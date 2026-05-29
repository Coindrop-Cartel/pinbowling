import { BowlingEngine } from './engines/BowlingEngine.js';

export function getScoringEngine(format = 'bowling') {
  switch (format) {
    case 'bowling':
      return new BowlingEngine();
    // Add other engines here if they are implemented
    default:
      return new BowlingEngine(); // Default to BowlingEngine
  }
}