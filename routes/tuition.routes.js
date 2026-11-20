import express from "express";
import Tuition from "../models/tuition.model.js";
import { verifyToken, verifyTutor, optionalAuth } from "../middleware/auth.middleware.js";
import { ok, okWithMessage } from "../utils/respond.js";
import {
  isObjectId,
  requireFields,
  requireString,
  requireNumberInRange,
  requireOneOf,
  searchPattern,
  parsePagination,
} from "../utils/validate.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();

const REQUIRED_FIELDS = [
  "title", "subject", "classLevel", "mode", "location",
  "monthlyFee", "daysPerWeek", "bannerImage", "description",
];

// Allowed ?sort= values. Each maps to a Mongo sort, newest first as the tiebreak.
const SORT_OPTIONS = {
  newest: { createdAt: -1 },
  fee_asc: { monthlyFee: 1, createdAt: -1 },
  fee_desc: { monthlyFee: -1, createdAt: -1 },
};

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
  const { page, limit, skip } = parsePagination(req.query);
  const search = req.query.search ? String(req.query.search).trim() : "";
  const subject = req.query.subject ? String(req.query.subject).trim() : "";
  // Accept both the documented ?classLevel= and the shorter ?class= alias.
  const classLevel = String(req.query.classLevel ?? req.query.class ?? "").trim();
  const mode = req.query.mode ? String(req.query.mode).trim() : "";

  const filter = { approvalStatus: "approved", isActive: true };

  // Challenge 1: the term matches the title OR the subject.
  if (search) {
    const pattern = searchPattern(search);
    filter.$or = [{ title: pattern }, { subject: pattern }];
  }
  if (subject) filter.subject = subject;
  if (classLevel) filter.classLevel = classLevel;

  const normalizedMode = normalizeMode(mode);
  if (normalizedMode) filter.mode = normalizedMode;

  // Budget range: ?minFee=&maxFee= (either one alone is allowed).
  const minFee = req.query.minFee ? req.query.minFee : undefined;
  const maxFee = req.query.maxFee ? req.query.maxFee : undefined;
  const feeRange = {};

  if (minFee !== undefined) {
    feeRange.$gte = requireNumberInRange(minFee, "minFee", { min: 0 });
  }
  if (maxFee !== undefined) {
    feeRange.$lte = requireNumberInRange(maxFee, "maxFee", { min: 0 });
  }
  if (feeRange.$gte !== undefined && feeRange.$lte !== undefined && feeRange.$gte > feeRange.$lte) {
    throw new ApiError(400, "maxFee must be greater than or equal to minFee");
  }
  if (Object.keys(feeRange).length > 0) filter.monthlyFee = feeRange;

  // ?sort= is optional; anything else is a 400 instead of being silently ignored.
  const sortKey = req.query.sort
    ? requireOneOf(String(req.query.sort), "sort", Object.keys(SORT_OPTIONS))
    : "newest";

  const total = await Tuition.countDocuments(filter);
  const tuitions = await Tuition.find(filter)
    .select("-__v")
    .sort(SORT_OPTIONS[sortKey])
    .skip(skip)
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
    { returnDocument: "after", runValidators: true }
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
