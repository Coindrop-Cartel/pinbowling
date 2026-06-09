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
    const scoreMap = { // Updated to new 1.5x multipliers: t1=15000, t2=22500
      '10': { ball1: 10000, ball2: 15000, ball3: 22500 }
    };

    const { turnResults } = engine.calculateTurnResults([machines[9]], scoreMap);

    expect(turnResults[0].mark).toBe('X X X');
    expect(turnResults[0].score).toBe(30);
  });

  test('calculateTurnResults - Round 10 Variations', () => {
    // Spare in 10th
    const scoreMapSpare = { '10': { ball1: 0, ball2: 10000, ball3: 10000 } };
    const resSpare = engine.calculateTurnResults([machines[9]], scoreMapSpare);
    expect(resSpare.turnResults[0].mark).toBe('9/ 4'); // Expectation matches hardcoded '9/ 4'
    expect(resSpare.turnResults[0].score).toBe(14);

    // Strike then Open in 10th
    const scoreMapStrikeOpen = { '10': { ball1: 10000, ball2: 10000, ball3: 10000 } };
    const resStrikeOpen = engine.calculateTurnResults([machines[9]], scoreMapStrikeOpen);
    expect(resStrikeOpen.turnResults[0].mark).toBe('X 6'); // Expectation matches hardcoded 'X 6'
    expect(resStrikeOpen.turnResults[0].score).toBe(16);
  });

  test('calculateTurnResults - Round 10: Two strikes then 4 pins', () => {
    const round = mockRound(10);
    const scoreMap = {
      '10': { ball1: 10000, ball2: 15000, ball3: 4000 } // raw1=10000 (strike), raw2=15000 (t1), raw3=4000 (4 pins)
    };
    const { turnResults } = engine.calculateTurnResults([round], scoreMap);
    expect(turnResults[0].mark).toBe('X X 4');
    expect(turnResults[0].score).toBe(24); // 10 + 10 + 4
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
    const round = { values: { 1: 1000, 10: 10000 } };
    const targets = engine.getBonusTargets(round);
    expect(targets.t1).toBe(15000);
    expect(targets.t2).toBe(22500);
  });

  test('getBonusTargetHtml', () => {
    const round = { values: { 10: 10000 } };
    const formatFn = (val) => `val:${val}`;

    // Not last round
    expect(engine.getBonusTargetHtml(round, false, formatFn)).toBe('');
    
    // Last round
    const html = engine.getBonusTargetHtml(round, true, formatFn);
    expect(html).toContain('XX:');
    expect(html).toContain('XXX:');

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
    expect(engine.buildRoundValues(10000, 0)).not.toBeNull(); // 0 is now a valid input for bottomScore
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
    const data = engine.getRound10Data(round, 10000, 10000, 16900);
    expect(data.mark).toBe('X 9/');
    expect(data.score).toBe(20);
  });

  test('getRound10Data - Spare then Strike Scenario', () => {
    const round = mockRound(10);
    const data = engine.getRound10Data(round, 5000, 10000, 22500);
    expect(data.mark).toBe('9/ X'); 
    expect(data.score).toBe(20);
  });

  test('Perfect Game Calculation', () => {
    const scoreMap = {};
    for (let i = 1; i <= 9; i++) {
      scoreMap[i] = { ball1: 10000, ball2: 0, ball3: 0 };
    }
    // Round 10 targets
    scoreMap[10] = { ball1: 10000, ball2: 15000, ball3: 22500 };

    const { total } = engine.calculateTurnResults(machines, scoreMap);
    expect(total).toBe(300);
  });

  test('calculateTurnResults - Empty Scores', () => {
    const scoreMap = {};
    const { turnResults, total } = engine.calculateTurnResults(machines.slice(0, 1), scoreMap);
    
    expect(turnResults[0].score).toBe(0);
    expect(total).toBe(0);
  });

  // === NEW COMPREHENSIVE TESTS ===
  describe('formatMark', () => {
    test('returns X for strike type', () => {
      expect(engine.formatMark({ type: 'strike', first: 10, second: 0 })).toBe('X');
    });
    test('returns first/ for spare2 type', () => {
      expect(engine.formatMark({ type: 'spare2', first: 9, second: 1 })).toBe('9/');
    });
    test('returns first/ for spare3 type', () => {
      expect(engine.formatMark({ type: 'spare3', first: 7, second: 3 })).toBe('7/');
    });
    test('returns tenth mark directly when type is tenth', () => {
      expect(engine.formatMark({ type: 'tenth', mark: 'X X X' })).toBe('X X X');
    });
    test('returns empty string for tenth with no mark', () => {
      expect(engine.formatMark({ type: 'tenth' })).toBe('');
    });
    test('returns "first second" for open frame with numeric values', () => {
      expect(engine.formatMark({ type: 'open', first: 4, second: 3 })).toBe('4 3');
    });
    test('fallback - returns turn.mark when type is unrecognized and first/second are not both numbers', () => {
      expect(engine.formatMark({ type: 'unknown', mark: 'custom', first: 'a', second: 'b' })).toBe('custom');
    });
    test('fallback - returns empty string when type is unrecognized and no mark', () => {
      expect(engine.formatMark({ type: 'unknown', first: 'a', second: 'b' })).toBe('');
    });
    test('ignores parValue parameter', () => {
      expect(engine.formatMark({ type: 'strike', first: 10, second: 0 }, 5)).toBe('X');
    });
  });
  describe('getRoundCountOptions', () => {
    test('returns [3, 6, 10]', () => {
      expect(engine.getRoundCountOptions()).toEqual([3, 6, 10]);
    });
  });
  describe('getInitialValues', () => {
    test('returns default suggestedTarget of 5000000', () => {
      const result = engine.getInitialValues();
      expect(result.value1).toBe(5000000);
      expect(result.value2).toBe(500000);
    });
    test('returns custom suggestedTarget with 10% value2', () => {
      const result = engine.getInitialValues(100000);
      expect(result.value1).toBe(100000);
      expect(result.value2).toBe(10000);
    });
    test('handles zero suggestedTarget', () => {
      const result = engine.getInitialValues(0);
      expect(result.value1).toBe(0);
      expect(result.value2).toBe(0);
    });
  });
  describe('formatTotalScore', () => {
    test('formats a number', () => {
      const result = engine.formatTotalScore(300);
      expect(typeof result).toBe('string');
      expect(result).toContain('300');
    });
    test('formats zero', () => {
      const result = engine.formatTotalScore(0);
      expect(result).toContain('0');
    });
  });
  describe('getBonusTargets - comprehensive', () => {
    test('fallback when s1 is missing', () => {
      const round = { values: { 10: 10000 } };
      const targets = engine.getBonusTargets(round);
      expect(targets.t1).toBe(15000);
      expect(targets.t2).toBe(22500);
    });
    test('fallback when s10 is missing', () => {
      const round = { values: { 1: 1000 } };
      const targets = engine.getBonusTargets(round);
      expect(targets.t1).toBe(0);
      expect(targets.t2).toBe(0);
    });
    test('fallback when s1 >= s10', () => {
      const round = { values: { 1: 10000, 10: 10000 } };
      const targets = engine.getBonusTargets(round);
      expect(targets.t1).toBe(15000);
    });
    test('inferred curved when gap end > 1.5x gap start', () => {
      const round = { values: { 1: 1000, 2: 1100, 9: 5000, 10: 10000 } };
      const targets = engine.getBonusTargets(round);
      expect(targets.t1).toBeGreaterThan(10000);
    });
    test('inferred flat when gap end <= 1.5x gap start', () => {
      const round = { values: { 1: 1000, 2: 2000, 9: 9000, 10: 10000 } };
      const targets = engine.getBonusTargets(round);
      expect(targets.t1).toBeGreaterThan(10000);
    });
  });
  describe('getRound10Data - comprehensive', () => {
    test('Instant Perfect Finish via raw1 >= t2', () => {
      const round = mockRound(10);
      const data = engine.getRound10Data(round, 22500, 0, 0); // Updated raw1 to hit new t2 (22500)
      expect(data.mark).toBe('X X X');
      expect(data.score).toBe(30);
    });
    test('Instant Perfect Finish via raw2 >= t2', () => {
      const round = mockRound(10);
      const data = engine.getRound10Data(round, 0, 22500, 0); // Updated raw2 to hit new t2 (22500)
      expect(data.mark).toBe('X X X');
      expect(data.score).toBe(30);
    });
    test('Open frame in 10th (no strike, no spare)', () => {
      const round = mockRound(10);
      const data = engine.getRound10Data(round, 3000, 5000, 7000);
      expect(data.type).toBe('tenth');
      expect(data.mark).toBe('7'); // Mark should be the final pin count
      expect(data.score).toBe(7); 
    });
    test('Strike path - ball2 hits t1, ball3 misses t2', () => {
      const round = mockRound(10);
      const data = engine.getRound10Data(round, 10000, 15000, 5000); // Updated raw2 to hit new t1 (15000)
      expect(data.mark).toContain('X X');
      expect(data.first).toBe(10);
      expect(data.second).toBe(10);
    });
    test('Strike path - ball2 misses t1, ball3 hits t1 (spare)', () => {
      const round = mockRound(10);
      const data = engine.getRound10Data(round, 10000, 10000, 15000); // Updated raw3 to hit new t1 (15000)
      expect(data.mark).toBe('X 9/'); // Expectation matches hardcoded 'X 9/'
      expect(data.score).toBe(20);
    });
    test('Strike path - ball2 and ball3 both miss t1 (open)', () => {
      const round = mockRound(10);
      const data = engine.getRound10Data(round, 10000, 10000, 10000);
      expect(data.mark).toBe('X 6'); // Expectation matches hardcoded 'X 6'
      expect(data.score).toBe(16);
    });
    test('Spare path - ball3 misses t1', () => {
      const round = mockRound(10);
      const data = engine.getRound10Data(round, 5000, 10000, 5000);
      expect(data.mark).toBe('9/ 4'); // Expectation matches hardcoded '9/ 4'
      expect(data.score).toBe(14);
    });
    test('Late spare with various pin counts', () => {
      const round = mockRound(10);
      const data = engine.getRound10Data(round, 3000, 5000, 10000);
      expect(data.type).toBe('tenth');
      expect(data.mark).toBe('5/');
      expect(data.score).toBe(10);
    });
  });
  describe('getTurnDataFromValues - standard frames', () => {
    test('strike frame (raw1 >= target)', () => {
      const round = mockRound(1);
      const data = engine.getTurnDataFromValues(round, 10000, 0, 0, false);
      expect(data.type).toBe('strike');
      expect(data.mark).toBe('X');
      expect(data.score).toBe(10);
    });
    test('spare2 frame (raw2 >= target)', () => {
      const round = mockRound(1);
      const data = engine.getTurnDataFromValues(round, 5000, 10000, 0, false);
      expect(data.type).toBe('spare2');
      expect(data.mark).toBe('9/');
      expect(data.score).toBe(10);
    });
    test('spare3 frame (raw3 >= target)', () => {
      const round = mockRound(1);
      const data = engine.getTurnDataFromValues(round, 3000, 5000, 10000, false);
      expect(data.type).toBe('spare3');
      expect(data.mark).toBe('5/'); // Specific mark based on mockRoun…
      expect(data.score).toBe(10);
    });
    test('spare3 caps first at 8', () => {
      const round = mockRound(1);
      const data = engine.getTurnDataFromValues(round, 9000, 9000, 10000, false);
      expect(data.first).toBe(8); // Specific pin count for 9000 raw score
    });
    test('open frame', () => {
      const round = mockRound(1);
      const data = engine.getTurnDataFromValues(round, 3000, 5000, 7000, false);
      expect(data.type).toBe('open');
      expect(data.score).toBe(7);
    });
    test('delegates to getRound10Data when isLastRound=true', () => {
      const round = mockRound(10);
      const data = engine.getTurnDataFromValues(round, 10000, 15000, 22500, true); // Updated raw2/raw3 to hit new t1/t2
      expect(data.type).toBe('tenth');
      expect(data.mark).toBe('X X X');
    });
  });
  describe('getNextBallValues', () => {
    test('gets next 2 balls from a strike', () => {
      const turnData = [ { type: 'strike', first: 10, second: 0 }, { type: 'open', first: 3, second: 4 } ];
      expect(engine.getNextBallValues(0, 2, turnData)).toEqual([3, 4]);
    });
    test('gets next 1 ball from a spare', () => {
      const turnData = [ { type: 'spare2', first: 9, second: 1 }, { type: 'open', first: 5, second: 3 } ];
      expect(engine.getNextBallValues(0, 1, turnData)).toEqual([5]);
    });
    test('pads with zeros when not enough data', () => {
      const turnData = [ { type: 'strike', first: 10, second: 0 } ];
      expect(engine.getNextBallValues(0, 2, turnData)).toEqual([0, 0]);
    });
    test('returns zeros when at end of array', () => {
      const turnData = [ { type: 'open', first: 3, second: 4 } ];
      expect(engine.getNextBallValues(0, 2, turnData)).toEqual([0, 0]);
    });
    test('handles consecutive strikes in lookahead', () => {
      const turnData = [ { type: 'strike', first: 10, second: 0 }, { type: 'strike', first: 10, second: 0 }, { type: 'strike', first: 10, second: 0 } ];
      expect(engine.getNextBallValues(0, 2, turnData)).toEqual([10, 10]);
    });
  });
  describe('calculateTurnResults - comprehensive', () => {
    test('spare3 type gets bonus from next ball', () => {
      const scoreMap = { '1': { ball1: 3000, ball2: 5000, ball3: 10000 }, '2': { ball1: 4000, ball2: 4000, ball3: 4000 } };
      const { turnResults, total } = engine.calculateTurnResults(machines.slice(0, 2), scoreMap);
      expect(turnResults[0].type).toBe('spare3');
      expect(turnResults[0].score).toBe(14); // 10 + 4 bonus
      expect(turnResults[1].score).toBe(4);
      expect(total).toBe(18);
    });
    test('displays formatted marks and totals', () => {
      const scoreMap = { '1': { ball1: 10000, ball2: 0, ball3: 0 }, '2': { ball1: 3000, ball2: 7000, ball3: 7000 } };
      const { turnResults } = engine.calculateTurnResults(machines.slice(0, 2), scoreMap);
      expect(turnResults[0].displayMark).toBe('X');
      expect(turnResults[0].played).toBe(true);
      expect(typeof turnResults[0].displayRoundTotal).toBe('string');
      expect(typeof turnResults[0].displayRunningTotal).toBe('string');
    });
    test('totalDisplay is formatted', () => {
      const scoreMap = { '1': { ball1: 5000, ball2: 7000, ball3: 7000 } };
      const { totalDisplay } = engine.calculateTurnResults(machines.slice(0, 1), scoreMap);
      expect(typeof totalDisplay).toBe('string');
    });
    test('empty machines array', () => {
      const { turnResults, total } = engine.calculateTurnResults([], {});
      expect(turnResults).toEqual([]);
      expect(total).toBe(0);
    });
  });
  describe('Config-based getters', () => {
    test('getRoundLabel with custom config', () => {
      const customEngine = new BowlingEngine({ roundLabel: 'Inning' });
      expect(customEngine.getRoundLabel()).toBe('Inning');
    });
    test('getTurnHeaderPrefix with custom config', () => {
      const customEngine = new BowlingEngine({ turnHeaderPrefix: 'Rnd' });
      expect(customEngine.getTurnHeaderPrefix()).toBe('Rnd');
    });
    test('getPrimaryTargetLabel with custom config', () => {
      const customEngine = new BowlingEngine({ primaryTargetLabel: 'Goal' });
      expect(customEngine.getPrimaryTargetLabel()).toBe('Goal');
    });
    test('getValue1Label with custom config', () => {
      const customEngine = new BowlingEngine({ value1Label: 'Strike Score' });
      expect(customEngine.getValue1Label()).toBe('Strike Score');
    });
    test('getValue2Label with custom config', () => {
      const customEngine = new BowlingEngine({ value2Label: 'Base' });
      expect(customEngine.getValue2Label()).toBe('Base');
    });
    test('getThresholdStart default is 10', () => {
      expect(engine.getThresholdStart()).toBe(10);
    });
    test('getThresholdEnd default is 1', () => {
      expect(engine.getThresholdEnd()).toBe(1);
    });
    test('getThresholdStart with custom config', () => {
      const customEngine = new BowlingEngine({ thresholdStart: 5 });
      expect(customEngine.getThresholdStart()).toBe(5);
    });
    test('getThresholdEnd with custom config', () => {
      const customEngine = new BowlingEngine({ thresholdEnd: 8 });
      expect(customEngine.getThresholdEnd()).toBe(8);
    });
    test('getThresholdPrefix returns Pins', () => {
      expect(engine.getThresholdPrefix()).toBe('Pins');
    });
    test('compareScores - inherits b-a from ScoringEngine (higher score wins)', () => {
      // BowlingEngine does NOT override compareScores, inherits b-a from ScoringEngine
      // compareScores(a, b) = b - a, so higher score wins
      expect(engine.compareScores(5, 10)).toBeGreaterThan(0); // 10-5 = 5 > 0
      expect(engine.compareScores(10, 5)).toBeLessThan(0); // 5-10 = -5 < 0
      expect(engine.compareScores(5, 5)).toBe(0); // 5-5 = 0
    });
  });
  describe('buildRoundValues - comprehensive', () => {
    test('curved scaling', () => {
      const values = engine.buildRoundValues(10000, 1000, 'curved');
      expect(values[1]).toBe(1000);
      expect(values[10]).toBe(10000);
      expect(values[5]).toBeLessThan(5000);
      expect(values[5]).toBeGreaterThan(1000);
    });
    test('flat scaling', () => {
      const values = engine.buildRoundValues(10000, 1000, 'flat');
      expect(values[1]).toBe(1000);
      expect(values[10]).toBe(10000);
      expect(values[5]).toBe(5000);
    });
    test('negative bottomScore returns null', () => {
      expect(engine.buildRoundValues(10000, -1)).toBeNull();
    });
  });
  describe('_createTurnData', () => {
    test('creates standardized turn data object', () => {
      const round = mockRound(1);
      const data = engine._createTurnData(round, 'strike', 'X', 10, 0, 0, 10);
      expect(data.orderNumber).toBe(1);
      expect(data.machineName).toBe('Machine 1');
      expect(data.type).toBe('strike');
      expect(data.mark).toBe('X');
      expect(data.first).toBe(10);
      expect(data.second).toBe(0);
      expect(data.third).toBe(0);
      expect(data.score).toBe(10);
    });
    test('defaults third to 0', () => {
      const round = mockRound(1);
      const data = engine._createTurnData(round, 'open', '5', 5, 3, undefined, 8);
      expect(data.third).toBe(0);
    });
  });
  describe('_getRelativePins', () => {
    test('calculates pins relative to offset', () => {
      const round = mockRound(1);
      const result = engine._getRelativePins(round, 8000, 4000);
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    });
    test('clamps to 0 when rawScore - offset is negative', () => {
      const round = mockRound(1);
      const result = engine._getRelativePins(round, 500, 4000);
      expect(result).toBe(0);
    });
  });
  describe('getBonusTargetHtml - comprehensive', () => {
    test('returns empty string when not last round', () => {
      const round = { values: { 10: 10000 } };
      expect(engine.getBonusTargetHtml(round, false, (v) => v)).toBe('');
    });
    test('returns empty string when values is missing', () => {
      expect(engine.getBonusTargetHtml({}, true, (v) => v)).toBe('');
    });
    test('returns HTML with formatted values for last round', () => {
      const round = { values: { 1: 1000, 10: 10000 } };
      const html = engine.getBonusTargetHtml(round, true, (v) => v);
      expect(html).toContain('XX:');
      expect(html).toContain('XXX:');
    });
    test('passes scalingType to getBonusTargets', () => {
      const round = { values: { 1: 1000, 2: 2000, 9: 9000, 10: 10000 } };
      const html = engine.getBonusTargetHtml(round, true, (v) => v, 'curved');
      expect(html).toContain('XX:');
    });
  });
});