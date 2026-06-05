import { describe, test, expect, beforeEach } from 'vitest';
import { GolfEngine } from '@core/engines/GolfEngine.js';

describe('GolfEngine', () => {
  beforeEach(() => {
    // Mock the global metadata object exported from config.php to satisfy base class getters
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

  const mockHole = (order) => {
    const target = 10000;
    const par = 3;
    return {
      orderNumber: order,
      machineName: `Hole ${order}`,
      value1: target,
      value2: par,
      values: engine.buildRoundValues(target, par, 'flat')
    };
  };

  test('calculateTurnResults - Ball Sequence Timing', () => {
    const holes = [mockHole(1), mockHole(2), mockHole(3)];
    const scoreMap = {
      '1': { ball1: 13000 }, // Threshold for Rank 1 is ~12571
      '2': { ball1: 5000, ball2: 12000 }, // Threshold for Rank 2 is ~11285
      '3': { ball1: 2000, ball2: 5000, ball3: 10000 } // Threshold for Rank 3 is exactly 10000
    };

    const { turnResults, total } = engine.calculateTurnResults(holes, scoreMap);

    expect(turnResults[0].score).toBe(1);
    expect(turnResults[1].score).toBe(2);
    expect(turnResults[2].score).toBe(3);
    expect(total).toBe(6);
  });

  test('calculateTurnResults - Fallback to 4-10 thresholds', () => {
    const hole = mockHole(1);
    // Par (10,000) never reached. Max is 8,000.
    const scoreMap = { '1': { ball1: 2000, ball2: 5000, ball3: 8714 } };
    
    const { turnResults } = engine.calculateTurnResults([hole], scoreMap);
    
    // ~8714 is the threshold for Rank 4 when anchored at Rank 3
    expect(turnResults[0].score).toBe(4);
  });

  test('buildRoundValues - Inverse Linear Interpolation', () => {
    // Target 1000 for Par 3
    const values = engine.buildRoundValues(1000, 3, 'flat');

    // Rank 3 (Par) should be exactly the target
    expect(values[3]).toBe(1000);
    
    expect(values[1]).toBe(1257); // High requirement for 1 stroke
    expect(values[10]).toBe(100); // Floor is 10% of target
  });

  test('buildRoundValues - Inverse Curved Interpolation', () => {
    const values = engine.buildRoundValues(1000, 3, 'curved');

    expect(values[3]).toBe(1000);
    expect(values[1]).toBe(1588); // Significantly higher requirement for 1 stroke
    expect(values[10]).toBe(100);
  });

  test('Metadata Getters', () => {
    expect(engine.getRoundLabel()).toBe('Hole');
    expect(engine.getTurnHeaderPrefix()).toBe('Hole');
    expect(engine.getPrimaryTargetLabel()).toBe('Par');
    expect(engine.getPlayActionLabel()).toBe("Let's Golf!");
    expect(engine.getBrandName()).toBe('PinGolf');
  });

  test('calculateTurnResults - Cumulative balls', () => {
    const holes = [mockHole(1)];
    const scoreMap = { '1': { ball1: 2000, ball2: 6000, ball3: 10000 } };
    const { total } = engine.calculateTurnResults(holes, scoreMap);
    expect(total).toBe(3); // Hits target on ball 3
  });
});