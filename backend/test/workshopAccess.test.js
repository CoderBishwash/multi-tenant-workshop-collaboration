const test = require('node:test');
const assert = require('node:assert/strict');
const Workshop = require('../src/models/Workshop');
const User = require('../src/models/User');
const {
  createWorkshop,
  joinWorkshop,
  approveJoinRequest,
  updateJoinSettings,
  getWorkshopById,
} = require('../src/controllers/workshopController');

const ownerId = '507f1f77bcf86cd799439011';
const learnerId = '507f191e810c19729de860ea';
const workshopId = '507f1f77bcf86cd799439012';
const original = {
  create: Workshop.create,
  findOneAndUpdate: Workshop.findOneAndUpdate,
  findOne: Workshop.findOne,
  findById: Workshop.findById,
  exists: Workshop.exists,
  userExists: User.exists,
};

test.afterEach(() => {
  Workshop.create = original.create;
  Workshop.findOneAndUpdate = original.findOneAndUpdate;
  Workshop.findOne = original.findOne;
  Workshop.findById = original.findById;
  Workshop.exists = original.exists;
  User.exists = original.userExists;
});

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
function user(id, role = 'student') { return { _id: id, role }; }

test('any signed-in account can create a room with approval enabled', async () => {
  let created;
  Workshop.create = async (input) => {
    created = input;
    return { _id: workshopId, ...input };
  };
  const res = response();
  await createWorkshop({ user: user(ownerId), body: {
    title: '  Test room  ', description: '  Learn together  ', approvalRequired: true,
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.mentor, ownerId);
  assert.equal(created.approvalRequired, true);
  assert.equal(created.title, 'Test room');
  assert.match(created.pin, /^[0-9]{4}$/);
  assert.equal(res.body.workshop.approvalRequired, true);
});

test('open room joins immediately and the owner cannot join through a PIN', async () => {
  const filters = [];
  Workshop.findOneAndUpdate = async (filter) => {
    filters.push(filter);
    return filter.approvalRequired?.$ne === true ? { _id: workshopId } : null;
  };
  const res = response();
  await joinWorkshop({ user: user(learnerId), body: { pin: '1234' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'joined');
  assert.equal(filters[0].mentor.$ne, learnerId);
  assert.equal(filters[0].roster.$ne, learnerId);
});

test('approval room creates a pending request without adding to the roster', async () => {
  const updates = [];
  Workshop.findOneAndUpdate = async (filter, update) => {
    updates.push({ filter, update });
    return filter.approvalRequired === true ? { _id: workshopId } : null;
  };
  const res = response();
  await joinWorkshop({ user: user(learnerId), body: { pin: '1234' } }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.status, 'pending');
  assert.deepEqual(updates[1].update.$push.joinRequests, { user: learnerId });
  assert.equal(updates[1].update.$addToSet, undefined);
});

test('only the room creator can approve a pending user', async () => {
  User.exists = async () => true;
  let query;
  Workshop.findOneAndUpdate = async (filter, update) => {
    query = { filter, update };
    return { _id: workshopId };
  };
  const res = response();
  await approveJoinRequest({ user: user(ownerId), params: { id: workshopId, userId: learnerId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'approved');
  assert.equal(query.filter.mentor, ownerId);
  assert.equal(query.filter['joinRequests.user'], learnerId);
  assert.equal(query.update.$addToSet.roster, learnerId);
  assert.equal(query.update.$pull.joinRequests.user, learnerId);
});

test('approval cannot be disabled while requests are pending', async () => {
  Workshop.findOneAndUpdate = async () => null;
  Workshop.exists = async () => true;
  const res = response();
  await updateJoinSettings({ user: user(ownerId), params: { id: workshopId }, body: { approvalRequired: false } }, res);
  assert.equal(res.statusCode, 409);
});

test('a pending requester cannot read room content', async () => {
  Workshop.findById = async () => ({
    mentor: { equals: () => false },
    roster: [],
    joinRequests: [{ user: learnerId }],
  });
  const res = response();
  await getWorkshopById({ user: user(learnerId), params: { id: workshopId } }, res);
  assert.equal(res.statusCode, 403);
});

test('repeated PIN entry stays pending and does not duplicate the request', async () => {
  Workshop.findOneAndUpdate = async () => null;
  Workshop.findOne = () => ({
    select: async () => ({
      _id: workshopId,
      mentor: { equals: () => false },
      roster: [],
      joinRequests: [{ user: { equals: (id) => id === learnerId } }],
      approvalRequired: true,
    }),
  });
  const res = response();
  await joinWorkshop({ user: user(learnerId), body: { pin: '1234' } }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.status, 'pending');
});

test('a non-owner cannot approve someone else’s request', async () => {
  User.exists = async () => true;
  let checkedFilter;
  Workshop.findOneAndUpdate = async (filter) => {
    checkedFilter = filter;
    return null;
  };
  const res = response();
  await approveJoinRequest({ user: user(learnerId), params: { id: workshopId, userId: ownerId } }, res);
  assert.equal(checkedFilter.mentor, learnerId);
  assert.equal(res.statusCode, 404);
});
