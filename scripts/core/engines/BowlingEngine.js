import { ScoringEngine } from '../ScoringEngine.js';

/**
 * Implementation of the Bowling-style scoring logic.
 * Maps pinball scores to 10 pins and calculates standard bowling bonuses.
 */
export class BowlingEngine extends ScoringEngine {
  /**
   * Converts a raw pinball score into a 0-10 pin count based on machine-specific thresholds.
   * @param {Object} round - The round/machine configuration containing threshold values.
   * @param {number} rawScore - The cumulative pinball score achieved.
   * @returns {number} Pin count (0-10).
   */
  getPinCount(round, rawScore) {
    if (!round || typeof rawScore !== 'number' || rawScore <= 0) return 0;
    const thresholds = Object.entries(round.values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => a.score - b.score);
    let pins = 0;
    for (const threshold of thresholds) {
      if (rawScore >= threshold.score) {
        pins = Math.max(pins, threshold.rank);
      }
    }
    return pins;
  }

  /**
   * Calculates Target 1 (1.3x strike) and Target 2 (1.3x Target 1) for the last round.
   * @param {Object} round The round object containing scoring values.
   * @param {string} [scalingType] Optional explicit scaling type ('flat' or 'curved').
   * @returns {{t1: number, t2: number}} An object with calculated Target 1 and Target 2 scores.
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
   * Generates format-specific HTML for bonus targets (e.g., Round 10 Targets).
   */
  getBonusTargetHtml(round, isLastRound, formatFn, scalingType) {
    if (!isLastRound || !round.values || !round.values[10]) return '';
    const { t1, t2 } = this.getBonusTargets(round, scalingType);
    return `
      <div style="margin-top: 8px; border-top: 1px dashed #bbb; padding-top: 4px; font-size: 0.8rem; color: #000;">
        <div><b>Target 1:</b> ${formatFn(t1)}</div>
        <div><b>Target 2:</b> ${formatFn(t2)}</div>
      </div>
    `;
  }

  /**
   * Complex logic for Round 10.
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
   * Handles the strike path for the 10th frame.
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
   * Handles the spare path for the 10th frame.
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
   * Handles the ball 3 spare (late spare) path for the 10th frame.
   */
  _processTenthLateSpare(round, raw2) {
    const p2 = this.getPinCount(round, raw2);
    const first = Math.min(p2, 8);
    return this._createTurnData(round, 'tenth', `${first}/`, first, 10 - first, 0, 10);
  }

  /**
   * Helper to calculate pin counts relative to a specific raw score offset.
   */
  _getRelativePins(round, rawScore, offset) {
    return this.getPinCount(round, Math.max(0, rawScore - offset));
  }

  /**
   * Standardized factory for turn data objects.
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

  formatMark(turn) {
    if (turn.type === 'tenth') return turn.mark;
    if (turn.type === 'strike') return 'X';
    if (turn.type === 'spare2' || turn.type === 'spare3') return `${turn.first}/`;
    return `${turn.first} ${turn.second}`;
  }

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
      return { orderNumber: turn.orderNumber, machineName: turn.machineName, mark: this.formatMark(turn), score: turnScore };
    });
    return { turnResults: results, total };
  }

  buildRoundValues(score10, score1, scalingType) {
    const values = {};
    if (score10 > 0 && score1 > 0) {
      const range = score10 - score1;
      for (let rank = 10; rank >= 1; rank -= 1) {
        const fraction = (rank - 1) / 9;
        const multiplier = (scalingType === 'curved') ? Math.pow(fraction, 2) : fraction;
        values[rank] = Math.round(score1 + range * multiplier);
      }
      return values;
    }
    return null;
  }

  getRoundLabel() { return 'Frame'; }
  getTurnHeaderPrefix() { return 'Frame'; }
  getPrimaryTargetLabel() { return 'Strike'; }
  getHighScoreLabel() { return 'Strike'; }
  getLowScoreLabel() { return '1 Pin'; }
}
