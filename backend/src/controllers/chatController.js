const mongoose = require("mongoose");
const { z } = require("zod");
const Workshop = require("../models/Workshop");
const ChatMessage = require("../models/ChatMessage");

const messageSchema = z.object({ text: z.string().trim().min(1).max(5000) });
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain",
  "text/csv", "application/zip", "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

async function roomAccess(req, res, write = false) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message: "Invalid room ID" });
    return null;
  }
  const room = await Workshop.findById(req.params.id).select("mentor roster status").lean();
  if (!room || (!room.mentor.equals(req.user._id) &&
    !room.roster.some((id) => id.equals(req.user._id)))) {
    res.status(404).json({ message: "Room not found" });
    return null;
  }
  if (write && room.status !== "active") {
    res.status(409).json({ message: "This room has ended" });
    return null;
  }
  return room;
}

const listMessages = async (req, res) => {
  try {
    if (!await roomAccess(req, res)) return;
    const after = req.query.after;
    if (after && !mongoose.isValidObjectId(after)) {
      return res.status(400).json({ message: "Invalid message cursor" });
    }
    const query = { workshop: req.params.id };
    if (after) query._id = { $gt: after };
    const messages = after
      ? await ChatMessage.find(query).sort({ _id: 1 }).limit(100).populate("sender", "name")
      : (await ChatMessage.find(query).sort({ _id: -1 }).limit(50).populate("sender", "name")).reverse();
    return res.json({ messages });
  } catch (error) {
    console.error("List chat messages error:", error);
    return res.status(500).json({ message: "Could not load chat" });
  }
};

const sendMessage = async (req, res) => {
  try {
    if (!await roomAccess(req, res, true)) return;
    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Message must be 1–5000 characters" });
    const message = await ChatMessage.create({
      workshop: req.params.id, sender: req.user._id, text: parsed.data.text,
    });
    await message.populate("sender", "name");
    return res.status(201).json({ message });
  } catch (error) {
    console.error("Send chat message error:", error);
    return res.status(500).json({ message: "Could not send message" });
  }
};

function cleanName(header) {
  let name;
  try { name = decodeURIComponent(header || ""); } catch { return ""; }
  return name.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 180);
}

const uploadFile = async (req, res) => {
  try {
    if (!await roomAccess(req, res, true)) return;
    const name = cleanName(req.get("X-File-Name"));
    const type = req.get("Content-Type")?.split(";")[0].toLowerCase();
    if (!name || !Buffer.isBuffer(req.body) || req.body.length === 0 ||
      req.body.length > MAX_FILE_SIZE || !ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ message: "Choose a supported file up to 10 MB" });
    }
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "chatFiles" });
    const stream = bucket.openUploadStream(name, { metadata: { workshop: req.params.id } });
    try {
      await new Promise((resolve, reject) => {
        stream.once("finish", resolve);
        stream.once("error", reject);
        stream.end(req.body);
      });
      const message = await ChatMessage.create({
        workshop: req.params.id, sender: req.user._id,
        attachment: { fileId: stream.id, name, size: req.body.length },
      });
      await message.populate("sender", "name");
      return res.status(201).json({ message });
    } catch (error) {
      await bucket.delete(stream.id).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error("Chat file upload error:", error);
    return res.status(500).json({ message: "Could not upload file" });
  }
};

const downloadFile = async (req, res) => {
  try {
    if (!await roomAccess(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.fileId)) {
      return res.status(400).json({ message: "Invalid file ID" });
    }
    const message = await ChatMessage.findOne({
      workshop: req.params.id, "attachment.fileId": req.params.fileId,
    }).lean();
    if (!message) return res.status(404).json({ message: "File not found" });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "chatFiles" });
    const files = await bucket.find({ _id: new mongoose.Types.ObjectId(req.params.fileId) }).limit(1).toArray();
    if (!files.length) return res.status(404).json({ message: "File not found" });
    res.set({
      "Content-Type": "application/octet-stream",
      "Content-Length": String(files[0].length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(message.attachment.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    bucket.openDownloadStream(files[0]._id)
      .on("error", () => res.destroy())
      .pipe(res);
  } catch (error) {
    console.error("Chat file download error:", error);
    if (!res.headersSent) return res.status(500).json({ message: "Could not download file" });
    res.destroy();
  }
};

module.exports = { listMessages, sendMessage, uploadFile, downloadFile };
