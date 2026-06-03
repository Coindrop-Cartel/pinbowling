import { describe, test, expect } from 'vitest';
import { GolfEngine } from '@core/engines/GolfEngine.js';

describe('GolfEngine', () => {
  const engine = new GolfEngine();

  const mockHole = (order) => ({
    orderNumber: order,
    machineName: `Hole ${order}`,
    value1: 10000,
    value2: 3,
    values: {
      1: 20000, 2: 15000, 3: 10000, 4: 8000, 5: 6000,
      6: 4000, 7: 3000, 8: 2000, 9: 1000, 10: 500
    }
  });

  test('calculateTurnResults - Ball Sequence Timing', () => {
    const holes = [mockHole(1), mockHole(2), mockHole(3)];
    const scoreMap = {
      '1': { ball1: 12000 }, // Reached target on Ball 1 -> 1 Stroke
      '2': { ball1: 5000, ball2: 10000 }, // Reached target on Ball 2 -> 2 Strokes
      '3': { ball1: 2000, ball2: 5000, ball3: 11000 } // Reached target on Ball 3 -> 3 Strokes
    };

    const { turnResults, total } = engine.calculateTurnResults(holes, scoreMap);

    expect(turnResults[0].score).toBe(1);
    expect(turnResults[1].score).toBe(2);
    expect(turnResults[2].score).toBe(3);
    expect(total).toBe(6);
  });

  test('calculateTurnResults - Fallback to 4-10 thresholds', () => {
    const hole = mockHole(1);
    // Target 10,000 never reached. Max is 8,000.
    const scoreMap = { '1': { ball1: 2000, ball2: 5000, ball3: 8000 } };
    
    const { turnResults } = engine.calculateTurnResults([hole], scoreMap);
    
    // 8000 is the exact threshold for Rank 4 in mockHole
    expect(turnResults[0].score).toBe(4);
  });

  test('buildRoundValues - Inverse Linear Interpolation', () => {
    // Target 1000 for Par 3
    const values = engine.buildRoundValues(1000, 3, 'flat');

    // Rank 3 (Par) should be exactly the target
    expect(values[3]).toBe(1000);
    
    // Rank 1 (better) should be higher: 1000 * (10/8) = 1250
    expect(values[1]).toBe(1250);
    // Rank 10 (worse) should be lower: 1000 * (1/8) = 125
    expect(values[10]).toBe(125);
  });

  test('buildRoundValues - Inverse Curved Interpolation', () => {
    const values = engine.buildRoundValues(1000, 3, 'curved');

    expect(values[3]).toBe(1000);
    // Rank 1: 1000 * (10/8)^2 = 1000 * 1.5625 = 1563
    expect(values[1]).toBe(1563);
  });

  test('Metadata Getters', () => {
    expect(engine.getRoundLabel()).toBe('Hole');
    expect(engine.getTurnHeaderPrefix()).toBe('H');
    expect(engine.getPrimaryTargetLabel()).toBe('Target Score');
  });

  test('calculateTurnResults - Cumulative balls', () => {
    const holes = [mockHole(1)];
    const scoreMap = { '1': { ball1: 2000, ball2: 6000, ball3: 10000 } };
    const { total } = engine.calculateTurnResults(holes, scoreMap);
    expect(total).toBe(3); // Hits target on ball 3
  });
});