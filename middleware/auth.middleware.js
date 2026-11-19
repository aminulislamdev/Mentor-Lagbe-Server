import { verifyToken } from "../utils/jwt.js";
import User from "../models/user.model.js";

/**
 * authMiddleware
 * --------------
 * Extracts the Bearer token from the Authorization header, verifies it
 * against BetterAuth's JWKS endpoint, and attaches the decoded payload
 * to req.user so downstream routes/middleware can read user info.
 *
 * Returns 401 if:
 * - No Authorization header is present
 * - Header does not start with "Bearer "
 * - Token is invalid, expired, or verification fails
 */
export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const payload = await verifyToken(token);

    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

/**
 * verifyStudent - allows access only to users with role "student"
 */
export function verifyStudent(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized: Authentication required" });
  }

  if (req.user.role !== "student") {
    return res.status(403).json({ error: "Forbidden: Student access required" });
  }

  next();
}

/**
 * verifyTutor - allows access only to users with role "tutor"
 */
export function verifyTutor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized: Authentication required" });
  }

  if (req.user.role !== "tutor") {
    return res.status(403).json({ error: "Forbidden: Tutor access required" });
  }

  next();
}

/**
 * verifyAdmin - allows access only to users with role "admin"
 */
export function verifyAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized: Authentication required" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  next();
}
