import express from "express";
import Notification from "../models/notification.model.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { isObjectId } from "../utils/validate.js";
import { ok, okWithMessage } from "../utils/respond.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();

// Every route in this file requires a logged-in user.
router.use(verifyToken);

// Roles a notification can be targeted to.
const TARGET_ALL = "all";

// Build a safe public shape — never leak readBy or other users' ids.
function toPublicNotification(notification, userId) {
  const readBy = Array.isArray(notification.readBy) ? notification.readBy : [];
  const alreadyRead = readBy.some((id) => String(id) === userId);

  return {
    _id: notification._id.toString(),
    title: notification.title,
    message: notification.message,
    targetRole: notification.targetRole,
    isRead: alreadyRead,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

// Can this user see this notification? Targeted to everyone, or to their role.
function canUserSeeNotification(notification, role) {
  if (notification.targetRole === TARGET_ALL) return true;
  return notification.targetRole === role;
}

/**
 * GET /api/notifications
 * ----------------------
 * Notifications for the current user: targeted to everyone OR to their own
 * role. Newest first. Adds isRead per user. Does not expose readBy.
 */
router.get("/", async (req, res) => {
  const user = req.dbUser;
  const userId = user._id.toString();
  const role = user.role; // "student" | "tutor" | "admin"

  // Everyone sees "all"; students see "student"; tutors see "tutor".
  const visibleRoles = [TARGET_ALL];
  if (role === "student" || role === "tutor") {
    visibleRoles.push(role);
  }

  const notifications = await Notification.find({ targetRole: { $in: visibleRoles } })
    .sort({ createdAt: -1 })
    .lean();

  const result = notifications.map((notification) => toPublicNotification(notification, userId));

  ok(res, result);
});

/**
 * PATCH /api/notifications/:id/read
 * ---------------------------------
 * Marks a notification read for the CURRENT user only (id from auth, never
 * req.body). Uses MongoDB $addToSet so the user id can't be duplicated.
 */
router.patch("/:id/read", async (req, res) => {
  const { id } = req.params;

  if (!isObjectId(id)) {
    throw new ApiError(400, "Invalid notification ID format");
  }

  const notification = await Notification.findById(id);
  if (!notification) {
    throw new ApiError(404, "Notification not found");
  }

  if (!canUserSeeNotification(notification, req.dbUser.role)) {
    throw new ApiError(403, "You cannot access this notification");
  }

  await Notification.findByIdAndUpdate(
    id,
    { $addToSet: { readBy: req.dbUser._id } },
    { returnDocument: "after" }
  );

  okWithMessage(res, "Notification marked as read", { id, isRead: true });
});

export default router;
