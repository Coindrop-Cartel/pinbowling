import { describe, it, expect } from 'vitest';
import { ScoringEngine } from '@core/ScoringEngine.js';

/**
 * Unit tests for the base ScoringEngine class.
 * Verifies interface enforcement, interpolation logic, and default metadata.
 */
describe('ScoringEngine (Base Class)', () => {
  const engine = new ScoringEngine();

  // ── Constructor ──────────────────────────────────────────────────────
  describe('constructor', () => {
    it('should default config to empty object', () => {
      const e = new ScoringEngine();
      expect(e.config).toEqual({});
    });

    it('should accept and store config', () => {
      const cfg = { brand: 'Test', roundLabel: 'Hole' };
      const e = new ScoringEngine(cfg);
      expect(e.config).toBe(cfg);
    });
  });

  // ── Abstract method enforcement ──────────────────────────────────────
  describe('abstract methods', () => {
    it('calculateTurnResults should throw', () => {
      expect(() => engine.calculateTurnResults([], {})).toThrow(
        'calculateTurnResults must be implemented by subclass'
      );
    });

    it('formatMark should throw', () => {
      expect(() => engine.formatMark({})).toThrow(
        'formatMark must be implemented by subclass'
      );
    });
  });

  // ── calculateInterpolatedValues ──────────────────────────────────────
  describe('calculateInterpolatedValues', () => {
    it('flat desc: anchor at rank 10 (bowling default)', () => {
      // topScore=10000 at position=10, bottomScore=1000, flat, desc
      const values = engine.calculateInterpolatedValues(10000, 1000, 10, 'flat', 'desc');
      expect(values).not.toBeNull();
      expect(values[10]).toBe(10000); // anchor
      expect(values[1]).toBe(1000);   // floor
      // Rank 5: fraction = (5-1)/9 = 4/9, value = 1000 + 9000*(4/9) = 5000
      expect(values[5]).toBe(5000);
    });

    it('flat asc: anchor at rank 3 (golf par)', () => {
      // topScore=1000 at position=3, bottomScore=100, flat, asc
      const values = engine.calculateInterpolatedValues(1000, 100, 3, 'flat', 'asc');
      expect(values).not.toBeNull();
      expect(values[3]).toBe(1000); // anchor
      expect(values[10]).toBe(100); // floor (rank 10 is lowest in asc)
      // Rank 1: fraction = (10-1)/9 = 1, value = 100 + range*1
      // fractionAtAnchor = (10-3)/9 = 7/9, multiplier = 7/9
      // range = (1000-100)/(7/9) = 900*9/7 ≈ 1157.14
      // rank 1: 100 + 1157.14*1 = 1257.14 → 1257
      expect(values[1]).toBe(1257);
    });

    it('curved desc: anchor at rank 10', () => {
      const values = engine.calculateInterpolatedValues(10000, 1000, 10, 'curved', 'desc');
      expect(values).not.toBeNull();
      expect(values[10]).toBe(10000);
      expect(values[1]).toBe(1000);
      // Curved: fraction = (r-1)/9, multiplier = fraction^2
      // Rank 5: fraction = 4/9, multiplier = 16/81 ≈ 0.1975
      // range = (10000-1000)/1 = 9000 (fractionAtAnchor=1, multiplier=1)
      // value = 1000 + 9000 * 16/81 ≈ 1000 + 1777.78 = 2778
      expect(values[5]).toBe(2778);
    });

    it('curved asc: anchor at rank 3', () => {
      const values = engine.calculateInterpolatedValues(1000, 100, 3, 'curved', 'asc');
      expect(values).not.toBeNull();
      expect(values[3]).toBe(1000);
      expect(values[10]).toBe(100);
      // Curved asc: fraction = (10-r)/9, multiplier = fraction^2
      // fractionAtAnchor = (10-3)/9 = 7/9, multiplierAtAnchor = 49/81
      // range = (1000-100)/(49/81) = 900*81/49 ≈ 1487.76
      // rank 1: fraction = 9/9 = 1, multiplier = 1, value = 100 + 1487.76 = 1588
      expect(values[1]).toBe(1588);
    });

    it('should return null when topScore <= 0', () => {
      expect(engine.calculateInterpolatedValues(0, 100, 10, 'flat', 'desc')).toBeNull();
      expect(engine.calculateInterpolatedValues(-1, 100, 10, 'flat', 'desc')).toBeNull();
    });

    it('should return null when bottomScore < 0', () => {
      expect(engine.calculateInterpolatedValues(10000, -1, 10, 'flat', 'desc')).toBeNull();
    });

    it('should return null when position <= 0', () => {
      expect(engine.calculateInterpolatedValues(10000, 1000, 0, 'flat', 'desc')).toBeNull();
      expect(engine.calculateInterpolatedValues(10000, 1000, -1, 'flat', 'desc')).toBeNull();
    });

    it('should allow bottomScore = 0 (valid floor)', () => {
      const values = engine.calculateInterpolatedValues(10000, 0, 10, 'flat', 'desc');
      expect(values).not.toBeNull();
      expect(values[10]).toBe(10000);
      expect(values[1]).toBe(0);
    });

    it('should produce all 10 ranks', () => {
      const values = engine.calculateInterpolatedValues(10000, 1000, 10, 'flat', 'desc');
      for (let r = 1; r <= 10; r++) {
        expect(values[r]).toBeDefined();
        expect(typeof values[r]).toBe('number');
      }
    });

    it('desc: values should decrease from rank 10 to rank 1', () => {
      const values = engine.calculateInterpolatedValues(10000, 1000, 10, 'flat', 'desc');
      for (let r = 2; r <= 10; r++) {
        expect(values[r]).toBeGreaterThan(values[r - 1]);
      }
    });

    it('asc: values should decrease from rank 1 to rank 10', () => {
      const values = engine.calculateInterpolatedValues(1000, 100, 3, 'flat', 'asc');
      for (let r = 2; r <= 10; r++) {
        expect(values[r]).toBeLessThan(values[r - 1]);
      }
    });

    it('anchor position should match topScore exactly', () => {
      const pos = 7;
      const values = engine.calculateInterpolatedValues(5000, 500, pos, 'flat', 'desc');
      expect(values[pos]).toBe(5000);
    });
  });

  // ── buildRoundValues ─────────────────────────────────────────────────
  describe('buildRoundValues', () => {
    it('should delegate to calculateInterpolatedValues with position=10, order=desc', () => {
      const values = engine.buildRoundValues(10000, 1000, 'flat');
      const direct = engine.calculateInterpolatedValues(10000, 1000, 10, 'flat', 'desc');
      expect(values).toEqual(direct);
    });

    it('should return null for invalid inputs', () => {
      expect(engine.buildRoundValues(0, 1000, 'flat')).toBeNull();
    });
  });

  // ── compareScores ────────────────────────────────────────────────────
  describe('compareScores', () => {
    it('should sort descending (high score wins) by default', () => {
      expect(engine.compareScores(100, 200)).toBeGreaterThan(0); // b-a = 200-100 = 100 > 0
      expect(engine.compareScores(200, 100)).toBeLessThan(0);   // b-a = 100-200 = -100 < 0
      expect(engine.compareScores(100, 100)).toBe(0);
    });
  });

  // ── formatTotalScore ─────────────────────────────────────────────────
  describe('formatTotalScore', () => {
    it('should return String(total) by default', () => {
      expect(engine.formatTotalScore(42)).toBe('42');
      expect(engine.formatTotalScore(0)).toBe('0');
      expect(engine.formatTotalScore(-5)).toBe('-5');
    });
  });

  // ── getRoundCountOptions ─────────────────────────────────────────────
  describe('getRoundCountOptions', () => {
    it('should return [10] by default', () => {
      expect(engine.getRoundCountOptions()).toEqual([10]);
    });
  });

  // ── getThresholdRange ────────────────────────────────────────────────
  describe('getThresholdRange', () => {
    it('should return descending range when start > end (bowling default)', () => {
      const e = new ScoringEngine({ thresholdStart: 10, thresholdEnd: 1 });
      expect(e.getThresholdRange()).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    });

    it('should return ascending range when start <= end (golf)', () => {
      const e = new ScoringEngine({ thresholdStart: 1, thresholdEnd: 10 });
      expect(e.getThresholdRange()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('should return single element when start === end', () => {
      const e = new ScoringEngine({ thresholdStart: 5, thresholdEnd: 5 });
      expect(e.getThresholdRange()).toEqual([5]);
    });
  });

  // ── filterThresholds ─────────────────────────────────────────────────
  describe('filterThresholds', () => {
    it('should pass through values unchanged', () => {
      const vals = { 1: 100, 2: 200 };
      expect(engine.filterThresholds(vals)).toBe(vals);
    });
  });

  // ── getInitialValues ─────────────────────────────────────────────────
  describe('getInitialValues', () => {
    it('should return defaults with suggestedTarget', () => {
      expect(engine.getInitialValues(5000)).toEqual({ value1: 5000, value2: 0 });
    });

    it('should return defaults without suggestedTarget', () => {
      expect(engine.getInitialValues()).toEqual({ value1: 0, value2: 0 });
    });
  });

  // ── getMarkFormatting ────────────────────────────────────────────────
  describe('getMarkFormatting', () => {
    it('should return empty string by default', () => {
      expect(engine.getMarkFormatting(5, 3)).toBe('');
      expect(engine.getMarkFormatting(0, 0)).toBe('');
    });
  });

  // ── Config-based getters with defaults ───────────────────────────────
  describe('config-based getters', () => {
    it('should provide default implementations for optional utility methods', () => {
      expect(engine.getBonusTargets()).toEqual({ t1: 0, t2: 0 });
      expect(engine.getBonusTargetHtml()).toBe('');
    });

    it('should provide standard default terminology', () => {
      expect(engine.getRoundLabel()).toBe('Round');
      expect(engine.getTurnHeaderPrefix()).toBe('Round');
      expect(engine.getPrimaryTargetLabel()).toBe('Target');
    });

    it('should use config values when provided', () => {
      const e = new ScoringEngine({
        roundLabel: 'Frame',
        turnHeaderPrefix: 'Frame',
        primaryTargetLabel: 'Strike',
        hint: 'Aim for strikes',
        lastFrameHint: 'Bonus balls',
        themeClass: 'bowling-theme',
        logo: 'bowl.png',
        brand: 'PinBowling',
        cta: 'Bowl!',
        logic: 'Standard bowling',
        value1Label: 'Strike Score',
        value2Label: '1-Pin Score',
        thresholdStart: 10,
        thresholdEnd: 1
      });
      expect(e.getRoundLabel()).toBe('Frame');
      expect(e.getTurnHeaderPrefix()).toBe('Frame');
      expect(e.getPrimaryTargetLabel()).toBe('Strike');
      expect(e.getScoringHint()).toBe('Aim for strikes');
      expect(e.getLastFrameHint()).toBe('Bonus balls');
      expect(e.getThemeClass()).toBe('bowling-theme');
      expect(e.getLogoImage()).toBe('bowl.png');
      expect(e.getBrandName()).toBe('PinBowling');
      expect(e.getPlayActionLabel()).toBe('Bowl!');
      expect(e.getScoringDescription()).toBe('Standard bowling');
      expect(e.getValue1Label()).toBe('Strike Score');
      expect(e.getValue2Label()).toBe('1-Pin Score');
      expect(e.getThresholdStart()).toBe(10);
      expect(e.getThresholdEnd()).toBe(1);
    });

    it('should fall back to defaults when config is empty', () => {
      const e = new ScoringEngine();
      expect(e.getScoringHint()).toBe('');
      expect(e.getLastFrameHint()).toBe('');
      expect(e.getThemeClass()).toBe('');
      expect(e.getLogoImage()).toBe('logo.png');
      expect(e.getBrandName()).toBe('PinBowling');
      expect(e.getPlayActionLabel()).toBe('Play');
      expect(e.getScoringDescription()).toBe('');
      expect(e.getValue1Label()).toBe('High Score');
      expect(e.getValue2Label()).toBe('Low Score');
      expect(e.getThresholdPrefix()).toBe('Value');
      expect(e.getThresholdStart()).toBe(10);
      expect(e.getThresholdEnd()).toBe(1);
    });
  });

  // ── getThresholdSort ─────────────────────────────────────────────────
  describe('getThresholdSort', () => {
    it('should sort by rank descending by default', () => {
      const sort = engine.getThresholdSort();
      expect(sort(['10', 10000], ['1', 1000])).toBeLessThan(0);
      expect(sort(['1', 1000], ['10', 10000])).toBeGreaterThan(0);
      expect(sort(['5', 5000], ['5', 5000])).toBe(0);
    });
  });

  // ── getThresholdLabel ────────────────────────────────────────────────
  describe('getThresholdLabel', () => {
    it('should return the rank as-is by default', () => {
      expect(engine.getThresholdLabel(5, 1000, 3)).toBe(5);
      expect(engine.getThresholdLabel('10', 10000, 1)).toBe('10');
    });
  });

  // ── getThresholdRowStyle ─────────────────────────────────────────────
  describe('getThresholdRowStyle', () => {
    it('should highlight start and end ranks', () => {
      const e = new ScoringEngine({ thresholdStart: 10, thresholdEnd: 1 });
      const style = e.getThresholdRowStyle(10, 10000, 1000);
      expect(style).toContain('font-weight: bold');
      expect(style).toContain('color: var(--pb-primary)');
    });

    it('should dim non-major ranks', () => {
      const e = new ScoringEngine({ thresholdStart: 10, thresholdEnd: 1 });
      const style = e.getThresholdRowStyle(5, 5000, 1000);
      expect(style).toContain('opacity: 0.8');
      expect(style).not.toContain('font-weight: bold');
    });
  });

  // ── getRowSummaryHtml ────────────────────────────────────────────────
  describe('getRowSummaryHtml', () => {
    it('should render primary target label with formatted value', () => {
      const e = new ScoringEngine({ primaryTargetLabel: 'Strike' });
      const html = e.getRowSummaryHtml({ value1: 10000 }, (v) => v.toLocaleString());
      expect(html).toContain('<b>Strike:</b>');
      expect(html).toContain('10,000');
    });

    it('should use default "Target" label when not configured', () => {
      const html = engine.getRowSummaryHtml({ value1: 5000 }, (v) => String(v));
      expect(html).toContain('<b>Target:</b>');
      expect(html).toContain('5000');
    });
  });
});