import { BowlingEngine } from '@core/engines/BowlingEngine.js';
import { GolfEngine } from '@core/engines/GolfEngine.js';
import { BaseballEngine } from '@core/engines/BaseballEngine.js';
import { ScoringFormats } from '@services/scoringFormat.js';

/**
 * List of supported scoring formats for display in configuration dropdowns and UI selectors.
 */
export const SCORING_FORMATS = ScoringFormats.ALL.map(value => {
  const labels = {
    [ScoringFormats.BOWLING]: 'Bowling (Marks & Frames)',
    [ScoringFormats.GOLF]: 'Golf (Strokes vs Par)',
    [ScoringFormats.BASEBALL]: 'Baseball (Head-to-Head Runs)'
  };
  return { value, label: labels[value] };
});

/**
 * Factory function to retrieve the active scoring engine. 
 * Prioritizes an explicit format parameter, falling back to the user's 
 * cookie preference, and finally defaulting to Bowling.
 * 
 * @param {string|null} [format=null] - The format key ('bowling', 'golf', or 'baseball').
 * @returns {ScoringEngine} An instance of a class extending ScoringEngine.
 */
export function getScoringEngine(format = null, options = {}) {
  const match = document.cookie.match(new RegExp('(^| )pb_preferred_format=([^;]+)'));
  const preferred = match ? match[2] : null;
  const activeFormat = ScoringFormats.resolve(format || preferred);
  
  // window.PB_SETTINGS is populated via js-config.php
  const settings = window.PB_SETTINGS || {};

  switch (activeFormat) {
    case ScoringFormats.GOLF:
      return new GolfEngine(settings.golf, options);
    case ScoringFormats.BASEBALL:
      return new BaseballEngine(settings.baseball, options);
    case ScoringFormats.BOWLING:
    default:
      return new BowlingEngine(settings.bowling, options);
  }
}