import { ScoringEngine } from '../ScoringEngine.js';

/**
 * Placeholder for future Golf scoring format.
 */
export class GolfEngine extends ScoringEngine {
  calculateTurnResults(machines, scoreMap) {
    const results = machines.map((round) => {
      const entry = scoreMap[String(round.orderNumber)] || { ball1: 0, ball2: 0, ball3: 0 };
      const target = Number(round.value1 || 0);
      const par = Number(round.value2 || 3);
      
      let strokes = 10;

      const b1 = Number(entry.ball1 || 0);
      const b2 = Number(entry.ball2 || 0);
      const b3 = Number(entry.ball3 || 0);

      // 1, 2, or 3 strokes depends on which ball reached the Target Score
      if (target > 0 && b1 >= target) {
        strokes = 1;
      } else if (target > 0 && b2 >= target) {
        strokes = 2;
      } else if (target > 0 && b3 >= target) {
        strokes = 3;
      } else {
        // Fallback to threshold interpolation for 4-10 based on cumulative total
        const finalTotal = Math.max(b1, b2, b3);
        
        // Sort thresholds to find the best (lowest) rank achieved
        const thresholds = Object.entries(round.values || {})
          .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
          .filter(t => t.rank >= 4) // Ranks 1-3 are handled by ball sequence above
          .sort((a, b) => a.rank - b.rank); // Sort 4, 5, 6...

        for (const threshold of thresholds) {
          if (finalTotal >= threshold.score) {
            strokes = threshold.rank;
            break;
          }
        }
      }

      return {
        orderNumber: round.orderNumber,
        machineName: round.machineName,
        mark: this.formatMark({ score: strokes, par: par }),
        score: strokes
      };
    });

    const total = results.reduce((sum, res) => sum + res.score, 0);
    return { turnResults: results, total };
  }

  getRoundCountOptions() {
    return [3, 6, 9, 18];
  }

  /**
   * For Golf, value1 is the Target Score for Par, and value2 is the Par rank (default 3).
   * @param {number} baseScore 
   */
  getInitialValues(baseScore) {
    return { value1: baseScore, value2: 3 };
  }

  /**
   * Filters the threshold list for display. 
   * For Golf, we only show 3-10 as 1 and 2 are ball-dependent.
   */
  filterThresholds(values) {
    const filtered = {};
    Object.entries(values || {}).forEach(([rank, val]) => {
      if (Number(rank) >= 3) filtered[rank] = val;
    });
    return filtered;
  }

  /**
   * Maps a specific target score to the designated Par rank and interpolates the rest.
   * @param {number} target The pinball score required to achieve Par.
   * @param {number} par The rank (3-5) that represents Par.
   * @param {string} scalingType 'flat' or 'curved'
   */
  buildRoundValues(target, par, scalingType) {
    const values = {};
    const t = Number(target) || 0;
    const p = Number(par) || 3; // Default to Par 3 if not provided

    if (t > 0) {
      const power = (scalingType === 'curved') ? 2 : 1;
      
      for (let rank = 1; rank <= 10; rank += 1) {
        /**
         * Calculation: Value = Target * ((11 - Rank) / (11 - Par))^power
         * This ensures that at Rank = Par, Value = Target.
         * Lower ranks (better strokes) require higher scores.
         * Higher ranks (worse strokes) require lower scores.
         */
        values[rank] = Math.round(t * Math.pow((11 - rank) / (11 - p), power));
      }
      return values;
    }
    return null;
  }

  /**
   * For Golf, we sort thresholds Ascending (3 -> 10).
   */
  getThresholdSort() {
    return (a, b) => Number(a[0]) - Number(b[0]);
  }

  compareTotals(a, b) {
    // Handle players with 0 strokes (didn't play) by moving them to the bottom
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  }

  getTotalColumnLabel(anchorValue) {
    return `Par: ${anchorValue}`;
  }

  formatTotalScore(total, anchorValue, formatFn) {
    if (total === 0) return formatFn(0);
    const diff = total - anchorValue;
    if (diff === 0) return 'E';
    if (diff > 0) return `+${diff}`;
    return String(diff);
  }

  shouldShowRoundScore() {
    return false;
  }

  getThresholdRowStyle(rank, value1, value2) {
    const isParRank = Number(rank) === Number(value2);
    if (isParRank) {
      return 'border: 2px solid #333; padding: 2px 8px; border-radius: 4px; display: inline-block; background: rgba(0,0,0,0.05); font-weight: bold; margin: 2px 0;';
    }
    return 'margin: 2px 0;';
  }

  /**
   * Returns the stylized HTML for a golf score based on its relation to par.
   */
  formatMark(turn) {
    const strokes = Number(turn.score);
    const par = Number(turn.par || 0);
    if (!strokes || !par) return String(strokes || '−');

    const diff = strokes - par;
    // Shared container for symbols to ensure consistent alignment in tables
    const baseStyle = "display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; margin: 0 auto; font-weight: bold; font-size: 0.85rem; box-sizing: border-box;";

    // Par: No symbol
    if (diff === 0) return `<span style="${baseStyle}">${strokes}</span>`;

    // Birdie: Circle
    if (diff === -1) return `<div style="${baseStyle} border: 1px solid #333; border-radius: 50%;">${strokes}</div>`;

    // Eagle: Solid circle
    if (diff === -2) return `<div style="${baseStyle} background: #333; color: #fff; border-radius: 50%;">${strokes}</div>`;

    // Albatross or better: Solid circle with frame
    if (diff <= -3) return `<div style="display: inline-flex; border: 1px solid #333; padding: 1px; border-radius: 50%; margin: 0 auto;"><div style="${baseStyle} background: #333; color: #fff; border-radius: 50%; width: 22px; height: 22px;">${strokes}</div></div>`;

    // Bogey: Square
    if (diff === 1) return `<div style="${baseStyle} border: 1px solid #333;">${strokes}</div>`;

    // Double bogey: Solid square
    if (diff === 2) return `<div style="${baseStyle} background: #333; color: #fff;">${strokes}</div>`;

    // Triple bogey or worse: Solid square with frame
    if (diff >= 3) return `<div style="display: inline-flex; border: 1px solid #333; padding: 1px; margin: 0 auto;"><div style="${baseStyle} background: #333; color: #fff; width: 22px; height: 22px;">${strokes}</div></div>`;

    return String(strokes);
  }

  getRoundLabel() {
    return 'Hole';
  }

  getTurnHeaderPrefix() {
    return 'H';
  }

  getPrimaryTargetLabel() {
    return 'Target Score';
  }

  getHighScoreLabel() {
    return 'Target Score';
  }

  getLowScoreLabel() {
    return 'Par';
  }
}