import { ScoringEngine } from '../ScoringEngine.js';
import { formatNumber } from '../../utils.js';

/**
 * Implementation of Baseball-style scoring logic (PinBaseball).
 * Head-to-head format where players alternate roles as pitcher and batter.
 */
export class BaseballEngine extends ScoringEngine {
  /**
   * Overridden for Baseball:
   * Returns a map of rank (1-10) to target score using exponential scaling.
   * 1 run = target
   * n runs = target * (multiplier ^ (n-1))
   * 
   * @param {number} target The baseline target score for 1 run.
   * @param {number|string} multiplier The exponential multiplier (e.g. 1.5).
   * @param {string} scalingType Ignored for baseball (always exponential).
   * @returns {Object} Map of rank -> score.
   */
  buildRoundValues(target, multiplier, scalingType) {
    const t = Number(target) || 5000000;
    const m = Number(multiplier) || 1.5;
    const values = {};
    for (let rank = 1; rank <= 10; rank++) {
      values[rank] = Math.round(t * Math.pow(m, rank - 1));
    }
    return values;
  }

  getThresholdStart() { return 1; }
  getThresholdEnd() { return 10; }
  getThresholdPrefix() { return 'Runs'; }

  getThresholdSort() {
    return (a, b) => Number(a[0]) - Number(b[0]);
  }

  getThresholdLabel(rank, _value1, _value2) {
    return `${rank} R`;
  }

  /**
   * Helper to get run count for a given score difference based on machine values.
   * 
   * @param {Object} machine The machine config containing .values map.
   * @param {number} diff The score difference (batterScore - pitcherScore).
   * @returns {number} Runs scored (0-10).
   */
  getRunCount(machine, diff) {
    if (diff <= 0 || !machine || !machine.values) return 0;
    const thresholds = Object.entries(machine.values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => b.score - a.score);

    const match = thresholds.find(t => diff >= t.score);
    return match ? match.rank : 0;
  }

  /**
   * Calculates the result of a single ball.
   * 
   * @param {Object} machine The machine/inning configuration.
   * @param {number} pitcherScore Score of the pitcher.
   * @param {number} batterScore Score of the batter.
   * @returns {number} Runs scored on this ball.
   */
  calculateBallRuns(machine, pitcherScore, batterScore) {
    const diff = batterScore - pitcherScore;
    return this.getRunCount(machine, diff);
  }

  /**
   * Calculates turn data for a player on a machine (inning).
   * 
   * @param {Object} machine The machine/inning config.
   * @param {Object} playerEntry The player's scores entry (ball1, ball2, ball3).
   * @param {Object} opponentEntry The opponent's scores entry (ball1, ball2, ball3).
   * @param {boolean} isBatter Whether the player is the batter for this inning/half.
   * @returns {Object} Calculated turn data.
   */
  getInningData(machine, playerEntry, opponentEntry, isBatter) {
    const p1 = Number(playerEntry?.ball1 || 0);
    const p2 = Number(playerEntry?.ball2 || 0);
    const p3 = Number(playerEntry?.ball3 || 0);

    const o1 = Number(opponentEntry?.ball1 || 0);
    const o2 = Number(opponentEntry?.ball2 || 0);
    const o3 = Number(opponentEntry?.ball3 || 0);

    let runs = 0;
    let played = false;

    if (isBatter) {
      // Batter runs are calculated per-ball and summed cumulatively.
      // Each ball's runs are independently determined by the score difference
      // on that ball. Once earned, runs are kept even if later balls yield fewer.
      const b1 = p1;
      const b2 = p2;
      const b3 = p3;
      
      const pit1 = o1;
      const pit2 = o2;
      const pit3 = o3;

      const runs1 = this.calculateBallRuns(machine, pit1, b1);
      const runs2 = this.calculateBallRuns(machine, pit2, b2);
      const runs3 = this.calculateBallRuns(machine, pit3, b3);

      runs = runs1 + runs2 + runs3;
      played = b1 > 0 || b2 > 0 || b3 > 0;
    } else {
      // Pitcher scores 0 runs.
      runs = 0;
      played = p1 > 0 || p2 > 0 || p3 > 0;
    }

    return {
      orderNumber: machine.orderNumber,
      machineName: machine.machineName,
      isBatter,
      played,
      score: runs,
      mark: `${runs}R`
    };
  }

