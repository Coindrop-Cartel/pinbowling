import { BowlingEngine } from '@core/engines/BowlingEngine.js';
import { GolfEngine } from '@core/engines/GolfEngine.js';

export const SCORING_FORMATS = [
  { value: 'bowling', label: 'Bowling (Marks & Frames)' },
  { value: 'golf', label: 'Golf (Strokes vs Par)' }
];

export function getScoringEngine(format = null) {
  const match = document.cookie.match(new RegExp('(^| )pb_preferred_format=([^;]+)'));
  const preferred = (match ? match[2] : null) || 'bowling';
  const activeFormat = format || preferred;

  switch (activeFormat) {
    case 'bowling':
      return new BowlingEngine();
    case 'golf':
      return new GolfEngine();
    default:
      return new BowlingEngine(); // Default to BowlingEngine
  }
}