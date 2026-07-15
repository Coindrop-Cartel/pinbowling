/**
 * Central source of truth for scoring format identifiers.
 *
 * The strings `'bowling'`, `'golf'`, and `'baseball'` were previously hardcoded
 * as raw literals across ~30+ files. This module centralizes them so that:
 *  - There is a single validated list of supported formats.
 *  - Default fallbacks always reference {@link ScoringFormats.DEFAULT}.
 *  - Cookie/URL/DB values can be validated with {@link ScoringFormats.isValid}
 *    before being trusted.
 *
 * @module services/scoringFormat
 */

/** @enum {string} */
export const ScoringFormats = {
  BOWLING: 'bowling',
  GOLF: 'golf',
  BASEBALL: 'baseball',
  /** @type {readonly string[]} */
  ALL: Object.freeze(['bowling', 'golf', 'baseball']),
  /** @type {string} */
  DEFAULT: 'bowling'
};

/**
 * Validate that a value is a recognized scoring format identifier.
 *
 * Coerces `null`/`undefined` to an empty string so that missing values
 * (cookies, URL params, DB columns) are treated as invalid rather than
 * crashing on `.includes(undefined)`.
 *
 * @param {*} value - Any value to test (typically a string from a cookie, URL, or DB).
 * @returns {boolean} `true` if `value` is one of {@link ScoringFormats.ALL}.
 */
ScoringFormats.isValid = function (value) {
  return this.ALL.includes(String(value ?? ''));
};

/**
 * Coerce a value into a valid scoring format identifier, falling back to
 * {@link ScoringFormats.DEFAULT} when the value is missing or unrecognized.
 *
 * Use this in place of bare `|| 'bowling'` fallbacks so that invalid values
 * (e.g. a corrupted cookie) are rejected rather than silently passed through.
 *
 * @param {*} value - Raw value from a cookie, URL param, or DB column.
 * @returns {string} A guaranteed-valid format identifier.
 */
ScoringFormats.resolve = function (value) {
  return this.isValid(value) ? String(value) : this.DEFAULT;
};
