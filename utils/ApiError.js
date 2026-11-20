// One error type for the whole API.
//
// A route never touches `res.status(...)` for failures. It just throws:
//   throw new ApiError(404, "Tuition not found");
//
// The central handler in middleware/error.middleware.js turns that into the
// standard envelope: { success: false, error: "Tuition not found" }.
// Express 5 forwards thrown/rejected async handlers automatically, so routes
// need no try/catch of their own.

export class ApiError extends Error {
  /**
   * @param {number} status  HTTP status code (400, 401, 403, 404, 409, ...)
   * @param {string} message human-readable message sent to the client
   * @param {Record<string, unknown>} [details] extra fields merged into the body
   *        (e.g. { missingFields: ["title"] })
   */
  constructor(status, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    if (details) this.details = details;
  }
}
