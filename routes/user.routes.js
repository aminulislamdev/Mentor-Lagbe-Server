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
 * Body: { name?, phone?, bio?, image?, settings? }
 *
 * Profile fields: only name, phone, bio, image. `role`, `plan`, `email`, `_id`
 * and auth fields are deliberately absent (not self-service); unknown fields are
 * ignored, so a request carrying only `role` ends up with nothing and is rejected.
 * phone, bio and image may be cleared by sending an empty string.
 *
 * `settings` is optional and partial. Only these keys are allowed (anything else
 * is rejected with 400); only supplied fields are changed; nothing else in
 * `settings` is touched. Uses MongoDB `$set` with dot notation:
 *   settings.language, settings.timezone, settings.mode, settings.days,
 *   settings.evenings, settings.notifications.{applicant,status,approval,
 *   announcements,subscription}
 * Types are validated; invalid values return 400. Unknown notifications keys
 * are rejected. Protected fields cannot be updated.
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

  // ── Partial settings update (whitelist; $set dot-notation; no mass assignment) ──
  if (body.settings !== undefined) {
    const settings = body.settings;

    if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
      throw new ApiError(400, "settings must be an object");
    }

    const SETTINGS_KEYS = ["language", "timezone", "mode", "days", "evenings", "notifications"];
    for (const key of Object.keys(settings)) {
      if (!SETTINGS_KEYS.includes(key)) {
        throw new ApiError(400, `Unknown settings field: ${key}`);
      }
    }

    if (settings.language !== undefined) {
      updateFields["settings.language"] = requireString(settings.language, "settings.language");
    }
    if (settings.timezone !== undefined) {
      updateFields["settings.timezone"] = requireString(settings.timezone, "settings.timezone");
    }
    if (settings.mode !== undefined) {
      updateFields["settings.mode"] = requireString(settings.mode, "settings.mode");
    }
    if (settings.days !== undefined) {
      if (!Array.isArray(settings.days) || !settings.days.every((d) => typeof d === "string")) {
        throw new ApiError(400, "settings.days must be an array of strings");
      }
      updateFields["settings.days"] = settings.days;
    }
    if (settings.evenings !== undefined) {
      if (typeof settings.evenings !== "boolean") {
        throw new ApiError(400, "settings.evenings must be a boolean");
      }
      updateFields["settings.evenings"] = settings.evenings;
    }
    if (settings.notifications !== undefined) {
      const notifications = settings.notifications;
      if (typeof notifications !== "object" || notifications === null || Array.isArray(notifications)) {
        throw new ApiError(400, "settings.notifications must be an object");
      }
      const NOTIFICATION_KEYS = ["applicant", "status", "approval", "announcements", "subscription"];
      for (const key of Object.keys(notifications)) {
        if (!NOTIFICATION_KEYS.includes(key)) {
          throw new ApiError(400, `Unknown settings.notifications field: ${key}`);
        }
        if (typeof notifications[key] !== "boolean") {
          throw new ApiError(400, `settings.notifications.${key} must be a boolean`);
        }
        updateFields[`settings.notifications.${key}`] = notifications[key];
      }
    }
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
  ).select("name email role plan image phone bio createdAt settings");

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  ok(res, user);
});

export default router;
