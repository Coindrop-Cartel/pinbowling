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