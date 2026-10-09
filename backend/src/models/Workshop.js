const mongoose = require("mongoose");

const snippetSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
  },
  code: {
    type: String,
    required: [true, "Code is required!"],
  },
  language: {
    type: String,
    default: "javascript",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const errorSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  errorMessage: {
    type: String,
    required: true,
  },
  codeBlock: {
    type: String,
  },
  resolved: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const workshopSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required!"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required!"],
      trim: true,
    },
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A mentor must be attached to a user!"],
    },
    pin: {
      type: String,
      required: [true, "Pin is required!"],
      trim: true,
    },
    status: {
      type: String,
      required: [true, "Status is required!"],
      enum: ["active", "archived"],
      default: "active",
    },
    roster: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
    },
    snippets: [snippetSchema],
    errors: [errorSchema],
  },
  {
    timestamps: true,
  },
);

workshopSchema.index(
  { pin: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  },
);

const Workshop = mongoose.model("Workshop", workshopSchema);

module.exports = Workshop;
