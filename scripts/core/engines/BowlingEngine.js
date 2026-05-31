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
   * @returns {{t1: number, t2: number}} An object with calculated Target 1 and Target 2 scores.
   */
  getBonusTargets(round) {
    const t1 = Math.round((round.values[10] || 0) * 1.3);
    const t2 = Math.round(t1 * 1.3);
    return { t1, t2 };
  }

  /**
   * Generates format-specific HTML for bonus targets (e.g., Round 10 Targets).
   */
  getBonusTargetHtml(round, isLastRound, formatFn) {
    if (!isLastRound || !round.values || !round.values[10]) return '';
    const { t1, t2 } = this.getBonusTargets(round);
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
    const target1 = Number(round.values[10] || 0);
    const target2 = Math.round(target1 * 1.3);
    const target3 = Math.round(target2 * 1.3);
    const hit1 = raw1 >= target1;
    const hit2 = raw2 >= target2;
    const hit3 = raw3 >= target3;
    const spare2 = !hit1 && raw2 >= target1;

    const c1 = this.getPinCount(round, raw1);
    const c2 = this.getPinCount(round, raw2);
    const c3 = this.getPinCount(round, raw3);

    let mark = '';
    let score = 0;
    let firstPins = 0;
    let secondPins = 0;
    let thirdPins = 0;

    if (hit1) {
      firstPins = 10;
      if (hit2) {
        secondPins = 10;
        thirdPins = hit3 ? 10 : Math.max(0, c3 - c2);
        mark = `X X ${hit3 ? 'X' : thirdPins}`;
        score = 20 + thirdPins;
      } else if (hit3) {
        secondPins = 8;
        thirdPins = 2;
        mark = 'X 8/';
        score = 20;
      } else {
        secondPins = c2;
        thirdPins = Math.max(0, c3 - c2);
        mark = `X ${secondPins} ${thirdPins}`;
        score = 10 + secondPins + thirdPins;
      }
    } else if (spare2) {
      firstPins = 9;
      secondPins = 1;
      thirdPins = hit3 ? 10 : Math.max(0, c3 - c2);
      mark = `9/ ${hit3 ? 'X' : thirdPins}`;
      score = 10 + thirdPins;
    } else if (hit3) {
      firstPins = Math.min(c2, 8);
      secondPins = 10 - firstPins;
      thirdPins = 0;
      mark = `${firstPins}/`;
      score = 10;
    } else {
      firstPins = c2;
      secondPins = Math.max(0, c3 - c2);
      thirdPins = 0;
      mark = `${firstPins} ${secondPins}`;
      score = firstPins + secondPins;
    }

    return { orderNumber: round.orderNumber, machineName: round.machineName, type: 'tenth', mark, first: firstPins, second: secondPins, third: thirdPins, score };
  }

  getTurnDataFromValues(round, raw1, raw2, raw3, isLastRound = false) {
    if (isLastRound) return this.getRound10Data(round, raw1, raw2, raw3);

    const c1 = this.getPinCount(round, raw1);
    const c2 = this.getPinCount(round, raw2);
    const c3 = this.getPinCount(round, raw3);

    let type, first = 0, second = 0, score = 0;

    if (c1 >= 10) {
      type = 'strike'; first = 10; second = 0; score = 10;
    } else if (c2 >= 10) {
      type = 'spare2'; first = 9; second = 1; score = 10;
    } else if (c3 >= 10) {
      type = 'spare3'; first = Math.min(c2, 8); second = 10 - first; score = 10;
    } else {
      type = 'open'; first = c2; second = Math.max(0, c3 - c2); score = first + second;
    }
    return { orderNumber: round.orderNumber, machineName: round.machineName, type, first, second, score };
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

  buildRoundValues(score10, score1) {
    const values = {};
    if (score10 > 0 && score1 > 0) {
      for (let rank = 10; rank >= 1; rank -= 1) {
        const fraction = (rank - 1) / 9;
        values[rank] = Math.round(score1 + (score10 - score1) * fraction);
      }
      return values;
    }
    return null;
  }

  getRoundLabel() { return 'Frame'; }
  getTurnHeaderPrefix() { return 'Frame'; }
  getPrimaryTargetLabel() { return 'Strike'; }
}
