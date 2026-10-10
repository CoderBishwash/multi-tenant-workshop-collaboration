const test = require('node:test');
const assert = require('node:assert/strict');
const Workshop = require('../src/models/Workshop');
const ChatMessage = require('../src/models/ChatMessage');
const { listMessages, sendMessage, uploadFile, downloadFile } = require('../src/controllers/chatController');

const roomId = '507f1f77bcf86cd799439012';
const ownerId = '507f1f77bcf86cd799439011';
const memberId = '507f191e810c19729de860ea';
const outsiderId = '507f191e810c19729de860eb';
const fileId = '507f191e810c19729de860ec';
const originals = { findById: Workshop.findById, create: ChatMessage.create, findOne: ChatMessage.findOne };

test.afterEach(() => {
  Workshop.findById = originals.findById;
  ChatMessage.create = originals.create;
  ChatMessage.findOne = originals.findOne;
});

function mockRoom(status = 'active') {
  Workshop.findById = () => ({ select: () => ({ lean: async () => ({
    mentor: { equals: id => id === ownerId },
    roster: [{ equals: id => id === memberId }], status,
  }) }) });
}
function request(id, extra = {}) {
  return { user: { _id: id }, params: { id: roomId, fileId }, get: () => undefined, ...extra };
}
function response() {
  return { statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('pending and unrelated users cannot send messages or list chat', async () => {
  mockRoom();
  ChatMessage.create = async () => { throw new Error('must not write'); };
  for (const controller of [listMessages, sendMessage]) {
    const res = response();
    await controller(request(outsiderId, { query: {}, body: { text: 'hello' } }), res);
    assert.equal(res.statusCode, 404);
  }
});

test('joined member can send a message; archived room rejects new messages', async () => {
  mockRoom();
  ChatMessage.create = async data => ({ ...data, populate: async () => {} });
  const res = response();
  await sendMessage(request(memberId, { body: { text: '  hello  ' } }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.message.text, 'hello');
  mockRoom('archived');
  const archived = response();
  await sendMessage(request(ownerId, { body: { text: 'hello' } }), archived);
  assert.equal(archived.statusCode, 409);
});

test('file upload validates name, payload, and type before storing', async () => {
  mockRoom();
  const res = response();
  await uploadFile(request(memberId, {
    body: Buffer.from('content'), get: header => header === 'X-File-Name' ? '../bad.svg' : 'image/svg+xml',
  }), res);
  assert.equal(res.statusCode, 400);
});

test('file download requires membership before looking up its message', async () => {
  mockRoom();
  ChatMessage.findOne = async () => { throw new Error('must not query files'); };
  const res = response();
  await downloadFile(request(outsiderId), res);
  assert.equal(res.statusCode, 404);
});
