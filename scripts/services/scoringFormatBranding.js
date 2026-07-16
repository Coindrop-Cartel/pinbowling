import { ScoringFormats } from './scoringFormat.js';

/**
 * Registry and service for all presentational metadata of scoring formats.
 * Separates UI concerns (branding, themes, labels, hints) from scoring calculation engines.
 */
export const FormatBranding = {
  /**
   * Retrieves branding configuration for a given scoring format.
   * Resolves values from window.PB_SETTINGS (populated from server-side config)
   * with static defaults as fallback.
   *
   * @param {string} [format] Format key (e.g. 'bowling').
   * @returns {Object} Presentational branding object.
   */
  get(format) {
    const resolved = ScoringFormats.resolve(format);
    const settings = (window.PB_SETTINGS && window.PB_SETTINGS[resolved]) || {};
    
    // Static fallback configurations
    const defaults = {
      [ScoringFormats.BOWLING]: {
        brand: 'PinBowling',
        logo: 'pinbowling.png',
        cta: "Let's Bowl!",
        themeClass: 'theme-bowling',
        roundLabel: 'Frame',
        turnHeaderPrefix: 'Frame',
        primaryTargetLabel: 'Pin Baseline',
        value1Label: 'Strike',
        value2Label: '1 pin',
        thresholdPrefix: 'Pins',
        hint: "Enter your score after each ball. When you hit the strike score you can stop entering scores for that frame and move on to the next frame. DO NOT PLAY EXTRA BALLS",
        lastFrameHint: "In the last frame, you can get up to 3 strikes. Keep playing until you hit the additional target scores or you run out of balls."
      },
      [ScoringFormats.GOLF]: {
        brand: 'PinGolf',
        logo: 'pingolf.png',
        cta: "Let's Golf!",
        themeClass: 'theme-golf',
        roundLabel: 'Hole',
        turnHeaderPrefix: 'Hole',
        primaryTargetLabel: 'Par',
        value1Label: 'Target Score',
        value2Label: 'Par',
        thresholdPrefix: 'Strokes',
        hint: "Enter your score after each ball. When you hit the target score you can stop entering scores for that round and move on to the next hole. DO NOT PLAY EXTRA BALLS",
        lastFrameHint: ""
      },
      [ScoringFormats.BASEBALL]: {
        brand: 'PinBaseball',
        logo: 'pinbaseball.png',
        cta: "Play Ball!",
        themeClass: 'theme-baseball',
        roundLabel: 'Inning',
        turnHeaderPrefix: 'Inning',
        primaryTargetLabel: 'Run Baseline',
        value1Label: 'Baseline Score',
        value2Label: 'Multiplier',
        thresholdPrefix: 'Runs',
        hint: "Enter your score after each ball.  There is no limit to how many runs you can score, so do not stop unless it's the bottom of the last inning and you have taken the lead.  DO NOT PLAY EXTRA BALLS",
        lastFrameHint: ""
      }
    };
    
    const def = defaults[resolved] || defaults[ScoringFormats.DEFAULT];
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
