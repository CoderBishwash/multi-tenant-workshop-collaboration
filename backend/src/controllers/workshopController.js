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

module.exports = { createWorkshop, getAllWorkshops };
