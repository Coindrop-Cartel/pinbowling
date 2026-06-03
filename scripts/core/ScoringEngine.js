/**
 * Base class for all Scoring Engines.
 * Defines the interface for score calculation and UI terminology.
 */
export class ScoringEngine {
  /**
   * Returns the label for a single unit of play (e.g., "Frame" for Bowling, "Hole" for Golf).
   */
  getRoundLabel() {
    return 'Round';
  }

  /**
   * Returns the prefix used in headers (e.g., "Frame 1").
   */
  getTurnHeaderPrefix() {
    return 'Round';
  }

  /**
   * Returns the label for the primary success state (e.g., "Strike" or "Par").
   */
  getPrimaryTargetLabel() {
    return 'Target';
  }

  /**
   * Returns the label for the maximum score threshold (e.g., "Strike (10 Pins)").
   */
  getHighScoreLabel() {
    return 'High Score';
  }

  /**
   * Returns the label for the minimum score threshold (e.g., "1 Pin").
   */
  getLowScoreLabel() {
    return 'Low Score';
  }

  /**
   * Returns valid round counts for session generation.
   */
  getRoundCountOptions() {
    return [3, 5, 10];
  }

  /**
   * Returns the initial anchor values (value1, value2) based on a base pinball score.
   * Default (Bowling): value1 is the strike target, value2 is 1/10th of that.
   * @param {number} baseScore 
   */
  getInitialValues(baseScore) {
    return { value1: baseScore, value2: Math.floor(baseScore / 10) };
  }

  /**
   * Optional: Filters the threshold list for display. 
   * Defaults to returning all values.
   */
  filterThresholds(values) {
    return values;
  }

  /**
   * Returns the label for a specific rank in the threshold preview.
   * Defaults to the rank number itself.
   */
  getThresholdLabel(rank, value1, value2) {
    return rank;
  }

  /**
   * Returns a CSS style string for a specific rank in the threshold preview.
   * Used for highlighting specific ranks (like Par in Golf).
   */
  getThresholdRowStyle(rank, value1, value2) {
    return 'margin: 2px 0;';
  }

  /**
   * Returns a comparator function for sorting thresholds in the UI.
   * Default: Descending (10 -> 1)
   */
  getThresholdSort() {
    return (a, b) => Number(b[0]) - Number(a[0]);
  }

  /**
   * Returns a comparator for sorting players by their total score.
   * Default: Descending (Higher is better).
   */
  compareTotals(a, b) {
    return b - a;
  }

  /**
   * Returns the label for the final aggregate column.
   * @param {number} anchorValue - Typically the total Par or baseline score.
   */
  getTotalColumnLabel(anchorValue) {
    return 'Total';
  }

  /**
   * Formats the final aggregate score for display.
   * @param {number} total - The player's total cumulative score.
   * @param {number} anchorValue - The total Par or baseline for the event.
   * @param {Function} formatFn - Standard number formatter.
   */
  formatTotalScore(total, anchorValue, formatFn) {
    return formatFn(total);
  }

  /**
   * Determines if individual round points should be shown in the table cell.
   */
  shouldShowRoundScore() {
    return true;
  }

  /**
   * Interface method: Must be implemented by subclasses to calculate results.
   */
  calculateTurnResults(machines, scoreMap) {
    throw new Error('calculateTurnResults must be implemented by the scoring engine.');
  }

  /**
   * Interface method: Must be implemented to interpolate scores between high and low.
   */
  buildRoundValues(highScore, lowScore, scalingType) {
    throw new Error('buildRoundValues must be implemented by the scoring engine.');
  }

  /**
   * Optional: Returns calculated bonus targets (e.g. for the final round).
   */
  getBonusTargets() {
    return { t1: 0, t2: 0 };
  }

  getBonusTargetHtml() {
    return '';
  }
}