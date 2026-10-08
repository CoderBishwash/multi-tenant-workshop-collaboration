const express = require("express");
const { protect, authorizeRole } = require("../middlewares/authMiddleware");
const {
  createWorkshop,
  getAllWorkshops,
} = require("../controllers/workshopController");

const router = express.Router();

router.get("/", getAllWorkshops);
router.post("/", protect, authorizeRole("mentor"), createWorkshop);

module.exports = router;
