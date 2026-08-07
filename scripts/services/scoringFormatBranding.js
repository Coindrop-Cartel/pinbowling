import { ScoringFormats, FORMAT_TERMINOLOGY } from './scoringFormat.js';

/**
 * Registry and service for all presentational metadata of scoring formats.
 * Separates UI concerns (branding, themes, labels, hints) from scoring calculation engines.
 */
export const FormatBranding = {
  /**
   * Retrieves branding configuration for a given scoring format.
   * Resolves values from window.PB_SETTINGS (populated from server-side config)
   * with FORMAT_TERMINOLOGY static defaults as fallback.
   *
   * @param {string} [format] Format key (e.g. 'bowling').
   * @returns {Object} Presentational branding object.
   */
  get(format) {
    const resolved = ScoringFormats.resolve(format);
    const settings = (window.PB_SETTINGS && window.PB_SETTINGS[resolved]) || {};
    const def = FORMAT_TERMINOLOGY[resolved] || FORMAT_TERMINOLOGY[ScoringFormats.DEFAULT];
    return {
      brandName: settings.brand || def.brand,
      logoImage: settings.logo || def.logo,
      playActionLabel: settings.cta || def.cta,
      themeClass: settings.themeClass || def.themeClass,
      roundLabel: settings.roundLabel || def.roundLabel,
      turnHeaderPrefix: settings.turnHeaderPrefix || def.turnHeaderPrefix,
      primaryTargetLabel: settings.primaryTargetLabel || def.primaryTargetLabel,
      value1Label: settings.value1Label || def.value1Label,
      value2Label: settings.value2Label || def.value2Label,
      thresholdPrefix: settings.thresholdPrefix || def.thresholdPrefix,
      scoringHint: settings.hint || def.hint,
      lastFrameHint: settings.lastFrameHint || def.lastFrameHint,
      scoringDescription: settings.logic || def.logic || ''
    };
  }
};
