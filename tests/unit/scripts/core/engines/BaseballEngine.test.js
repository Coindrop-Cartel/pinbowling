import { describe, test, expect, beforeEach } from 'vitest';
import { BaseballEngine } from '@core/engines/BaseballEngine.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';
import { renderHead2HeadScoreboard } from '@scripts/renderers/scoreboardRenderer.js';

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
        '2': { ball1: 1000000, ball2: 6000000, ball3: 8000000 }    // Opponent pitcher (Bottom of 1st)
      },
      '1': { ball1: 3000000, ball2: 6000000, ball3: 8000000 },    // Player 1 pitcher (Top of 1st)
      '2': { ball1: 6000000, ball2: 14000000, ball3: 20000000 }   // Player 1 batter (Bottom of 1st)
    };

    const { turnResults, total } = engine.calculateTurnResults(innings, scoreMap);
    
    // Inning 1 (Pitcher role): Player 1 scores 0 runs
    expect(turnResults[0].isBatter).toBe(false);
    expect(turnResults[0].score).toBe(0);
    expect(turnResults[0].displayMark).toBe('0R');

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
    expect(turnResults[1].displayMark).toBe('0R');

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
    const branding = FormatBranding.get('baseball');
    expect(branding.roundLabel).toBe('Inning');
    expect(branding.turnHeaderPrefix).toBe('Inning');
    expect(branding.primaryTargetLabel).toBe('Run Baseline');
    expect(branding.playActionLabel).toBe('Play Ball!');
    expect(branding.brandName).toBe('PinBaseball');
    expect(branding.value1Label).toBe('Baseline Score');
    expect(branding.value2Label).toBe('Multiplier');
    expect(engine.getRoundCountOptions()).toEqual([2, 4, 6, 9]);
    expect(engine.formatTotalScore(3)).toBe('3 R');
  });

  // ── Threshold Getters ───────────────────────────────────────────────
  test('Threshold metadata getters', () => {
    expect(engine.getThresholdStart()).toBe(1);
    expect(engine.getThresholdEnd()).toBe(10);
    expect(engine.getThresholdPrefix()).toBe('Runs');
    expect(engine.getThresholdLabel(1)).toBe('1 R');
    expect(engine.getThresholdLabel(5)).toBe('5 R');
    expect(engine.getThresholdLabel(10)).toBe('10 R');
  });

  test('getThresholdSort - ascending by rank', () => {
    const items = [['1', 10], ['3', 30], ['2', 20]];
    items.sort(engine.getThresholdSort());
    expect(items.map(i => i[0])).toEqual(['1', '2', '3']);
  });

  // ── getRequiredEventData ─────────────────────────────────────────────
  test('getRequiredEventData - returns promises for matchups and scores', async () => {
    const api = {
      matchups: { get: async (id) => [{ orderNumber: id }] },
      scores: { get: async (_player, eventId) => [{ eventId }] }
    };
    const result = engine.getRequiredEventData(42, api);
    expect(result.eventMatchups).toBeInstanceOf(Promise);
    expect(result.allEventScores).toBeInstanceOf(Promise);
    const [matchups, scores] = await Promise.all([result.eventMatchups, result.allEventScores]);
    expect(matchups).toEqual([{ orderNumber: 42 }]);
    expect(scores).toEqual([{ eventId: 42 }]);
  });

  test('getRequiredEventData - falls back to empty arrays on rejection', async () => {
    const api = {
      matchups: { get: async () => { throw new Error('fail'); } },
      scores: { get: async () => { throw new Error('fail'); } }
    };
    const result = engine.getRequiredEventData(1, api);
    expect(await result.eventMatchups).toEqual([]);
    expect(await result.allEventScores).toEqual([]);
  });

  // ── getRunCount edge cases ───────────────────────────────────────────
  test('getRunCount - returns 0 for diff <= 0', () => {
    const machine = mockInning(1);
    expect(engine.getRunCount(machine, 0)).toBe(0);
    expect(engine.getRunCount(machine, -100)).toBe(0);
  });

  test('getRunCount - returns 0 for missing machine or values', () => {
    expect(engine.getRunCount(null, 10000000)).toBe(0);
    expect(engine.getRunCount({}, 10000000)).toBe(0);
    expect(engine.getRunCount({ values: null }, 10000000)).toBe(0);
  });

  test('getRunCount - caps at rank 10', () => {
    const machine = mockInning(1, 5000000, 1.5);
    // Highest threshold (rank 10) is 5M * 1.5^9 ≈ 192M
    expect(engine.getRunCount(machine, 1000000000)).toBe(10);
  });

  // ── calculateBallRuns ────────────────────────────────────────────────
  test('calculateBallRuns - computes runs from batter-pitcher diff', () => {
    const machine = mockInning(1, 5000000, 1.5);
    // diff = 7M - 2M = 5M → 1 run
    expect(engine.calculateBallRuns(machine, 2000000, 7000000)).toBe(1);
    // diff = 0 → 0 runs
    expect(engine.calculateBallRuns(machine, 5000000, 5000000)).toBe(0);
    // negative diff → 0 runs
    expect(engine.calculateBallRuns(machine, 8000000, 2000000)).toBe(0);
  });

  // ── getInningData edge cases ─────────────────────────────────────────
  test('getInningData - missing player entry defaults to 0s', () => {
    const machine = mockInning(1);
    const opponentEntry = { ball1: 1000000, ball2: 2000000, ball3: 3000000 };
    const result = engine.getInningData(machine, null, opponentEntry, true);
    // Batter played flag is true when opponent has scores (p1>0 || o1>0 || ...)
    expect(result.played).toBe(true);
    expect(result.score).toBe(0);
  });

  test('getInningData - missing opponent entry defaults to 0s', () => {
    const machine = mockInning(1);
    const playerEntry = { ball1: 6000000, ball2: 12000000, ball3: 18000000 };
    const result = engine.getInningData(machine, playerEntry, null, true);
    expect(result.played).toBe(true);
    // diff each ball: 6M, 12M, 18M → 1R, 3R, 4R cumulative; marginal gains 1+2+1 = 4
    expect(result.score).toBe(4);
  });

  test('getInningData - silent mode suppresses logging without changing result', () => {
    const machine = mockInning(1);
    const playerEntry = { ball1: 6000000, ball2: 12000000, ball3: 18000000 };
    const opponentEntry = { ball1: 1000000, ball2: 2000000, ball3: 3000000 };
    const loud = engine.getInningData(machine, playerEntry, opponentEntry, true, false);
    const silent = engine.getInningData(machine, playerEntry, opponentEntry, true, true);
    expect(silent.score).toBe(loud.score);
    expect(silent.played).toBe(loud.played);
    expect(silent.mark).toBe(loud.mark);
  });

  test('getInningData - pitcher played flag true when player has scores', () => {
    const machine = mockInning(1);
    const playerEntry = { ball1: 5000000, ball2: 10000000, ball3: 15000000 };
    const opponentEntry = { ball1: 1000000, ball2: 2000000, ball3: 3000000 };
    const result = engine.getInningData(machine, playerEntry, opponentEntry, false);
    expect(result.played).toBe(true);
    expect(result.score).toBe(0);
    expect(result.isBatter).toBe(false);
  });

  test('getInningData - pitcher played false when player has no scores', () => {
    const machine = mockInning(1);
    const playerEntry = { ball1: 0, ball2: 0, ball3: 0 };
    const opponentEntry = { ball1: 1000000, ball2: 2000000, ball3: 3000000 };
    const result = engine.getInningData(machine, playerEntry, opponentEntry, false);
    // Pitcher played flag only checks player's own scores (p1>0 || p2>0 || p3>0)
    expect(result.played).toBe(false);
  });

  test('getInningData - batter played true when opponent has scores but player does not', () => {
    const machine = mockInning(1);
    const playerEntry = { ball1: 0, ball2: 0, ball3: 0 };
    const opponentEntry = { ball1: 5000000, ball2: 10000000, ball3: 15000000 };
    const result = engine.getInningData(machine, playerEntry, opponentEntry, true);
    // played = any of p or o > 0 → true (opponent has scores)
    expect(result.played).toBe(true);
    // batter diff all negative → 0 runs
    expect(result.score).toBe(0);
  });

  // ── calculateTurnResults walk-off ────────────────────────────────────
  test('calculateTurnResults - walk-off when home batter leads after top of last inning', () => {
    // 2 innings = 4 machines (top/bottom of inning 1, top/bottom of inning 2)
    // Home (isPlayer1) pitches on Top (order 1,3), bats on Bottom (order 2,4).
    // Away bats on Top, pitches on Bottom. The opponent map holds the AWAY
    // player's scores on EVERY machine (batting on top, pitching on bottom),
    // keyed by machine orderNumber — matching buildPlayerScoreMap.
    const innings = [mockInning(1), mockInning(2), mockInning(3), mockInning(4)];
    const scoreMap = {
      isPlayer1: true,
      opponent: {
        '1': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // away bats top 1: 0 runs
        '2': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // away pitches bottom 1
        '3': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // away bats top 2: 0 runs
        '4': { ball1: 0, ball2: 0, ball3: 0 }                      // away pitches bottom 2 (not played)
      },
      '1': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // home pitches top 1
      '2': { ball1: 6000000, ball2: 12000000, ball3: 18000000 }, // home bats bottom 1: 3 runs
      '3': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // home pitches top 2
      '4': { ball1: 0, ball2: 0, ball3: 0 }                       // home bats bottom 2: walk-off
    };

    const { turnResults, total } = engine.calculateTurnResults(innings, scoreMap);
    // After bottom of inning 1, home leads 3-0. Top of inning 2 played (0 runs).
    // Bottom of inning 2 → walk-off (home already leads).
    expect(turnResults[3].isWalkOff).toBe(true);
    expect(turnResults[3].played).toBe(false);
    expect(turnResults[3].score).toBe(0);
    expect(turnResults[3].mark).toBe('-');
    expect(total).toBe(3);
  });

  test('calculateTurnResults - no walk-off when home trails going into bottom of last', () => {
    const innings = [mockInning(1), mockInning(2), mockInning(3), mockInning(4)];
    const scoreMap = {
      isPlayer1: true,
      opponent: {
        '1': { ball1: 6000000, ball2: 12000000, ball3: 18000000 }, // away bats top 1: 3 runs
        '2': { ball1: 1000000, ball2: 2000000, ball3: 3000000 },    // away pitches bottom 1
        '3': { ball1: 6000000, ball2: 12000000, ball3: 18000000 }, // away bats top 2: 3 runs
        '4': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }    // away pitches bottom 2
      },
      '1': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // home pitches top 1
      '2': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // home bats bottom 1: 0 runs
      '3': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // home pitches top 2
      '4': { ball1: 20000000, ball2: 40000000, ball3: 60000000 } // home bats bottom 2: 7 runs (must bat)
    };

    const { turnResults, total } = engine.calculateTurnResults(innings, scoreMap);
    // Home trails 0-3 after inning 1, opponent scores 3 more in top of 2 → home down 0-6.
    // Bottom of last: home must bat (no walk-off) and scores 7 to win 7-6.
    expect(turnResults[3].isWalkOff).toBeUndefined();
    expect(turnResults[3].played).toBe(true);
    expect(turnResults[3].score).toBe(7);
    expect(total).toBe(7);
  });

  test('calculateTurnResults - no walk-off when away top of last inning not played', () => {
    const innings = [mockInning(1), mockInning(2), mockInning(3), mockInning(4)];
    const scoreMap = {
      isPlayer1: true,
      opponent: {
        '1': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // away bats top 1: 0 runs
        '2': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // away pitches bottom 1
        // top of inning 2 (order 3) NOT played
        '4': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }  // away pitches bottom 2
      },
      '1': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }, // home pitches top 1
      '2': { ball1: 6000000, ball2: 12000000, ball3: 18000000 }, // home bats bottom 1: 3 runs
      '3': { ball1: 0, ball2: 0, ball3: 0 }, // home pitches top 2 (not played)
      '4': { ball1: 20000000, ball2: 40000000, ball3: 60000000 } // home bats bottom 2: 7 runs
    };

    const { turnResults } = engine.calculateTurnResults(innings, scoreMap);
    // awayTopOfLastInningPlayed is false → no walk-off even though home leads
    expect(turnResults[3].isWalkOff).toBeUndefined();
    expect(turnResults[3].played).toBe(true);
    expect(turnResults[3].score).toBe(7);
  });

  test('calculateTurnResults - unplayed turns show dash display values', () => {
    const innings = [mockInning(1), mockInning(2)];
    const scoreMap = {
      isPlayer1: true,
      opponent: {},
      '1': { ball1: 0, ball2: 0, ball3: 0 },
      '2': { ball1: 0, ball2: 0, ball3: 0 }
    };
    const { turnResults, total, totalDisplay } = engine.calculateTurnResults(innings, scoreMap);
    expect(turnResults[0].played).toBe(false);
    expect(turnResults[0].displayMark).toBe('-');
    expect(turnResults[0].displayRoundTotal).toBe('');
    expect(turnResults[0].displayRunningTotal).toBe('-');
    expect(total).toBe(0);
    expect(totalDisplay).toBe('0 R');
  });

  test('calculateTurnResults - displayRoundTotal shows +N for batter, 0 for pitcher', () => {
    const innings = [mockInning(1), mockInning(2)];
    const scoreMap = {
      isPlayer1: true,
      opponent: {
        '1': { ball1: 1000000, ball2: 2000000, ball3: 3000000 },
        '2': { ball1: 1000000, ball2: 2000000, ball3: 3000000 }
      },
      '1': { ball1: 6000000, ball2: 12000000, ball3: 18000000 },
      '2': { ball1: 6000000, ball2: 12000000, ball3: 18000000 }
    };
    const { turnResults } = engine.calculateTurnResults(innings, scoreMap);
    // idx 0 (top, isPlayer1=true → pitcher): displayRoundTotal '0'
    expect(turnResults[0].displayRoundTotal).toBe('0');
    // idx 1 (bottom, isPlayer1=true → batter): displayRoundTotal '+N'
    expect(turnResults[1].displayRoundTotal.startsWith('+')).toBe(true);
  });

  // ── formatMark ───────────────────────────────────────────────────────
  test('formatMark - unplayed returns mark or dash', () => {
    expect(engine.formatMark({ played: false, mark: 'X' })).toBe('X');
    expect(engine.formatMark({ played: false })).toBe('-');
  });

  test('formatMark - pitcher returns mark or P', () => {
    expect(engine.formatMark({ played: true, isBatter: false, mark: '0R' })).toBe('0R');
    expect(engine.formatMark({ played: true, isBatter: false })).toBe('P');
  });

  test('formatMark - batter uses scoreOverride when provided', () => {
    expect(engine.formatMark({ played: true, isBatter: true, score: 5, mark: '5R' }, 7)).toBe('7R');
    expect(engine.formatMark({ played: true, isBatter: true, score: 5 }, 7)).toBe('7R');
  });

  test('formatMark - batter falls back to mark then score', () => {
    expect(engine.formatMark({ played: true, isBatter: true, mark: '3R' })).toBe('3R');
    expect(engine.formatMark({ played: true, isBatter: true, score: 4 })).toBe('4R');
  });

  // ── getRoundDisplayLabel ─────────────────────────────────────────────
  test('getRoundDisplayLabel - top/bottom parity', () => {
    expect(engine.getRoundDisplayLabel(0)).toBe('Top of Inning 1');
    expect(engine.getRoundDisplayLabel(1)).toBe('Bottom of Inning 1');
    expect(engine.getRoundDisplayLabel(2)).toBe('Top of Inning 2');
    expect(engine.getRoundDisplayLabel(3)).toBe('Bottom of Inning 2');
    expect(engine.getRoundDisplayLabel(5)).toBe('Bottom of Inning 3');
  });

  // ── getMatchupDescription ────────────────────────────────────────────
  test('getMatchupDescription - returns head-to-head description', () => {
    const desc = engine.getMatchupDescription(9);
    expect(desc.description).toContain('2 players');
    expect(desc.description).toContain('9 innings');
    expect(desc.details).toEqual([
      { label: 'Format', value: 'Head-to-Head (2 players per inning)' },
      { label: 'Innings', value: '9' }
    ]);
  });

  // ── getMachinesPerRound / getMaxRosterSize / getValue2AllowsDecimal ──
  test('Baseball format constraints', () => {
    expect(engine.getMachinesPerRound()).toBe(2);
    expect(engine.getMaxRosterSize()).toBe(2);
    expect(engine.getValue2AllowsDecimal()).toBe(true);
  });

  // ── getInitialValues ─────────────────────────────────────────────────
  test('getInitialValues - defaults to 5M target and 1.5 multiplier', () => {
    expect(engine.getInitialValues()).toEqual({ value1: 5000000, value2: 1.5 });
    expect(engine.getInitialValues(8000000)).toEqual({ value1: 8000000, value2: 1.5 });
  });

  // ── formatTotalScore ─────────────────────────────────────────────────
  test('formatTotalScore - formats with locale and R suffix', () => {
    expect(engine.formatTotalScore(0)).toBe('0 R');
    expect(engine.formatTotalScore(1000)).toBe('1,000 R');
    expect(engine.formatTotalScore(1000000)).toBe('1,000,000 R');
  });

  // ── generateMatchupPayload ───────────────────────────────────────────
  test('generateMatchupPayload - empty for fewer than 2 players or 0 innings', () => {
    expect(engine.generateMatchupPayload([], 4, [])).toEqual([]);
    expect(engine.generateMatchupPayload([{ id: 1 }], 4, [])).toEqual([]);
    expect(engine.generateMatchupPayload([{ id: 1 }, { id: 2 }], 0, [])).toEqual([]);
  });

  test('generateMatchupPayload - single pairing for 2 players', () => {
    const players = [{ id: 10 }, { id: 20 }];
    const machines = [{ machineId: 101 }, { machineId: 102 }, { machineId: 103 }, { machineId: 104 }];
    const matchups = engine.generateMatchupPayload(players, 2, machines);
    // 2 innings × 2 players = 4 rows
    expect(matchups).toHaveLength(4);
    expect(matchups[0]).toEqual({ orderNumber: 1, playerId: 10, player1Id: 10, player2Id: 20, playerOrder: 1, machineId: 101 });
    expect(matchups[1]).toEqual({ orderNumber: 2, playerId: 20, player1Id: 20, player2Id: 10, playerOrder: 2, machineId: 102 });
    expect(matchups[2]).toEqual({ orderNumber: 3, playerId: 10, player1Id: 10, player2Id: 20, playerOrder: 1, machineId: 103 });
    expect(matchups[3]).toEqual({ orderNumber: 4, playerId: 20, player1Id: 20, player2Id: 10, playerOrder: 2, machineId: 104 });
  });

  test('generateMatchupPayload - round-robin cycles pairings for 3 players', () => {
    const players = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const machines = Array.from({ length: 6 }, (_, i) => ({ machineId: 100 + i }));
    const matchups = engine.generateMatchupPayload(players, 3, machines);
    // 3 pairings: (1,2), (1,3), (2,3) — one per inning
    expect(matchups).toHaveLength(6);
    // Inning 1: pairing (1,2)
    expect(matchups[0].playerId).toBe(1);
    expect(matchups[1].playerId).toBe(2);
    // Inning 2: pairing (1,3)
    expect(matchups[2].playerId).toBe(1);
    expect(matchups[3].playerId).toBe(3);
    // Inning 3: pairing (2,3)
    expect(matchups[4].playerId).toBe(2);
    expect(matchups[5].playerId).toBe(3);
  });

  test('generateMatchupPayload - cycles pairings when innings exceed unique pairings', () => {
    const players = [{ id: 1 }, { id: 2 }];
    const machines = Array.from({ length: 8 }, (_, i) => ({ machineId: 100 + i }));
    const matchups = engine.generateMatchupPayload(players, 4, machines);
    // Only 1 unique pairing, cycled across 4 innings
    expect(matchups).toHaveLength(8);
    expect(matchups[0].playerId).toBe(1);
    expect(matchups[6].playerId).toBe(1); // inning 4 reuses pairing
  });

  test('generateMatchupPayload - falls back to first machine when not enough machines', () => {
    const players = [{ id: 1 }, { id: 2 }];
    const machines = [{ machineId: 101 }]; // only 1 machine for 2 innings
    const matchups = engine.generateMatchupPayload(players, 2, machines);
    // bottom machine falls back to machines[1] || topMachine
    expect(matchups[1].machineId).toBe(101);
    expect(matchups[3].machineId).toBe(101);
  });

  test('generateMatchupPayload - supports machine.id when machineId absent', () => {
    const players = [{ id: 1 }, { id: 2 }];
    const machines = [{ id: 201 }, { id: 202 }];
    const matchups = engine.generateMatchupPayload(players, 1, machines);
    expect(matchups[0].machineId).toBe(201);
    expect(matchups[1].machineId).toBe(202);
  });

  // ── getPrintTargetSummaryHtml ────────────────────────────────────────
  test('getPrintTargetSummaryHtml - shows baseline and multiplier', () => {
    const machine = { value1: 5000000, value2: 1.5 };
    const html = engine.getPrintTargetSummaryHtml(machine, false, (n) => Number(n).toLocaleString());
    expect(html).toContain('Baseline:');
    expect(html).toContain('5,000,000');
    expect(html).toContain('Multiplier:');
    expect(html).toContain('1.5');
  });

  // ── enrichScoreMap ───────────────────────────────────────────────────
  test('enrichScoreMap - correctly enriches scoreMap with opponent data', () => {
    const context = {
      allEventScores: [
        { playerId: 1, orderNumber: 1, ball1: 100, ball2: 200, ball3: 300 },
        { playerId: 2, orderNumber: 1, ball1: 150, ball2: 250, ball3: 350 },
      ],
      eventMatchups: [
        {
          player1Id: 1,
          player2Id: 2,
          entries: [
            { orderNumber: 1, playerId: 1, playerOrder: 1, machineId: 10 },
            { orderNumber: 1, playerId: 2, playerOrder: 2, machineId: 11 },
          ],
        },
      ],
      getCurrentPlayerId: () => 1,
      normalizeScores: (scores) => scores,
      groupScoresByPlayer: (scores) => {
        const grouped = {};
        scores.forEach(s => {
          if (!grouped[s.playerId]) grouped[s.playerId] = [];
          grouped[s.playerId].push(s);
        });
        return grouped;
      },
    };

    const scoreMap = { '1': { ball1: 100, ball2: 200, ball3: 300 } };
    const enriched = engine.enrichScoreMap(scoreMap, context);

    expect(enriched.isPlayer1).toBe(true);
    expect(enriched.opponent['1']).toEqual({ ball1: 150, ball2: 250, ball3: 350 });
  });

  test('enrichScoreMap - defaults opponent to empty object', () => {
    const scoreMap = {};
    const context = {
      allEventScores: [],
      eventMatchups: [],
      getCurrentPlayerId: () => 1,
      normalizeScores: (s) => s,
      groupScoresByPlayer: (scores) => {
        const grouped = {};
        scores.forEach(s => {
          if (!grouped[s.playerId]) grouped[s.playerId] = [];
          grouped[s.playerId].push(s);
        });
        return grouped;
      },
    };
    const result = engine.enrichScoreMap(scoreMap, context);
    expect(result.opponent).toEqual({});
    expect(result.isPlayer1).toBe(true); // defaults to true when no matchups
  });

  // ── buildPlayerScoreMap ──────────────────────────────────────────────
  test('buildPlayerScoreMap - builds score map with opponent scores', () => {
    const scoresByPlayer = { 1: [] };
    const matchups = [{ orderNumber: 1, playerId: 1, playerOrder: 1, machineId: 10 }];
    const result = engine.buildPlayerScoreMap(1, [], scoresByPlayer, matchups);
    expect(result.isPlayer1).toBe(true);
    expect(result.opponent).toEqual({});
  });

  // ── getRoundRowContext ───────────────────────────────────────────────
  test('getRoundRowContext - away player is batter when viewing home top machine', () => {
    const matchups = [
      {
        player1Id: 1,
        player2Id: 2,
        player1Name: 'Kyle',
        player2Name: 'Brian',
        entries: [
          { orderNumber: 1, playerId: 1, playerOrder: 1, machineId: 10, playerName: 'Kyle' },
          { orderNumber: 1, playerId: 2, playerOrder: 2, machineId: 11, playerName: 'Brian' },
        ],
      },
    ];
    const context = { eventMatchups: matchups, getCurrentPlayerId: () => 2 };
    const round = { machineId: 10, orderNumber: 1 };
    const result = engine.getRoundRowContext(round, context);
    // Current player 2 is away (playerOrder 2). Viewing the Top machine (player 1's).
    // Away bats on Top → current player is the Batter.
    expect(result.isPlayer1).toBe(false);
    expect(result.isPitcher).toBe(false);
    expect(result.opponentName).toBe('Kyle');
    expect(result.displayRoundNumber).toContain('Top of 1');
    expect(result.role).toBe('batter');
  });

  test('getRoundRowContext - away player is pitcher when viewing own bottom machine', () => {
    const matchups = [
      {
        player1Id: 1,
        player2Id: 2,
        player1Name: 'Kyle',
        player2Name: 'Brian',
        entries: [
          { orderNumber: 1, playerId: 1, playerOrder: 1, machineId: 10, playerName: 'Kyle' },
          { orderNumber: 1, playerId: 2, playerOrder: 2, machineId: 11, playerName: 'Brian' },
        ],
      },
    ];
    const context = { eventMatchups: matchups, getCurrentPlayerId: () => 2 };
    const round = { machineId: 11, orderNumber: 1 };
    const result = engine.getRoundRowContext(round, context);
    // Current player 2 is away (playerOrder 2). Viewing the Bottom machine (their own).
    // Away pitches on Bottom → current player is the Pitcher.
    expect(result.isPlayer1).toBe(false);
    expect(result.isPitcher).toBe(true);
    expect(result.role).toBe('pitcher');
  });

  test('getRoundRowContext - home player is pitcher when viewing own top machine', () => {
    const matchups = [
      {
        player1Id: 1,
        player2Id: 2,
        player1Name: 'Kyle',
        player2Name: 'Brian',
        entries: [
          { orderNumber: 1, playerId: 1, playerOrder: 1, machineId: 10, playerName: 'Kyle' },
          { orderNumber: 1, playerId: 2, playerOrder: 2, machineId: 11, playerName: 'Brian' },
        ],
      },
    ];
    const context = { eventMatchups: matchups, getCurrentPlayerId: () => 1 };
    const round = { machineId: 10, orderNumber: 1 };
    const result = engine.getRoundRowContext(round, context);
    // Current player 1 is home (playerOrder 1). Viewing the Top machine (their own).
    // Home pitches on Top → current player is the Pitcher.
    expect(result.isPlayer1).toBe(true);
    expect(result.isPitcher).toBe(true);
    expect(result.opponentName).toBe('Brian');
    expect(result.displayRoundNumber).toContain('Top of 1');
    expect(result.role).toBe('pitcher');
  });

  test('calculateTurnResults - preserves bottom of last inning scores and dynamically includes them if earlier inning edit causes home to trail', () => {
    const machines = [
      { orderNumber: 1, machineName: 'M1', values: { 1: 1000, 2: 2000 } }, // Top 1 (Away)
      { orderNumber: 2, machineName: 'M2', values: { 1: 1000, 2: 2000 } }, // Bot 1 (Home)
      { orderNumber: 3, machineName: 'M3', values: { 1: 1000, 2: 2000 } }, // Top 2 (Away)
      { orderNumber: 4, machineName: 'M4', values: { 1: 1000, 2: 2000 } }, // Bot 2 (Home)
    ];

    // Initial state:
    // Top 1: Away 0 runs
    // Bot 1: Home 2 runs (2000)
    // Top 2: Away 0 runs (played ball1: 100 -> 0 runs)
    // Bot 2: Home 2000 (2 runs entered)
    // Entering Bot 2, Home is ALREADY leading 2-0 after Top 2 is played!
    const scoreMapInitial = {
      isPlayer1: true,
      '1': { ball1: 0, ball2: 0, ball3: 0 },
      '2': { ball1: 2000, ball2: 0, ball3: 0 },
      '3': { ball1: 0, ball2: 0, ball3: 0 },
      '4': { ball1: 2000, ball2: 0, ball3: 0 },
      opponent: {
        '1': { ball1: 0, ball2: 0, ball3: 0 },
        '2': { ball1: 0, ball2: 0, ball3: 0 },
        '3': { ball1: 100, ball2: 0, ball3: 0 },
        '4': { ball1: 0, ball2: 0, ball3: 0 }
      }
    };

    const initialResult = engine.calculateTurnResults(machines, scoreMapInitial);
    // Home was leading 2-0 before Bot 2; Bot 2 is walk-off (0 added to total, but score preserved)
    expect(initialResult.turnResults[3].isWalkOff).toBe(true);
    expect(initialResult.turnResults[3].played).toBe(true);
    expect(initialResult.turnResults[3].displayMark).toBe('2R');

    // Away edits Top 1 to score 4000 (2 runs for Away) -> Away total is now 2, Home before Bot 2 was 2
    // Away edits Top 2 to score 2000 (1 run for Away) -> Away total is now 3, Home before Bot 2 is 2 (Home is trailing 2-3!)
    const scoreMapEdited = {
      isPlayer1: true,
      '1': { ball1: 0, ball2: 0, ball3: 0 },
      '2': { ball1: 2000, ball2: 0, ball3: 0 },
      '3': { ball1: 0, ball2: 0, ball3: 0 },
      '4': { ball1: 2000, ball2: 0, ball3: 0 },
      opponent: {
        '1': { ball1: 4000, ball2: 0, ball3: 0 }, // Away scores 2 runs in Top 1!
        '2': { ball1: 0, ball2: 0, ball3: 0 },
        '3': { ball1: 2000, ball2: 0, ball3: 0 }, // Away scores 1 run in Top 2! (Away total = 3)
        '4': { ball1: 0, ball2: 0, ball3: 0 }
      }
    };

    const editedResult = engine.calculateTurnResults(machines, scoreMapEdited);
    // Away is now 3 runs. Home (2 runs before Bot 2) is trailing! Home's Bot 2 score (2 runs) is now NEEDED so isWalkOff is undefined and runs are counted!
    expect(editedResult.turnResults[3].isWalkOff).toBeUndefined();
    expect(editedResult.turnResults[3].score).toBe(2);
    expect(editedResult.turnResults[3].displayRunningTotal).toBe('4 R');
  });

  test('getRoundRowContext - home player is batter when viewing away bottom machine', () => {
    const matchups = [
      {
        player1Id: 1,
        player2Id: 2,
        player1Name: 'Kyle',
        player2Name: 'Brian',
        entries: [
          { orderNumber: 1, playerId: 1, playerOrder: 1, machineId: 10, playerName: 'Kyle' },
          { orderNumber: 1, playerId: 2, playerOrder: 2, machineId: 11, playerName: 'Brian' },
        ],
      },
    ];
    const context = { eventMatchups: matchups, getCurrentPlayerId: () => 1 };
    const round = { machineId: 11, orderNumber: 1 };
    const result = engine.getRoundRowContext(round, context);
    // Current player 1 is home (playerOrder 1). Viewing the Bottom machine (away's).
    // Home bats on Bottom → current player is the Batter.
    expect(result.isPlayer1).toBe(true);
    expect(result.isPitcher).toBe(false);
    expect(result.opponentName).toBe('Brian');
    expect(result.displayRoundNumber).toContain('Bottom of 1');
    expect(result.role).toBe('batter');
  });

  test('getRoundRowContext - no matchup found returns defaults', () => {
    const context = { eventMatchups: [], getCurrentPlayerId: () => 1 };
    const round = { machineId: 999, orderNumber: 1 };
    const result = engine.getRoundRowContext(round, context);
    expect(result.matchup).toBeNull();
    expect(result.isPlayer1).toBe(true);
    expect(result.isPitcher).toBe(true);
    expect(result.opponentName).toBe('');
    expect(result.role).toBe('pitcher');
    expect(result.displayRoundNumber).toBe(1);
  });

  // ── getPreviewRowData ─────────────────────────────────────────────────
  test('getPreviewRowData - returns structured preview data', () => {
    const frame = {
      machineName: 'Godzilla',
      scaling: 'curved',
      values: engine.buildRoundValues(5000000, 1.5),
      value1: 5000000,
      value2: 1.5
    };
    const result = engine.getPreviewRowData(frame);
    expect(result.value1).toBe(5000000);
    expect(result.value2).toBe(1.5);
  });

  // ── buildRoundValues scalingType ignored ──────────────────────────────
  test('buildRoundValues - ignores scalingType parameter', () => {
    const curved = engine.buildRoundValues(5000000, 1.5, 'curved');
    const flat = engine.buildRoundValues(5000000, 1.5, 'flat');
    expect(flat).toEqual(curved);
  });

  test('buildRoundValues - produces 10 thresholds', () => {
    const values = engine.buildRoundValues(5000000, 1.5);
    expect(Object.keys(values)).toHaveLength(10);
    expect(values[1]).toBe(5000000);
  });

  // ── renderResults ────────────────────────────────────────────────────
  test('renderResults - fallback to standard rendering when no matchups', () => {
    const calcResult = { turnResults: [], totalDisplay: '0' };
    const machines = [];
    const scoreMap = {};
    const context = { eventMatchups: [] };
    const domRefs = {
      resultsPanel: { 
        querySelector: () => null, 
        classList: { add: vi.fn(), remove: vi.fn() }, 
        insertAdjacentHTML: vi.fn() 
      },
      resultsBody: { innerHTML: '' },
      totalScore: { innerHTML: '' },
      resultsEmpty: { classList: { add: vi.fn() } },
      escapeHTML: (s) => s
    };

    // We don't need to spy on ScoringEngine.prototype.renderResults if we just want to ensure it doesn't crash
    // and follows the fallback path.
    renderHead2HeadScoreboard(calcResult, machines, context, domRefs, engine);
    expect(domRefs.resultsPanel.classList.add).not.toHaveBeenCalled();
  });

  test('renderResults - with matchups and full scoreboard rendering (player found in cache, total score div present)', () => {
    const calcResult = { turnResults: [], totalDisplay: '0' };
    const machines = [{}, {}, {}, {}]; // 4 machines -> 2 innings
    const scoreMap = {};

    // Mock calculations inside engine
    const calculateTurnResultsSpy = vi.spyOn(engine, 'calculateTurnResults');
    // Player 1 (Home)
    calculateTurnResultsSpy.mockReturnValueOnce({
      turnResults: [
        { played: true, score: 0, isBatter: false, isWalkOff: false }, // Inn 1 top (pitcher) - sets to '0'
        { played: true, score: 3, isBatter: true, isWalkOff: false },  // Inn 1 bottom (batter)
        { played: false, isWalkOff: true },                            // Inn 2 top (pitcher) - sets to 'X' (Walk-off)
        { played: false, isWalkOff: false }                            // Inn 2 bottom
      ]
    });
    // Player 2 (Away)
    calculateTurnResultsSpy.mockReturnValueOnce({
      turnResults: [
        { played: true, score: 1, isBatter: true, isWalkOff: false },  // Inn 1 top (batter) - sets to '1'
        { played: true, score: 0, isBatter: false, isWalkOff: false }, // Inn 1 bottom (pitcher)
        { played: false, isWalkOff: false },                           // Inn 2 top (batter) - sets to '-'
        { played: false, isWalkOff: false }                            // Inn 2 bottom
      ]
    });

    const context = {
      eventMatchups: [
        {
          player1Id: 1,
          player2Id: 2,
          player1Name: 'Player One',
          player2Name: 'Player Two',
          entries: [
            { playerId: 1, orderNumber: 1, playerOrder: 1, machineId: 10 },
            { playerId: 2, orderNumber: 1, playerOrder: 2, machineId: 11 },
          ],
        },
      ],
      allPlayersCache: [
        { id: 1, playerName: 'Player One' },
        { id: 2, playerName: 'Player Two' }
      ],
      getCurrentPlayerId: () => '1',
      normalizeScores: (s) => s,
      groupScoresByPlayer: (s) => s,
      allEventScores: []
    };

    const mockTable = { classList: { add: vi.fn(), remove: vi.fn() } };
    const mockExistingGrid = { remove: vi.fn() };
    const mockTotalScoreDiv = { insertAdjacentHTML: vi.fn() };

    const querySelectorMock = vi.fn((selector) => {
      if (selector === 'table.data-table') return mockTable;
      if (selector === '.scoreboard-grid') return mockExistingGrid;
      if (selector === '.total-score') return mockTotalScoreDiv;
      return null;
    });

    const domRefs = {
      resultsPanel: {
        querySelector: querySelectorMock,
        classList: { add: vi.fn(), remove: vi.fn() },
        insertAdjacentHTML: vi.fn()
      },
      resultsBody: { innerHTML: '' },
      totalScore: { innerHTML: '' },
      resultsEmpty: { classList: { add: vi.fn() } },
      escapeHTML: (s) => s
    };

    renderHead2HeadScoreboard(calcResult, machines, context, domRefs, engine);

    // Verify mock interactions
    expect(mockTable.classList.add).toHaveBeenCalledWith('hidden');
    expect(mockExistingGrid.remove).toHaveBeenCalled();
    expect(mockTotalScoreDiv.insertAdjacentHTML).toHaveBeenCalledWith('beforebegin', expect.stringContaining('scoreboard-grid'));

    // Check rendered total score
    expect(domRefs.totalScore.innerHTML).toContain('Player One');
    expect(domRefs.totalScore.innerHTML).toContain('Player Two');
    // Away (Player 2) has 1 + 2 = 3 runs (using first mock because sorted first)
    // Home (Player 1) has 1 run (using second mock)
    expect(domRefs.totalScore.innerHTML).toContain('Player Two 3');
    expect(domRefs.totalScore.innerHTML).toContain('Player One 1');

    // Restore spy
    calculateTurnResultsSpy.mockRestore();
  });

  test('renderResults - fallback names and missing away team', () => {
    const calcResult = { turnResults: [], totalDisplay: '0' };
    const machines = [{}]; // 1 machine -> 1 inning
    const scoreMap = {};

    const calculateTurnResultsSpy = vi.spyOn(engine, 'calculateTurnResults');
    // Player 1 (Home)
    calculateTurnResultsSpy.mockReturnValueOnce({
      turnResults: [
        { played: true, score: 5, isBatter: true, isWalkOff: false }
      ]
    });

    const context = {
      eventMatchups: [
        {
          player1Id: 1,
          player2Id: undefined,
          player1Name: 'Player One',
          player2Name: undefined,
          entries: [
            { playerId: 1, orderNumber: 1, playerOrder: 1, machineId: 10 },
          ],
        },
      ],
      allPlayersCache: [], // Empty cache to trigger fallback names
      getCurrentPlayerId: () => '1',
      normalizeScores: (s) => s,
      groupScoresByPlayer: (s) => s,
      allEventScores: []
    };

    const mockTable = { classList: { add: vi.fn(), remove: vi.fn() } };

    const querySelectorMock = vi.fn((selector) => {
      if (selector === 'table.data-table') return mockTable;
      return null;
    });

    const domRefs = {
      resultsPanel: {
        querySelector: querySelectorMock,
        classList: { add: vi.fn(), remove: vi.fn() },
        insertAdjacentHTML: vi.fn()
      },
      resultsBody: { innerHTML: '' },
      totalScore: { innerHTML: '' },
      resultsEmpty: { classList: { add: vi.fn() } },
      escapeHTML: (s) => s
    };

    renderHead2HeadScoreboard(calcResult, machines, context, domRefs, engine);

    // Verify insertion fallback (no total-score div)
    expect(domRefs.resultsPanel.insertAdjacentHTML).toHaveBeenCalledWith('beforeend', expect.stringContaining('scoreboard-grid'));

    // Check rendered total score (Away defaults to 'Away' with mocked score 5, Home resolves to 'Player One' with 0)
    expect(domRefs.totalScore.innerHTML).toContain('Away 5');
    expect(domRefs.totalScore.innerHTML).toContain('Player One 0');

    calculateTurnResultsSpy.mockRestore();
  });

  test('renderResults - missing home team and opponent fallback name', () => {
    const calcResult = { turnResults: [], totalDisplay: '0' };
    const machines = [{}];
    const scoreMap = {};

    const calculateTurnResultsSpy = vi.spyOn(engine, 'calculateTurnResults');
    // Player 2 (Away, Current Player)
    calculateTurnResultsSpy.mockReturnValueOnce({
      turnResults: [
        { played: true, score: 7, isBatter: true, isWalkOff: false }
      ]
    });

    const context = {
      eventMatchups: [
        {
          player1Id: undefined,
          player2Id: 2,
          player1Name: undefined,
          player2Name: 'Player Two',
          entries: [
            { playerId: 2, orderNumber: 1, playerOrder: 2, machineId: 10 },
          ],
        },
      ],
      allPlayersCache: [], // Empty cache to trigger fallback names
      getCurrentPlayerId: () => '2',
      normalizeScores: (s) => s,
      groupScoresByPlayer: (s) => s,
      allEventScores: []
    };

    const mockTable = { classList: { add: vi.fn(), remove: vi.fn() } };

    const querySelectorMock = vi.fn((selector) => {
      if (selector === 'table.data-table') return mockTable;
      return null;
    });

    const domRefs = {
      resultsPanel: {
        querySelector: querySelectorMock,
        classList: { add: vi.fn(), remove: vi.fn() },
        insertAdjacentHTML: vi.fn()
      },
      resultsBody: { innerHTML: '' },
      totalScore: { innerHTML: '' },
      resultsEmpty: { classList: { add: vi.fn() } },
      escapeHTML: (s) => s
    };

    renderHead2HeadScoreboard(calcResult, machines, context, domRefs, engine);

    // Away resolves to 'Player Two' (from wrapper.player2Name), Home defaults to 'Home' (because it's missing)
    expect(domRefs.totalScore.innerHTML).toContain('Player Two 7');
    expect(domRefs.totalScore.innerHTML).toContain('Home 0');

    calculateTurnResultsSpy.mockRestore();
  });
});
