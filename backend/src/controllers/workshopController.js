const Workshop = require("../models/Workshop");
const { randomInt } = require("node:crypto");
const { z } = require("zod");

const createWorkshopSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
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

    const { title, description } = result.data;

    for (let attempt = 0; attempt < 20; attempt++) {
      const pin = String(randomInt(1000, 10000));

      try {
        const workshop = await Workshop.create({
          title,
          description,
          mentor: req.user._id,
          pin,
        });

        return res.status(201).json({
          message: "Workshop created successfully!",
          workshop: {
            _id: workshop._id,
            title: workshop.title,
            description: workshop.description,
            pin: workshop.pin,
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
      .select("title description mentor status createdAt")
      .populate("mentor", "name");

    res.status(200).json({ workshops });
  } catch (error) {
    console.error("Get Active Workshop Error:", error);
    res.status(500).json({ message: "Internal server error" });
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

    const workshop = await Workshop.findOneAndUpdate(
      {
        pin,
        status: "active",
        roster: { $ne: req.user._id },
      },
      {
        $addToSet: { roster: req.user._id },
      },
      {
        returnDocument: "after",
        runValidators: true,
      },
    );

    if (!workshop) {
      const activeWorkshop = await Workshop.exists({ pin, status: "active" });

      return res.status(activeWorkshop ? 400 : 404).json({
        message: activeWorkshop
          ? "Already joined!"
          : "Invalid PIN or session has ended!",
      });
    }

    return res.status(200).json({ workshopId: workshop._id });
  } catch (error) {
    console.error("Join Workshop Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getWorkshopById = async (req, res) => {
  try {
    const workshop = await Workshop.findById(req.params.id);

    if (!workshop) {
      return res.status(404).json({ message: "No workshop found!" });
    }

    const isOwner = workshop.mentor.equals(req.user._id);
    const isStudentMember =
      req.user.role === "student" &&
      workshop.roster.some((id) => id.equals(req.user._id));

    if (!isOwner && !isStudentMember) {
      return res.status(403).json({ message: "Access denied!" });
    }

    await workshop.populate("mentor", "name");

    if (isOwner) {
      await workshop.populate("roster", "name email");
      return res.status(200).json({ workshop });
    }

    return res.status(200).json({
      workshop: {
        _id: workshop._id,
        title: workshop.title,
        description: workshop.description,
        mentor: workshop.mentor,
        status: workshop.status,
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

    const workshop = await Workshop.findById(id);
    if (!workshop) {
      return res.status(404).json({ message: "Workshop not found!" });
    }

    if (workshop.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Not authorized!",
      });
    }

    workshop.status = "archived";
    await workshop.save();

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
      roster: req.user._id,
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
  joinWorkshop,
  getWorkshopById,
  pushSnippet,
  submitError,
  resolveError,
  endWorkshop,
  getMyArchivedWorkshops,
};
