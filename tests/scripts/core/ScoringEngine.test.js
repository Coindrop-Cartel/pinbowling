import { describe, it, expect } from 'vitest';
import { ScoringEngine } from '@core/ScoringEngine.js';

/**
 * Unit tests for the base ScoringEngine class.
 * Verifies interface enforcement and default metadata.
 */
describe('ScoringEngine (Base Class)', () => {
  const engine = new ScoringEngine();

  it('should throw error for non-implemented interface methods', () => {
    // These methods must be overridden by specific implementations (Bowling, Golf, etc.)
    expect(() => engine.calculateTurnResults([], {})).toThrow(/must be implemented/);
    expect(() => engine.buildRoundValues(100, 10)).toThrow(/must be implemented/);
    expect(() => engine.formatMark({})).toThrow(/must be implemented/);
  });

  it('should provide default implementations for optional utility methods', () => {
    expect(engine.getBonusTargets()).toEqual({ t1: 0, t2: 0 });
    expect(engine.getBonusTargetHtml()).toBe('');
  });

  it('should provide standard default terminology', () => {
    expect(engine.getRoundLabel()).toBe('Round');
    expect(engine.getTurnHeaderPrefix()).toBe('Round');
    expect(engine.getPrimaryTargetLabel()).toBe('Target');
  });
});