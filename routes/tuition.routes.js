import express from "express";
import Tuition from "../models/tuition.model.js";
import { authMiddleware, verifyTutor } from "../middleware/auth.middleware.js";

const router = express.Router();

// Normalize mode to "Online" or "Offline"; returns null if invalid
function normalizeMode(mode) {
  const normalized = mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
  return normalized === "Online" || normalized === "Offline" ? normalized : null;
}

// GET /api/tuitions — Public list with filters and pagination
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const search = req.query.search ? String(req.query.search).trim() : "";
    const subject = req.query.subject ? String(req.query.subject).trim() : "";
    const classLevel = req.query.class ? String(req.query.class).trim() : "";
    const mode = req.query.mode ? String(req.query.mode).trim() : "";

    const filter = { approvalStatus: "approved", isActive: true };

    if (search) filter.title = { $regex: search, $options: "i" };
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
  } catch (error) {
    console.error("Error fetching tuitions:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// GET /api/tuitions/:id — Public single tuition
router.get("/:id", async (req, res) => {
  try {
    const tuitionId = req.params.id;
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(tuitionId)) {
      return res.status(400).json({ success: false, error: "Invalid tuition ID format" });
    }

    const tuition = await Tuition.findOne({
      _id: tuitionId,
      approvalStatus: "approved",
      isActive: true,
    }).select("-__v");

    if (!tuition) {
      return res.status(404).json({ success: false, error: "Tuition not found or not available" });
    }

    res.json({ success: true, data: tuition });
  } catch (error) {
    console.error("Error fetching tuition:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// POST /api/tuitions — Tutor creates tuition (free plan limit applies)
router.post("/", authMiddleware, verifyTutor, async (req, res) => {
  try {
    const tutorName = req.dbUser.name;
    const tutorEmail = req.dbUser.email;
    const tutorPlan = req.dbUser.plan;

    // Required field validation (simple loop)
    const requiredFields = [
      "title", "subject", "classLevel", "mode", "location",
      "monthlyFee", "daysPerWeek", "bannerImage", "description",
    ];
    const missingFields = requiredFields.filter((f) => !req.body[f]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        missingFields,
      });
    }

    const normalizedMode = normalizeMode(req.body.mode);
    if (!normalizedMode) {
      return res.status(400).json({ success: false, error: 'Invalid mode. Must be "Online" or "Offline".' });
    }

    const monthlyFeeNum = Number(req.body.monthlyFee);
    const daysPerWeekNum = Number(req.body.daysPerWeek);

    if (isNaN(monthlyFeeNum) || monthlyFeeNum < 0) {
      return res.status(400).json({ success: false, error: "monthlyFee must be a non-negative number" });
    }
    if (isNaN(daysPerWeekNum) || daysPerWeekNum < 1 || daysPerWeekNum > 7) {
      return res.status(400).json({ success: false, error: "daysPerWeek must be a number between 1 and 7" });
    }

    // Free plan limit check
    if (tutorPlan === "free") {
      const activeTuitionCount = await Tuition.countDocuments({ tutorEmail, isActive: true });
      if (activeTuitionCount >= 2) {
        return res.status(403).json({
          success: false,
          error: "Free plan limit reached: You can have a maximum of 2 active tuition posts. Upgrade to Pro to post more.",
        });
      }
    }

    const newTuition = await Tuition.create({
      title: req.body.title.trim(),
      subject: req.body.subject.trim(),
      classLevel: req.body.classLevel.trim(),
      mode: normalizedMode,
      location: req.body.location.trim(),
      monthlyFee: monthlyFeeNum,
      daysPerWeek: daysPerWeekNum,
      bannerImage: req.body.bannerImage.trim(),
      description: req.body.description.trim(),
      tutorName: tutorName.trim(),
      tutorEmail: tutorEmail.trim(),
    });

    res.status(201).json({
      success: true,
      message: "Tuition created successfully. It is pending admin approval.",
      data: newTuition,
    });
  } catch (error) {
    console.error("Error creating tuition:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// PATCH /api/tuitions/:id — Owner updates own tuition
router.patch("/:id", authMiddleware, verifyTutor, async (req, res) => {
  try {
    const tuitionId = req.params.id;
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(tuitionId)) {
      return res.status(400).json({ success: false, error: "Invalid tuition ID format" });
    }

    const tuition = await Tuition.findById(tuitionId);
    if (!tuition) {
      return res.status(404).json({ success: false, error: "Tuition not found" });
    }

    if (tuition.tutorEmail !== req.dbUser.email) {
      return res.status(403).json({ success: false, error: "Forbidden: You do not own this tuition" });
    }

    const updateFields = {};

    if (req.body.title !== undefined) {
      if (typeof req.body.title !== "string" || !req.body.title.trim()) {
        return res.status(400).json({ success: false, error: "title must be a non-empty string" });
      }
      updateFields.title = req.body.title.trim();
    }

    if (req.body.subject !== undefined) {
      if (typeof req.body.subject !== "string" || !req.body.subject.trim()) {
        return res.status(400).json({ success: false, error: "subject must be a non-empty string" });
      }
      updateFields.subject = req.body.subject.trim();
    }

    if (req.body.classLevel !== undefined) {
      if (typeof req.body.classLevel !== "string" || !req.body.classLevel.trim()) {
        return res.status(400).json({ success: false, error: "classLevel must be a non-empty string" });
      }
      updateFields.classLevel = req.body.classLevel.trim();
    }

    if (req.body.mode !== undefined) {
      const normalizedMode = normalizeMode(req.body.mode);
      if (!normalizedMode) {
        return res.status(400).json({ success: false, error: 'Invalid mode. Must be "Online" or "Offline".' });
      }
      updateFields.mode = normalizedMode;
    }

    if (req.body.location !== undefined) {
      if (typeof req.body.location !== "string" || !req.body.location.trim()) {
        return res.status(400).json({ success: false, error: "location must be a non-empty string" });
      }
      updateFields.location = req.body.location.trim();
    }

    if (req.body.monthlyFee !== undefined) {
      const monthlyFeeNum = Number(req.body.monthlyFee);
      if (isNaN(monthlyFeeNum) || monthlyFeeNum < 0) {
        return res.status(400).json({ success: false, error: "monthlyFee must be a non-negative number" });
      }
      updateFields.monthlyFee = monthlyFeeNum;
    }

    if (req.body.daysPerWeek !== undefined) {
      const daysPerWeekNum = Number(req.body.daysPerWeek);
      if (isNaN(daysPerWeekNum) || daysPerWeekNum < 1 || daysPerWeekNum > 7) {
        return res.status(400).json({ success: false, error: "daysPerWeek must be a number between 1 and 7" });
      }
      updateFields.daysPerWeek = daysPerWeekNum;
    }

    if (req.body.bannerImage !== undefined) {
      if (typeof req.body.bannerImage !== "string" || !req.body.bannerImage.trim()) {
        return res.status(400).json({ success: false, error: "bannerImage must be a non-empty string" });
      }
      updateFields.bannerImage = req.body.bannerImage.trim();
    }

    if (req.body.description !== undefined) {
      if (typeof req.body.description !== "string" || !req.body.description.trim()) {
        return res.status(400).json({ success: false, error: "description must be a non-empty string" });
      }
      updateFields.description = req.body.description.trim();
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ success: false, error: "No valid fields provided to update" });
    }

    const updatedTuition = await Tuition.findByIdAndUpdate(
      tuitionId,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select("-__v");

    res.json({
      success: true,
      message: "Tuition updated successfully",
      data: updatedTuition,
    });
  } catch (error) {
    console.error("Error updating tuition:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// DELETE /api/tuitions/:id — Owner deletes own tuition
router.delete("/:id", authMiddleware, verifyTutor, async (req, res) => {
  try {
    const tuitionId = req.params.id;
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(tuitionId)) {
      return res.status(400).json({ success: false, error: "Invalid tuition ID format" });
    }

    const tuition = await Tuition.findById(tuitionId);
    if (!tuition) {
      return res.status(404).json({ success: false, error: "Tuition not found" });
    }

    if (tuition.tutorEmail !== req.dbUser.email) {
      return res.status(403).json({ success: false, error: "Forbidden: You do not own this tuition" });
    }

    await Tuition.deleteOne({ _id: tuitionId });

    res.json({
      success: true,
      message: "Tuition deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting tuition:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

export default router;