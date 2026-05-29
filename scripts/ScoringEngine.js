/**
 * Base class for all scoring logic in the PinBowling application.
 */
export class ScoringEngine {
  /**
   * Interface method: The primary orchestration method for calculating a complete game's results.
   * @param {Array<Object>} machines 
   * @param {Object} scoreMap 
   * @throws {Error} If not implemented by subclass.
   */
  calculateTurnResults(machines, scoreMap) {
    throw new Error('calculateTurnResults must be implemented by subclass');
  }

  /**
   * Interface method: Linearly interpolates threshold values.
   * @param {number} target 
   * @param {number} base 
   */
  buildRoundValues(target, base) {
    throw new Error('buildRoundValues must be implemented by subclass');
  }

  /**
   * Interface method: Formats the visual representation of a frame.
   * @param {Object} turn 
   */
  formatMark(turn) {
    throw new Error('formatMark must be implemented by subclass');
  }

  getBonusTargets() { return { t1: 0, t2: 0 }; }
  getBonusTargetHtml() { return ''; }

  /**
   * Returns the terminology used for an individual round (e.g., "Round", "Frame", "Hole").
   * @returns {string}
   */
  getRoundLabel() { return 'Round'; }

  /**
   * Returns the terminology used for columns in a summary table.
   * @returns {string}
   */
  getTurnHeaderPrefix() { return 'Round'; }

  /**
   * Returns the label for the primary goal score (e.g., "Strike", "Target", "Par").
   * @returns {string}
   */
  getPrimaryTargetLabel() { return 'Target'; }
}