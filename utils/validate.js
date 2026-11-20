// Input validation helpers.
//
// Every helper throws an ApiError, so a route reads as a straight line:
//   const fee = requireNumberInRange(body.monthlyFee, "monthlyFee", { min: 0 });
// ...and a bad request never reaches the database.
//
// The central error handler turns the throw into { success: false, error } with
// the status from the helper (always 400 here).

import { ApiError } from "./ApiError.js";

/**
 * True only for a 24-character hex string — a value MongoDB can cast to an
 * ObjectId. Checking here keeps CastError noise out of the logs.
 * @param {unknown} value
 */
export function isObjectId(value) {
  return /^[0-9a-fA-F]{24}$/.test(String(value ?? ""));
}

/**
 * Rejects a body that is missing any of `names`.
 * Missing means undefined, null or an empty string.
 * @param {Record<string, unknown>} body
 * @param {string[]} names
 */
export function requireFields(body, names) {
  const missingFields = names.filter(
    (name) => body?.[name] === undefined || body[name] === null || body[name] === ""
  );

  if (missingFields.length > 0) {
    throw new ApiError(400, "Missing required fields", { missingFields });
  }
}

/**
 * Requires a string and returns it trimmed.
 * @param {unknown} value
 * @param {string} field name used in the error message
 * @param {{ minLength?: number }} [options]
 * @returns {string}
 */
export function requireString(value, field, { minLength = 1 } = {}) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${field} must be a string`);
  }

  const trimmed = value.trim();

  if (trimmed.length < minLength) {
    throw new ApiError(400, `${field} must be at least ${minLength} characters`);
  }

  return trimmed;
}

/**
 * Requires something that converts to a finite number inside the given bounds.
 * Accepts numeric strings, because form and query values arrive as text.
 * @param {unknown} value
 * @param {string} field
 * @param {{ min?: number, max?: number }} [options]
 * @returns {number}
 */
export function requireNumberInRange(value, field, { min, max } = {}) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    throw new ApiError(400, `${field} must be a number`);
  }

  if (min !== undefined && num < min) {
    throw new ApiError(400, `${field} must be a number greater than or equal to ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new ApiError(400, `${field} must be a number between ${min} and ${max}`);
  }

  return num;
}

/**
 * Requires one of a fixed set of values, e.g. an enum field.
 * @param {unknown} value
 * @param {string} field
 * @param {readonly string[]} allowed
 * @returns {string}
 */
export function requireOneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new ApiError(400, `${field} must be one of: ${allowed.join(", ")}`);
  }

  return value;
}

/**
 * Case-insensitive "contains" pattern for a search term.
 * The term is escaped first, so user input can never be read as regex syntax
 * (which would allow both broken queries and very slow patterns).
 * @param {unknown} term
 * @returns {RegExp}
 */
export function searchPattern(term) {
  const escaped = String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

/**
 * Turns ?page= and ?limit= into safe numbers, with a hard ceiling so a single
 * request can never dump a whole collection.
 * @param {Record<string, unknown>} query
 * @param {{ defaultLimit?: number, maxLimit?: number }} [options]
 * @returns {{ page: number, limit: number, skip: number }}
 */
export function parsePagination(query = {}, { defaultLimit = 10, maxLimit = 50 } = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);

  return { page, limit, skip: (page - 1) * limit };
}
