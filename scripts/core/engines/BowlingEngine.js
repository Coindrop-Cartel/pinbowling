import { ScoringEngine } from '../ScoringEngine.js';
import { formatNumber } from '../../utils.js';

/**
 * Implementation of the Bowling-style scoring logic.
 * Maps pinball scores to 10 pins and calculates standard bowling bonuses.
 */
export class BowlingEngine extends ScoringEngine {
  /**
   * Converts a raw pinball score into a 0-10 pin count based on machine-specific thresholds.
   * Uses a descending search to find the highest threshold reached.
   * 
   * @param {Object} round The round configuration containing .values map.
   * @param {number} rawScore The cumulative pinball score for the current frame.
   * @returns {number} Pin count (0-10).
   */
  getPinCount(round, rawScore) {
    if (!round || typeof rawScore !== 'number' || rawScore <= 0) return 0;
    const thresholds = Object.entries(round.values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => b.score - a.score);

    const match = thresholds.find(t => rawScore >= t.score);
    return match ? match.rank : 0;
  }

  /**
   * Calculates Target 1 (1.3x strike) and Target 2 (1.3x Target 1) for the last round.
   * Bonus targets are used in the 10th frame to allow for multiple strikes.
   * 
   * @param {Object} round The round definition.
   * @param {string} [scalingType] Scaling preference ('flat'|'curved').
   * @returns {{t1: number, t2: number}} Calculated bonus threshold values.
   */
  getBonusTargets(round, scalingType) {
    const s1 = round.values?.[1];
    const s10 = round.values?.[10];

    if (!s1 || !s10 || s1 >= s10) {
      const t1 = Math.round((s10 || 0) * 1.3);
      const t2 = Math.round(t1 * 1.3);
      return { t1, t2 };
    }

    // Use provided scalingType, or infer: if gap at end is > 1.5x gap at start, it's curved
    let isCurved = scalingType === 'curved';
    if (!scalingType) {
      const gapStart = (round.values[2] || s1) - s1;
      const gapEnd = s10 - (round.values[9] || s10);
      isCurved = gapEnd > gapStart * 1.5;
    }

    const range = s10 - s1;
    const m1 = isCurved ? Math.pow(10 / 9, 2) : (10 / 9);
    const m2 = isCurved ? Math.pow(11 / 9, 2) : (11 / 9);

    return {
      t1: Math.round(s1 + range * m1),
      t2: Math.round(s1 + range * m2)
    };
  }

  /**
   * Generates format-specific HTML for bonus targets.
   * Specifically used in Bowling to show the extra point thresholds for the 10th frame.
   * 
   * @param {Object} round The round definition.
   * @param {boolean} isLastRound Whether this is the final frame.
   * @param {Function} formatFn Numeric formatting helper.
   * @param {string} scalingType Scaling preference ('flat'|'curved').
   * @returns {string} HTML string.
   */
  getBonusTargetHtml(round, isLastRound, formatFn, scalingType) {
    if (!isLastRound || !round.values || !round.values[10]) return '';
    const { t1, t2 } = this.getBonusTargets(round, scalingType);
    return `
      <div style="margin-top: 8px; border-top: 1px dashed #bbb; padding-top: 4px; font-size: 0.8rem; color: var(--pb-primary);">
        <div><b>XX:</b> ${formatFn(t1)}</div>
        <div><b>XXX:</b> ${formatFn(t2)}</div>
      </div>
    `;
  }

