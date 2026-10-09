const User = require("../models/User");
const { generateToken } = require("../utils/generateToken");
const { z } = require("zod");

const registerSchema = z.object({
  name: z.string().trim().min(3).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z
    .string()
    .min(6)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Password must be 72 bytes or fewer",
    ),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z
    .string()
    .min(1)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Password must be 72 bytes or fewer",
    ),
});

const registerUser = async (req, res) => {
  try {
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid registration data",
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    const { name, email, password } = result.data;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        message: "User with that email already exists!",
      });
    }

    const newUser = await User.create({
      name,
      email,
      password,
      role: "student",
    });

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
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(409).json({
        message: "User with that email already exists!",
      });
    }

    console.error("Registration Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const loginUser = async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid login data",
        errors: z.flattenError(result.error).fieldErrors,
      });
    }

    const { email, password } = result.data;

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

const logoutUser = (req, res) => {
  res.clearCookie("jwt", {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
    path: "/",
  });

  res.status(200).json({ message: "Logged out successfully" });
};

const getMe = (req, res) => {
  res.status(200).json({
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
};

module.exports = { registerUser, loginUser, logoutUser, getMe };
