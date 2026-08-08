/**
 * Central source of truth for scoring format identifiers.
 *
 * Single source of truth for supported formats (bowling, golf, baseball, homerunderby).
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
  HOME_RUN_DERBY: 'homerunderby',
  /** @type {readonly string[]} */
  ALL: Object.freeze(['bowling', 'golf', 'baseball', 'homerunderby']),
  /** @type {string} */
  DEFAULT: 'bowling',

  /**
   * Validate that a value is a recognized scoring format identifier.
   *
   * @param {*} value - Any value to test.
   * @returns {boolean} `true` if `value` is one of {@link ScoringFormats.ALL}.
   */
  isValid(value) {
    const valStr = String(value ?? '').toLowerCase();
    return this.ALL.includes(valStr) || valStr === 'derby';
  },

  /**
   * Coerce a value into a valid scoring format identifier, falling back to
   * {@link ScoringFormats.DEFAULT} when the value is missing or unrecognized.
   *
   * @param {*} value - Raw value from a cookie, URL param, or DB column.
   * @returns {string} A guaranteed-valid format identifier.
   */
  resolve(value) {
    const valStr = String(value ?? '').toLowerCase();
    if (valStr === 'derby' || valStr === 'homerunderby') return this.HOME_RUN_DERBY;
    return this.isValid(value) ? valStr : this.DEFAULT;
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
    scoreColumnLabel: 'Score',
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
    scoreColumnLabel: 'Score',
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
    scoreColumnLabel: 'Score',
    hint: "Enter your score after each ball.  There is no limit to how many runs you can score, so do not stop unless it's the bottom of the last inning and you have taken the lead.  DO NOT PLAY EXTRA BALLS",
    lastFrameHint: ""
  }),
  [ScoringFormats.HOME_RUN_DERBY]: Object.freeze({
    brand: 'Home Run Derby',
    logo: 'pinderby.png',
    cta: "Play Derby!",
    themeClass: 'theme-baseball',
    roundLabel: 'At Bat',
    pluralRoundLabel: 'At Bats',
    turnHeaderPrefix: 'At Bat',
    primaryTargetLabel: 'Run Baseline',
    value1Label: 'Baseline Score',
    value2Label: 'Multiplier',
    thresholdPrefix: 'Runs',
    scoreColumnLabel: 'HRs',
    hint: "Enter your score after each ball. Your score maps to runs scored based on the machine thresholds. DO NOT PLAY EXTRA BALLS",
    lastFrameHint: "",
    logic: "Individual card scoring based on baseball run thresholds. Players compete individually across At Bats to accumulate the highest total runs."
  })
});
