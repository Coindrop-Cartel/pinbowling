/**
 * Base class for all scoring logic in the PinBowling application.
 */
export class ScoringEngine {
  /**
   * @param {Object} config UI and Terminology configuration from config.php
   */
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Interface method: The primary orchestration method for calculating a complete game's results.
   * Maps each machine to a turn result and computes the aggregate total.
   * 
   * @param {Array<Object>} machines List of target definitions for the event.
   * @param {Object} scoreMap Dictionary of recorded ball scores keyed by orderNumber.
   * @returns {{turnResults: Array<Object>, total: number}} Calculated results and sum.
   * @throws {Error} If not implemented by subclass.
   */
  calculateTurnResults(machines, scoreMap) {
    throw new Error('calculateTurnResults must be implemented by subclass');
  }

  /**
   * Generic interpolation logic to calculate target scores for ranks 1-10.
   * 
   * @param {number} topScore The target score to be anchored at 'position'.
   * @param {number} bottomScore The baseline score (floor).
   * @param {number} position The rank (1-10) where topScore is anchored.
   * @param {string} type 'flat' or 'curved'.
   * @param {string} order 'desc' (Rank 10 is high) or 'asc' (Rank 1 is high).
   * @returns {Object|null}
   */
  calculateInterpolatedValues(topScore, bottomScore, position, type, order) {
    if (topScore <= 0 || bottomScore < 0 || position <= 0) return null;

    const values = {};
    const isDescending = order === 'desc';
    // Descending (Bowling): Rank 10 is high score requirement.
    // Ascending (Golf): Rank 1 is high score requirement.
    const getFraction = (r) => isDescending ? (r - 1) / 9 : (10 - r) / 9;

    const fractionAtAnchor = getFraction(position);
    const multiplierAtAnchor = Math.max(0.01, (type === 'curved') ? Math.pow(fractionAtAnchor, 2) : fractionAtAnchor);

    // Solve for range: topScore = bottomScore + (range * multiplierAtAnchor)
    const range = (topScore - bottomScore) / multiplierAtAnchor;

    for (let rank = 1; rank <= 10; rank++) {
      const fraction = getFraction(rank);
      const multiplier = (type === 'curved') ? Math.pow(fraction, 2) : fraction;
      values[rank] = Math.round(bottomScore + range * multiplier);
    }
    return values;
  }

  /**
   * Interface method: Generates a map of pin/stroke thresholds based on high/low bounds.
   * Default implementation uses linear or curved interpolation between target and base.
   *
   * @param {number} target The top-end goal score.
   * @param {number} base The entry-level or par score.
   * @param {string} scalingType 'flat' for linear, 'curved' for exponential.
   * @returns {Object|null} A map of rank to pinball score, or null if inputs are invalid.
   */
  buildRoundValues(target, base, scalingType) {
    // Default implementation assumes Bowling-style (Target is Rank 10, Descending)
    return this.calculateInterpolatedValues(target, base, 10, scalingType, 'desc');
  }

  /**
   * Interface method: Formats the visual representation of a frame.
   * 
   * @param {Object} turn The calculated turn data object.
   * @returns {string} The formatted mark (e.g., "X", "9/", "4").
   */
  formatMark(turn) {
    throw new Error('formatMark must be implemented by subclass');
  }

  /**
   * Returns configuration for bonus target values (e.g. Strike/Spare).
   * @returns {{t1: number, t2: number}}
   */
  getBonusTargets() { return { t1: 0, t2: 0 }; }

  /**
   * Returns HTML representation for secondary targets (e.g. bonus frames).
   * @param {Object} round - The round data.
   * @returns {string}
   */
  getBonusTargetHtml() { return ''; }

  /**
   * Returns the terminology used for an individual round (e.g., "Round", "Frame", "Hole").
   * @returns {string}
   */
  getRoundLabel() { return this.config.roundLabel || 'Round'; }

  /**
   * Returns the terminology used for columns in summary tables.
   * Useful for dynamic headers in the Scoreboard or Results list.
   * @returns {string} e.g. "Frame" or "Hole".
   */
  getTurnHeaderPrefix() { return this.config.turnHeaderPrefix || 'Round'; }

