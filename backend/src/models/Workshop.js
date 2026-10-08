const mongoose = require("mongoose");

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
  },
  {
    timestamps: true,
  },
);

const Workshop = mongoose.model("Workshop", workshopSchema);

module.exports = Workshop;
