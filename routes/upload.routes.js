import express from "express";
import multer from "multer";
import { verifyToken } from "../middleware/auth.middleware.js";
import { ok } from "../utils/respond.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// The file is kept in memory and forwarded straight to ImgBB — nothing is ever
// written to disk. A rejected file type produces an ApiError, which multer
// forwards to the central error handler like any other route error.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new ApiError(400, `image must be one of: ${ALLOWED_TYPES.join(", ")}`));
    }
    cb(null, true);
  },
});

/**
 * POST /api/upload  (any signed-in user)
 * -------------------------------------
 * multipart/form-data, single file in the field `image`.
 *
 * The ImgBB key lives in the server environment, so it is never shipped to the
 * browser: the client sends a file, the server talks to ImgBB and returns the
 * hosted URL to store on a user or a tuition document.
 *
 * IMGBB_API_URL exists so a local stub can be used in tests; production only
 * needs IMGBB_API_KEY.
 */
router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, "An image file is required in the 'image' field");
  }

  const apiKey = process.env.IMGBB_API_KEY;

  if (!apiKey) {
    throw new ApiError(
      503,
      "Image upload is not configured: set IMGBB_API_KEY on the server"
    );
  }

  const endpoint = process.env.IMGBB_API_URL || "https://api.imgbb.com/1/upload";

  const form = new URLSearchParams();
  form.set("image", req.file.buffer.toString("base64"));
  form.set("name", req.file.originalname || "mentorlagbe");

  let response;
  try {
    response = await fetch(`${endpoint}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(502, "Could not reach ImgBB, please try again");
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.data?.url) {
    throw new ApiError(502, "Image upload failed", {
      reason: payload?.error?.message || `ImgBB responded with ${response.status}`,
    });
  }

  ok(
    res,
    {
      url: payload.data.display_url || payload.data.url,
      thumb: payload.data.thumb?.url,
      deleteUrl: payload.data.delete_url,
    },
    201
  );
});

export default router;
