import { ScoringEngine } from '../ScoringEngine.js';

/**
 * Placeholder for future Golf scoring format.
 */
export class GolfEngine extends ScoringEngine {
  calculateTurnResults(machines, scoreMap) {
    const results = machines.map((round) => {
      const entry = scoreMap[String(round.orderNumber)] || { ball1: 0, ball2: 0, ball3: 0 };
      const target = Number(round.value1 || 0);
      
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
        mark: String(strokes),
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

  getThresholdRowStyle(rank, value1, value2) {
    const isParRank = Number(rank) === Number(value2);
    if (isParRank) {
      return 'border: 2px solid #333; padding: 2px 8px; border-radius: 4px; display: inline-block; background: rgba(0,0,0,0.05); font-weight: bold; margin: 2px 0;';
    }
    return 'margin: 2px 0;';
  }

  formatMark(turn) {
    return String(turn.score);
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