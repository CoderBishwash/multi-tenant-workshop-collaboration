const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  try {
    const token = req.cookies?.jwt;

    if (!token) {
      return res.status(401).json({
        status: "fail",
        message: "Unauthorized, JWT token is required!",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      return res.status(401).json({
        status: "fail",
        message: "User belonging to this token no longer exists!",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error.message);
    return res.status(401).json({
      status: "fail",
      message: "Unauthorized, JWT token is wrong or expired",
    });
  }
};

const authorizeRole = (...roles) => {
  return (req, res, next) => {
    const checkRole = roles.includes(req.user.role);

    if (!checkRole) {
      return res.status(403).json({
        status: "fail",
        message: "User role not authorized!",
      });
    }

    next();
  };
};

module.exports = { protect, authorizeRole };
