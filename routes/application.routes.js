import express from "express";
import Application from "../models/application.model.js";
import Tuition from "../models/tuition.model.js";
import {
  verifyToken,
  verifyStudent,
  verifyTutor,
} from "../middleware/auth.middleware.js";
import { ok, okWithMessage } from "../utils/respond.js";
import { isObjectId, requireString, requireOneOf } from "../utils/validate.js";
import { ApiError } from "../utils/ApiError.js";

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
router.post("/", verifyToken, verifyStudent, async (req, res) => {
  const { tuitionId, studentPhone, preferredSchedule, studentNote } = req.body ?? {};

  if (!isObjectId(tuitionId)) {
    throw new ApiError(400, "Invalid tuitionId format");
  }

  const phone = requireString(studentPhone, "studentPhone", { minLength: 6 });
  const schedule = requireString(preferredSchedule, "preferredSchedule");

  if (studentNote !== undefined && typeof studentNote !== "string") {
    throw new ApiError(400, "studentNote must be a string");
  }

  const tuition = await Tuition.findOne({
    _id: tuitionId,
    approvalStatus: "approved",
    isActive: true,
  });

  if (!tuition) {
    throw new ApiError(404, "Tuition is not open for applications");
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
    throw new ApiError(409, "You have already applied to this tuition");
  }

  const application = await Application.create({
    tuitionId,
    tuitionTitle: tuition.title,
    subject: tuition.subject,
    monthlyFee: tuition.monthlyFee,
    tutorEmail: tuition.tutorEmail,
    studentName: req.dbUser.name,
    studentEmail,
    studentPhone: phone,
    preferredSchedule: schedule,
    studentNote: (studentNote ?? "").trim(),
    status: "pending",
  });

  okWithMessage(
    res,
    "Application submitted. The tutor will review it shortly.",
    application,
    201
  );
});

/**
 * GET /api/applications/student  (student)
 * ---------------------------------------
 * Every application the signed-in student has submitted, newest first.
 */
router.get("/student", verifyToken, verifyStudent, async (req, res) => {
  const applications = await Application.find({ studentEmail: req.dbUser.email })
    .select("-__v")
    .sort({ appliedAt: -1 });

  ok(res, applications);
});

/**
 * GET /api/applications/tutor  (tutor)
 * -----------------------------------
 * Applicants across all of this tutor's tuitions, newest first.
 * Optional filter: ?tuitionId=<id>
 */
router.get("/tutor", verifyToken, verifyTutor, async (req, res) => {
  const filter = { tutorEmail: req.dbUser.email };

  if (req.query.tuitionId) {
    if (!isObjectId(req.query.tuitionId)) {
      throw new ApiError(400, "Invalid tuitionId filter");
    }
    filter.tuitionId = String(req.query.tuitionId);
  }

  const applications = await Application.find(filter)
    .select("-__v")
    .sort({ appliedAt: -1 });

  ok(res, applications);
});

/**
 * PATCH /api/applications/:id/status  (tutor)
 * -------------------------------------------
 * Body: { status: "accepted" | "rejected" }
 * Only the tutor who owns the tuition may decide. Re-sending the current
 * status is treated as a no-op success so the UI can retry safely.
 */
router.patch("/:id/status", verifyToken, verifyTutor, async (req, res) => {
  const decision = requireOneOf((req.body ?? {}).status, "status", TUTOR_DECISIONS);

  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid application ID format");
  }

  const application = await Application.findById(req.params.id);

  if (!application) {
    throw new ApiError(404, "Application not found");
  }

  if (application.tutorEmail !== req.dbUser.email) {
    throw new ApiError(403, "Forbidden: You do not own this application");
  }

  if (application.status === decision) {
    return okWithMessage(res, `Application is already ${decision}`, application);
  }

  application.status = decision;
  await application.save();

  okWithMessage(res, `Application ${decision}`, application);
});

/**
 * DELETE /api/applications/:id  (student)
 * ---------------------------------------
 * Students may withdraw only while the application is still pending.
 */
router.delete("/:id", verifyToken, verifyStudent, async (req, res) => {
  if (!isObjectId(req.params.id)) {
    throw new ApiError(400, "Invalid application ID format");
  }

  const application = await Application.findById(req.params.id);

  if (!application) {
    throw new ApiError(404, "Application not found");
  }

  if (application.studentEmail !== req.dbUser.email) {
    throw new ApiError(403, "Forbidden: You do not own this application");
  }

  if (application.status !== "pending") {
    throw new ApiError(
      409,
      `Only pending applications can be cancelled (this one is ${application.status})`
    );
  }

  await Application.deleteOne({ _id: application._id });

  okWithMessage(res, "Application cancelled");
});

export default router;
