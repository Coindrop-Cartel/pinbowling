import { describe, test, expect, beforeEach } from 'vitest';
import { BaseballEngine } from '@core/engines/BaseballEngine.js';

describe('BaseballEngine', () => {
  beforeEach(() => {
    window.PB_ENGINE_META = {
      baseball: {
        brand: 'PinBaseball',
        cta: 'Play Ball!',
        logo: 'pinbaseball.png'
      }
    };
  });

  const engine = new BaseballEngine({
    brand: 'PinBaseball',
    cta: 'Play Ball!',
    logo: 'pinbaseball.png',
    roundLabel: 'Inning',
    turnHeaderPrefix: 'Inning',
    primaryTargetLabel: 'Run Baseline'
  });

  const mockInning = (order, target = 5000000, multiplier = 1.5) => ({
    orderNumber: order,
    machineName: `Inning Machine ${order}`,
    value1: target,
    value2: multiplier,
    values: engine.buildRoundValues(target, multiplier, 'curved')
  });

  // ── buildRoundValues ─────────────────────────────────────────────────
  test('buildRoundValues - Exponential scaling', () => {
    const values = engine.buildRoundValues(5000000, 1.5);
    expect(values[1]).toBe(5000000);
    expect(values[2]).toBe(7500000);
    expect(values[3]).toBe(11250000);
    expect(values[4]).toBe(16875000);
  });

  // ── getRunCount ──────────────────────────────────────────────────────
  test('getRunCount - correct calculation based on thresholds', () => {
    const machine = mockInning(1, 5000000, 1.5);
    // Thresholds: 1R=5M, 2R=7.5M, 3R=11.25M
    expect(engine.getRunCount(machine, 4000000)).toBe(0);
    expect(engine.getRunCount(machine, 5000000)).toBe(1);
    expect(engine.getRunCount(machine, 6000000)).toBe(1);
    expect(engine.getRunCount(machine, 7500000)).toBe(2);
    expect(engine.getRunCount(machine, 10000000)).toBe(2);
    expect(engine.getRunCount(machine, 11250000)).toBe(3);
  });

  // ── calculateTurnResults ─────────────────────────────────────────────
  test('calculateTurnResults - Home team (Player 1) scoring', () => {
    const innings = [mockInning(1), mockInning(2)];
    // Inning 1 (Odd): Player 1 (isPlayer1=true) is Pitcher (scores 0)
    // Inning 2 (Even): Player 1 is Batter (scores runs based on batter - pitcher difference)
    const scoreMap = {
      isPlayer1: true,
      opponent: {
        '1': { ball1: 7000000, ball2: 14000000, ball3: 18000000 }, // Opponent batter (Top of 1st)
        '2': { ball1: 1000000, ball2: 6000000, ball3: 8000000 }    // Opponent pitcher (Bottom of 2nd)
      },
      '1': { ball1: 3000000, ball2: 6000000, ball3: 8000000 },    // Player 1 pitcher
      '2': { ball1: 6000000, ball2: 14000000, ball3: 20000000 }   // Player 1 batter (Bottom of 2nd)
    };

    const { turnResults, total } = engine.calculateTurnResults(innings, scoreMap);
    
    // Inning 1 (Pitcher role): Player 1 scores 0 runs
    expect(turnResults[0].isBatter).toBe(false);
    expect(turnResults[0].score).toBe(0);
    expect(turnResults[0].displayMark).toBe('P');

    // Inning 2 (Batter role): Player 1 scores runs
    // Ball 1 diff: 6M - 1M = 5M (>= 5M) -> 1 Run
    // Ball 2 diff: 14M - 6M = 8M (>= 7.5M) -> 2 Runs total, marginal 1 Run
    // Ball 3 diff: 20M - 8M = 12M (>= 11.25M) -> 3 Runs total, marginal 1 Run
    // Cumulative runs: 1 + 1 + 1 = 3 Runs
    expect(turnResults[1].isBatter).toBe(true);
    expect(turnResults[1].score).toBe(3);
    expect(turnResults[1].displayMark).toBe('3R');

    expect(total).toBe(3);
  });

  test('calculateTurnResults - Away team (Player 2) scoring', () => {
    const innings = [mockInning(1), mockInning(2)];
    // Inning 1 (Odd): Player 2 (isPlayer1=false) is Batter (scores runs)
    // Inning 2 (Even): Player 2 is Pitcher (scores 0)
    const scoreMap = {
      isPlayer1: false,
      opponent: {
        '1': { ball1: 3000000, ball2: 6000000, ball3: 8000000 },    // Opponent pitcher (Kyle)
        '2': { ball1: 6000000, ball2: 14000000, ball3: 20000000 }   // Opponent batter
      },
      '1': { ball1: 7000000, ball2: 14000000, ball3: 18000000 },   // Player 2 batter (Brian)
      '2': { ball1: 1000000, ball2: 6000000, ball3: 8000000 }     // Player 2 pitcher
    };

    const { turnResults, total } = engine.calculateTurnResults(innings, scoreMap);

    // Inning 1 (Batter role): Player 2 scores runs
    // Ball 1 diff: 7M - 3M = 4M (< 5M) -> 0 Runs
    // Ball 2 diff: 14M - 6M = 8M (>= 7.5M) -> 2 Runs total, marginal 2 Runs
    // Ball 3 diff: 18M - 8M = 10M (< 11.25M) -> 2 Runs total, marginal 0 Runs
    // Cumulative runs: 0 + 2 + 0 = 2 Runs
    expect(turnResults[0].isBatter).toBe(true);
    expect(turnResults[0].score).toBe(2);
    expect(turnResults[0].displayMark).toBe('2R');

    // Inning 2 (Pitcher role): Player 2 scores 0 runs
    expect(turnResults[1].isBatter).toBe(false);
    expect(turnResults[1].score).toBe(0);
    expect(turnResults[1].displayMark).toBe('P');

    expect(total).toBe(2);
  });

  test('getInningData - cumulative pinball scoring with marginal run gains', () => {
    // User's example: Machine thresholds 10=1R, 20=2R, 30=3R, etc.
    const machine = {
      orderNumber: 1,
      machineName: 'Godzilla',
      values: { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80, 9: 90, 10: 100 }
    };

    // Pitcher: Ball 1: 5, Ball 2: 10, Ball 3: 15
    // Batter:  Ball 1: 15, Ball 2: 25, Ball 3: 35
    const pitcherEntry = { ball1: 5, ball2: 10, ball3: 15 };
    const batterEntry = { ball1: 15, ball2: 25, ball3: 35 };

    // Ball 1: batter-pitcher = 15-5 = 10 → 1R, accumulated=1R
    // Ball 2: batter-pitcher = 25-10 = 15 → 1R, marginal=0R, accumulated=1R
    // Ball 3: batter-pitcher = 35-15 = 20 → 2R, marginal=1R, accumulated=2R
    const result = engine.getInningData(machine, batterEntry, pitcherEntry, true);
    expect(result.score).toBe(2);
    expect(result.played).toBe(true);
    expect(result.mark).toBe('2R');
  });

  test('getInningData - no runs when batter never exceeds pitcher', () => {
    const machine = {
      orderNumber: 1,
      machineName: 'Test',
      values: { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80, 9: 90, 10: 100 }
    };

    const pitcherEntry = { ball1: 20, ball2: 40, ball3: 60 };
    const batterEntry = { ball1: 10, ball2: 20, ball3: 30 };

    const result = engine.getInningData(machine, batterEntry, pitcherEntry, true);
    expect(result.score).toBe(0);
  });

  test('getInningData - pitcher always scores 0', () => {
    const machine = mockInning(1);
    const playerEntry = { ball1: 5000000, ball2: 10000000, ball3: 15000000 };
    const opponentEntry = { ball1: 1000000, ball2: 2000000, ball3: 3000000 };

    const result = engine.getInningData(machine, playerEntry, opponentEntry, false);
    expect(result.score).toBe(0);
    expect(result.isBatter).toBe(false);
  });

  // ── compareScores ────────────────────────────────────────────────────
  test('compareScores - high score wins', () => {
    expect(engine.compareScores(10, 20)).toBeGreaterThan(0);
    expect(engine.compareScores(20, 10)).toBeLessThan(0);
    expect(engine.compareScores(10, 10)).toBe(0);
  });

  // ── Metadata Getters ─────────────────────────────────────────────────
  test('Metadata Getters', () => {
    expect(engine.getRoundLabel()).toBe('Inning');
    expect(engine.getTurnHeaderPrefix()).toBe('Inning');
    expect(engine.getPrimaryTargetLabel()).toBe('Run Baseline');
    expect(engine.getPlayActionLabel()).toBe('Play Ball!');
    expect(engine.getBrandName()).toBe('PinBaseball');
    expect(engine.getValue1Label()).toBe('Baseline Score');
    expect(engine.getValue2Label()).toBe('Multiplier');
    expect(engine.getRoundCountOptions()).toEqual([2, 4, 6, 9]);
    expect(engine.formatTotalScore(3)).toBe('3 R');
  });
});
