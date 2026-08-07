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

/**
 * Scoring format identifiers and utility methods.
 */
export const ScoringFormats = {
  BOWLING: 'bowling',
  GOLF: 'golf',
  BASEBALL: 'baseball',
  /** @type {readonly string[]} */
  ALL: Object.freeze(['bowling', 'golf', 'baseball']),
  /** @type {string} */
  DEFAULT: 'bowling',

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
  isValid(value) {
    return this.ALL.includes(String(value ?? ''));
  },

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
  resolve(value) {
    return this.isValid(value) ? String(value) : this.DEFAULT;
  }
};

/**
 * Competition format identifiers and helper functions.
 */
export const CompetitionFormats = {
  GROUP: 'group',
  HEAD2HEAD: 'head2head',
  ALL: Object.freeze(['group', 'head2head'])
};

/**
 * Checks whether a competition format string represents a Head-to-Head format.
 * Normalizes 'head2head', 'head_to_head', and 'h2h'.
 *
 * @param {string} [format] Competition format string.
 * @returns {boolean} True if format is a head-to-head variant.
 */
export function isHead2Head(format) {
  const fmt = String(format || '').toLowerCase();
  return fmt === 'head2head' || fmt === 'head_to_head' || fmt === 'h2h';
}

/**
 * Single Source of Truth for presentational terminology per format.
 * Change terms here (e.g. 'Inning' vs 'Frame' vs 'Hole') to update throughout the app.
 */
export const FORMAT_TERMINOLOGY = Object.freeze({
  [ScoringFormats.BOWLING]: Object.freeze({
    brand: 'PinBowling',
    logo: 'pinbowling.png',
    cta: "Let's Bowl!",
    themeClass: 'theme-bowling',
    roundLabel: 'Frame',
    pluralRoundLabel: 'Frames',
    turnHeaderPrefix: 'Frame',
    primaryTargetLabel: 'Strike',
    value1Label: 'Target Score',
    value2Label: 'Base Score',
    thresholdPrefix: 'Pins',
    hint: "Enter your score after each ball. When you hit the strike score you can stop entering scores for that frame and move on to the next frame. DO NOT PLAY EXTRA BALLS",
    lastFrameHint: "In the last frame, you can get up to 3 strikes. Keep playing until you hit the additional target scores or you run out of balls."
  }),
  [ScoringFormats.GOLF]: Object.freeze({
    brand: 'PinGolf',
    logo: 'pingolf.png',
    cta: "Let's Golf!",
    themeClass: 'theme-golf',
    roundLabel: 'Hole',
    pluralRoundLabel: 'Holes',
    turnHeaderPrefix: 'Hole',
    primaryTargetLabel: 'Par',
    value1Label: 'Target Score',
    value2Label: 'Par',
    thresholdPrefix: 'Strokes',
    hint: "Enter your score after each ball. When you hit the target score you can stop entering scores for that round and move on to the next hole. DO NOT PLAY EXTRA BALLS",
    lastFrameHint: ""
  }),
  [ScoringFormats.BASEBALL]: Object.freeze({
    brand: 'PinBaseball',
    logo: 'pinbaseball.png',
    cta: "Play Ball!",
    themeClass: 'theme-baseball',
    roundLabel: 'Inning',
    pluralRoundLabel: 'Innings',
    turnHeaderPrefix: 'Inning',
    primaryTargetLabel: 'Run Baseline',
    value1Label: 'Baseline Score',
    value2Label: 'Multiplier',
    thresholdPrefix: 'Runs',
    hint: "Enter your score after each ball.  There is no limit to how many runs you can score, so do not stop unless it's the bottom of the last inning and you have taken the lead.  DO NOT PLAY EXTRA BALLS",
    lastFrameHint: ""
  })
});
