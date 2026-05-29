/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { getScoringEngine } from '../../scripts/engine.js';
import { BowlingEngine } from '../../scripts/engines/BowlingEngine.js';

describe('Scoring Engine Factory (engine.js)', () => {
  it('should return an instance of BowlingEngine for "bowling" format', () => {
    const engine = getScoringEngine('bowling');
    expect(engine).toBeInstanceOf(BowlingEngine);
  });

  it('should return an instance of BowlingEngine for an unknown format (default)', () => {
    const engine = getScoringEngine('unknown');
    expect(engine).toBeInstanceOf(BowlingEngine);
  });

  it('should return an instance of BowlingEngine when no format is provided', () => {
    const engine = getScoringEngine();
    expect(engine).toBeInstanceOf(BowlingEngine);
  });
});