import { ScoringEngine } from '../../ScoringEngine.js';
import { formatNumber } from '../../../utils.js';

/**
 * Implementation of Golf-style scoring logic (PinGolf).
 * Scoring is based on strokes relative to par.
 */
export class GolfEngine extends ScoringEngine {
  constructor(config = {}, options = {}) {
    super({ format: 'golf', ...config }, options);
  }

  getQuickFillScale() {
    return 100;
  }

  buildRoundValues(target, par, scalingType) {
    const parRank = Number(par) || 3;
    const floor = target / 10;
    return this.calculateInterpolatedValues(target, floor, parRank, scalingType, 'asc');
  }

  filterThresholds(values) {
    if (!values) return {};
    const filtered = {};
    for (const [rank, val] of Object.entries(values)) {
      if (Number(rank) >= 3) {
        filtered[rank] = val;
      }
    }
    return filtered;
  }

  getThresholdSort() {
    return (a, b) => Number(a[0]) - Number(b[0]);
  }

  getThresholdPrefix() { return 'Strokes'; }

  getRowSummaryData(round) {
    const goal = round.values?.[3] || round.values?.['3'] || round.value1 || 0;
    const par = round.value2 || 3;
    return {
      label: 'Target Score',
      value: goal,
      label2: 'Par',
      value2: par
    };
  }

  getPrintTargetSummaryData(machine, _isLastRound) {
    const goal = machine.values?.[3] || machine.values?.['3'] || machine.value1 || 0;
    return [
      { label: 'Target Score', value: goal, format: true },
      { label: 'Par', value: machine.value2 || 3, format: false }
    ];
  }

  getThresholdRowClass(rank, value1, value2) {
    const r = Number(rank);
    const isTarget = r === this.getThresholdStart();
    const isEnd = r === this.getThresholdEnd();
    const isPar = r === Number(value2);

    if (isTarget || isEnd || isPar) {
      return 'threshold-highlight';
    }
    return '';
  }

  isParThreshold(rank, _value1, value2) {
    return Number(rank) === Number(value2);
  }

  getMarkFormatting(markValue, parValue) {
    const diff = markValue - parValue;
    if (diff === 0) return '';
    if (diff === -1) return 'golf-birdie';
    if (diff === -2) return 'golf-eagle';
    if (diff <= -3) return 'golf-albatross';
    if (diff === 1) return 'golf-bogey';
    if (diff === 2) return 'golf-double-bogey';
    if (diff >= 3) return 'golf-triple-bogey';
    return '';
  }

  formatMark(turn) {
    return turn.mark || String(turn.score) || '';
  }

  getMarkStyleClass(turn, parValue) {
    return this.getMarkFormatting(turn.score, parValue);
  }

  getTurnDataFromValues(machine, raw1, raw2, raw3) {
    const values = machine.values || {};
    let strokes = 10;

    const threshold3 = values[3] || 0;
    if (raw1 >= threshold3) strokes = 1;
    else if (raw2 >= threshold3) strokes = 2;
    else if (raw3 >= threshold3) strokes = 3;
    else {
      const thresholds = Object.entries(values)
        .filter(([rank]) => Number(rank) >= 4)
        .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
        .sort((a, b) => b.score - a.score);

      const match = thresholds.find(t => raw3 >= t.score);
      strokes = match ? match.rank : 10;
    }

    return {
      orderNumber: machine.orderNumber,
      machineName: machine.machineName,
      mark: String(strokes),
      score: strokes
    };
  }

  calculateTurnResults(machines, scoreMap) {
    let runningTotal = 0;
    const playedMachines = [];

    const results = machines.map(machine => {
      const entry = scoreMap[String(machine.orderNumber)];
      const hasScores = entry && (Number(entry.ball1) > 0 || Number(entry.ball2) > 0 || Number(entry.ball3) > 0);
      
      const turn = this.getTurnDataFromValues(
        machine,
        Number(entry?.ball1 || 0),
        Number(entry?.ball2 || 0),
        Number(entry?.ball3 || 0)
      );

      if (hasScores) {
        runningTotal += turn.score;
        playedMachines.push(machine);
        const par = Number(machine.value2) || 3;
        const diff = turn.score - par;
        const styleClass = this.getMarkStyleClass(turn, machine.value2);
        const formattedMark = this.formatMark(turn);
        return {
          ...turn,
          played: true,
          mark: turn.mark,
          displayMark: formattedMark,
          styleClass,
          displayRoundTotal: diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : String(diff)),
          displayRunningTotal: this.formatTotalScore(runningTotal, playedMachines)
        };
      }

      return { ...turn, played: false, displayMark: '−', displayRoundTotal: '', displayRunningTotal: '−', styleClass: '' };
    });

    return { turnResults: results, total: runningTotal, totalDisplay: this.formatTotalScore(runningTotal, playedMachines) };
  }

  compareScores(a, b) { return a - b; }
  handlesSortCompletely() { return true; }

  sortStandings(rows, options = {}) {
    const sorted = [...rows].sort((a, b) => {
      if (a.hasScores !== b.hasScores) return a.hasScores ? -1 : 1;
      if (a.parDiff !== undefined && b.parDiff !== undefined) {
        const d = a.parDiff - b.parDiff;
        if (d !== 0) return d;
      }
      const holesA = a.ordersWithScores?.size ?? 0;
      const holesB = b.ordersWithScores?.size ?? 0;
      if (holesA !== holesB) return holesA - holesB;
      return this.compareScores(a.totalSeasonPoints ?? a.total ?? 0, b.totalSeasonPoints ?? b.total ?? 0);
    });
    if (options.seasonScoring === 'weekly') {
      return this.getCompetitionStrategy().sortStandings(sorted, this, options);
    }
    return sorted;
  }

  getRoundCountOptions() { return [3, 6, 9, 18]; }

  formatTotalScore(total, machines = []) {
    const machinesArray = Array.isArray(machines) ? machines : [machines];
    const cumulativePar = machinesArray.reduce((sum, m) => sum + (Number(m.value2) || 3), 0);
    if (cumulativePar === 0) return formatNumber(total);

    const rel = (Number(total) || 0) - cumulativePar;
    const relStr = rel === 0 ? 'E' : (rel > 0 ? `+${rel}` : rel);
    return `${formatNumber(total)} (${relStr})`;
  }
  
  getInitialValues(suggestedTarget = 5000000) {
    return { value1: suggestedTarget, value2: 3 };
  }

  generateValue2Defaults(count) {
    const pars = [3, 4, 5];
    while (pars.length < count) {
      pars.push(Math.floor(Math.random() * 3) + 3);
    }
    for (let i = pars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pars[i], pars[j]] = [pars[j], pars[i]];
    }
    return pars.slice(0, count);
  }
}
