import { ScoringEngine } from '../ScoringEngine.js';
import { formatNumber } from '../../utils.js';

/**
 * Implementation of Golf-style scoring logic (PinGolf).
 * Scoring is based on strokes relative to par.
 */
export class GolfEngine extends ScoringEngine {
  /**
   * Overridden for Golf: Anchors the input 'target' at the 'par' rank.
   * Scores for fewer strokes (ranks < par) are calculated above the target,
   * while scores for more strokes (ranks > par) are calculated below.
   * 
   * @param {number} target The Target Score (Ball 1).
   * @param {number|string} par The par value for the hole (usually 3).
   * @param {string} scalingType 'flat' or 'curved'.
   * @returns {Object|null}
   */
  buildRoundValues(target, par, scalingType) {
    const parRank = Number(par) || 3;
    const floor = target / 10; // Default floor to 10% of the target

    // Golf: target is the anchor at parRank, ascending order (1 is the high score requirement).
    // Anchor at par means reaching the target score at the Par stroke (e.g. Stroke 3).
    return this.calculateInterpolatedValues(target, floor, parRank, scalingType, 'asc');
  }

  /**
   * Sort 1 to 10 for Golf (lowest strokes first).
   */
  getThresholdSort() {
    return (a, b) => Number(a[0]) - Number(b[0]);
  }

  getThresholdPrefix() { return 'Strokes'; }

  /**
   * Overridden for Golf: Summarizes the target needed by Ball 3 to achieve a "3" or better.
   * This helps players understand the primary goal of the hole.
   * 
   * @param {Object} round 
   * @param {Function} formatFn 
   * @returns {string}
   */
  getRowSummaryHtml(round, formatFn) {
    const goal = round.values?.[3] || round.values?.['3'] || round.value1 || 0;
    const par = round.value2 || 3;
    return `<div class="strike-target" style="font-size: 0.8rem; color: var(--pb-primary); margin-top: 4px;"><b>Target Score:</b> ${formatFn(goal)} &nbsp;&nbsp; <b>Par:</b> ${par}</div>`;
  }

  /**
   * Highlighting for Golf thresholds (Target Stroke and Par Stroke).
   */
  getThresholdRowStyle(rank, value1, value2) {
    const r = Number(rank);
    // Highlighting for the key thresholds: Start (3), End (10), and Par.
    const isMajor = 
      r === this.getThresholdStart() || 
      r === this.getThresholdEnd() || 
      r === Number(value2);

    if (isMajor) {
      return 'margin: 2px 0; font-weight: bold; color: var(--pb-primary);';
    }
    return 'margin: 2px 0; opacity: 0.8;';
  }

  /**
   * Returns a CSS class string for formatting a mark based on its value relative to par.
   * @param {number} markValue The numeric value of the mark (stroke count).
   * @param {number} parValue The par value for the current hole.
   * @returns {string} CSS class string.
   */
  getMarkFormatting(markValue, parValue) {
    const diff = markValue - parValue;
    if (diff === 0) return ''; // Par
    if (diff === -1) return 'golf-birdie';   // Circle
    if (diff === -2) return 'golf-eagle';    // Solid Circle
    if (diff <= -3) return 'golf-albatross'; // Solid Circle with Frame
    if (diff === 1) return 'golf-bogey'; // Bogey (square)
    if (diff === 2) return 'golf-double-bogey'; // Double Bogey (solid square)
    if (diff >= 3) return 'golf-triple-bogey'; // Solid Square with Frame
    return '';
  }

  /**
   * Converts turn data into a visual mark string, applying Golf-specific formatting.
   * @param {Object} turn The calculated turn result.
   * @param {number} parValue The par value for the current hole.
   * @returns {string}
   */
  formatMark(turn, parValue) {
    const formattingClass = this.getMarkFormatting(turn.score, parValue);
    return `<span class="${formattingClass}">${turn.mark}</span>`;
  }

