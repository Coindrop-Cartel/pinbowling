import { describe, test, expect } from 'vitest';
import { GolfEngine } from '@core/engines/GolfEngine.js';

describe('GolfEngine', () => {
  const engine = new GolfEngine();

  const mockHole = (order) => ({
    orderNumber: order,
    machineName: `Hole ${order}`,
    values: {
      1: 10000, 2: 8000, 3: 5000, 4: 4000, 5: 3000,
      6: 2500, 7: 2000, 8: 1500, 9: 1000, 10: 500
    }
  });

  test('getStrokeCount - Inverse Thresholds', () => {
    const hole = mockHole(1);

    // High scores yield low strokes
    expect(engine.getStrokeCount(hole, 15000)).toBe(1);
    expect(engine.getStrokeCount(hole, 10000)).toBe(1);
    expect(engine.getStrokeCount(hole, 5500)).toBe(3); // Better than 3 (5000) but not a 2 (8000)
    expect(engine.getStrokeCount(hole, 500)).toBe(10);
    expect(engine.getStrokeCount(hole, 100)).toBe(10); // Failed all thresholds
  });

  test('calculateTurnResults - Summation of Strokes', () => {
    const holes = [mockHole(1), mockHole(2), mockHole(3)];
    const scoreMap = {
      '1': { ball1: 12000 }, // Stroke 1
      '2': { ball1: 5500 },  // Stroke 3
      '3': { ball1: 100 }    // Stroke 10
    };

    const { turnResults, total } = engine.calculateTurnResults(holes, scoreMap);

    expect(turnResults[0].score).toBe(1);
    expect(turnResults[1].score).toBe(3);
    expect(turnResults[2].score).toBe(10);
    expect(total).toBe(14); // 1 + 3 + 10
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
    expect(total).toBe(1); // Hits the highest target (ball 3)
  });
});