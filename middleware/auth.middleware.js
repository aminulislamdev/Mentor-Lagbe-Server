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

    // Extract and validate the user ID from the JWT payload.
    // payload.sub contains the MongoDB _id issued by BetterAuth.
    const userId = payload.sub;

    if (!userId || typeof userId !== "string") {
      return res.status(401).json({ error: "Unauthorized: Invalid token payload" });
    }

    // MongoDB ObjectId is a 24-character hexadecimal string.
    // Validating here prevents malformed IDs from reaching the database.
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(userId)) {
      return res.status(401).json({ error: "Unauthorized: Invalid user ID format" });
    }

    req.user = payload;
    req.userId = userId;

    // Fetch the current user from MongoDB using the validated user ID.
    // We select only the fields we need to keep the query lightweight.
    const dbUser = await User.findById(req.userId).select(
      "_id name email role image"
    );

    // If the user does not exist in the database (deleted or never created),
    // reject the request even if the JWT is valid.
    if (!dbUser) {
      return res.status(401).json({ error: "Unauthorized: User not found" });
    }

    // Attach the database user to req.dbUser so role middlewares can
    // compare against the current, authoritative role from MongoDB.
    req.dbUser = dbUser;

    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
  }
}

/**
 * verifyStudent - allows access only to users with role "student"
 * Uses req.dbUser.role (MongoDB source of truth) instead of JWT role.
 */
export function verifyStudent(req, res, next) {
  if (!req.dbUser) {
    return res.status(401).json({ error: "Unauthorized: User not found in database" });
  }

  if (req.dbUser.role !== "student") {
    return res.status(403).json({ error: "Forbidden: Student access required" });
  }

  next();
}

/**
 * verifyTutor - allows access only to users with role "tutor"
 * Uses req.dbUser.role (MongoDB source of truth) instead of JWT role.
 */
export function verifyTutor(req, res, next) {
  if (!req.dbUser) {
    return res.status(401).json({ error: "Unauthorized: User not found in database" });
  }

  if (req.dbUser.role !== "tutor") {
    return res.status(403).json({ error: "Forbidden: Tutor access required" });
  }

  next();
}

/**
 * verifyAdmin - allows access only to users with role "admin"
 * Uses req.dbUser.role (MongoDB source of truth) instead of JWT role.
 */
export function verifyAdmin(req, res, next) {
  if (!req.dbUser) {
    return res.status(401).json({ error: "Unauthorized: User not found in database" });
  }

  if (req.dbUser.role !== "admin") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }

  next();
}
