import express from "express";
import Tuition from "../models/tuition.model.js";
import { verifyToken, verifyTutor, optionalAuth } from "../middleware/auth.middleware.js";
import { ok, okWithMessage } from "../utils/respond.js";
import {
  isObjectId,
  requireFields,
  requireString,
  requireNumberInRange,
} from "../utils/validate.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();

const REQUIRED_FIELDS = [
  "title", "subject", "classLevel", "mode", "location",
  "monthlyFee", "daysPerWeek", "bannerImage", "description",
];

// Normalize mode to "Online" or "Offline"; returns null if invalid
function normalizeMode(mode) {
  if (typeof mode !== "string" || !mode.trim()) return null;
  const trimmed = mode.trim();
  const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  return normalized === "Online" || normalized === "Offline" ? normalized : null;
}

// Reads and validates the optional fields of a PATCH body.
// Only fields present in the request are copied, so a tutor can never touch
// tutorEmail or approvalStatus — moderation belongs to the admin routes.
function buildUpdateFields(body) {
  const updateFields = {};

  if (body.title !== undefined) updateFields.title = requireString(body.title, "title");
  if (body.subject !== undefined) updateFields.subject = requireString(body.subject, "subject");
  if (body.classLevel !== undefined) {
    updateFields.classLevel = requireString(body.classLevel, "classLevel");
  }
  if (body.location !== undefined) updateFields.location = requireString(body.location, "location");
  if (body.bannerImage !== undefined) {
    updateFields.bannerImage = requireString(body.bannerImage, "bannerImage");
  }
  if (body.description !== undefined) {
    updateFields.description = requireString(body.description, "description");
  }

  if (body.mode !== undefined) {
    const mode = normalizeMode(body.mode);
    if (!mode) throw new ApiError(400, 'Invalid mode. Must be "Online" or "Offline".');
    updateFields.mode = mode;
  }

  if (body.monthlyFee !== undefined) {
    updateFields.monthlyFee = requireNumberInRange(body.monthlyFee, "monthlyFee", { min: 0 });
  }

  if (body.daysPerWeek !== undefined) {
    updateFields.daysPerWeek = requireNumberInRange(body.daysPerWeek, "daysPerWeek", {
      min: 1,
      max: 7,
    });
  }

  // Active/Closed toggle.
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw new ApiError(400, "isActive must be a boolean");
    }
    updateFields.isActive = body.isActive;
  }

  return updateFields;
}