  /**
   * Calculates the stroke result for a single hole based on cumulative ball scores.
   * 
   * @param {Object} machine The target definition for this hole.
   * @property {number} machine.value1 - Target score.
   * @property {number} machine.value2 - Par value.
   * @property {Object<string, number>} machine.values - Interpolated thresholds.
   * @property {number} raw1 Score after Ball 1.
   * @property {number} raw2 Score after Ball 2.
   * @param {number} raw1 Score after Ball 1.
   * @param {number} raw2 Score after Ball 2.
   * @param {number} raw3 Score after Ball 3.
   * @returns {Object} Standardized turn data.
   */
  getTurnDataFromValues(machine, raw1, raw2, raw3) {
    const values = machine.values || {};
    let strokes = 10; // Default if target not hit

    // For Golf, hitting the Rank 3 threshold on any of the first three balls
    // determines the stroke count (1, 2, or 3).
    const threshold3 = values[3] || 0;
    if (raw1 >= threshold3) strokes = 1;
    else if (raw2 >= threshold3) strokes = 2;
    else if (raw3 >= threshold3) strokes = 3;
    else {
      // Step 2: Hitting target after 3 balls. 
      // Strokes are calculated based on where the final score falls in the 4-10 thresholds.
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

  /**
   * Calculates the full game results for a PinGolf session.
   * 
   * @param {Array<Object>} machines Target definitions for the event.
   * @param {Object} scoreMap Dictionary of ball scores keyed by orderNumber.
   * @returns {{turnResults: Array, total: number}}
   */
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
        const formattedMark = this.formatMark(turn, machine.value2);
        return {
          ...turn,
          played: true,
          mark: turn.mark, // Keep numeric mark for logic if needed
          displayMark: formattedMark,
          displayRoundTotal: diff === 0 ? 'E' : (diff > 0 ? `+${diff}` : String(diff)),
          displayRunningTotal: this.formatTotalScore(runningTotal, playedMachines)
        };
      }

      return { ...turn, played: false, displayMark: '−', displayRoundTotal: '', displayRunningTotal: '−' };
    });

    return { turnResults: results, total: runningTotal, totalDisplay: this.formatTotalScore(runningTotal, playedMachines) };
  }

  /**
   * Comparator for player standings. Low score wins in Golf.
   */
  compareScores(a, b) { return a - b; } // Low score wins

  /**
   * Standardized round options for Golf.
   * @returns {Array<number>} [9, 18]
   */
  getRoundCountOptions() { return [3, 6, 9, 18]; }

  /** @returns {string} Label for a single round (e.g. "Hole"). */
  getRoundLabel() { return this.config.roundLabel || 'Hole'; }

  /** @returns {string} Prefix for turn headers. */
  getTurnHeaderPrefix() { return this.config.turnHeaderPrefix || 'Hole'; }

  /** @returns {string} Label for the main goal (e.g. "Par"). */
  getPrimaryTargetLabel() { return this.config.primaryTargetLabel || 'Par'; }

  /** @returns {string} Label for the value 1 (Target Score) requirement. */
  getValue1Label() { return this.config.value1Label || 'Target Score'; }

  /** @returns {string} Label for the value 2 (Par) baseline. */
  getValue2Label() { return this.config.value2Label || 'Par'; }

  /**
   * Formats the total score, including relative-to-par display (e.g. "24 (+2)").
   */
  formatTotalScore(total, machines = []) {
    // Ensure machines is always an array for reduce
    const machinesArray = Array.isArray(machines) ? machines : [machines];

    // Calculate cumulative par for the machines provided
    const cumulativePar = machinesArray.reduce((sum, m) => sum + (Number(m.value2) || 3), 0);

    if (cumulativePar === 0) return formatNumber(total);

    const rel = (Number(total) || 0) - cumulativePar;
    const relStr = rel === 0 ? 'E' : (rel > 0 ? `+${rel}` : rel);
    return `${formatNumber(total)} (${relStr})`;
  }
  
  getInitialValues(suggestedTarget = 5000000) {
    return { value1: suggestedTarget, value2: 3 };
  }
}