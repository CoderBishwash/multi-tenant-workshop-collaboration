const User = require("../models/User");
const { generateToken } = require("../utils/generateToken");

const registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        message: "User with that email already exists!",
      });
    }

    const newUser = await User.create({ name, email, password, role });

    generateToken(res, newUser._id);

    res.status(201).json({
      message: "User registered successfully",
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const checkUser = await User.findOne({ email });
    if (!checkUser) {
      return res.status(401).json({
        message: "Invalid credentials!",
      });
    }

    const checkPassword = await checkUser.matchPassword(password);
    if (!checkPassword) {
      return res.status(401).json({
        message: "Invalid credentials!",
      });
    }

    generateToken(res, checkUser._id);

    res.status(200).json({
      message: "Logged in successfully",
      user: {
        _id: checkUser._id,
        name: checkUser.name,
        email: checkUser.email,
        role: checkUser.role,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = { registerUser, loginUser };
