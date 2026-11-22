import express from "express";
import mongoose from "mongoose"; // ✅ BetterAuth collections অ্যাক্সেস করার জন্য যোগ করা হয়েছে
import User from "../models/user.model.js";
import Tuition from "../models/tuition.model.js";
import Payment from "../models/payment.model.js";
import Application from "../models/application.model.js";
import { verifyToken, verifyAdmin } from "../middleware/auth.middleware.js";
import {
  isObjectId,
  requireOneOf,
  searchPattern,
  parsePagination,
} from "../utils/validate.js";
import { ok, okWithMessage } from "../utils/respond.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();

const ROLES = ["student", "tutor", "admin"];
const APPROVAL_STATUSES = ["pending", "approved", "rejected"];

// Every route in this file is admin-only. Declared once instead of repeated on
// each handler, so a future route cannot accidentally ship unguarded.
router.use(verifyToken, verifyAdmin);

/**
 * GET /api/admin/users?search=&role=&page=&limit=
 * -----------------------------------------------
 * Every registered user, newest first. `search` matches name or email.
 * Only profile fields are returned — no password or session data exists on this
 * model, and the shape is chosen explicitly rather than projecting the document.
 */
router.get("/users", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.search) {
    const pattern = searchPattern(String(req.query.search).trim());
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  if (req.query.role) {
    filter.role = requireOneOf(String(req.query.role), "role", ROLES);
  }

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .select("name email role plan image phone createdAt")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const mapped = users.map((u) => ({
    id: u._id.toString(),
    _id: u._id.toString(),
    name: u.name,
    email: u.email,
    role: u.role,
    plan: u.plan,
    image: u.image,
    phone: u.phone,
    createdAt: u.createdAt,
  }));

  res.json({
    success: true,
    data: mapped,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * DELETE /api/admin/users/:id
 * ---------------------------
 * Removes a user and cleans up their tuitions and applications.
 * Also cleans up BetterAuth sessions and accounts to prevent orphaned data.
 * An admin cannot delete their own account.
 */
router.delete("/users/:id", async (req, res) => {
  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  if (req.params.id === req.userId) {
    throw new ApiError(400, "You cannot delete your own account");
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // ✅ BetterAuth এর সেশন এবং অ্যাকাউন্ট ডিলিট করা (Orphaned Data প্রতিরোধ করতে)
  const db = mongoose.connection.db;
  const userObjectId = new mongoose.Types.ObjectId(req.params.id);
  await db.collection("sessions").deleteMany({ userId: userObjectId });
  await db.collection("accounts").deleteMany({ userId: userObjectId });

  await User.deleteOne({ _id: req.params.id });
  await Tuition.deleteMany({ tutorEmail: user.email });
  await Application.deleteMany({
    $or: [{ studentEmail: user.email }, { tutorEmail: user.email }],
  });

  okWithMessage(res, `User ${user.name} removed successfully`);
});

/**
 * PATCH /api/admin/users/:id/role
 * -------------------------------
 * Body: { role: "student" | "tutor" | "admin" }
 * An admin cannot change their own role: that is the one action that can lock
 * the platform out of its own admin account by accident.
 */
router.patch("/users/:id/role", async (req, res) => {
  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  if (req.params.id === req.userId) {
    throw new ApiError(400, "You cannot change your own role");
  }

  const role = requireOneOf((req.body ?? {}).role, "role", ROLES);

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { role } },
    { returnDocument: "after" }
  ).select("name email role plan");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  okWithMessage(res, `Role updated to ${role}`, user);
});

/**
 * GET /api/admin/tuitions?approvalStatus=&search=&page=&limit=
 * ------------------------------------------------------------
 * The moderation queue: every listing in every state, newest first.
 * `search` matches title, subject or tutor email.
 */
router.get("/tuitions", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.approvalStatus) {
    filter.approvalStatus = requireOneOf(
      String(req.query.approvalStatus),
      "approvalStatus",
      APPROVAL_STATUSES
    );
  }

  if (req.query.search) {
    const pattern = searchPattern(String(req.query.search).trim());
    filter.$or = [{ title: pattern }, { subject: pattern }, { tutorEmail: pattern }];
  }

  const total = await Tuition.countDocuments(filter);
  const tuitions = await Tuition.find(filter)
    .select("-__v")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: tuitions,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * PATCH /api/admin/tuitions/:id/status
 * ------------------------------------
 * Body: { approvalStatus: "pending" | "approved" | "rejected" }
 * Approving makes a listing public; rejecting keeps it private. "pending" is
 * allowed so a decision can be undone.
 */
router.patch("/tuitions/:id/status", async (req, res) => {
  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid tuition ID format");
  }

  const approvalStatus = requireOneOf(
    (req.body ?? {}).approvalStatus,
    "approvalStatus",
    APPROVAL_STATUSES
  );

  const tuition = await Tuition.findByIdAndUpdate(
    req.params.id,
    { $set: { approvalStatus } },
    { returnDocument: "after" }
  ).select("-__v");

  if (!tuition) {
    throw new ApiError(404, "Tuition not found");
  }

  okWithMessage(res, `Tuition ${approvalStatus}`, tuition);
});

// GET /api/admin/transactions — Payment ledger for admin
router.get("/transactions", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.search) {
    const pattern = searchPattern(String(req.query.search).trim());
    filter.$or = [
      { userEmail: pattern },
      { userName: pattern },
      { planName: pattern },
    ];
  }

  const total = await Payment.countDocuments(filter);
  const transactions = await Payment.find(filter)
    .sort({ paidAt: -1 })
    .skip(skip)
    .limit(limit)
    .select("userEmail userName userRole planName amount currency transactionId stripeSessionId paymentStatus paidAt createdAt");

  res.json({
    success: true,
    data: transactions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * GET /api/admin/applications?status=&search=&page=&limit=
 * --------------------------------------------------------
 * Admin application management: every application across all tuitions.
 */
router.get("/applications", async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.search) {
    const pattern = searchPattern(String(req.query.search).trim());
    filter.$or = [
      { studentName: pattern },
      { studentEmail: pattern },
      { tutorEmail: pattern },
      { tuitionTitle: pattern },
      { subject: pattern },
    ];
  }

  const total = await Application.countDocuments(filter);
  const applications = await Application.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    success: true,
    data: applications,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

export default router;