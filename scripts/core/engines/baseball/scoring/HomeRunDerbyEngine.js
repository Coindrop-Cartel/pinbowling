import { BaseballEngine } from '../BaseballEngine.js';
import { formatNumber } from '../../../../utils.js';

/**
 * Implementation of Home Run Derby scoring logic (PinDerby / Home Run Derby).
 * Non-head-to-head individual format where players accumulate runs based on machine thresholds.
 * Low score floor defaults to 1/5th (20%) of the target score.
 */
export class HomeRunDerbyEngine extends BaseballEngine {
  constructor(config = {}, options = {}) {
    super({ format: 'homerunderby', ...config }, options);
  }

  getQuickFillScale() {
    return 5;
  }

  requiresHeadToHead() {
    return false;
  }

  getMachinesPerRound() {
    return 1;
  }

  getMaxBallsPerRound() {
    return 1;
  }

  getRoundDisplayLabel(index) {
    const prefix = this.getTurnHeaderPrefix();
    return `${prefix} ${index + 1}`;
  }

  getScoringDescription() {
    return "Individual card scoring based on baseball run thresholds. Players compete individually across At Bats to accumulate the highest total runs.";
  }

  getRunCount(machine, rawScore) {
    if (!machine || typeof rawScore !== 'number' || rawScore <= 0) return 0;
    const values = machine.values || this.buildRoundValues(machine.value1 ?? machine.targetScore, machine.value2 ?? machine.multiplier);
    const thresholds = Object.entries(values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => b.score - a.score);

    const match = thresholds.find(t => rawScore >= t.score);
    return match ? match.rank : 0;
  }

  formatMark(turn) {
    if (!turn || turn.played === false) return '−';
    return String(turn.score ?? turn.mark ?? '−');
  }

  formatTotalScore(total) {
    return formatNumber(total);
  }

  getPrintTargetSummaryData(machine, _isLastRound) {
    const goal = machine.values?.[1] || machine.value1 || 0;
    return [
      { label: 'Run Baseline', value: goal, format: true },
      { label: 'Multiplier', value: machine.value2 || 1.5, format: false }
    ];
  }

  getTurnDataFromValues(machine, raw1) {
    const rawScore = Number(raw1 || 0);
    const runs = this.getRunCount(machine, rawScore);
    return {
      orderNumber: machine.orderNumber,
      machineName: machine.machineName,
      mark: String(runs),
      score: runs
    };
  }

  calculateTurnResults(machines, scoreMap) {
    let totalRuns = 0;
    const results = machines.map((machine) => {
      const entry = scoreMap[String(machine.orderNumber)];
      const hasScores = entry && (Number(entry.ball1) > 0 || Number(entry.ball2) > 0 || Number(entry.ball3) > 0);
      
      const turn = this.getTurnDataFromValues(
        machine,
        Number(entry?.ball1 || 0),
        Number(entry?.ball2 || 0),
        Number(entry?.ball3 || 0)
      );

      if (hasScores) {
        totalRuns += turn.score;
        const turnWithPlayed = { ...turn, played: true };
        const formattedMark = this.formatMark(turnWithPlayed);
        return {
          ...turnWithPlayed,
          displayMark: formattedMark,
          displayRoundTotal: String(turn.score),
          displayRunningTotal: this.formatTotalScore(totalRuns)
        };
      }

      return {
        ...turn,
        played: false,
        displayMark: '−',
        displayRoundTotal: '',
        displayRunningTotal: '−'
      };
    });

    return {
      turnResults: results,
      total: totalRuns,
      totalDisplay: this.formatTotalScore(totalRuns)
    };
  }

  compareScores(a, b) {
    return b - a; // High score wins
  }

  getRoundCountOptions() {
    return [3, 6, 9];
  }

  getInitialValues(suggestedTarget = 5000000) {
    return { value1: suggestedTarget, value2: 1.5 };
  }
}