// GET /api/tuitions — Public list with filters and pagination
router.get("/", async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  // Cap the page size so a large ?limit= cannot dump the whole collection.
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
  const search = req.query.search ? String(req.query.search).trim() : "";
  const subject = req.query.subject ? String(req.query.subject).trim() : "";
  // Accept both the documented ?classLevel= and the shorter ?class= alias.
  const classLevel = String(req.query.classLevel ?? req.query.class ?? "").trim();
  const mode = req.query.mode ? String(req.query.mode).trim() : "";

  const filter = { approvalStatus: "approved", isActive: true };

  // Challenge 1: the term matches the title OR the subject. The pattern is
  // escaped so user input can never be interpreted as regex syntax.
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: pattern }, { subject: pattern }];
  }
  if (subject) filter.subject = subject;
  if (classLevel) filter.classLevel = classLevel;

  const normalizedMode = normalizeMode(mode);
  if (normalizedMode) filter.mode = normalizedMode;

  const total = await Tuition.countDocuments(filter);
  const tuitions = await Tuition.find(filter)
    .select("-__v")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);

  res.json({
    success: true,
    data: tuitions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// GET /api/tuitions/mine — Tutor's own listings, including pending/rejected/closed
// NOTE: declared before "/:id", otherwise Express reads "mine" as an ObjectId.
router.get("/mine", verifyToken, verifyTutor, async (req, res) => {
  const tuitions = await Tuition.find({ tutorEmail: req.dbUser.email })
    .select("-__v")
    .sort({ createdAt: -1 });

  ok(res, tuitions);
});

// GET /api/tuitions/:id — Public single tuition.
// The owner also sees their own pending or closed listing, so the tutor's edit
// screen can load it; everyone else gets approved + active only.
router.get("/:id", optionalAuth, async (req, res) => {
  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid tuition ID format");
  }

  const tuition = await Tuition.findById(req.params.id).select("-__v");

  // The same 404 whether the listing never existed or is merely not public:
  // the response must not reveal that a hidden listing exists.
  if (!tuition) {
    throw new ApiError(404, "Tuition not found or not available");
  }

  const isPublic = tuition.approvalStatus === "approved" && tuition.isActive === true;
  const isOwner = Boolean(req.dbUser) && req.dbUser.email === tuition.tutorEmail;

  if (!isPublic && !isOwner) {
    throw new ApiError(404, "Tuition not found or not available");
  }

  ok(res, tuition);
});

// POST /api/tuitions — Tutor creates tuition (free plan limit applies)
router.post("/", verifyToken, verifyTutor, async (req, res) => {
  const body = req.body ?? {};
  const tutorName = req.dbUser.name;
  const tutorEmail = req.dbUser.email;

  requireFields(body, REQUIRED_FIELDS);

  const normalizedMode = normalizeMode(body.mode);
  if (!normalizedMode) {
    throw new ApiError(400, 'Invalid mode. Must be "Online" or "Offline".');
  }

  const monthlyFee = requireNumberInRange(body.monthlyFee, "monthlyFee", { min: 0 });
  const daysPerWeek = requireNumberInRange(body.daysPerWeek, "daysPerWeek", { min: 1, max: 7 });

  // Free plan limit check
  if (req.dbUser.plan === "free") {
    const activeTuitionCount = await Tuition.countDocuments({ tutorEmail, isActive: true });
    if (activeTuitionCount >= 2) {
      throw new ApiError(
        403,
        "Free plan limit reached: You can have a maximum of 2 active tuition posts. Upgrade to Pro to post more."
      );
    }
  }

  const newTuition = await Tuition.create({
    title: requireString(body.title, "title"),
    subject: requireString(body.subject, "subject"),
    classLevel: requireString(body.classLevel, "classLevel"),
    mode: normalizedMode,
    location: requireString(body.location, "location"),
    monthlyFee,
    daysPerWeek,
    bannerImage: requireString(body.bannerImage, "bannerImage"),
    description: requireString(body.description, "description"),
    tutorName: tutorName.trim(),
    tutorEmail: tutorEmail.trim(),
  });

  okWithMessage(
    res,
    "Tuition created successfully. It is pending admin approval.",
    newTuition,
    201
  );
});

// PATCH /api/tuitions/:id — Owner updates own tuition
router.patch("/:id", verifyToken, verifyTutor, async (req, res) => {
  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid tuition ID format");
  }

  const tuition = await Tuition.findById(req.params.id);
  if (!tuition) {
    throw new ApiError(404, "Tuition not found");
  }

  if (tuition.tutorEmail !== req.dbUser.email) {
    throw new ApiError(403, "Forbidden: You do not own this tuition");
  }

  const updateFields = buildUpdateFields(req.body ?? {});

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "No valid fields provided to update");
  }

  const updatedTuition = await Tuition.findByIdAndUpdate(
    req.params.id,
    { $set: updateFields },
    { new: true, runValidators: true }
  ).select("-__v");

  okWithMessage(res, "Tuition updated successfully", updatedTuition);
});

// DELETE /api/tuitions/:id — Owner deletes own tuition
router.delete("/:id", verifyToken, verifyTutor, async (req, res) => {
  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid tuition ID format");
  }

  const tuition = await Tuition.findById(req.params.id);
  if (!tuition) {
    throw new ApiError(404, "Tuition not found");
  }

  if (tuition.tutorEmail !== req.dbUser.email) {
    throw new ApiError(403, "Forbidden: You do not own this tuition");
  }

  await Tuition.deleteOne({ _id: req.params.id });

  okWithMessage(res, "Tuition deleted successfully");
});

export default router;
