import { BowlingEngine } from '@core/engines/BowlingEngine.js';
import { GolfEngine } from '@core/engines/GolfEngine.js';

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