  /**
   * Calculates the full game results.
   * scoreMap can contain an `opponent` property (another scoreMap)
   * and `isPlayer1` property (boolean, true if player is Player 1/Home).
   * 
   * If opponent scoreMap is not present, we assume 0 for opponent.
   */
  calculateTurnResults(machines, scoreMap) {
    let runningTotal = 0;
    const opponentMap = scoreMap?.opponent || {};
    // Default to player being Player 1 (home) if not specified
    const isPlayer1 = scoreMap?.isPlayer1 !== false;

    // Pre-compute opponent's running total to support walk-off detection.
    // Walk-off: if the batter is already ahead going into the last inning,
    // they win — no need to play it (like real baseball).
    let opponentRunningTotal = 0;
    const opponentResults = machines.map(machine => {
      const orderStr = String(machine.orderNumber);
      const opponentEntry = opponentMap[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const playerEntry = scoreMap?.[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const isInningOdd = machine.orderNumber % 2 !== 0;
      // Opponent's role is the reverse of this player's role
      const opponentIsBatter = isInningOdd ? isPlayer1 : !isPlayer1;
      const turn = this.getInningData(machine, opponentEntry, playerEntry, opponentIsBatter);
      if (turn.played) opponentRunningTotal += turn.score;
      return turn;
    });

    const lastInning = machines.length > 0 ? machines[machines.length - 1] : null;

    const results = machines.map((machine, idx) => {
      const orderStr = String(machine.orderNumber);
      const playerEntry = scoreMap?.[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const opponentEntry = opponentMap[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };

      // Odd innings: Player 1 is Pitcher, Player 2 is Batter
      // Even innings: Player 1 is Batter, Player 2 is Pitcher
      const isInningOdd = machine.orderNumber % 2 !== 0;
      const isBatter = isInningOdd ? !isPlayer1 : isPlayer1;

      // Walk-off check for the last inning:
      // If this player is the batter in the last inning and is already ahead,
      // they win without needing to play — mark as walk-off.
      const isLastInning = lastInning && machine.orderNumber === lastInning.orderNumber;
      if (isLastInning && isBatter && runningTotal > opponentRunningTotal) {
        return {
          orderNumber: machine.orderNumber,
          machineName: machine.machineName,
          isBatter,
          played: false,
          score: 0,
          mark: 'WO',
          isWalkOff: true,
          displayMark: 'WO',
          displayRoundTotal: '0',
          displayRunningTotal: this.formatTotalScore(runningTotal)
        };
      }

      const turn = this.getInningData(machine, playerEntry, opponentEntry, isBatter);

      if (turn.played) {
        runningTotal += turn.score;
        return {
          ...turn,
          displayMark: this.formatMark(turn),
          displayRoundTotal: isBatter ? `+${turn.score}` : '0',
          displayRunningTotal: this.formatTotalScore(runningTotal)
        };
      }

      return {
        ...turn,
        displayMark: '-',
        displayRoundTotal: '',
        displayRunningTotal: '-'
      };
    });

    return {
      turnResults: results,
      total: runningTotal,
      totalDisplay: this.formatTotalScore(runningTotal)
    };
  }

  formatMark(turn) {
    if (!turn.played) return '-';
    if (!turn.isBatter) return 'P'; // Pitcher role
    return `${turn.score}R`;
  }

  compareScores(a, b) {
    return b - a; // High score wins (total runs)
  }

  getRoundCountOptions() {
    return [2, 4, 6, 9];
  }

  getRoundLabel() { return this.config.roundLabel || 'Inning'; }
  getTurnHeaderPrefix() { return this.config.turnHeaderPrefix || 'Inning'; }
  getPrimaryTargetLabel() { return this.config.primaryTargetLabel || 'Run Baseline'; }
  getValue1Label() { return this.config.value1Label || 'Baseline Score'; }
  getValue2Label() { return this.config.value2Label || 'Multiplier'; }
  getValue2AllowsDecimal() { return true; }

  formatTotalScore(total) {
    return `${formatNumber(total)} R`;
  }

  getInitialValues(suggestedTarget = 5000000) {
    // 5M target, 1.5 multiplier
    return { value1: suggestedTarget, value2: 1.5 };
  }
}
