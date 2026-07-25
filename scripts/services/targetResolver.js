/**
 * Single Source of Truth for Target Score Resolution and Format Defaults in Frontend JS.
 */
export const FORMAT_DEFAULTS = {
  baseball: {
    easy: 3000000,
    medium: 5000000,
    hard: 10000000,
    multiplier: 1.5,
  },
  golf: {
    easy: 25000000,
    medium: 50000000,
    hard: 100000000,
    multiplier: 1.0,
  },
  bowling: {
    easy: 25000000,
    medium: 50000000,
    hard: 100000000,
    multiplier: 1.0,
  },
};

/**
 * Resolves the baseline target score for a machine based on format and difficulty.
 *
 * Precedence hierarchy:
 * 1. Location target for requested format (machine.locationScores[format] or machine.scores[format])
 * 2. Master machine target for requested format (machine.masterScores[format] or top-level format match)
 * 3. Cross-format conversion fallback:
 *    - Baseball: target = otherFormatTarget / 10
 *    - Golf / Bowling: target = otherFormatTarget * 10
 * 4. Default for requested format from FORMAT_DEFAULTS.
 *
 * @param {Object} machine Machine object with scores/masterScores/locationScores maps.
 * @param {string} format Scoring format ('baseball', 'golf', 'bowling').
 * @param {string} difficulty Difficulty level ('easy', 'medium', 'hard').
 * @returns {number} Resolved baseline score.
 */
export function getTargetScoreForDifficulty(machine, format = 'bowling', difficulty = 'medium') {
  const fmt = String(format || 'bowling').toLowerCase();
  const diff = String(difficulty || 'medium').toLowerCase();
  const isKnownDiff = ['easy', 'med', 'medium', 'hard', ''].includes(diff);
  const diffKey = diff === 'easy' ? 'targetEasy' : (diff === 'hard' ? 'targetHard' : 'targetMed');
  const fmtDefaults = FORMAT_DEFAULTS[fmt] || FORMAT_DEFAULTS.bowling;
  const defaultVal = fmtDefaults[diff === 'easy' ? 'easy' : (diff === 'hard' ? 'hard' : 'medium')] || 50000000;

  if (!machine || !isKnownDiff) return defaultVal;

  const locScores = machine.locationScores || machine.scores || {};
  const masterScores = machine.masterScores || machine.scores || {};

  // Tier 1: Location score for requested format
  if (locScores[fmt] && Number(locScores[fmt][diffKey]) > 0) {
    return Number(locScores[fmt][diffKey]);
  }

  // Tier 2: Master machine score for requested format
  if (masterScores[fmt] && Number(masterScores[fmt][diffKey]) > 0) {
    return Number(masterScores[fmt][diffKey]);
  }

  // Check top-level format properties if format matches or is unformatted
  if ((!machine.format || machine.format === fmt) && Number(machine[diffKey]) > 0) {
    return Number(machine[diffKey]);
  }

  // Tier 3: Cross-format conversion fallback
  let fallbackVal = null;

  if (fmt === 'baseball') {
    // Baseball prefers Bowling first, then Golf
    const prefOrder = ['bowling', 'golf'];
    for (const f of prefOrder) {
      if (locScores[f] && Number(locScores[f][diffKey]) > 0) {
        fallbackVal = Math.round(Number(locScores[f][diffKey]) / 10);
        break;
      }
      if (masterScores[f] && Number(masterScores[f][diffKey]) > 0) {
        fallbackVal = Math.round(Number(masterScores[f][diffKey]) / 10);
        break;
      }
    }
  } else if (fmt === 'golf') {
    // Golf prefers Bowling first (1:1), then Baseball (* 10)
    const prefOrder = [
      { format: 'bowling', scale: 1 },
      { format: 'baseball', scale: 10 }
    ];
    for (const item of prefOrder) {
      const f = item.format;
      if (locScores[f] && Number(locScores[f][diffKey]) > 0) {
        fallbackVal = Math.round(Number(locScores[f][diffKey]) * item.scale);
        break;
      }
      if (masterScores[f] && Number(masterScores[f][diffKey]) > 0) {
        fallbackVal = Math.round(Number(masterScores[f][diffKey]) * item.scale);
        break;
      }
    }
  } else if (fmt === 'bowling') {
    // Bowling prefers Golf first (1:1), then Baseball (* 10)
    const prefOrder = [
      { format: 'golf', scale: 1 },
      { format: 'baseball', scale: 10 }
    ];
    for (const item of prefOrder) {
      const f = item.format;
      if (locScores[f] && Number(locScores[f][diffKey]) > 0) {
        fallbackVal = Math.round(Number(locScores[f][diffKey]) * item.scale);
        break;
      }
      if (masterScores[f] && Number(masterScores[f][diffKey]) > 0) {
        fallbackVal = Math.round(Number(masterScores[f][diffKey]) * item.scale);
        break;
      }
    }
  }

  if (fallbackVal !== null && fallbackVal > 0) {
    return fallbackVal;
  }

  // Tier 4: Default for format
  return defaultVal;
}