  /**
   * Orchestrates the branching paths for the 10th frame (Final Round).
   * Handles "Instant Perfect Finish", multiple strikes, and early/late spares.
   * 
   * @param {Object} round Machine configuration.
   * @param {number} raw1 Score after Ball 1.
   * @param {number} raw2 Score after Ball 2.
   * @param {number} raw3 Score after Ball 3.
   * @returns {Object} Turn data containing mark and cumulative frame score.
   */
  getRound10Data(round, raw1, raw2, raw3) {
    const { t1, t2 } = this.getBonusTargets(round);
    const target = Number(round.values[10] || 0);

    // Instant Perfect Finish (Short-circuit if Bonus 2 target hit early)
    if (raw1 >= t2 || raw2 >= t2) {
      return this._createTurnData(round, 'tenth', 'X X X', 10, 10, 10, 30);
    }

    if (raw1 >= target) {
      return this._processTenthStrike(round, raw2, raw3, target, t1, t2);
    } else if (raw2 >= target) {
      return this._processTenthSpare(round, raw3, target, t1);
    } else if (raw3 >= target) {
      return this._processTenthLateSpare(round, raw2);
    } else {
      const p2 = this.getPinCount(round, raw2);
      const p3 = this.getPinCount(round, raw3);
      return this._createTurnData(round, 'tenth', String(p3), p2, Math.max(0, p3 - p2), 0, p3);
    }
  }

  /**
   * Handles the "Strike Path" for the 10th frame.
   * If ball 1 is a strike, the player gets two more balls. This method
   * determines if those balls result in more strikes or spares.
   * 
   * @param {Object} round Machine configuration.
   * @param {number} raw2 Score after Ball 2.
   * @param {number} raw3 Score after Ball 3.
   * @param {number} target The base strike target.
   * @param {number} t1 Bonus Target 1.
   * @param {number} t2 Bonus Target 2.
   * @returns {Object} Calculated turn data.
   */
  _processTenthStrike(round, raw2, raw3, target, t1, t2) {
    if (raw2 >= t1) {
      const isThirdStrike = raw3 >= t2;
      const p3 = isThirdStrike ? 10 : this.getPinCount(round, raw3 - t1);
      return this._createTurnData(round, 'tenth', `X X ${isThirdStrike ? 'X' : p3}`, 10, 10, p3, 20 + p3);
    }

    // Ball 2 missed Bonus 1. Calculate pins relative to 'X 6 0' threshold.
    const v6 = Number(round.values?.[6] || 0);
    const strikeOffset = target - v6;
    const p2 = this._getRelativePins(round, raw2, strikeOffset);

    if (raw3 >= t1) {
      return this._createTurnData(round, 'tenth', 'X 8/', 10, 8, 2, 20);
    }
    const p3 = Math.max(0, this._getRelativePins(round, raw3, strikeOffset) - p2);
    return this._createTurnData(round, 'tenth', `X ${p2} ${p3}`, 10, p2, p3, 10 + p2 + p3);
  }

  /**
   * Handles the "Spare Path" for the 10th frame.
   * If the strike target is reached on ball 2, the player gets one more bonus ball.
   * 
   * @param {Object} round Machine configuration.
   * @param {number} raw3 Score after Ball 3.
   * @param {number} target The base strike target.
   * @param {number} t1 Bonus Target 1.
   * @returns {Object} Calculated turn data.
   */
  _processTenthSpare(round, raw3, target, t1) {
    if (raw3 >= t1) {
      return this._createTurnData(round, 'tenth', '9/ X', 9, 1, 10, 20);
    }
    // Ball 3 missed Bonus 1. Calculate pins relative to '9/ 4' threshold.
    const v4 = Number(round.values?.[4] || 0);
    const spareOffset = target - v4;
    const p3 = this._getRelativePins(round, raw3, spareOffset);
    return this._createTurnData(round, 'tenth', `9/ ${p3}`, 9, 1, p3, 10 + p3);
  }

  /**
   * Processes the "Late Spare" path. This occurs when the player fails to hit 
   * the strike target on balls 1 and 2, but reaches it cumulatively on ball 3.
   * 
   * @param {Object} round Machine configuration.
   * @param {number} raw2 Score after Ball 2.
   * @returns {Object} Turn data with a spare mark (e.g. "8/").
   */
  _processTenthLateSpare(round, raw2) {
    const p2 = this.getPinCount(round, raw2);
    const first = Math.min(p2, 8);
    return this._createTurnData(round, 'tenth', `${first}/`, first, 10 - first, 0, 10);
  }

