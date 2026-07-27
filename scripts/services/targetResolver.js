import { getScoringEngine } from '../core/engine.js';

/**
 * Dynamic map querying engine format defaults for backwards compatibility.
 */
export const FORMAT_DEFAULTS = new Proxy({}, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined;
    const engine = getScoringEngine(prop);
    return engine ? engine.getFormatDefaults() : { easy: 25000000, medium: 50000000, hard: 100000000, multiplier: 1.0 };
  }
});

/**
 * Resolves the baseline target score for a machine based on format and difficulty.
 *
 * Precedence hierarchy:
 * 1. Location target for requested format
 * 2. Master machine target for requested format
 * 3. Cross-format conversion fallback via engine preferences
 * 4. Default for requested format from engine
 *
 * @param {Object} machine Machine object with scores/masterScores/locationScores maps.
 * @param {string|Object} [format='bowling'] Scoring format key or ScoringEngine instance.
 * @param {string} [difficulty='medium'] Difficulty level ('easy', 'medium', 'hard').
 * @returns {number} Resolved baseline score.
 */
export function getTargetScoreForDifficulty(machine, format = 'bowling', difficulty = 'medium') {
  const engine = (typeof format === 'object' && format !== null && typeof format.getCrossFormatPreferenceOrder === 'function')
    ? format
    : getScoringEngine(format);

  const fmtKey = String(engine.config?.format || format || 'bowling').toLowerCase();
  const diff = String(difficulty || 'medium').toLowerCase();
  const isKnownDiff = ['easy', 'med', 'medium', 'hard', ''].includes(diff);
  const diffKey = diff === 'easy' ? 'targetEasy' : (diff === 'hard' ? 'targetHard' : 'targetMed');
  const defaultVal = engine.getDefaultTargetForDifficulty(diff);

  if (!machine || !isKnownDiff) return defaultVal;

  const locScores = machine.locationScores || machine.scores || {};
  const masterScores = machine.masterScores || machine.scores || {};

  // Tier 1: Location score for requested format
  if (locScores[fmtKey] && Number(locScores[fmtKey][diffKey]) > 0) {
    return Number(locScores[fmtKey][diffKey]);
  }

  // Tier 2: Master machine score for requested format
  if (masterScores[fmtKey] && Number(masterScores[fmtKey][diffKey]) > 0) {
    return Number(masterScores[fmtKey][diffKey]);
  }

  // Check top-level format properties if format matches or is unformatted
  if ((!machine.format || machine.format === fmtKey) && Number(machine[diffKey]) > 0) {
    return Number(machine[diffKey]);
  }

  // Tier 3: Cross-format conversion fallback using engine preference order
  const prefOrder = engine.getCrossFormatPreferenceOrder();
  for (const item of prefOrder) {
    const f = item.format;
    const scale = item.scale ?? 1;
    if (locScores[f] && Number(locScores[f][diffKey]) > 0) {
      return Math.round(Number(locScores[f][diffKey]) * scale);
    }
    if (masterScores[f] && Number(masterScores[f][diffKey]) > 0) {
      return Math.round(Number(masterScores[f][diffKey]) * scale);
    }
  }

  // Tier 4: Default for format
  return defaultVal;
}
