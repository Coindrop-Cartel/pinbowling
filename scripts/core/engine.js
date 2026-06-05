import { BowlingEngine } from '@core/engines/BowlingEngine.js';
import { GolfEngine } from '@core/engines/GolfEngine.js';

/**
 * List of supported scoring formats for display in configuration dropdowns and UI selectors.
 */
export const SCORING_FORMATS = [
  { value: 'bowling', label: 'Bowling (Marks & Frames)' },
  { value: 'golf', label: 'Golf (Strokes vs Par)' }
];

/**
 * Factory function to retrieve the active scoring engine. 
 * Prioritizes an explicit format parameter, falling back to the user's 
 * cookie preference, and finally defaulting to Bowling.
 * 
 * @param {string|null} [format=null] - The format key ('bowling' or 'golf').
 * @returns {ScoringEngine} An instance of a class extending ScoringEngine.
 */
export function getScoringEngine(format = null) {
  const match = document.cookie.match(new RegExp('(^| )pb_preferred_format=([^;]+)'));
  const preferred = (match ? match[2] : null) || 'bowling';
  const activeFormat = format || preferred;
  
  // window.PB_SETTINGS is populated via js-config.php
  const settings = window.PB_SETTINGS || {};

  switch (activeFormat) {
    case 'golf':
      return new GolfEngine(settings.golf);
    case 'bowling':
    default:
      return new BowlingEngine(settings.bowling);
  }
}