const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoURL = process.env.MONGO_URI;

    if (!mongoURL) {
      throw new Error("Env variable is missing!");
    }

    await mongoose.connect(mongoURL);
    console.log("Connected to MongoDB securely.");
  } catch (error) {
    console.error("Error while connecting to MongoDB:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
