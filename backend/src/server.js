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

// middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// routes
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API is running",
  });
});
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/workshops", workshopRoutes);

connectDB();
app.listen(PORT, () => {
  console.log(`Server started at PORT: ${PORT}`);
});
