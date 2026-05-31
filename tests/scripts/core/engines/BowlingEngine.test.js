import { describe, test, expect, vi } from 'vitest';
import { BowlingEngine } from '@core/engines/BowlingEngine.js';

/**
 * Unit tests for BowlingEngine
 * These tests verify that pinball scores are correctly translated to bowling pins
 * and that frame bonuses (strikes/spares) are applied accurately.
 */
describe('BowlingEngine', () => {
  const engine = new BowlingEngine();

  // Mock machine configuration for tests
  const mockRound = (order) => ({
    orderNumber: order,
    machineName: `Machine ${order}`,
    values: {
      1: 1000, 2: 2000, 3: 3000, 4: 4000, 5: 5000,
      6: 6000, 7: 7000, 8: 8000, 9: 9000, 10: 10000
    }
  });

  const machines = Array.from({ length: 10 }, (_, i) => mockRound(i + 1));

  test('calculateTurnResults - Open Frames', () => {
    const scoreMap = {
      '1': { ball1: 5000, ball2: 7000, ball3: 7000 }, // 5 pins, then 2 more (total 7)
      '2': { ball1: 2000, ball2: 2000, ball3: 3000 }  // 2 pins, then 1 more (total 3)
    };

    // Only test first 2 rounds
    const { turnResults, total } = engine.calculateTurnResults(machines.slice(0, 2), scoreMap);
    
    expect(turnResults[0].score).toBe(7);
    expect(turnResults[1].score).toBe(3);
    expect(total).toBe(10);
  });

  test('calculateTurnResults - Consecutive Strikes (Turkey)', () => {
    const scoreMap = {
      '1': { ball1: 10000, ball2: 0, ball3: 0 }, // Strike
      '2': { ball1: 10000, ball2: 0, ball3: 0 }, // Strike
      '3': { ball1: 10000, ball2: 0, ball3: 0 }, // Strike
      '4': { ball1: 0, ball2: 0, ball3: 0 }      // 0
    };

    const { turnResults } = engine.calculateTurnResults(machines.slice(0, 4), scoreMap);

    // Frame 1: 10 + 10 + 10 = 30
    expect(turnResults[0].score).toBe(30);
    // Frame 2: 10 + 10 + 0 = 20
    expect(turnResults[1].score).toBe(20);
    // Frame 3: 10 + 0 + 0 = 10
    expect(turnResults[2].score).toBe(10);
  });

  test('calculateTurnResults - Multiple Spares', () => {
    const scoreMap = {
      '1': { ball1: 5000, ball2: 10000, ball3: 10000 }, // Spare (9/1)
      '2': { ball1: 5000, ball2: 10000, ball3: 10000 }, // Spare (9/1)
      '3': { ball1: 2000, ball2: 2000, ball3: 2000 }    // 2 pins
    };

    const { turnResults, total } = engine.calculateTurnResults(machines.slice(0, 3), scoreMap);

    // Frame 1: 10 + next ball (5) = 15
    expect(turnResults[0].score).toBe(19);
    // Frame 2: 10 + next ball (2) = 12
    expect(turnResults[1].score).toBe(12);
    // Frame 3: 2
    expect(turnResults[2].score).toBe(2);
    expect(total).toBe(33);
  });

  test('calculateTurnResults - Spares with Lookahead', () => {
    const scoreMap = {
      '1': { ball1: 5000, ball2: 10000, ball3: 10000 }, // Spare on Ball 2 (9/1)
      '2': { ball1: 4000, ball2: 4000, ball3: 4000 }    // 4 pins
    };

    const { turnResults, total } = engine.calculateTurnResults(machines.slice(0, 2), scoreMap);

    // Spare in frame 1 gets next ball (4 pins) as bonus: 10 + 4 = 14
    expect(turnResults[0].score).toBe(14);
    expect(turnResults[1].score).toBe(4);
    expect(total).toBe(18);
  });

  test('calculateTurnResults - Strikes with Lookahead', () => {
    const scoreMap = {
      '1': { ball1: 10000, ball2: 0, ball3: 0 },    // Strike
      '2': { ball1: 3000, ball2: 7000, ball3: 7000 } // Open: 3 + 4 = 7 pins
    };

    const { turnResults, total } = engine.calculateTurnResults(machines.slice(0, 2), scoreMap);

    // Strike gets next 2 balls (3 and 4) as bonus: 10 + 3 + 4 = 17
    expect(turnResults[0].score).toBe(17);
    expect(turnResults[1].score).toBe(7);
    expect(total).toBe(24);
  });

  test('calculateTurnResults - Round 10 Perfect Finish', () => {
    // Target 1 for Strike is 10,000. 
    // Target 2 (1.3x) is 13,000. 
    // Target 3 (1.3x Target 2) is 16,900.
    const scoreMap = {
      '10': { ball1: 10000, ball2: 13000, ball3: 17000 }
    };

    const { turnResults } = engine.calculateTurnResults([machines[9]], scoreMap);

    expect(turnResults[0].mark).toBe('X X X');
    expect(turnResults[0].score).toBe(30);
  });

  test('calculateTurnResults - Round 10 Variations', () => {
    // Spare in 10th
    const scoreMapSpare = { '10': { ball1: 0, ball2: 10000, ball3: 11000 } };
    const resSpare = engine.calculateTurnResults([machines[9]], scoreMapSpare);
    expect(resSpare.turnResults[0].mark).toBe('9/ 0');
    expect(resSpare.turnResults[0].score).toBe(10);

    // Strike then Open in 10th
    const scoreMapStrikeOpen = { '10': { ball1: 10000, ball2: 11000, ball3: 12000 } };
    const resStrikeOpen = engine.calculateTurnResults([machines[9]], scoreMapStrikeOpen);
    expect(resStrikeOpen.turnResults[0].mark).toBe('X 10 0');
    expect(resStrikeOpen.turnResults[0].score).toBe(20);
  });

  test('getPinCount - Threshold Accuracy', () => {
    const round = mockRound(1);
    
    expect(engine.getPinCount(round, 950)).toBe(0);   // Below 1 pin
    expect(engine.getPinCount(round, 1050)).toBe(1);  // 1 pin
    expect(engine.getPinCount(round, 5500)).toBe(5);  // 5 pins
    expect(engine.getPinCount(round, 10000)).toBe(10); // Exact strike
    expect(engine.getPinCount(round, 15000)).toBe(10); // Well over strike
  });

  test('getPinCount - Edge Cases', () => {
    expect(engine.getPinCount(null, 5000)).toBe(0);
    expect(engine.getPinCount(machines[0], -100)).toBe(0);
    expect(engine.getPinCount(machines[0], 'not a number')).toBe(0);
  });

  test('getBonusTargets - Calculation', () => {
    const round = { values: { 10: 10000 } };
    const targets = engine.getBonusTargets(round);
    expect(targets.t1).toBe(13000);
    expect(targets.t2).toBe(16900);
  });

  test('getBonusTargetHtml', () => {
    const round = { values: { 10: 10000 } };
    const formatFn = (val) => `val:${val}`;

    // Not last round
    expect(engine.getBonusTargetHtml(round, false, formatFn)).toBe('');
    
    // Last round
    const html = engine.getBonusTargetHtml(round, true, formatFn);
    expect(html).toContain('Target 1:</b> val:13000');
    expect(html).toContain('Target 2:</b> val:16900');

    // Missing values
    expect(engine.getBonusTargetHtml({ values: {} }, true, formatFn)).toBe('');
  });

  test('buildRoundValues - Interpolation', () => {
    const values = engine.buildRoundValues(10000, 1000);
    
    expect(values[1]).toBe(1000);
    expect(values[10]).toBe(10000);
    // Pin 5: 1000 + (9000 * 4/9) = 1000 + 4000 = 5000
    expect(values[5]).toBe(5000);
  });

  test('buildRoundValues - Invalid Inputs', () => {
    expect(engine.buildRoundValues(0, 1000)).toBeNull();
    expect(engine.buildRoundValues(10000, 0)).toBeNull();
  });

  test('Metadata Getters', () => {
    expect(engine.getRoundLabel()).toBe('Frame');
    expect(engine.getTurnHeaderPrefix()).toBe('Frame');
    expect(engine.getPrimaryTargetLabel()).toBe('Strike');
  });

  test('getRound10Data - Late Spare Scenario', () => {
    const round = mockRound(10);
    const data = engine.getRound10Data(round, 0, 0, 16900); 
    expect(data.mark).toBe('0/');
    expect(data.score).toBe(10);
  });

  test('getRound10Data - Strike then Spare Scenario', () => {
    const round = mockRound(10);
    const data = engine.getRound10Data(round, 10000, 8000, 16900);
    expect(data.mark).toBe('X 8/');
    expect(data.score).toBe(20);
  });

  test('getRound10Data - Spare then Strike Scenario', () => {
    const round = mockRound(10);
    const data = engine.getRound10Data(round, 5000, 10000, 16900);
    expect(data.mark).toBe('9/ X'); 
    expect(data.score).toBe(20);
  });

  test('Perfect Game Calculation', () => {
    const scoreMap = {};
    for (let i = 1; i <= 9; i++) {
      scoreMap[i] = { ball1: 10000, ball2: 0, ball3: 0 };
    }
    // Round 10 targets
    scoreMap[10] = { ball1: 10000, ball2: 13000, ball3: 16900 };

    const { total } = engine.calculateTurnResults(machines, scoreMap);
    expect(total).toBe(300);
  });

  test('calculateTurnResults - Empty Scores', () => {
    const scoreMap = {};
    const { turnResults, total } = engine.calculateTurnResults(machines.slice(0, 1), scoreMap);
    
    expect(turnResults[0].score).toBe(0);
    expect(total).toBe(0);
  });
});