const express = require("express");
const { protect } = require("../middlewares/authMiddleware");
const {
  createWorkshop,
  getAllWorkshops,
  getMyWorkshops,
  joinWorkshop,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  updateJoinSettings,
  getWorkshopById,
  pushSnippet,
  submitError,
  resolveError,
  endWorkshop,
  getMyArchivedWorkshops,
} = require("../controllers/workshopController");
const { rateLimit } = require("express-rate-limit");
const { listMessages, sendMessage, uploadFile, downloadFile } = require("../controllers/chatController");

const router = express.Router();

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user._id.toString(),
  message: { message: "Too many rooms created. Try again in an hour." },
});

const joinIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { message: "Too many PIN attempts from this network. Try again later." },
});

const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => req.user._id.toString(),
  message: { message: "Too many join attempts. Try again in 15 minutes." },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user._id.toString(),
  message: { message: "Too many chat requests. Try again shortly." },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user._id.toString(),
  message: { message: "File upload limit reached. Try again later." },
});

router.get("/", getAllWorkshops);
router.post("/", protect, createLimiter, createWorkshop);
router.get("/mine", protect, getMyWorkshops);
router.post(
  "/join",
  protect,
  joinIpLimiter,
  joinLimiter,
  joinWorkshop,
);
router.get(
  "/archive/me",
  protect,
  getMyArchivedWorkshops,
);
router.get("/:id", protect, getWorkshopById);
router.get("/:id/chat", protect, listMessages);
router.post("/:id/chat", protect, chatLimiter, sendMessage);
router.post("/:id/chat/files", protect, uploadLimiter,
  express.raw({ type: () => true, limit: "10mb" }), uploadFile);
router.get("/:id/chat/files/:fileId", protect, downloadFile);
router.patch("/:id/end", protect, endWorkshop);
router.patch("/:id/join-settings", protect, updateJoinSettings);
router.get("/:id/join-requests", protect, getJoinRequests);
router.patch("/:id/join-requests/:userId/approve", protect, approveJoinRequest);
router.patch("/:id/join-requests/:userId/reject", protect, rejectJoinRequest);
router.post("/:id/snippets", protect, pushSnippet);
router.post("/:id/errors", protect, submitError);
router.patch(
  "/:id/errors/:errorId/resolve",
  protect,
  resolveError,
);

module.exports = router;
