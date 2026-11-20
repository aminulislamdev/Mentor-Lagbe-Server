import express from "express";
import Tuition from "../models/tuition.model.js";
import { authMiddleware, verifyTutor } from "../middleware/auth.middleware.js";
import { ok, okWithMessage, isObjectId } from "../utils/respond.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();

// Normalize mode to "Online" or "Offline"; returns null if invalid
function normalizeMode(mode) {
  if (typeof mode !== "string" || !mode.trim()) return null;
  const trimmed = mode.trim();
  const normalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  return normalized === "Online" || normalized === "Offline" ? normalized : null;
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
router.get("/mine", authMiddleware, verifyTutor, async (req, res) => {
  const tuitions = await Tuition.find({ tutorEmail: req.dbUser.email })
    .select("-__v")
    .sort({ createdAt: -1 });

  ok(res, tuitions);
});

// GET /api/tuitions/:id — Public single tuition
router.get("/:id", async (req, res) => {
  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid tuition ID format");
  }

  const tuition = await Tuition.findOne({
    _id: req.params.id,
    approvalStatus: "approved",
    isActive: true,
  }).select("-__v");

  if (!tuition) {
    throw new ApiError(404, "Tuition not found or not available");
  }

  ok(res, tuition);
});

// POST /api/tuitions — Tutor creates tuition (free plan limit applies)
router.post("/", authMiddleware, verifyTutor, async (req, res) => {
  const body = req.body ?? {};
  const tutorName = req.dbUser.name;
  const tutorEmail = req.dbUser.email;
  const tutorPlan = req.dbUser.plan;

  // Required field validation (simple loop)
  const requiredFields = [
    "title", "subject", "classLevel", "mode", "location",
    "monthlyFee", "daysPerWeek", "bannerImage", "description",
  ];
  const missingFields = requiredFields.filter((f) => !body[f]);

  if (missingFields.length > 0) {
    throw new ApiError(400, "Missing required fields", { missingFields });
  }

  const normalizedMode = normalizeMode(body.mode);
  if (!normalizedMode) {
    throw new ApiError(400, 'Invalid mode. Must be "Online" or "Offline".');
  }

  const monthlyFeeNum = Number(body.monthlyFee);
  const daysPerWeekNum = Number(body.daysPerWeek);

  if (isNaN(monthlyFeeNum) || monthlyFeeNum < 0) {
    throw new ApiError(400, "monthlyFee must be a non-negative number");
  }
  if (isNaN(daysPerWeekNum) || daysPerWeekNum < 1 || daysPerWeekNum > 7) {
    throw new ApiError(400, "daysPerWeek must be a number between 1 and 7");
  }

  // Free plan limit check
  if (tutorPlan === "free") {
    const activeTuitionCount = await Tuition.countDocuments({ tutorEmail, isActive: true });
    if (activeTuitionCount >= 2) {
      throw new ApiError(
        403,
        "Free plan limit reached: You can have a maximum of 2 active tuition posts. Upgrade to Pro to post more."
      );
    }
  }

  const newTuition = await Tuition.create({
    title: body.title.trim(),
    subject: body.subject.trim(),
    classLevel: body.classLevel.trim(),
    mode: normalizedMode,
    location: body.location.trim(),
    monthlyFee: monthlyFeeNum,
    daysPerWeek: daysPerWeekNum,
    bannerImage: body.bannerImage.trim(),
    description: body.description.trim(),
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
router.patch("/:id", authMiddleware, verifyTutor, async (req, res) => {
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

  const body = req.body ?? {};
  const updateFields = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      throw new ApiError(400, "title must be a non-empty string");
    }
    updateFields.title = body.title.trim();
  }

  if (body.subject !== undefined) {
    if (typeof body.subject !== "string" || !body.subject.trim()) {
      throw new ApiError(400, "subject must be a non-empty string");
    }
    updateFields.subject = body.subject.trim();
  }

  if (body.classLevel !== undefined) {
    if (typeof body.classLevel !== "string" || !body.classLevel.trim()) {
      throw new ApiError(400, "classLevel must be a non-empty string");
    }
    updateFields.classLevel = body.classLevel.trim();
  }

  if (body.mode !== undefined) {
    const normalizedMode = normalizeMode(body.mode);
    if (!normalizedMode) {
      throw new ApiError(400, 'Invalid mode. Must be "Online" or "Offline".');
    }
    updateFields.mode = normalizedMode;
  }

  if (body.location !== undefined) {
    if (typeof body.location !== "string" || !body.location.trim()) {
      throw new ApiError(400, "location must be a non-empty string");
    }
    updateFields.location = body.location.trim();
  }

  if (body.monthlyFee !== undefined) {
    const monthlyFeeNum = Number(body.monthlyFee);
    if (isNaN(monthlyFeeNum) || monthlyFeeNum < 0) {
      throw new ApiError(400, "monthlyFee must be a non-negative number");
    }
    updateFields.monthlyFee = monthlyFeeNum;
  }

  if (body.daysPerWeek !== undefined) {
    const daysPerWeekNum = Number(body.daysPerWeek);
    if (isNaN(daysPerWeekNum) || daysPerWeekNum < 1 || daysPerWeekNum > 7) {
      throw new ApiError(400, "daysPerWeek must be a number between 1 and 7");
    }
    updateFields.daysPerWeek = daysPerWeekNum;
  }

  if (body.bannerImage !== undefined) {
    if (typeof body.bannerImage !== "string" || !body.bannerImage.trim()) {
      throw new ApiError(400, "bannerImage must be a non-empty string");
    }
    updateFields.bannerImage = body.bannerImage.trim();
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string" || !body.description.trim()) {
      throw new ApiError(400, "description must be a non-empty string");
    }
    updateFields.description = body.description.trim();
  }

  // Active/Closed toggle. Only a boolean is accepted, and approvalStatus is
  // deliberately NOT updatable here — moderation belongs to the admin routes,
  // otherwise a tutor could silently re-approve their own listing.
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      throw new ApiError(400, "isActive must be a boolean");
    }
    updateFields.isActive = body.isActive;
  }

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
router.delete("/:id", authMiddleware, verifyTutor, async (req, res) => {
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
