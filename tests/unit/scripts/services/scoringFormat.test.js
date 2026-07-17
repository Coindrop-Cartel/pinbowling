/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { ScoringFormats } from '@services/scoringFormat.js';

describe('ScoringFormats service', () => {
  it('exports the expected format constants', () => {
    expect(ScoringFormats.BOWLING).toBe('bowling');
    expect(ScoringFormats.GOLF).toBe('golf');
    expect(ScoringFormats.BASEBALL).toBe('baseball');
  });

  it('provides an immutable ALL array of all formats', () => {
    expect(ScoringFormats.ALL).toEqual(['bowling', 'golf', 'baseball']);
    expect(() => {
      ScoringFormats.ALL.push('test');
    }).toThrow();
  });

  it('has a DEFAULT constant equal to BOWLING', () => {
    expect(ScoringFormats.DEFAULT).toBe(ScoringFormats.BOWLING);
  });

  it('isValid correctly identifies valid and invalid values', () => {
    expect(ScoringFormats.isValid('bowling')).toBe(true);
    expect(ScoringFormats.isValid('golf')).toBe(true);
    expect(ScoringFormats.isValid('baseball')).toBe(true);
    expect(ScoringFormats.isValid('invalid')).toBe(false);
    expect(ScoringFormats.isValid(null)).toBe(false);
    expect(ScoringFormats.isValid(undefined)).toBe(false);
  });

  it('resolve returns the input if valid, otherwise DEFAULT', () => {
    expect(ScoringFormats.resolve('bowling')).toBe('bowling');
    expect(ScoringFormats.resolve('golf')).toBe('golf');
    expect(ScoringFormats.resolve('baseball')).toBe('baseball');
    expect(ScoringFormats.resolve('invalid')).toBe(ScoringFormats.DEFAULT);
    expect(ScoringFormats.resolve(null)).toBe(ScoringFormats.DEFAULT);
  });
});