  /**
   * Returns the label for the primary goal score (e.g., "Strike", "Target", "Par").
   * @returns {string}
   */
  getPrimaryTargetLabel() { return this.config.primaryTargetLabel || 'Target'; }

  /**
   * Comparator function for sorting player standings.
   * 
   * @param {number} a Score of player A.
   * @param {number} b Score of player B.
   * @returns {number} Default: High score wins (descending).
   */
  compareScores(a, b) { return b - a; }

  /**
   * Formats the total score for display (e.g., adds par relativity).
   * @param {number} total The raw points.
   * @param {Array} machines The target definitions for context.
   * @returns {string}
   */
  formatTotalScore(total, machines) { return String(total); }

  /**
   * Returns the available round count options for a new game/league of this format.
   * @returns {Array<number>}
   */
  getRoundCountOptions() { return [10]; }

  /**
   * Returns the general scoring hint shown to players.
   * @returns {string}
   */
  getScoringHint() { return this.config.hint || ''; }

  /**
   * Returns specific instructions for the final turn of a game.
   * @returns {string}
   */
  getLastFrameHint() { return this.config.lastFrameHint || ''; }

  // UI Branding and Meta Properties
  getThemeClass() { return this.config.themeClass || ''; }
  getLogoImage() { return this.config.logo || 'logo.png'; }
  getBrandName() { return this.config.brand || 'PinBowling'; }
  getPlayActionLabel() { return this.config.cta || 'Play'; }
  getScoringDescription() { return this.config.logic || ''; }
  getValue1Label() { return this.config.value1Label || 'High Score'; }
  getValue2Label() { return this.config.value2Label || 'Low Score'; }
  getThresholdPrefix() { return 'Value'; }

  /**
   * Returns the primary target summary HTML for a scoring row.
   * @param {Object} round 
   * @param {Function} formatFn 
   * @returns {string}
   */
  getRowSummaryHtml(round, formatFn) {
    return `<div class="strike-target"><b>${this.getPrimaryTargetLabel()}:</b> ${formatFn(round.value1)}</div>`;
  }

  /**
   * Returns a CSS class string for formatting a mark based on its value relative to par.
   * Default implementation returns an empty string (no special formatting).
   * @param {number} markValue The numeric value of the mark (e.g., pin count, stroke count).
   * @param {number} parValue The par value for the current round (if applicable).
   * @returns {string} CSS class string.
   */
  getMarkFormatting(markValue, parValue) { return ''; }

  getThresholdStart() { return this.config.thresholdStart ?? 10; } // Default to Bowling
  getThresholdEnd() { return this.config.thresholdEnd ?? 1; }     // Default to Bowling

  /**
   * Returns an ordered array of ranks (1-10) to display in the threshold grid,
   * based on the engine's configured thresholdStart and thresholdEnd.
   * @returns {Array<number>}
   */
  getThresholdRange() {
    const ranks = [];
    const start = this.getThresholdStart();
    const end = this.getThresholdEnd();

    if (start <= end) { // Ascending (Golf)
      for (let i = start; i <= end; i++) ranks.push(i);
    } else { // Descending (Bowling)
      for (let i = start; i >= end; i--) ranks.push(i);
    }
    return ranks;
  }

  filterThresholds(values) { return values; }

  /**
   * Returns a comparator function for sorting thresholds in UI grids.
   * Default: Sort by rank descending (e.g., 10 down to 1).
   */
  getThresholdSort() {
    return (a, b) => Number(b[0]) - Number(a[0]);
  }

  /**
   * Returns a display label for a specific threshold rank.
   */
  getThresholdLabel(rank, _value1, _value2) {
    return rank;
  }

  /**
   * Returns CSS styles for a threshold display element.
   */
  getThresholdRowStyle(rank, _value1, _value2) {
    const r = Number(rank);
    const isMajor = r === this.getThresholdStart() || r === this.getThresholdEnd();
    return isMajor 
      ? 'margin: 2px 0; font-weight: bold; color: var(--pb-primary);' 
      : 'margin: 2px 0; opacity: 0.8;';
  }

  /**
   * Returns default scoring values for a new machine setup.
   * @param {number} [suggestedTarget] Optional base value to derive defaults from.
   * @returns {{value1: number, value2: number}}
   */
  getInitialValues(suggestedTarget = 0) {
    return { value1: suggestedTarget, value2: 0 };
  }
}