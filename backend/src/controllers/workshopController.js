const Workshop = require("../models/Workshop");
const User = require("../models/User");
const { isValidObjectId } = require("mongoose");
const { randomInt } = require("node:crypto");
const { z } = require("zod");

const createWorkshopSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  approvalRequired: z.boolean().default(false),
});

const joinSettingsSchema = z.object({
  approvalRequired: z.boolean(),
});

const joinWorkshopSchema = z.object({
  pin: z.string().regex(/^[0-9]{4}$/, "PIN must contain exactly 4 digits"),
});

const snippetSchema = z.object({
  title: z.string().trim().max(120).optional(),
  code: z.string().min(1).max(50_000),
  language: z.string().trim().min(1).max(40).default("javascript"),
});

const errorSubmissionSchema = z.object({
  errorMessage: z.string().min(1).max(10_000),
  codeBlock: z.string().max(50_000).optional(),
});

const createWorkshop = async (req, res) => {
  try {
    const result = createWorkshopSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid workshop data",
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    const { title, description, approvalRequired } = result.data;

    for (let attempt = 0; attempt < 20; attempt++) {
      const pin = String(randomInt(1000, 10000));

      try {
        const workshop = await Workshop.create({
          title,
          description,
          mentor: req.user._id,
          pin,
          approvalRequired,
        });

        return res.status(201).json({
          message: "Workshop created successfully!",
          workshop: {
            _id: workshop._id,
            title: workshop.title,
            description: workshop.description,
            pin: workshop.pin,
            approvalRequired: workshop.approvalRequired,
          },
        });
      } catch (error) {
        // retry a collision on the PIN index.
        if (error.code !== 11000 || !error.keyPattern?.pin) {
          throw error;
        }
      }
    }

    return res.status(503).json({
      message: "Could not allocate a workshop PIN. Try again.",
    });
  } catch (error) {
    console.error("Workshop creation error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getAllWorkshops = async (req, res) => {
  try {
    const workshops = await Workshop.find({ status: "active" })
      .select("title description mentor status approvalRequired createdAt")
      .populate("mentor", "name");

    res.status(200).json({ workshops });
  } catch (error) {
    console.error("Get Active Workshop Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getMyWorkshops = async (req, res) => {
  try {
    const userId = req.user._id;
    const [owned, joined, pending] = await Promise.all([
      Workshop.find({ mentor: userId })
        .select("title description mentor status pin approvalRequired roster createdAt updatedAt")
        .sort({ createdAt: -1 }),
      Workshop.find({ roster: userId, mentor: { $ne: userId } })
        .select("title description status mentor createdAt updatedAt")
        .populate("mentor", "name")
        .sort({ createdAt: -1 }),
      Workshop.find({
        status: "active",
        "joinRequests.user": userId,
        roster: { $ne: userId },
      })
        .select("title description status mentor createdAt")
        .populate("mentor", "name")
        .sort({ createdAt: -1 }),
    ]);

    return res.status(200).json({ owned, joined, pending });
  } catch (error) {
    console.error("Get My Workshops Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const joinWorkshop = async (req, res) => {
  try {
    const result = joinWorkshopSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid join data",
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    const { pin } = result.data;

    // Each update is conditional and atomic on the workshop document. The
    // setting cannot change between checking it and adding a participant.
    for (let attempt = 0; attempt < 2; attempt++) {
      const joined = await Workshop.findOneAndUpdate(
        {
          pin,
          status: "active",
          mentor: { $ne: req.user._id },
          roster: { $ne: req.user._id },
          approvalRequired: { $ne: true },
        },
        {
          $addToSet: { roster: req.user._id },
          $pull: { joinRequests: { user: req.user._id } },
        },
        { new: true, runValidators: true },
      );
      if (joined) {
        return res.status(200).json({
          workshopId: joined._id,
          status: "joined",
        });
      }

      const requested = await Workshop.findOneAndUpdate(
        {
          pin,
          status: "active",
          mentor: { $ne: req.user._id },
          roster: { $ne: req.user._id },
          approvalRequired: true,
          "joinRequests.user": { $ne: req.user._id },
          "joinRequests.199": { $exists: false },
        },
        { $push: { joinRequests: { user: req.user._id } } },
        { new: true, runValidators: true },
      );
      if (requested) {
        return res.status(202).json({
          workshopId: requested._id,
          status: "pending",
          message: "Join request sent to the room creator",
        });
      }

      const current = await Workshop.findOne({ pin, status: "active" })
        .select("mentor roster joinRequests approvalRequired");
      if (!current) {
        return res.status(404).json({ message: "Invalid PIN or session has ended" });
      }
      if (current.mentor.equals(req.user._id)) {
        return res.status(400).json({ message: "You already own this room" });
      }
      if (current.roster.some((id) => id.equals(req.user._id))) {
        return res.status(200).json({
          workshopId: current._id,
          status: "joined",
        });
      }
      if (current.joinRequests.some((request) => request.user.equals(req.user._id))) {
        return res.status(202).json({
          workshopId: current._id,
          status: "pending",
          message: "Join request is awaiting approval",
        });
      }
      if (current.approvalRequired && current.joinRequests.length >= 200) {
        return res.status(429).json({ message: "This room's request queue is full" });
      }
      // The owner may have changed the join setting during this attempt.
    }

    return res.status(409).json({ message: "Room settings changed. Try again." });
  } catch (error) {
    console.error("Join Workshop Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getJoinRequests = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid workshop ID" });
    }
    const workshop = await Workshop.findOne({
      _id: req.params.id,
      mentor: req.user._id,
      status: "active",
    })
      .select("joinRequests")
      .populate("joinRequests.user", "name email");
    if (!workshop) {
      return res.status(404).json({ message: "Active room not found" });
    }
    return res.status(200).json({ requests: workshop.joinRequests });
  } catch (error) {
    console.error("Get Join Requests Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const decideJoinRequest = async (req, res, approve) => {
  try {
    const { id, userId } = req.params;
    if (!isValidObjectId(id) || !isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid workshop or user ID" });
    }
    if (approve && !(await User.exists({ _id: userId }))) {
      return res.status(404).json({ message: "User no longer exists" });
    }

    const update = approve
      ? {
          $addToSet: { roster: userId },
          $pull: { joinRequests: { user: userId } },
        }
      : { $pull: { joinRequests: { user: userId } } };
    const workshop = await Workshop.findOneAndUpdate(
      {
        _id: id,
        mentor: req.user._id,
        status: "active",
        "joinRequests.user": userId,
      },
      update,
      { new: true, runValidators: true },
    );
    if (!workshop) {
      return res.status(404).json({ message: "Pending request not found" });
    }
    return res.status(200).json({
      workshopId: workshop._id,
      status: approve ? "approved" : "rejected",
    });
  } catch (error) {
    console.error("Decide Join Request Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const approveJoinRequest = (req, res) => decideJoinRequest(req, res, true);
const rejectJoinRequest = (req, res) => decideJoinRequest(req, res, false);

const updateJoinSettings = async (req, res) => {
  try {
    const result = joinSettingsSchema.safeParse(req.body);
    if (!result.success || !isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid join settings" });
    }
    const approvalRequired = result.data.approvalRequired;
    const filter = {
      _id: req.params.id,
      mentor: req.user._id,
      status: "active",
      ...(approvalRequired ? {} : { "joinRequests.0": { $exists: false } }),
    };
    const workshop = await Workshop.findOneAndUpdate(
      filter,
      { $set: { approvalRequired } },
      { new: true, runValidators: true },
    );
    if (workshop) {
      return res.status(200).json({ approvalRequired: workshop.approvalRequired });
    }
    const pending = await Workshop.exists({
      _id: req.params.id,
      mentor: req.user._id,
      status: "active",
      "joinRequests.0": { $exists: true },
    });
    return res.status(pending ? 409 : 404).json({
      message: pending
        ? "Resolve pending requests before turning approval off"
        : "Active room not found",
    });
  } catch (error) {
    console.error("Update Join Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const getWorkshopById = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid workshop ID" });
    }
    const workshop = await Workshop.findById(req.params.id);

    if (!workshop) {
      return res.status(404).json({ message: "No workshop found!" });
    }

    const isOwner = workshop.mentor.equals(req.user._id);
    const isMember = workshop.roster.some((id) => id.equals(req.user._id));

    if (!isOwner && !isMember) {
      return res.status(403).json({ message: "Access denied!" });
    }

    await workshop.populate("mentor", "name");

    if (isOwner) {
      await workshop.populate("roster", "name email");
      await workshop.populate("joinRequests.user", "name email");
      await workshop.populate("errors.student", "name email");
      return res.status(200).json({ workshop });
    }

    return res.status(200).json({
      workshop: {
        _id: workshop._id,
        title: workshop.title,
        description: workshop.description,
        mentor: workshop.mentor,
        status: workshop.status,
        approvalRequired: workshop.approvalRequired,
        snippets: workshop.snippets,
        createdAt: workshop.createdAt,
        updatedAt: workshop.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get Workshop Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const pushSnippet = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid workshop ID" });
    }
    const result = snippetSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid snippet data",
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    const { title, code, language } = result.data;

    const workshop = await Workshop.findOneAndUpdate(
      {
        _id: req.params.id,
        mentor: req.user._id,
        status: "active",
      },
      {
        $push: { snippets: { title, code, language } },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!workshop) {
      return res.status(404).json({
        message: "Active workshop not found or access denied",
      });
    }

    res.status(200).json({
      snippet: workshop.snippets[workshop.snippets.length - 1],
    });
  } catch (error) {
    console.error("Push Snippet Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const submitError = async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid workshop ID" });
    }
    const result = errorSubmissionSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid error submission",
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    const { errorMessage, codeBlock } = result.data;

    const workshop = await Workshop.findOneAndUpdate(
      {
        _id: req.params.id,
        status: "active",
        roster: req.user._id,
      },
      {
        $push: {
          errors: {
            student: req.user._id,
            errorMessage,
            codeBlock,
          },
        },
      },
      { runValidators: true },
    );

    if (!workshop) {
      return res.status(404).json({
        message: "Active joined workshop not found",
      });
    }

    res.status(201).json({ message: "Submitted!" });
  } catch (error) {
    console.error("Submit Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const resolveError = async (req, res) => {
  try {
    const { id, errorId } = req.params;
    if (!isValidObjectId(id) || !isValidObjectId(errorId)) {
      return res.status(400).json({ message: "Invalid workshop or error ID" });
    }

    const workshop = await Workshop.findOneAndUpdate(
      {
        _id: id,
        mentor: req.user._id,
        status: "active",
        "errors._id": errorId,
      },
      {
        $set: { "errors.$.resolved": true },
      },
    );

    if (!workshop) {
      return res.status(404).json({
        message: "Active workshop or error not found",
      });
    }

    res.status(200).json({ message: "Error resolved" });
  } catch (error) {
    console.error("Resolve Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const endWorkshop = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid workshop ID" });
    }
    const workshop = await Workshop.findOneAndUpdate(
      { _id: id, mentor: req.user._id, status: "active" },
      { $set: { status: "archived", joinRequests: [] } },
      { new: true, runValidators: true },
    );
    if (!workshop) {
      return res.status(404).json({ message: "Active room not found" });
    }

    res.status(200).json({
      message: "The session is permanently locked",
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

const getMyArchivedWorkshops = async (req, res) => {
  try {
    const workshops = await Workshop.find({
      status: "archived",
      $or: [{ roster: req.user._id }, { mentor: req.user._id }],
    })
      .select("title description mentor status snippets createdAt updatedAt")
      .populate("mentor", "name");

    res.status(200).json({ workshops });
  } catch (error) {
    console.error("Get Archived Workshops Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  createWorkshop,
  getAllWorkshops,
  getMyWorkshops,
  joinWorkshop,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  updateJoinSettings,
  getWorkshopById,
  pushSnippet,
  submitError,
  resolveError,
  endWorkshop,
  getMyArchivedWorkshops,
};
