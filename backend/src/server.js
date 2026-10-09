require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const connectDB = require("./config/db");
const cookieParser = require("cookie-parser");

// route imports
const authRoutes = require("./routes/authRoutes");
const workshopRoutes = require("./routes/workshopRoutes");

const app = express();
const PORT = process.env.PORT || 8000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN;

if (!FRONTEND_ORIGIN) {
  throw new Error("FRONTEND_ORIGIN is required");
}

// middlewares
app.use(helmet());
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// CORS check
app.use("/api/v1", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  if (req.get("Origin") !== FRONTEND_ORIGIN) {
    return res.status(403).json({
      message: "Request origin not allowed",
    });
  }

  next();
});

// routes
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API is running",
  });
});
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/workshops", workshopRoutes);

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server started at PORT: ${PORT}`);
  });
};

if (
  !process.env.JWT_SECRET ||
  Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32
) {
  throw new Error("JWT_SECRET must be set to a strong secret");
}

startServer();
