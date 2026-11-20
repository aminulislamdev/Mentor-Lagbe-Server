// All failure responses are produced here — the only place that logs server bugs
// and the only place that decides an HTTP status for an error.

import { ApiError } from "../utils/ApiError.js";

/**
 * Catches any request that matched no route.
 * Mounted after every router, before the error handler.
 */
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Central error handler. Express recognises it by its four arguments and routes
 * every `throw`, `next(error)` and rejected async handler into it.
 *
 * Order matters: our own classified errors first, then errors thrown by
 * Mongoose/MongoDB, and an opaque 500 for anything unexpected.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, next) {
  // A response already started (e.g. a stream broke mid-flight); nothing we can
  // safely add, so let Express close the connection.
  if (res.headersSent) return next(error);

  // 1. Errors the routes classified themselves.
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      success: false,
      error: error.message,
      ...(error.details ?? {}),
    });
  }

  // 2. Mongoose schema validation (required field, enum, min/max).
  if (error.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      fields: Object.keys(error.errors ?? {}),
    });
  }

  // 3. Mongoose could not cast a value (usually a malformed ObjectId).
  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: `Invalid value for "${error.path}"`,
    });
  }

  // 4. MongoDB unique index violation (duplicate email, etc.).
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      error: "Duplicate value",
      fields: Object.keys(error.keyValue ?? {}),
    });
  }

  // 5. Unknown: log the real cause, tell the client nothing about internals.
  console.error("Unhandled error:", error);
  return res.status(500).json({ success: false, error: "Internal server error" });
}
