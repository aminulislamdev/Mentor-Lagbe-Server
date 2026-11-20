import express from "express";
import User from "../models/user.model.js";
import { verifyToken } from "../middleware/auth.middleware.js";
import { requireString } from "../utils/validate.js";
import { ok } from "../utils/respond.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();

/**
 * PATCH /api/users/me  (any signed-in user)
 * ----------------------------------------
 * Body: { name?, phone?, bio?, image? }
 *
 * Only four fields are accepted. `role`, `plan` and `email` are deliberately
 * absent: promotion, subscription tier and login identity are not self-service.
 * An unknown field is ignored, so a request carrying only `role` ends up with
 * nothing to update and is rejected.
 *
 * phone, bio and image may be cleared by sending an empty string.
 */
router.patch("/me", verifyToken, async (req, res) => {
  const body = req.body ?? {};
  const updateFields = {};

  if (body.name !== undefined) {
    updateFields.name = requireString(body.name, "name", { minLength: 2 });
  }

  if (body.phone !== undefined) {
    // A blank phone clears it; otherwise it must look like a real number.
    const phone = requireString(body.phone, "phone", { minLength: 0 });
    if (phone && phone.length < 6) {
      throw new ApiError(400, "phone must be at least 6 characters, or empty to clear it");
    }
    updateFields.phone = phone;
  }

  if (body.bio !== undefined) {
    updateFields.bio = requireString(body.bio, "bio", { minLength: 0 });
  }

  if (body.image !== undefined) {
    // Accepts a hosted URL (ImgBB links arrive here); a blank value clears it.
    const image = requireString(body.image, "image", { minLength: 0 });
    if (image && !/^https?:\/\//i.test(image)) {
      throw new ApiError(400, "image must be an http(s) URL, or empty to clear it");
    }
    updateFields.image = image;
  }

  if (Object.keys(updateFields).length === 0) {
    throw new ApiError(400, "No valid fields provided to update");
  }

  // req.userId comes from the verified token, so a user can only ever edit
  // their own document — there is no id in the URL to tamper with.
  const user = await User.findByIdAndUpdate(
    req.userId,
    { $set: updateFields },
    { returnDocument: "after", runValidators: true }
  ).select("name email role plan image phone bio createdAt");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  ok(res, user);
});

export default router;
