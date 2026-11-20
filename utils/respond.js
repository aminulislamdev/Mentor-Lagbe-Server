// Shared response helpers so every route answers with the same envelope.
//
//   success            → { success: true, data }
//   success + message  → { success: true, message, data }
//   failure            → { success: false, error }
//
// One shape everywhere means the Next.js client can parse any endpoint the
// same way (json.data / json.error) instead of special-casing each route.

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

/**
 * True only for a 24-character hex string — i.e. a shape MongoDB can cast to
 * an ObjectId. Rejecting malformed ids here keeps CastErrors out of the logs
 * and turns them into clean 400s.
 * @param {unknown} value
 */
export function isObjectId(value) {
  return /^[0-9a-fA-F]{24}$/.test(String(value ?? ""));
}
