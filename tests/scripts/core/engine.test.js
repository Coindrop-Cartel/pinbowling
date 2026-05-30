/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { getScoringEngine } from '@core/engine.js';
import { BowlingEngine } from '@core/engines/BowlingEngine.js';

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