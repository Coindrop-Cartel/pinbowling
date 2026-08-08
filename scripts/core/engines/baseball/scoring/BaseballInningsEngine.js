import { BaseballEngine } from '../BaseballEngine.js';

/**
 * Implementation of Head-to-Head Baseball Innings scoring (PinBaseball).
 * Features paired top/bottom half-innings, pitcher and batter roles, and walkoff rules.
 */
export class BaseballInningsEngine extends BaseballEngine {
  constructor(config = {}, options = {}) {
    super(config, { competitionFormat: 'head_to_head', ...options });
  }

  requiresHeadToHead() { return true; }
}
