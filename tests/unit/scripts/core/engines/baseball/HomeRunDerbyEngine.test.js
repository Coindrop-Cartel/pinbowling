import { describe, test, expect } from 'vitest';
import { HomeRunDerbyEngine } from '@core/engines/baseball/index.js';
import { getScoringEngine } from '@core/engine.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';

describe('HomeRunDerbyEngine', () => {
  const engine = new HomeRunDerbyEngine({
    brand: 'Home Run Derby',
    cta: "Play Derby!",
    logo: 'pinderby.png',
    roundLabel: 'Inning',
    turnHeaderPrefix: 'Inning',
    primaryTargetLabel: 'Run Baseline'
  });

  const mockInning = (order, baseline = 1000, multiplier = 1.5) => ({
    orderNumber: order,
    machineName: `Inning ${order}`,
    value1: baseline,
    value2: multiplier,
    values: engine.buildRoundValues(baseline, multiplier, 'curved')
  });

  test('factory returns HomeRunDerbyEngine instance for homerunderby and derby', () => {
    const e1 = getScoringEngine('homerunderby');
    const e2 = getScoringEngine('derby');
    expect(e1).toBeInstanceOf(HomeRunDerbyEngine);
    expect(e2).toBeInstanceOf(HomeRunDerbyEngine);
  });

  test('requiresHeadToHead returns false for Home Run Derby', () => {
    expect(engine.requiresHeadToHead()).toBe(false);
    expect(engine.getMatchupDescription()).toBeNull();
  });

  test('getMachinesPerRound returns 1, getMaxBallsPerRound returns 1, getRoundCountOptions returns [3, 6, 9], and getRoundDisplayLabel formats turn header', () => {
    expect(engine.getMachinesPerRound()).toBe(1);
    expect(engine.getMaxBallsPerRound()).toBe(1);
    expect(engine.getRoundCountOptions()).toEqual([3, 6, 9]);
    expect(engine.getRoundDisplayLabel(0)).toBe('Inning 1');
  });

  test('getQuickFillScale returns 5 for 1/5th low score floor baseline', () => {
    expect(engine.getQuickFillScale()).toBe(5);
  });

  test('calculateTurnResults sums runs across innings', () => {
    const innings = [mockInning(1, 1000), mockInning(2, 1000)];
    // Rank 1 = 1000, Rank 2 = 1500, Rank 3 = 2250
    const scoreMap = {
      '1': { ball1: 1500 }, // 2 runs
      '2': { ball1: 2250 }  // 3 runs
    };
    const { turnResults, total } = engine.calculateTurnResults(innings, scoreMap);
    expect(turnResults[0].score).toBe(2);
    expect(turnResults[0].displayMark).toBe('2');
    expect(turnResults[0].displayRunningTotal).toBe('2');
    expect(turnResults[1].score).toBe(3);
    expect(turnResults[1].displayMark).toBe('3');
    expect(turnResults[1].displayRunningTotal).toBe('5');
    expect(total).toBe(5);
  });

  test('compareScores sorts higher total runs first', () => {
    expect(engine.compareScores(8, 5)).toBeLessThan(0); // 8 beats 5 (b - a = -3)
    expect(engine.compareScores(3, 7)).toBeGreaterThan(0);
  });

  test('FormatBranding returns derby terminology and individual description', () => {
    const branding = FormatBranding.get('homerunderby');
    expect(branding.brandName).toBe('Home Run Derby');
    expect(branding.playActionLabel).toBe('Play Ball!');
    expect(branding.themeClass).toBe('theme-baseball');
    expect(branding.roundLabel).toBe('At Bat');
    expect(branding.scoreColumnLabel).toBe('HRs');
    expect(engine.getScoreColumnLabel()).toBe('HRs');
    expect(branding.scoringDescription).toContain('Players compete individually across At Bats');
  });
});
