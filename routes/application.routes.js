import express from "express";
import Application from "../models/application.model.js";
import Tuition from "../models/tuition.model.js";
import {
  authMiddleware,
  verifyStudent,
  verifyTutor,
} from "../middleware/auth.middleware.js";
import { ok, okWithMessage, fail, isObjectId } from "../utils/respond.js";

const router = express.Router();

// The only two statuses a tutor may set. "pending" is reachable only by applying.
const TUTOR_DECISIONS = ["accepted", "rejected"];

/**
 * POST /api/applications  (student)
 * --------------------------------
 * Body: { tuitionId, studentPhone, preferredSchedule, studentNote? }
 *
 * Only approved + active tuitions are applicable. The tuition's facts are
 * snapshotted onto the application so the student's ledger stays readable even
 * if the tutor later edits or deletes the listing.
 */
router.post("/", authMiddleware, verifyStudent, async (req, res) => {
  try {
    const { tuitionId, studentPhone, preferredSchedule, studentNote } =
      req.body ?? {};

    if (!isObjectId(tuitionId)) {
      return fail(res, 400, "Invalid tuitionId format");
    }

    if (typeof studentPhone !== "string" || studentPhone.trim().length < 6) {
      return fail(res, 400, "studentPhone is required (at least 6 characters)");
    }

    if (
      typeof preferredSchedule !== "string" ||
      !preferredSchedule.trim()
    ) {
      return fail(res, 400, "preferredSchedule is required");
    }

    if (studentNote !== undefined && typeof studentNote !== "string") {
      return fail(res, 400, "studentNote must be a string");
    }

    const tuition = await Tuition.findOne({
      _id: tuitionId,
      approvalStatus: "approved",
      isActive: true,
    });

    if (!tuition) {
      return fail(res, 404, "Tuition is not open for applications");
    }

    const studentEmail = req.dbUser.email;

    // One active application per student per tuition. A rejected/cancelled
    // application may be submitted again, so those statuses are excluded.
    const duplicate = await Application.findOne({
      tuitionId,
      studentEmail,
      status: { $in: ["pending", "accepted"] },
    });

    if (duplicate) {
      return fail(res, 409, "You have already applied to this tuition");
    }

    const application = await Application.create({
      tuitionId,
      tuitionTitle: tuition.title,
      subject: tuition.subject,
      monthlyFee: tuition.monthlyFee,
      tutorEmail: tuition.tutorEmail,
      studentName: req.dbUser.name,
      studentEmail,
      studentPhone: studentPhone.trim(),
      preferredSchedule: preferredSchedule.trim(),
      studentNote: (studentNote ?? "").trim(),
      status: "pending",
    });

    return okWithMessage(
      res,
      "Application submitted. The tutor will review it shortly.",
      application,
      201
    );
  } catch (error) {
    console.error("Error creating application:", error);
    return fail(res, 500, "Internal server error");
  }
});

/**
 * GET /api/applications/student  (student)
 * ---------------------------------------
 * Every application the signed-in student has submitted, newest first.
 */
router.get("/student", authMiddleware, verifyStudent, async (req, res) => {
  try {
    const applications = await Application.find({
      studentEmail: req.dbUser.email,
    })
      .select("-__v")
      .sort({ appliedAt: -1 });

    return ok(res, applications);
  } catch (error) {
    console.error("Error fetching student applications:", error);
    return fail(res, 500, "Internal server error");
  }
});

/**
 * GET /api/applications/tutor  (tutor)
 * -----------------------------------
 * Applicants across all of this tutor's tuitions, newest first.
 * Optional filter: ?tuitionId=<id>
 */
router.get("/tutor", authMiddleware, verifyTutor, async (req, res) => {
  try {
    const filter = { tutorEmail: req.dbUser.email };

    if (req.query.tuitionId) {
      if (!isObjectId(req.query.tuitionId)) {
        return fail(res, 400, "Invalid tuitionId filter");
      }
      filter.tuitionId = String(req.query.tuitionId);
    }

    const applications = await Application.find(filter)
      .select("-__v")
      .sort({ appliedAt: -1 });

    return ok(res, applications);
  } catch (error) {
    console.error("Error fetching tutor applications:", error);
    return fail(res, 500, "Internal server error");
  }
});

/**
 * PATCH /api/applications/:id/status  (tutor)
 * -------------------------------------------
 * Body: { status: "accepted" | "rejected" }
 * Only the tutor who owns the tuition may decide. Re-sending the current
 * status is treated as a no-op success so the UI can retry safely.
 */
router.patch("/:id/status", authMiddleware, verifyTutor, async (req, res) => {
  try {
    const { status } = req.body ?? {};

    if (!TUTOR_DECISIONS.includes(status)) {
      return fail(res, 400, 'status must be either "accepted" or "rejected"');
    }

    if (!isObjectId(req.params.id)) {
      return fail(res, 400, "Invalid application ID format");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return fail(res, 404, "Application not found");
    }

    if (application.tutorEmail !== req.dbUser.email) {
      return fail(res, 403, "Forbidden: You do not own this application");
    }

    if (application.status === status) {
      return okWithMessage(res, `Application is already ${status}`, application);
    }

    application.status = status;
    await application.save();

    return okWithMessage(res, `Application ${status}`, application);
  } catch (error) {
    console.error("Error updating application status:", error);
    return fail(res, 500, "Internal server error");
  }
});

/**
 * DELETE /api/applications/:id  (student)
 * ---------------------------------------
 * Students may withdraw only while the application is still pending.
 */
router.delete("/:id", authMiddleware, verifyStudent, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return fail(res, 400, "Invalid application ID format");
    }

    const application = await Application.findById(req.params.id);

    if (!application) {
      return fail(res, 404, "Application not found");
    }

    if (application.studentEmail !== req.dbUser.email) {
      return fail(res, 403, "Forbidden: You do not own this application");
    }

    if (application.status !== "pending") {
      return fail(
        res,
        409,
        `Only pending applications can be cancelled (this one is ${application.status})`
      );
    }

    await Application.deleteOne({ _id: application._id });

    return okWithMessage(res, "Application cancelled");
  } catch (error) {
    console.error("Error deleting application:", error);
    return fail(res, 500, "Internal server error");
  }
});

export default router;
