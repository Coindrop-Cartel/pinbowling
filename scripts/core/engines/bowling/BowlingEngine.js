import { ScoringEngine } from '../../ScoringEngine.js';
import { formatNumber } from '../../../utils.js';

/**
 * Base & traditional implementation of the Bowling-style scoring logic.
 * Maps pinball scores to 10 pins and calculates standard bowling bonuses.
 */
export class BowlingEngine extends ScoringEngine {
  constructor(config = {}, options = {}) {
    super({ format: 'bowling', ...config }, options);
  }

  getQuickFillScale() {
    return 1000;
  }

  getPinCount(round, rawScore) {
    if (!round || typeof rawScore !== 'number' || rawScore <= 0) return 0;
    const thresholds = Object.entries(round.values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => b.score - a.score);

    const match = thresholds.find(t => rawScore >= t.score);
    return match ? match.rank : 0;
  }

  getBonusTargets(round) {
    const s10 = round.values?.[10] || 0;
    const t1 = Math.round(s10 * 1.5);
    const t2 = Math.round(t1 * 1.5);
    return { t1, t2 };
  }

  getBonusTargetLabels(_machine) {
    return { label1: 'XX', label2: 'XXX' };
  }

  getPrintTargetSummaryData(machine, isLastRound) {
    const data = [{ label: 'Strike', value: machine.values?.[10] || machine.value1 || 0, format: true }];
    if (isLastRound) {
      const { t1, t2 } = this.getBonusTargets(machine);
      data.push(
        { label: 'Target 1', value: t1, format: true },
        { label: 'Target 2', value: t2, format: true }
      );
    }
    return data;
  }

  getRound10Data(round, raw1, raw2, raw3) {
    const { t1, t2 } = this.getBonusTargets(round);
    const target = Number(round.values?.[10] || 0);

    if (raw1 >= t2 || raw2 >= t2) {
      return this._createTurnData(round, 'tenth', 'X X X', 10, 10, 10, 30);
    }

    if (raw1 >= target) {
      return this._processTenthStrike(round, raw2, raw3, target, t1, t2);
    } else if (raw2 >= target) {
      return this._processTenthSpare(round, raw1, raw3, target, t1);
    } else if (raw3 >= target) {
      return this._processTenthLateSpare(round, raw2);
    } else {
      const p2 = this.getPinCount(round, raw2);
      const p3 = this.getPinCount(round, raw3);
      return this._createTurnData(round, 'tenth', String(p3), p2, Math.max(0, p3 - p2), 0, p3);
    }
  }

  _processTenthStrike(round, raw2, raw3, target, t1, t2) {
    if (raw2 >= t1) {
      if (raw3 >= t2) {
        return this._createTurnData(round, 'tenth', 'X X X', 10, 10, 10, 30);
      }
      return this._createTurnData(round, 'tenth', 'X X 4', 10, 10, 4, 24);
    }

    if (raw3 >= t1) {
      return this._createTurnData(round, 'tenth', 'X 9/', 10, 9, 1, 20);
    }
    return this._createTurnData(round, 'tenth', 'X 6', 10, 6, 0, 16);
  }

  _processTenthSpare(round, _raw1, raw3, target, t1) {
    if (raw3 >= t1) {
      return this._createTurnData(round, 'tenth', '9/ X', 9, 1, 10, 20);
    }
    return this._createTurnData(round, 'tenth', '9/ 4', 9, 1, 4, 14);
  }

  _processTenthLateSpare(round, raw2) {
    const p2 = this.getPinCount(round, raw2);
    const first = Math.min(p2, 8);
    return this._createTurnData(round, 'tenth', `${first}/`, first, 10 - first, 0, 10);
  }

  _getRelativePins(round, rawScore, offset) {
    return this.getPinCount(round, Math.max(0, rawScore - offset));
  }

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

  formatMark(turn, _parValue = 0) {
    if (turn.type === 'tenth') return turn.mark || '';
    if (turn.type === 'strike') return 'X';
    if (turn.type === 'spare2' || turn.type === 'spare3') return `${turn.first}/`;
    if (typeof turn.first === 'number' && typeof turn.second === 'number') return `${turn.first} ${turn.second}`;
    return turn.mark || '';
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
      const formattedMark = this.formatMark(turn);
      return { 
        ...turn, 
        score: turnScore, 
        played: true,
        mark: formattedMark,
        displayMark: formattedMark,
        displayRoundTotal: this.formatTotalScore(total),
        displayRunningTotal: this.formatTotalScore(total)
      };
    });
    return { turnResults: results, total, totalDisplay: this.formatTotalScore(total) };
  }

  getRoundCountOptions() { return [3, 6, 10]; }
  formatTotalScore(total) { return formatNumber(total); }
  getInitialValues(suggestedTarget = 5000000) {
    return { value1: suggestedTarget, value2: Math.floor(suggestedTarget / 10) };
  }
}
