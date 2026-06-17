import { describe, test, expect, beforeEach } from 'vitest';
import { GolfEngine } from '@core/engines/GolfEngine.js';

describe('GolfEngine', () => {
  beforeEach(() => {
    window.PB_ENGINE_META = {
      golf: {
        brand: 'PinGolf',
        cta: "Let's Golf!",
        logo: 'pingolf.png'
      }
    };
  });

  const engine = new GolfEngine({
    brand: 'PinGolf',
    cta: "Let's Golf!",
    logo: 'pingolf.png',
    roundLabel: 'Hole',
    turnHeaderPrefix: 'Hole',
    primaryTargetLabel: 'Par'
  });

  const mockHole = (order, target = 10000, par = 3) => ({
    orderNumber: order,
    machineName: `Hole ${order}`,
    value1: target,
    value2: par,
    values: engine.buildRoundValues(target, par, 'flat')
  });

  // ── calculateTurnResults ─────────────────────────────────────────────
  test('calculateTurnResults - Ball Sequence Timing', () => {
    const holes = [mockHole(1), mockHole(2), mockHole(3)];
    const scoreMap = {
      '1': { ball1: 13000 },
      '2': { ball1: 5000, ball2: 12000 },
      '3': { ball1: 2000, ball2: 5000, ball3: 10000 }
    };
    const { turnResults, total } = engine.calculateTurnResults(holes, scoreMap);
    expect(turnResults[0].score).toBe(1);
    expect(turnResults[1].score).toBe(2);
    expect(turnResults[2].score).toBe(3);
    expect(total).toBe(6);
  });

  test('calculateTurnResults - Fallback to 4-10 thresholds', () => {
    const hole = mockHole(1);
    const scoreMap = { '1': { ball1: 2000, ball2: 5000, ball3: 8714 } };
    const { turnResults } = engine.calculateTurnResults([hole], scoreMap);
    expect(turnResults[0].score).toBe(4);
  });

  test('calculateTurnResults - Cumulative balls', () => {
    const holes = [mockHole(1)];
    const scoreMap = { '1': { ball1: 2000, ball2: 6000, ball3: 10000 } };
    const { total } = engine.calculateTurnResults(holes, scoreMap);
    expect(total).toBe(3);
  });

  test('calculateTurnResults - Unplayed hole', () => {
    const holes = [mockHole(1)];
    const scoreMap = { '1': { ball1: 0, ball2: 0, ball3: 0 } };
    const { turnResults, total } = engine.calculateTurnResults(holes, scoreMap);
    expect(turnResults[0].played).toBe(false);
    expect(turnResults[0].displayMark).toBe('−');
    expect(turnResults[0].displayRoundTotal).toBe('');
    expect(turnResults[0].displayRunningTotal).toBe('−');
    expect(total).toBe(0);
  });

  test('calculateTurnResults - Missing scoreMap entry', () => {
    const holes = [mockHole(1)];
    const scoreMap = {};
    const { turnResults, total } = engine.calculateTurnResults(holes, scoreMap);
    expect(turnResults[0].played).toBe(false);
    expect(total).toBe(0);
  });

  test('calculateTurnResults - displayRoundTotal relative to par', () => {
    const holes = [mockHole(1, 10000, 3)];
    const scoreMap = { '1': { ball1: 13000 } };
    const { turnResults } = engine.calculateTurnResults(holes, scoreMap);
    expect(turnResults[0].displayRoundTotal).toBe('-2');
  });

  test('calculateTurnResults - even par displayRoundTotal', () => {
    const holes = [mockHole(1, 10000, 3)];
    const scoreMap = { '1': { ball1: 2000, ball2: 5000, ball3: 10000 } };
    const { turnResults } = engine.calculateTurnResults(holes, scoreMap);
    expect(turnResults[0].displayRoundTotal).toBe('E');
  });

  test('calculateTurnResults - over par displayRoundTotal', () => {
    const holes = [mockHole(1, 10000, 3)];
    const scoreMap = { '1': { ball1: 2000, ball2: 5000, ball3: 8714 } };
    const { turnResults } = engine.calculateTurnResults(holes, scoreMap);
    expect(turnResults[0].displayRoundTotal).toBe('+1');
  });

  test('calculateTurnResults - max strokes (10) when no threshold met', () => {
    const holes = [mockHole(1, 10000, 3)];
    const scoreMap = { '1': { ball1: 100, ball2: 200, ball3: 300 } };
    const { turnResults } = engine.calculateTurnResults(holes, scoreMap);
    expect(turnResults[0].score).toBe(10);
  });

  // ── buildRoundValues ─────────────────────────────────────────────────
  test('buildRoundValues - Inverse Linear Interpolation', () => {
    const values = engine.buildRoundValues(1000, 3, 'flat');
    expect(values[3]).toBe(1000);
    expect(values[1]).toBe(1257);
    expect(values[10]).toBe(100);
  });

  test('buildRoundValues - Inverse Curved Interpolation', () => {
    const values = engine.buildRoundValues(1000, 3, 'curved');
    expect(values[3]).toBe(1000);
    expect(values[1]).toBe(1588);
    expect(values[10]).toBe(100);
  });

  test('buildRoundValues - defaults par to 3 when not provided', () => {
    const values = engine.buildRoundValues(1000, 0, 'flat');
    expect(values[3]).toBe(1000);
  });

  // ── getTurnDataFromValues ────────────────────────────────────────────
  test('getTurnDataFromValues - stroke 1 on ball1', () => {
    const hole = mockHole(1);
    const result = engine.getTurnDataFromValues(hole, 13000, 0, 0);
    expect(result.score).toBe(1);
    expect(result.mark).toBe('1');
  });

  test('getTurnDataFromValues - stroke 2 on ball2', () => {
    const hole = mockHole(1);
    const result = engine.getTurnDataFromValues(hole, 5000, 12000, 0);
    expect(result.score).toBe(2);
    expect(result.mark).toBe('2');
  });

  test('getTurnDataFromValues - stroke 3 on ball3', () => {
    const hole = mockHole(1);
    const result = engine.getTurnDataFromValues(hole, 2000, 5000, 10000);
    expect(result.score).toBe(3);
    expect(result.mark).toBe('3');
  });

  test('getTurnDataFromValues - fallback to rank 4-10 thresholds', () => {
    const hole = mockHole(1);
    const result = engine.getTurnDataFromValues(hole, 2000, 5000, 8714);
    expect(result.score).toBe(4);
  });

  test('getTurnDataFromValues - default 10 strokes when no threshold met', () => {
    const hole = mockHole(1);
    const result = engine.getTurnDataFromValues(hole, 0, 0, 0);
    expect(result.score).toBe(10);
  });

  test('getTurnDataFromValues - includes orderNumber and machineName', () => {
    const hole = mockHole(5);
    const result = engine.getTurnDataFromValues(hole, 0, 0, 0);
    expect(result.orderNumber).toBe(5);
    expect(result.machineName).toBe('Hole 5');
  });

  // ── compareScores ────────────────────────────────────────────────────
  test('compareScores - low score wins', () => {
    expect(engine.compareScores(10, 20)).toBeLessThan(0);
    expect(engine.compareScores(20, 10)).toBeGreaterThan(0);
    expect(engine.compareScores(10, 10)).toBe(0);
  });

  // ── getRoundCountOptions ─────────────────────────────────────────────
  test('getRoundCountOptions - returns golf options', () => {
    expect(engine.getRoundCountOptions()).toEqual([3, 6, 9, 18]);
  });

  // ── formatTotalScore ─────────────────────────────────────────────────
  test('formatTotalScore - with machines shows relative to par', () => {
    const machines = [{ value2: 3 }, { value2: 3 }, { value2: 3 }];
    expect(engine.formatTotalScore(9, machines)).toContain('(E)');
  });

  test('formatTotalScore - over par', () => {
    const machines = [{ value2: 3 }];
    expect(engine.formatTotalScore(5, machines)).toContain('(+2)');
  });

  test('formatTotalScore - under par', () => {
    const machines = [{ value2: 3 }];
    expect(engine.formatTotalScore(2, machines)).toContain('(-1)');
  });

  test('formatTotalScore - zero value2 falls back to default par 3', () => {
    // Number(m.value2) || 3 → 0 || 3 = 3, so cumulativePar = 3
    const machines = [{ value2: 0 }];
    expect(engine.formatTotalScore(5, machines)).toContain('(+2)');
  });

  test('formatTotalScore - no machines', () => {
    expect(engine.formatTotalScore(5, [])).toBe('5');
  });

  test('formatTotalScore - single machine (non-array)', () => {
    const result = engine.formatTotalScore(5, { value2: 3 });
    expect(result).toContain('(+2)');
  });

  // ── getMarkFormatting ────────────────────────────────────────────────
  test('getMarkFormatting - par', () => {
    expect(engine.getMarkFormatting(3, 3)).toBe('');
  });

  test('getMarkFormatting - birdie', () => {
    expect(engine.getMarkFormatting(2, 3)).toBe('golf-birdie');
  });

  test('getMarkFormatting - eagle', () => {
    expect(engine.getMarkFormatting(1, 3)).toBe('golf-eagle');
  });

  test('getMarkFormatting - albatross', () => {
    expect(engine.getMarkFormatting(0, 3)).toBe('golf-albatross');
    expect(engine.getMarkFormatting(-1, 3)).toBe('golf-albatross');
  });

  test('getMarkFormatting - bogey', () => {
    expect(engine.getMarkFormatting(4, 3)).toBe('golf-bogey');
  });

  test('getMarkFormatting - double bogey', () => {
    expect(engine.getMarkFormatting(5, 3)).toBe('golf-double-bogey');
  });

  test('getMarkFormatting - triple bogey', () => {
    expect(engine.getMarkFormatting(6, 3)).toBe('golf-triple-bogey');
    expect(engine.getMarkFormatting(10, 3)).toBe('golf-triple-bogey');
  });

  // ── formatMark ───────────────────────────────────────────────────────
  test('formatMark - wraps mark in span with formatting class', () => {
    const turn = { score: 2, mark: '2' };
    const result = engine.formatMark(turn, 3);
    expect(result).toContain('golf-birdie');
    expect(result).toContain('>2<');
  });

  test('formatMark - par has no special class', () => {
    const turn = { score: 3, mark: '3' };
    const result = engine.formatMark(turn, 3);
    expect(result).toContain('class=""');
  });

  // ── getThresholdSort ─────────────────────────────────────────────────
  test('getThresholdSort - ascending (1 to 10)', () => {
    const sort = engine.getThresholdSort();
    expect(sort(['1', 100], ['10', 10])).toBeLessThan(0);
    expect(sort(['10', 10], ['1', 100])).toBeGreaterThan(0);
  });

  // ── getThresholdPrefix ───────────────────────────────────────────────
  test('getThresholdPrefix - returns Strokes', () => {
    expect(engine.getThresholdPrefix()).toBe('Strokes');
  });

  // ── getRowSummaryHtml ────────────────────────────────────────────────
  test('getRowSummaryHtml - shows target score and par', () => {
    const round = { values: { 3: 10000 }, value1: 10000, value2: 3 };
    const html = engine.getRowSummaryHtml(round, (v) => String(v));
    expect(html).toContain('<b>Target Score:</b> 10000');
    expect(html).toContain('<b>Par:</b> 3');
  });

  // ── getThresholdRowStyle ─────────────────────────────────────────────
  test('getThresholdRowStyle - highlights start, end, and par ranks', () => {
    const e = new GolfEngine({ thresholdStart: 1, thresholdEnd: 10 });
    const styleStart = e.getThresholdRowStyle(1, 10000, 3);
    expect(styleStart).toContain('font-weight: bold');
    const styleEnd = e.getThresholdRowStyle(10, 100, 3);
    expect(styleEnd).toContain('font-weight: bold');
    const stylePar = e.getThresholdRowStyle(3, 10000, 3);
    expect(stylePar).toContain('font-weight: bold');
    const styleMid = e.getThresholdRowStyle(5, 5000, 3);
    expect(styleMid).toContain('opacity: 0.8');
  });

  // ── getInitialValues ─────────────────────────────────────────────────
  test('getInitialValues - default suggestedTarget', () => {
    const vals = engine.getInitialValues();
    expect(vals.value1).toBe(5000000);
    expect(vals.value2).toBe(3);
  });

  test('getInitialValues - custom suggestedTarget', () => {
    const vals = engine.getInitialValues(2000000);
    expect(vals.value1).toBe(2000000);
    expect(vals.value2).toBe(3);
  });

  // ── Metadata Getters ─────────────────────────────────────────────────
  test('Metadata Getters', () => {
    expect(engine.getRoundLabel()).toBe('Hole');
    expect(engine.getTurnHeaderPrefix()).toBe('Hole');
    expect(engine.getPrimaryTargetLabel()).toBe('Par');
    expect(engine.getPlayActionLabel()).toBe("Let's Golf!");
    expect(engine.getBrandName()).toBe('PinGolf');
    expect(engine.getValue1Label()).toBe('Target Score');
    expect(engine.getValue2Label()).toBe('Par');
  });

  test('Default GolfEngine getters (no config)', () => {
    const e = new GolfEngine();
    expect(e.getRoundLabel()).toBe('Hole');
    expect(e.getTurnHeaderPrefix()).toBe('Hole');
    expect(e.getPrimaryTargetLabel()).toBe('Par');
    expect(e.getValue1Label()).toBe('Target Score');
    expect(e.getValue2Label()).toBe('Par');
  });
});