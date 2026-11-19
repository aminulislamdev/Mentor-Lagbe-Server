import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import User from "../models/user.model.js";

const app = express.Router();

/**
 * GET /api/auth/me
 * ----------------
 * Protected test endpoint. Verifies the JWT via authMiddleware, then
 * looks up the user in the users collection to confirm they exist and
 * to return their current role and plan.
 *
 * Response (200):
 * {
 *   "user": {
 *     "id": "...",
 *     "name": "...",
 *     "email": "...",
 *     "role": "student",
 *     "plan": "free",
 *     "image": "...",
 *     "phone": "...",
 *     "bio": "...",
 *     "createdAt": "..."
 *   }
 * }
 */
app.get("/me", authMiddleware, async (req, res) => {
  try {
    // req.user.sub contains the user ID from the JWT payload
    const userId = req.user.sub;



    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: Invalid token payload" });
    }

    // Verify against the users collection where appropriate
    const user = await User.findById(userId).select(
      "name email role plan image phone bio createdAt"
    );

    if (!user) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
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
      },
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
