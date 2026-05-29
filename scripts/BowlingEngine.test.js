import { describe, test, expect } from 'vitest';
import { BowlingEngine } from './BowlingEngine.js';

/**
 * Unit tests for BowlingEngine
 * These tests verify that pinball scores are correctly translated to bowling pins
 * and that frame bonuses (strikes/spares) are applied accurately.
 */
describe('BowlingEngine', () => {
  const engine = new BowlingEngine();

  // Mock machine configuration for tests
  const mockRound = (order) => ({
    order_number: order,
    machine_name: `Machine ${order}`,
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

  test('getPinCount - Threshold Accuracy', () => {
    const round = mockRound(1);
    
    expect(engine.getPinCount(round, 950)).toBe(0);   // Below 1 pin
    expect(engine.getPinCount(round, 1050)).toBe(1);  // 1 pin
    expect(engine.getPinCount(round, 5500)).toBe(5);  // 5 pins
    expect(engine.getPinCount(round, 15000)).toBe(10); // Well over strike
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
});