// Shared success responses so every route answers with the same envelope.
//
//   success            → { success: true, data }
//   success + message  → { success: true, message, data }
//
// Failures never go through here: a route throws an ApiError and the central
// error handler (middleware/error.middleware.js) builds { success: false, error }.

/**
 * 200 (or a custom status) with a `data` payload.
 * @param {import("express").Response} res
 * @param {unknown} data
 * @param {number} [status]
 */
export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

/**
 * Success response that also carries a human-readable message
 * (used by mutations so the client can toast it directly).
 * @param {import("express").Response} res
 * @param {string} message
 * @param {unknown} [data]
 * @param {number} [status]
 */
export function okWithMessage(res, message, data, status = 200) {
  const body = { success: true, message };
  if (data !== undefined) body.data = data;
  return res.status(status).json(body);
}
