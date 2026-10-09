const jwt = require("jsonwebtoken");

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

const generateToken = (res, userId) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "8h",
  });

  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "strict",
    maxAge: SESSION_DURATION_MS,
  });
};

module.exports = { generateToken };
