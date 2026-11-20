import express from "express";
import Tuition from "../models/tuition.model.js";
import User from "../models/user.model.js";
import { authMiddleware, verifyTutor } from "../middleware/auth.middleware.js";

const router = express.Router();

// GET /api/tuitions
// Public endpoint to list approved and active tuitions with filters and pagination.
//
// Query parameters:
//   page     - Page number (default: 1)
//   limit    - Items per page (default: 10)
//   search   - Search in tuition title (case-insensitive)
//   subject  - Filter by subject (exact match)
//   class    - Filter by class level (exact match, maps to classLevel)
//   mode     - Filter by mode: Online or Offline (exact match)
//
// Response includes:
//   data      - Array of tuition documents
//   pagination - Total count, current page, limit, total pages
router.get("/", async (req, res) => {
  try {
    // --- Parse and sanitize query parameters ---
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const search = req.query.search ? String(req.query.search).trim() : "";
    const subject = req.query.subject ? String(req.query.subject).trim() : "";
    const classLevel = req.query.class ? String(req.query.class).trim() : "";
    const mode = req.query.mode ? String(req.query.mode).trim() : "";

    // --- Build MongoDB filter ---
    // Only approved and active tuitions are visible to the public.
    const filter = {
      approvalStatus: "approved",
      isActive: true,
    };

    // Search in tuition title (case-insensitive)
    if (search) {
      filter.title = { $regex: search, $options: "i" };
    }

    // Subject filter (exact match)
    if (subject) {
      filter.subject = subject;
    }

    // Class level filter (exact match; query param is "class", DB field is "classLevel")
    if (classLevel) {
      filter.classLevel = classLevel;
    }

    // Mode filter (exact match; normalize first letter to match "Online"/"Offline")
    if (mode) {
      const normalizedMode =
        mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
      if (normalizedMode === "Online" || normalizedMode === "Offline") {
        filter.mode = normalizedMode;
      }
    }

    // --- Count total matching documents ---
    const total = await Tuition.countDocuments(filter);

    // --- Fetch paginated results ---
    const tuitions = await Tuition.find(filter)
      .select("-__v")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // --- Calculate total pages ---
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: tuitions,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching tuitions:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// GET /api/tuitions/:id
// Public endpoint to get a single approved and active tuition by ID.
//
// Path parameter:
//   id - MongoDB ObjectId of the tuition
//
// Response includes:
//   data - Single tuition document (with tutor info embedded)
// Returns 404 if tuition is not found or not approved/active.
// Returns 400 if ID is not a valid ObjectId.
router.get("/:id", async (req, res) => {
  try {
    const tuitionId = req.params.id;

    // --- Validate MongoDB ObjectId format ---
    // ObjectId is a 24-character hexadecimal string.
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(tuitionId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid tuition ID format",
      });
    }

    // --- Find only approved and active tuition ---
    const tuition = await Tuition.findOne({
      _id: tuitionId,
      approvalStatus: "approved",
      isActive: true,
    }).select("-__v");

    if (!tuition) {
      return res.status(404).json({
        success: false,
        error: "Tuition not found or not available",
      });
    }

    res.json({
      success: true,
      data: tuition,
    });
  } catch (error) {
    console.error("Error fetching tuition:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// POST /api/tuitions
// Protected endpoint for tutors to create a new tuition post.
// Only authenticated tutors can create tuition.
// Free plan tutors can have a maximum of 2 active tuition posts.
//
// Body parameters:
//   title         - Tuition title (required)
//   subject       - Subject name (required)
//   classLevel    - Class level (required)
//   mode          - "Online" or "Offline" (required)
//   location      - Location (required)
//   monthlyFee    - Monthly fee (required, number)
//   daysPerWeek   - Days per week (required, number)
//   bannerImage   - Banner image URL (required)
//   description   - Tuition description (required)
//
// Fields set automatically (NOT from frontend):
//   tutorName     - From authenticated user's name
//   tutorEmail    - From authenticated user's email
//   approvalStatus - Always "pending"
//   isActive      - Always true
router.post(
  "/",
  authMiddleware,
  verifyTutor,
  async (req, res) => {
    try {
      // --- Get authenticated tutor info from database (source of truth) ---
      // Never trust tutor ID or role sent by the frontend.
      const tutorId = req.userId; // from JWT payload
      const tutorName = req.dbUser.name;
      const tutorEmail = req.dbUser.email;
      const tutorPlan = req.dbUser.plan;

      // --- Extract and validate required body fields ---
      const {
        title,
        subject,
        classLevel,
        mode,
        location,
        monthlyFee,
        daysPerWeek,
        bannerImage,
        description,
      } = req.body;

      const missingFields = [];
      if (!title) missingFields.push("title");
      if (!subject) missingFields.push("subject");
      if (!classLevel) missingFields.push("classLevel");
      if (!mode) missingFields.push("mode");
      if (!location) missingFields.push("location");
      if (monthlyFee === undefined || monthlyFee === null)
        missingFields.push("monthlyFee");
      if (daysPerWeek === undefined || daysPerWeek === null)
        missingFields.push("daysPerWeek");
      if (!bannerImage) missingFields.push("bannerImage");
      if (!description) missingFields.push("description");

      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields",
          missingFields,
        });
      }

      // --- Validate mode value ---
      const normalizedMode =
        mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
      if (normalizedMode !== "Online" && normalizedMode !== "Offline") {
        return res.status(400).json({
          success: false,
          error: 'Invalid mode. Must be "Online" or "Offline".',
        });
      }

      // --- Validate numeric fields ---
      const monthlyFeeNum = Number(monthlyFee);
      const daysPerWeekNum = Number(daysPerWeek);

      if (isNaN(monthlyFeeNum) || monthlyFeeNum < 0) {
        return res.status(400).json({
          success: false,
          error: "monthlyFee must be a non-negative number",
        });
      }
      if (isNaN(daysPerWeekNum) || daysPerWeekNum < 1 || daysPerWeekNum > 7) {
        return res.status(400).json({
          success: false,
          error: "daysPerWeek must be a number between 1 and 7",
        });
      }

      // --- Free Plan Limit Check ---
      // Free plan tutors can have a maximum of 2 active tuition posts.
      // Check subscription details from the database (not from frontend).
      if (tutorPlan === "free") {
        const activeTuitionCount = await Tuition.countDocuments({
          tutorEmail,
          isActive: true,
        });

        if (activeTuitionCount >= 2) {
          return res.status(403).json({
            success: false,
            error:
              "Free plan limit reached: You can have a maximum of 2 active tuition posts. Upgrade to Pro to post more.",
          });
        }
      }

      // --- Create tuition document ---
      // Prevent frontend from setting approvalStatus, tutorName, or tutorEmail.
      // approvalStatus always starts as "pending" (awaits admin approval).
      // isActive is true by default.
      const newTuition = await Tuition.create({
        title: title.trim(),
        subject: subject.trim(),
        classLevel: classLevel.trim(),
        mode: normalizedMode,
        location: location.trim(),
        monthlyFee: monthlyFeeNum,
        daysPerWeek: daysPerWeekNum,
        bannerImage: bannerImage.trim(),
        description: description.trim(),
        tutorName: tutorName.trim(),
        tutorEmail: tutorEmail.trim(),
        // approvalStatus defaults to "pending" in schema
        // isActive defaults to true in schema
        // createdAt and updatedAt handled by timestamps
      });

      res.status(201).json({
        success: true,
        message: "Tuition created successfully. It is pending admin approval.",
        data: newTuition,
      });
    } catch (error) {
      console.error("Error creating tuition:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

// PATCH /api/tuitions/:id
// Protected endpoint for tutors to update their own tuition post.
// Only the tutor who owns the tuition can update it.
//
// Path parameter:
//   id - MongoDB ObjectId of the tuition
//
// Body parameters (all optional):
//   title         - Tuition title
//   subject       - Subject name
//   classLevel    - Class level
//   mode          - "Online" or "Offline"
//   location      - Location
//   monthlyFee    - Monthly fee (number)
//   daysPerWeek   - Days per week (number)
//   bannerImage   - Banner image URL
//   description   - Tuition description
//
// Protected fields (never updated by tutor):
//   _id, tutorName, tutorEmail (ownership)
//   approvalStatus (admin-controlled)
//   createdAt, updatedAt (system timestamps)
router.patch(
  "/:id",
  authMiddleware,
  verifyTutor,
  async (req, res) => {
    try {
      const tuitionId = req.params.id;

      // --- Validate MongoDB ObjectId format ---
      const objectIdRegex = /^[0-9a-fA-F]{24}$/;
      if (!objectIdRegex.test(tuitionId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid tuition ID format",
        });
      }

      // --- Extract update fields from body ---
      const {
        title,
        subject,
        classLevel,
        mode,
        location,
        monthlyFee,
        daysPerWeek,
        bannerImage,
        description,
      } = req.body;

      // --- Build update object with only allowed fields ---
      const updateFields = {};

      if (title !== undefined) {
        if (typeof title !== "string" || !title.trim()) {
          return res.status(400).json({
            success: false,
            error: "title must be a non-empty string",
          });
        }
        updateFields.title = title.trim();
      }

      if (subject !== undefined) {
        if (typeof subject !== "string" || !subject.trim()) {
          return res.status(400).json({
            success: false,
            error: "subject must be a non-empty string",
          });
        }
        updateFields.subject = subject.trim();
      }

      if (classLevel !== undefined) {
        if (typeof classLevel !== "string" || !classLevel.trim()) {
          return res.status(400).json({
            success: false,
            error: "classLevel must be a non-empty string",
          });
        }
        updateFields.classLevel = classLevel.trim();
      }

      if (mode !== undefined) {
        const normalizedMode =
          mode.charAt(0).toUpperCase() + mode.slice(1).toLowerCase();
        if (normalizedMode !== "Online" && normalizedMode !== "Offline") {
          return res.status(400).json({
            success: false,
            error: 'Invalid mode. Must be "Online" or "Offline".',
          });
        }
        updateFields.mode = normalizedMode;
      }

      if (location !== undefined) {
        if (typeof location !== "string" || !location.trim()) {
          return res.status(400).json({
            success: false,
            error: "location must be a non-empty string",
          });
        }
        updateFields.location = location.trim();
      }

      if (monthlyFee !== undefined) {
        const monthlyFeeNum = Number(monthlyFee);
        if (isNaN(monthlyFeeNum) || monthlyFeeNum < 0) {
          return res.status(400).json({
            success: false,
            error: "monthlyFee must be a non-negative number",
          });
        }
        updateFields.monthlyFee = monthlyFeeNum;
      }

      if (daysPerWeek !== undefined) {
        const daysPerWeekNum = Number(daysPerWeek);
        if (
          isNaN(daysPerWeekNum) ||
          daysPerWeekNum < 1 ||
          daysPerWeekNum > 7
        ) {
          return res.status(400).json({
            success: false,
            error: "daysPerWeek must be a number between 1 and 7",
          });
        }
        updateFields.daysPerWeek = daysPerWeekNum;
      }

      if (bannerImage !== undefined) {
        if (typeof bannerImage !== "string" || !bannerImage.trim()) {
          return res.status(400).json({
            success: false,
            error: "bannerImage must be a non-empty string",
          });
        }
        updateFields.bannerImage = bannerImage.trim();
      }

      if (description !== undefined) {
        if (typeof description !== "string" || !description.trim()) {
          return res.status(400).json({
            success: false,
            error: "description must be a non-empty string",
          });
        }
        updateFields.description = description.trim();
      }

      // --- Reject empty update requests ---
      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({
          success: false,
          error: "No valid fields provided to update",
        });
      }

      // --- Find the tuition by ID ---
      const tuition = await Tuition.findById(tuitionId);

      if (!tuition) {
        return res.status(404).json({
          success: false,
          error: "Tuition not found",
        });
      }

      // --- Verify ownership ---
      // Never trust frontend-provided tutor ID; use the authenticated
      // tutor's email from the database to check ownership.
      if (tuition.tutorEmail !== req.dbUser.email) {
        return res.status(403).json({
          success: false,
          error: "Forbidden: You do not own this tuition",
        });
      }

      // --- Update only allowed fields ---
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
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  }
);

export default router;
