const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
  workshop: { type: mongoose.Schema.Types.ObjectId, ref: "Workshop", required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, trim: true, maxlength: 5000, default: "" },
  attachment: {
    fileId: mongoose.Schema.Types.ObjectId,
    name: String,
    size: Number,
  },
}, { timestamps: true });

chatMessageSchema.index({ workshop: 1, _id: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
