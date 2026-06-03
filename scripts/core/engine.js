import { BowlingEngine } from '@core/engines/BowlingEngine.js';
import { GolfEngine } from '@core/engines/GolfEngine.js';

export const SCORING_FORMATS = [
  { value: 'bowling', label: 'Bowling (Marks & Frames)' },
  { value: 'golf', label: 'Golf (Strokes vs Par)' }
];

export function getScoringEngine(format = 'bowling') {
  switch (format) {
    case 'bowling':
      return new BowlingEngine();
    case 'golf':
      return new GolfEngine();
    default:
      return new BowlingEngine(); // Default to BowlingEngine
  }
}