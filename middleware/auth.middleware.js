import { verifyJwt } from "../utils/jwt.js";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";

// MongoDB ObjectId is a 24-character hex string.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * verifyToken — the first middleware of every protected route.
 * -----------------------------------------------------------
 * Reads the Bearer token, verifies it against BetterAuth's JWKS, validates the
 * userId, loads the user from MongoDB and exposes it as `req.dbUser`.
 *
 * Failures go to the central error handler, so every rejection keeps the
 * standard { success: false, error } shape.
 */
export async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new ApiError(401, "Unauthorized: No token provided"));
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return next(new ApiError(401, "Unauthorized: No token provided"));
  }

  let payload;
  try {
    payload = await verifyJwt(token);
  } catch {
    return next(new ApiError(401, "Unauthorized: Invalid or expired token"));
  }

  // payload.sub is the MongoDB _id BetterAuth issued with the token.
  const userId = payload.sub;

  if (!userId || typeof userId !== "string") {
    return next(new ApiError(401, "Unauthorized: Invalid token payload"));
  }

  if (!OBJECT_ID.test(userId)) {
    return next(new ApiError(401, "Unauthorized: Invalid user ID format"));
  }

  // Read the role from MongoDB on every request, so a role change (or a deleted
  // account) takes effect immediately instead of living on inside the token.
  // `plan` must be selected too: the tuition routes use req.dbUser.plan to
  // enforce the free-plan listing limit.
  const dbUser = await User.findById(userId).select("_id name email role image plan");

  if (!dbUser) {
    return next(new ApiError(401, "Unauthorized: User not found"));
  }

  req.user = payload;
  req.userId = userId;
  req.dbUser = dbUser;

  next();
}

/**
 * optionalAuth — for routes that are public but richer when signed in.
 * -------------------------------------------------------------------
 * With no token, or an unusable one, the request simply continues anonymously
 * (so a stale token in a browser can never break a public page). With a valid
 * token it behaves like verifyToken and attaches req.dbUser.
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return next();

  try {
    const payload = await verifyJwt(token);
    const userId = payload.sub;

    if (typeof userId === "string" && OBJECT_ID.test(userId)) {
      const dbUser = await User.findById(userId).select("_id name email role image plan");
      if (dbUser) {
        req.user = payload;
        req.userId = userId;
        req.dbUser = dbUser;
      }
    }
  } catch {
    // Ignored on purpose: the route stays readable for anonymous visitors.
  }

  next();
}

/**
 * verifyStudent / verifyTutor / verifyAdmin
 * ----------------------------------------
 * Role guards that must run after verifyToken. They trust only the current
 * role from the database, never the JWT payload.
 */
export function verifyStudent(req, res, next) {
  if (!req.dbUser) {
    return next(new ApiError(401, "Unauthorized: User not found in database"));
  }
  if (req.dbUser.role !== "student") {
    return next(new ApiError(403, "Forbidden: Student access required"));
  }
  next();
}

export function verifyTutor(req, res, next) {
  if (!req.dbUser) {
    return next(new ApiError(401, "Unauthorized: User not found in database"));
  }
  if (req.dbUser.role !== "tutor") {
    return next(new ApiError(403, "Forbidden: Tutor access required"));
  }
  next();
}

export function verifyAdmin(req, res, next) {
  if (!req.dbUser) {
    return next(new ApiError(401, "Unauthorized: User not found in database"));
  }
  if (req.dbUser.role !== "admin") {
    return next(new ApiError(403, "Forbidden: Admin access required"));
  }
  next();
}
