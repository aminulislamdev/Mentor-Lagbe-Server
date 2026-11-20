import express from "express";
import Application from "../models/application.model.js";
import Tuition from "../models/tuition.model.js";
import User from "../models/user.model.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { ok } from "../utils/respond.js";

const router = express.Router();

/**
 * GET /api/dashboard/stats  (any signed-in user)
 * ---------------------------------------------
 * One endpoint for all three dashboards; the shape follows the caller's role.
 * Counts are read from the same collections the pages already list, so a card
 * can never disagree with the table underneath it.
 *
 * Revenue is deliberately absent: it lives in the payments collection and
 * arrives with the Stripe task.
 */
router.get("/stats", verifyToken, async (req, res) => {
  const { role, email, plan } = req.dbUser;

  if (role === "student") {
    const [totalApplications, pendingApplications, acceptedApplications] = await Promise.all([
      Application.countDocuments({ studentEmail: email }),
      Application.countDocuments({ studentEmail: email, status: "pending" }),
      Application.countDocuments({ studentEmail: email, status: "accepted" }),
    ]);

    return ok(res, {
      role,
      plan,
      totalApplications,
      pendingApplications,
      acceptedApplications,
    });
  }

  if (role === "tutor") {
    const [totalTuitions, approvedTuitions, activeTuitions, totalApplicants] =
      await Promise.all([
        Tuition.countDocuments({ tutorEmail: email }),
        Tuition.countDocuments({ tutorEmail: email, approvalStatus: "approved" }),
        Tuition.countDocuments({ tutorEmail: email, isActive: true }),
        Application.countDocuments({ tutorEmail: email }),
      ]);

    return ok(res, {
      role,
      plan,
      totalTuitions,
      approvedTuitions,
      activeTuitions,
      totalApplicants,
    });
  }

  // admin — platform health, still without money.
  const [
    totalUsers,
    totalStudents,
    totalTutors,
    totalTuitions,
    pendingTuitions,
    approvedTuitions,
    totalApplications,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "tutor" }),
    Tuition.countDocuments({}),
    Tuition.countDocuments({ approvalStatus: "pending" }),
    Tuition.countDocuments({ approvalStatus: "approved" }),
    Application.countDocuments({}),
  ]);

  return ok(res, {
    role,
    totalUsers,
    totalStudents,
    totalTutors,
    totalTuitions,
    pendingTuitions,
    approvedTuitions,
    totalApplications,
  });
});

export default router;
