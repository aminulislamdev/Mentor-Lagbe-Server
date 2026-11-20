import express from "express";
import Tuition from "../models/tuition.model.js";

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

export default router;