  /**
   * Helper to calculate pin counts relative to a specific raw score offset. 
   * Used during the 10th frame to calculate pins after a strike or spare has occurred.
   * 
   * @param {Object} round Machine configuration.
   * @param {number} rawScore The achievement to evaluate.
   * @param {number} offset The amount of score "consumed" by previous marks.
   * @returns {number} Pin count (0-10).
   */
  _getRelativePins(round, rawScore, offset) {
    return this.getPinCount(round, Math.max(0, rawScore - offset));
  }

  /**
   * Internal factory for turn data objects.
   * Ensures a consistent structure for return values across all branching paths.
   * 
   * @param {Object} round Machine configuration.
   * @param {string} type The logic path (strike, spare2, open, etc).
   * @param {string} mark The visual representation (X, 9/, etc).
   * @param {number} first Pin count of first ball.
   * @param {number} second Pin count of second ball.
   * @param {number} third Pin count of third ball.
   * @param {number} score Frame total for current pins (excluding bonuses).
   * @returns {Object} Standardized turn result.
   */
  _createTurnData(round, type, mark, first, second, third = 0, score) {
    return {
      orderNumber: round.orderNumber,
      machineName: round.machineName,
      type,
      mark,
      first,
      second,
      third,
      score
    };
  }

  /**
   * Calculates the pin results for a standard (1-9) frame.
   * 
   * @param {Object} round Machine configuration.
   * @param {number} raw1 Score after Ball 1.
   * @param {number} raw2 Score after Ball 2.
   * @param {number} raw3 Score after Ball 3.
   * @param {boolean} [isLastRound=false] Toggle for 10th frame logic.
   * @returns {Object} Raw turn result including pin counts for bowling math.
   */
  getTurnDataFromValues(round, raw1, raw2, raw3, isLastRound = false) {
    if (isLastRound) return this.getRound10Data(round, raw1, raw2, raw3);

    const target = round.values?.[10] || 0;
    if (raw1 >= target) {
      return this._createTurnData(round, 'strike', 'X', 10, 0, 0, 10);
    }
    if (raw2 >= target) {
      return this._createTurnData(round, 'spare2', '9/', 9, 1, 0, 10);
    }
    if (raw3 >= target) {
      const p2 = this.getPinCount(round, raw2);
      const first = Math.min(p2, 8);
      return this._createTurnData(round, 'spare3', `${first}/`, first, 10 - first, 0, 10);
    }

    const p2 = this.getPinCount(round, raw2);
    const p3 = this.getPinCount(round, raw3);
    return this._createTurnData(round, 'open', String(p3), p2, Math.max(0, p3 - p2), 0, p3);
  }

  /**
   * Look-ahead helper for standard bowling math.
   * 
   * @param {number} roundIndex The current frame index.
   * @param {number} count Number of balls to look ahead (1 for spare, 2 for strike).
   * @param {Array} turnData The full list of calculated frame results.
   * @returns {Array<number>} The pin counts of the next N balls.
   */
  getNextBallValues(roundIndex, count, turnData) {
    const values = [];
    for (let current = roundIndex + 1; current < turnData.length && values.length < count; current += 1) {
      const next = turnData[current];
      if (next.type === 'strike') values.push(10);
      else values.push(next.first, next.second);
    }
    while (values.length < count) values.push(0);
    return values.slice(0, count);
  }

  /** @returns {string} Label for a single round (e.g. "Frame"). */
  getRoundLabel() { return this.config.roundLabel || 'Frame'; }

  /** @returns {string} Prefix for turn headers. */
  getTurnHeaderPrefix() { return this.config.turnHeaderPrefix || 'Frame'; }

  /** @returns {string} Label for the main goal (e.g. "Strike"). */
  getPrimaryTargetLabel() { return this.config.primaryTargetLabel || 'Strike'; }

  /** @returns {string} Label for the value 1 (Strike) requirement. */
  getValue1Label() { return this.config.value1Label || 'Target Score'; }

