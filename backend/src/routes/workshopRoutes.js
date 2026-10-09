const express = require("express");
const { protect, authorizeRole } = require("../middlewares/authMiddleware");
const {
  createWorkshop,
  getAllWorkshops,
  joinWorkshop,
  getWorkshopById,
  pushSnippet,
  submitError,
  resolveError,
  endWorkshop,
  getMyArchivedWorkshops,
} = require("../controllers/workshopController");
const { rateLimit } = require("express-rate-limit");

const router = express.Router();

const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user._id.toString(),
  message: { message: "Too many join attempts. Try again in 15 minutes." },
});

router.get("/", getAllWorkshops);
router.post("/", protect, authorizeRole("mentor"), createWorkshop);
router.post(
  "/join",
  protect,
  authorizeRole("student"),
  joinLimiter,
  joinWorkshop,
);
router.get(
  "/archive/me",
  protect,
  authorizeRole("student"),
  getMyArchivedWorkshops,
);
router.get("/:id", protect, getWorkshopById);
router.patch("/:id/end", protect, authorizeRole("mentor"), endWorkshop);
router.post("/:id/snippets", protect, authorizeRole("mentor"), pushSnippet);
router.post("/:id/errors", protect, authorizeRole("student"), submitError);
router.patch(
  "/:id/errors/:errorId/resolve",
  protect,
  authorizeRole("mentor"),
  resolveError,
);

module.exports = router;
