import express from "express";
import { verifyToken } from "../middleware/auth.middleware.js";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";

const app = express.Router();

/**
 * GET /api/auth/me
 * ----------------
 * Returns the signed-in user as BetterAuth stored them. This is the one endpoint
 * that answers with { user } instead of the standard { data } envelope, so the
 * client can tell "who am I" apart from a list response.
 */
app.get("/me", verifyToken, async (req, res) => {
  const user = await User.findById(req.userId).select(
    "name email role plan image phone bio createdAt settings"
  );

  if (!user) {
    throw new ApiError(401, "Unauthorized: User not found");
  }

  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      image: user.image,
      phone: user.phone,
      bio: user.bio,
      createdAt: user.createdAt,
      settings: user.settings ?? null,
    },
  });
});

export default app;
