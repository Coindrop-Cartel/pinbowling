import { describe, test, expect, beforeEach } from 'vitest';
import { SkinsGolfEngine } from '@core/engines/golf/scoring/SkinsGolfEngine.js';

describe('SkinsGolfEngine', () => {
  const engine = new SkinsGolfEngine({
    roundLabel: 'Hole',
    turnHeaderPrefix: 'Hole',
    primaryTargetLabel: 'Par'
  });

  const mockHole = (order, target = 5000000, par = 3) => ({
    orderNumber: order,
    machineName: `Hole Machine ${order}`,
    value1: target,
    value2: par,
    values: engine.buildRoundValues(target, par, 'curved')
  });

  test('Format metadata & constraints', () => {
    expect(engine.config.format).toBe('golf_skins');
    expect(engine.requiresHeadToHead()).toBe(true);
    expect(engine.hasHead2HeadScoring()).toBe(true);
    expect(engine.getMaxRosterSize()).toBe(4);
    expect(engine.allowsTies()).toBe(true);
  });

  test('calculateSkinsResults - single lowest player wins skin', () => {
    const machines = [mockHole(1, 5000000, 3)];
    // Player 1: ball1 hit 3rd threshold (3 strokes)
    // Player 2: ball1 hit 4th threshold (4 strokes)
    const scoreMapByPlayer = {
      1: { '1': { ball1: 5000000, ball2: 0, ball3: 0 } }, // 1 stroke
      2: { '1': { ball1: 1000000, ball2: 5000000, ball3: 0 } } // 2 strokes
    };

    const res = engine.calculateSkinsResults(machines, scoreMapByPlayer);
    expect(res.holeResults[0].winnerId).toBe(1);
    expect(res.holeResults[0].skinsAwarded).toBe(1);
    expect(res.skinsWon[1]).toBe(1);
    expect(res.skinsWon[2]).toBe(0);
  });

  test('calculateSkinsResults - tie carries over to next hole', () => {
    const machines = [mockHole(1), mockHole(2)];
    // Hole 1: Both P1 & P2 get 1 stroke -> Tied, Carryover = 1
    // Hole 2: P2 gets 1 stroke, P1 gets 2 strokes -> P2 wins Hole 2 + Carryover = 2 skins!
    const scoreMapByPlayer = {
      1: {
        '1': { ball1: 5000000, ball2: 0, ball3: 0 },
        '2': { ball1: 1000000, ball2: 5000000, ball3: 0 }
      },
      2: {
        '1': { ball1: 5000000, ball2: 0, ball3: 0 },
        '2': { ball1: 5000000, ball2: 0, ball3: 0 }
      }
    };

    const res = engine.calculateSkinsResults(machines, scoreMapByPlayer);
    expect(res.holeResults[0].tied).toBe(true);
    expect(res.holeResults[0].carryover).toBe(1);
    expect(res.holeResults[0].winnerId).toBeNull();

    expect(res.holeResults[1].winnerId).toBe(2);
    expect(res.holeResults[1].skinsAwarded).toBe(2); // 1 for Hole 2 + 1 carryover
    expect(res.skinsWon[1]).toBe(0);
    expect(res.skinsWon[2]).toBe(2);
  });

  test('getRoundRowContext - returns 4 player sections for Golf Skins', () => {
    const round = mockHole(1);
    const context = {
      eventMatchups: [{
        player1Id: 10, player1Name: 'Alice',
        player2Id: 20, player2Name: 'Bob',
        player3Id: 30, player3Name: 'Charlie',
        player4Id: 40, player4Name: 'Diana'
      }],
      getCurrentPlayerId: () => 20
    };

    const rowCtx = engine.getRoundRowContext(round, context);
    expect(rowCtx.sections.length).toBe(4);
    expect(rowCtx.sections[0].displayName).toBe('Alice');
    expect(rowCtx.sections[0].isActiveParticipant).toBe(false);

    expect(rowCtx.sections[1].displayName).toBe('Bob');
    expect(rowCtx.sections[1].isActiveParticipant).toBe(true); // Active user!

    expect(rowCtx.sections[2].displayName).toBe('Charlie');
    expect(rowCtx.sections[3].displayName).toBe('Diana');
  });
});
