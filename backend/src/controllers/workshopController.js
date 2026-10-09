const Workshop = require("../models/Workshop");

const createWorkshop = async (req, res) => {
  try {
    const { title, description } = req.body;
    const pin = Math.floor(1000 + Math.random() * 9000).toString();

    const workshop = await Workshop.create({
      title,
      description,
      mentor: req.user._id,
      pin,
    });

    res.status(201).json({
      message: "Workshop created successfully!",
      workshop: {
        _id: workshop._id,
        title: workshop.title,
        description: workshop.description,
        pin: workshop.pin,
      },
    });
  } catch (error) {
    console.error("Workshop creation error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllWorkshops = async (req, res) => {
  try {
    const workshop = await Workshop.find({ status: "active" }).populate(
      "mentor",
      "name email",
    );

    res.status(200).json({
      workshop,
    });
  } catch (error) {
    console.error("Get Active Workshop Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const joinWorkshop = async (req, res) => {
  try {
    const { pin } = req.body;

    const workshop = await Workshop.findOne({ pin, status: "active" });
    if (!workshop) {
      return res.status(404).json({
        message: "Invalid PIN or session has ended!",
      });
    }

    if (workshop.roster.includes(req.user._id)) {
      return res.status(400).json({
        message: "Already joined!",
      });
    }

    workshop.roster.push(req.user._id);
    await workshop.save();

    res.status(200).json({
      workshopId: workshop._id,
    });
  } catch (error) {
    console.error("Join Workshop Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getWorkshopById = async (req, res) => {
  try {
    const { id } = req.params;

    const workshop = await Workshop.findById(id)
      .populate("mentor", "name")
      .populate("roster", "name email");

    if (!workshop) {
      return res.status(404).json({
        message: "No workshop found!",
      });
    }

    res.status(200).json({
      workshop: workshop,
    });
  } catch (error) {
    console.error("Get Workshop Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const pushSnippet = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, code, language } = req.body;
    const workshop = await Workshop.findById(id);

    if (workshop.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Not authorized!",
      });
    }

    workshop.snippets.push({ title, code, language });
    await workshop.save();

    res.status(200).json({
      snippet: workshop.snippets[workshop.snippets.length - 1],
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

const submitError = async (req, res) => {
  try {
    const { id } = req.params;
    const { errorMessage, codeBlock } = req.body;

    const workshop = await Workshop.findById(id);
    if (!workshop) {
      return res.status(404).json({ message: "Workshop not found" });
    }

    const isEnrolled = workshop.roster.some(
      (studentId) => studentId.toString() === req.user._id.toString(),
    );

    if (!isEnrolled) {
      return res.status(403).json({
        message: "You must join the workshop before submitting errors!",
      });
    }

    workshop.errors.push({ student: req.user._id, errorMessage, codeBlock });
    await workshop.save();

    res.status(201).json({
      message: "Submitted!",
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

const resolveError = async (req, res) => {
  try {
    const { id, errorId } = req.params;

    const workshop = await Workshop.findById(id);
    if (workshop.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Not authorized!",
      });
    }

    const error = workshop.errors.id(errorId);
    if (!error) {
      return res.status(404).json({
        message: "No error found",
      });
    }

    error.resolved = true;
    await workshop.save();

    res.status(200).json({
      message: "Error resolved",
    });
  } catch (error) {
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
    }).populate("mentor", "name");

    res.status(200).json({
      workshops: workshops,
    });
  } catch (error) {
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