  /** @returns {string} Label for the value 2 (1-Pin) baseline. */
  getValue2Label() { return this.config.value2Label || 'Base Score'; }

  getThresholdPrefix() { return 'Pins'; }

  // Explicitly define for Bowling, even if they match the base defaults
  getThresholdStart() { return this.config.thresholdStart ?? 10; }
  getThresholdEnd() { return this.config.thresholdEnd ?? 1; }

  /**
   * Converts turn data into a visual mark string.
   * 
   * @param {Object} turn The calculated turn result.
   * @returns {string} e.g. "X", "7/", "4 3".
   */
  formatMark(turn, _parValue = 0) { // Bowling doesn't use parValue for mark formatting
    if (turn.type === 'tenth') return turn.mark || '';
    if (turn.type === 'strike') return 'X';
    if (turn.type === 'spare2' || turn.type === 'spare3') return `${turn.first}/`;
    if (typeof turn.first === 'number' && typeof turn.second === 'number') return `${turn.first} ${turn.second}`;
    return turn.mark || '';
  }

  /**
   * Calculates the full game results for a Bowling session.
   * 
   * @param {Array<Object>} machines Target definitions for the event.
   * @param {Object} scoreMap Dictionary of ball scores keyed by orderNumber.
   * @returns {{turnResults: Array, total: number}}
   */
  calculateTurnResults(machines, scoreMap) {
    const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

    const turnData = machines.map((round) => {
      const entry = scoreMap[String(round.orderNumber)] || { ball1: 0, ball2: 0, ball3: 0 };
      return this.getTurnDataFromValues(round, Number(entry.ball1), Number(entry.ball2), Number(entry.ball3), round.orderNumber === maxOrder);
    });

    let total = 0;
    const results = turnData.map((turn, index) => {
      let turnScore = turn.score;
      if (turn.type === 'strike') {
        const [next1, next2] = this.getNextBallValues(index, 2, turnData);
        turnScore = 10 + next1 + next2;
      } else if (turn.type === 'spare2' || turn.type === 'spare3') {
        const [next1] = this.getNextBallValues(index, 1, turnData);
        turnScore = 10 + next1;
      }
      total += turnScore;
      const formattedMark = this.formatMark(turn);
      return { 
        ...turn, 
        score: turnScore, 
        played: true,
        mark: formattedMark, // Update mark property to satisfy unit tests
        displayMark: formattedMark,
        displayRoundTotal: this.formatTotalScore(total),
        displayRunningTotal: this.formatTotalScore(total)
      };
    });
    return { turnResults: results, total, totalDisplay: this.formatTotalScore(total) };
  }

  /**
   * Generates a 1-to-10 pin mapping based on a Target (10) and Base (1) score.
   * 
   * @param {number} score10 The strike target.
   * @param {number} score1 The 1-pin baseline.
   * @param {string} scalingType 'flat' for linear, 'curved' for exponential.
   * @returns {Object|null} Map of rank -> raw score.
   */
  buildRoundValues(score10, score1, scalingType) {
    // Bowling: score10 is the anchor at rank 10, descending order (10 is the high score requirement).
    return this.calculateInterpolatedValues(score10, score1, 10, scalingType, 'desc');
  }

  /**
   * Standardized round options for Bowling.
   * @returns {Array<number>} [10]
   */
  getRoundCountOptions() { return [3, 6, 10]; }

  /**
   * Formats the total score for the leaderboard.
   * @param {number} total Final cumulative points.
   * @returns {string} Formatted number.
   */
  formatTotalScore(total) { return formatNumber(total); }

  /**
   * Returns default values for a new Bowling machine configuration.
   * Calculates a suggested baseline of 10% of the target.
   * 
   * @param {number} [suggestedTarget=5000000] The strike goal.
   * @returns {{value1: number, value2: number}}
   */
  getInitialValues(suggestedTarget = 5000000) {
    return { value1: suggestedTarget, value2: Math.floor(suggestedTarget / 10) };
  }
}
