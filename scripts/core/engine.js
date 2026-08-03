import { BowlingEngine } from '@core/engines/BowlingEngine.js';
import { GolfEngine } from '@core/engines/GolfEngine.js';
import { BaseballEngine } from '@core/engines/BaseballEngine.js';
import { ScoringEngine } from '@core/ScoringEngine.js';
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
 * 
 * @param {string|null} [format=null] - The format key ('bowling', 'golf', or 'baseball').
 * @param {Object} [settings={}] - Terminology settings config map.
 * @param {Object} [options={}] - Strategy configuration.
 * @returns {ScoringEngine} An instance of a class extending ScoringEngine.
 */
export function getScoringEngine(format = null, settings = null, options = {}) {
  let preferred = null;
  if (!format && typeof document !== 'undefined') {
    const match = document.cookie.match(new RegExp('(^| )pb_preferred_format=([^;]+)'));
    preferred = match ? match[2] : null;
  }
  const activeFormat = ScoringFormats.resolve(format || preferred);
  const resolvedSettings = settings || (typeof window !== 'undefined' ? window['PB_SETTINGS'] : {}) || {};

  switch (activeFormat) {
    case ScoringFormats.GOLF:
      return new GolfEngine(resolvedSettings.golf, options);
    case ScoringFormats.BASEBALL:
      return new BaseballEngine(resolvedSettings.baseball, options);
    case ScoringFormats.BOWLING:
    default:
      return new BowlingEngine(resolvedSettings.bowling, options);
  }
}