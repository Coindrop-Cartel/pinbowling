import { BowlingEngine } from './engines/BowlingEngine.js';
import { GolfEngine } from './engines/GolfEngine.js';
import { ScoringEngine } from './ScoringEngine.js';

/**
 * Registry of available scoring implementations.
 * @type {Object<string, ScoringEngine>}
 */
const ENGINES = {
  'bowling': new BowlingEngine(),
  'golf': new GolfEngine()
};

/**
 * Factory to retrieve the correct scoring logic based on the event format.
 * Defaults to 'bowling' for backward compatibility.
 * 
 * @param {string} format 
 * @returns {Object} The engine implementation
 */
export const getScoringEngine = (format = 'bowling') => {
  return ENGINES[format] || ENGINES['bowling'];
};

export { BowlingEngine, ScoringEngine };