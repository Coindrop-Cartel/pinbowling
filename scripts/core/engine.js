import { TraditionalBowlingEngine } from '@core/engines/bowling/scoring/TraditionalBowlingEngine.js';
import { StrokesGolfEngine } from '@core/engines/golf/scoring/StrokesGolfEngine.js';
import { BaseballInningsEngine } from '@core/engines/baseball/scoring/BaseballInningsEngine.js';
import { HomeRunDerbyEngine } from '@core/engines/baseball/scoring/HomeRunDerbyEngine.js';
import { ScoringEngine } from '@core/ScoringEngine.js';
import { ScoringFormats } from '@services/scoringFormat.js';

/**
 * List of supported scoring formats for display in configuration dropdowns and UI selectors.
 */
export const SCORING_FORMATS = ScoringFormats.ALL.map(value => {
  const labels = {
    [ScoringFormats.BOWLING]: 'Bowling (Marks & Frames)',
    [ScoringFormats.GOLF]: 'Golf (Strokes vs Par)',
    [ScoringFormats.BASEBALL]: 'Baseball (Head-to-Head Runs)',
    [ScoringFormats.HOME_RUN_DERBY]: 'Home Run Derby (Individual Runs)'
  };
  return { value, label: labels[value] || value };
});

/**
 * Factory function to retrieve the active scoring engine. 
 * 
 * @param {string|null} [format=null] - The format key ('bowling', 'golf', 'baseball', or 'homerunderby').
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
    case ScoringFormats.HOME_RUN_DERBY:
      return new HomeRunDerbyEngine(resolvedSettings.homerunderby || resolvedSettings.baseball, options);
    case ScoringFormats.GOLF:
      return new StrokesGolfEngine(resolvedSettings.golf, options);
    case ScoringFormats.BASEBALL:
      return new BaseballInningsEngine(resolvedSettings.baseball, options);
    case ScoringFormats.BOWLING:
    default:
      return new TraditionalBowlingEngine(resolvedSettings.bowling, options);
  }
}