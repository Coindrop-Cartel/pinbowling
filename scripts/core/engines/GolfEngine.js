import { ScoringEngine } from '../ScoringEngine.js';

/**
 * Placeholder for future Golf scoring format.
 */
export class GolfEngine extends ScoringEngine {
  /**
   * Translates a pinball score into a stroke count (1-10).
   * In Golf, if your score is >= the threshold for a 1, you get a 1.
   */
  getStrokeCount(round, rawScore) {
    if (!round || !round.values || typeof rawScore !== 'number') return 10;
    
    // Sort thresholds descending: Stroke 1 is the highest score
    const thresholds = Object.entries(round.values)
      .map(([strokes, score]) => ({ strokes: Number(strokes), score: Number(score) }))
      .sort((a, b) => b.score - a.score);

    // Find the lowest stroke count (best) where the score was achieved
    for (const threshold of thresholds) {
      if (rawScore >= threshold.score) {
        return threshold.strokes;
      }
    }
    return 10; // Default to max strokes if no threshold met
  }

  calculateTurnResults(machines, scoreMap) {
    const results = machines.map((round) => {
      const entry = scoreMap[String(round.orderNumber)] || { ball1: 0, ball2: 0, ball3: 0 };
      // Use the highest value from any ball entered (standard Pingolf cumulative)
      const rawScore = Math.max(
        Number(entry.ball1 || 0),
        Number(entry.ball2 || 0),
        Number(entry.ball3 || 0)
      );
      const strokes = this.getStrokeCount(round, rawScore);

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