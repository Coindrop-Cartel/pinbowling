/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getScoringEngine, SCORING_FORMATS } from '@core/engine.js';
import { BowlingEngine } from '@core/engines/BowlingEngine.js';
import { GolfEngine } from '@core/engines/GolfEngine.js';

describe('Scoring Engine Factory (engine.js)', () => {
  beforeEach(() => { document.cookie = ''; });

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

  it('should return an instance of GolfEngine for "golf" format', () => {
    const engine = getScoringEngine('golf');
    expect(engine).toBeInstanceOf(GolfEngine);
  });

  it('should fall back to cookie preference when no format is provided', () => {
    document.cookie = 'pb_preferred_format=golf';
    const engine = getScoringEngine();
    expect(engine).toBeInstanceOf(GolfEngine);
  });

  it('should prioritize explicit format over cookie preference', () => {
    document.cookie = 'pb_preferred_format=golf';
    const engine = getScoringEngine('bowling');
    expect(engine).toBeInstanceOf(BowlingEngine);
  });

  it('should fall back to bowling when cookie has invalid format', () => {
    document.cookie = 'pb_preferred_format=invalid';
    const engine = getScoringEngine();
    expect(engine).toBeInstanceOf(BowlingEngine);
  });

  it('should pass window.PB_SETTINGS.golf to GolfEngine constructor', () => {
    window.PB_SETTINGS = { golf: { roundLabel: 'Hole' } };
    const engine = getScoringEngine('golf');
    expect(engine).toBeInstanceOf(GolfEngine);
    expect(engine.getRoundLabel()).toBe('Hole');
    delete window.PB_SETTINGS;
  });

  it('should pass window.PB_SETTINGS.bowling to BowlingEngine constructor', () => {
    window.PB_SETTINGS = { bowling: { roundLabel: 'Inning' } };
    const engine = getScoringEngine('bowling');
    expect(engine).toBeInstanceOf(BowlingEngine);
    expect(engine.getRoundLabel()).toBe('Inning');
    delete window.PB_SETTINGS;
  });

  describe('SCORING_FORMATS', () => {
    it('should contain bowling and golf format options', () => {
      expect(SCORING_FORMATS).toHaveLength(2);
      expect(SCORING_FORMATS[0].value).toBe('bowling');
      expect(SCORING_FORMATS[1].value).toBe('golf');
    });

    it('should have label strings for each format', () => {
      SCORING_FORMATS.forEach(f => { expect(f.label).toBeTruthy(); expect(typeof f.label).toBe('string'); });
    });
  });
});