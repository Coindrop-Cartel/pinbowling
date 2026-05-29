import { ScoringEngine } from '../ScoringEngine.js';

/**
 * Placeholder for future Golf scoring format.
 */
export class GolfEngine extends ScoringEngine {
  calculateTurnResults(machines, scoreMap) {
    // Implementation for Pingolf: Strokes vs Par
    return { turnResults: [], total: 0 };
  }

  buildRoundValues(target, par) {
    // Implementation for defining hole-in-one vs par thresholds
    return {};
  }

  formatMark(frame) { return ''; }
}