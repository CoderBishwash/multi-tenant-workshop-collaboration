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

const router = express.Router();

router.get("/", getAllWorkshops);
router.post("/", protect, authorizeRole("mentor"), createWorkshop);
router.post("/join", protect, authorizeRole("student"), joinWorkshop);
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
