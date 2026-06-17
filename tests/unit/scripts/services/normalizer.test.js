/** @vitest-environment jsdom */
import { vi, describe, it, expect } from 'vitest';
import {
  normalizeTarget,
  normalizeTargets,
  normalizeScore,
  normalizeScores,
  groupTargetsByEvent,
  groupScoresByEventAndPlayer,
  groupScoresByPlayer,
  buildScoreMapFromRows,
  buildScoreMapFromDOM
} from '@services/normalizer.js';

// ── normalizeTarget ──────────────────────────────────────────────────
describe('normalizeTarget', () => {
  it('should map snake_case fields to camelCase', () => {
    const raw = {
      event_id: 10,
      machine_id: 20,
      machine_name: 'Machine A',
      order_number: 3,
      value1: 5000,
      value2: 1000,
      score1: 100, score2: 200, score3: 300, score4: 400, score5: 500,
      score6: 600, score7: 700, score8: 800, score9: 900, score10: 1000
    };
    const result = normalizeTarget(raw);
    expect(result.eventId).toBe(10);
    expect(result.machineId).toBe(20);
    expect(result.machineName).toBe('Machine A');
    expect(result.orderNumber).toBe(3);
  });

  it('should preserve existing camelCase fields', () => {
    const raw = {
      eventId: 5,
      machineId: 15,
      machineName: 'Machine B',
      orderNumber: 1,
      value1: 3000,
      value2: 500
    };
    const result = normalizeTarget(raw);
    expect(result.eventId).toBe(5);
    expect(result.machineId).toBe(15);
    expect(result.machineName).toBe('Machine B');
    expect(result.orderNumber).toBe(1);
  });

  it('should prefer camelCase over snake_case when both exist', () => {
    const raw = { eventId: 1, event_id: 99 };
    const result = normalizeTarget(raw);
    expect(result.eventId).toBe(1);
  });

  it('should build values object from score1-score10 when values is absent', () => {
    const raw = {
      score1: 10, score2: 20, score3: 30, score4: 40, score5: 50,
      score6: 60, score7: 70, score8: 80, score9: 90, score10: 100
    };
    const result = normalizeTarget(raw);
    expect(result.values).toEqual({
      1: 10, 2: 20, 3: 30, 4: 40, 5: 50,
      6: 60, 7: 70, 8: 80, 9: 90, 10: 100
    });
  });

  it('should use existing values object when provided', () => {
    const values = { 1: 100, 2: 200, 3: 300 };
    const raw = { values, score1: 999 };
    const result = normalizeTarget(raw);
    expect(result.values).toBe(values);
  });

  it('should coerce value1 and value2 to numbers', () => {
    const raw = { value1: '5000', value2: '1000' };
    const result = normalizeTarget(raw);
    expect(result.value1).toBe(5000);
    expect(result.value2).toBe(1000);
  });

  it('should default value1 and value2 to 0 when missing', () => {
    const result = normalizeTarget({});
    expect(result.value1).toBe(0);
    expect(result.value2).toBe(0);
  });

  it('should default missing score fields to 0 in values', () => {
    const raw = { score1: 100, score5: 500 };
    const result = normalizeTarget(raw);
    expect(result.values[1]).toBe(100);
    expect(result.values[2]).toBe(0);
    expect(result.values[5]).toBe(500);
    expect(result.values[10]).toBe(0);
  });

  it('should spread other properties through', () => {
    const raw = { eventId: 1, customField: 'hello' };
    const result = normalizeTarget(raw);
    expect(result.customField).toBe('hello');
  });
});

// ── normalizeTargets ─────────────────────────────────────────────────
describe('normalizeTargets', () => {
  it('should normalize an array of targets', () => {
    const arr = [
      { event_id: 1, machine_name: 'A', score1: 100, score2: 200, score3: 0, score4: 0, score5: 0, score6: 0, score7: 0, score8: 0, score9: 0, score10: 0 },
      { event_id: 2, machine_name: 'B', score1: 300, score2: 400, score3: 0, score4: 0, score5: 0, score6: 0, score7: 0, score8: 0, score9: 0, score10: 0 }
    ];
    const result = normalizeTargets(arr);
    expect(result).toHaveLength(2);
    expect(result[0].eventId).toBe(1);
    expect(result[1].machineName).toBe('B');
  });

  it('should return empty array for null input', () => {
    expect(normalizeTargets(null)).toEqual([]);
  });

  it('should return empty array for undefined input', () => {
    expect(normalizeTargets(undefined)).toEqual([]);
  });

  it('should return empty array for empty array input', () => {
    expect(normalizeTargets([])).toEqual([]);
  });
});

// ── normalizeScore ───────────────────────────────────────────────────
describe('normalizeScore', () => {
  it('should map snake_case fields to camelCase', () => {
    const raw = {
      player_id: 42,
      event_id: 10,
      order_number: 3,
      machine_id: 20,
      ball1: 5000,
      ball2: 8000,
      ball3: 0
    };
    const result = normalizeScore(raw);
    expect(result.playerId).toBe(42);
    expect(result.eventId).toBe(10);
    expect(result.orderNumber).toBe(3);
    expect(result.machineId).toBe(20);
  });

  it('should preserve existing camelCase fields', () => {
    const raw = { playerId: 7, eventId: 3, orderNumber: 1, machineId: 5 };
    const result = normalizeScore(raw);
    expect(result.playerId).toBe(7);
    expect(result.eventId).toBe(3);
  });

  it('should prefer camelCase over snake_case when both exist', () => {
    const raw = { playerId: 1, player_id: 99 };
    const result = normalizeScore(raw);
    expect(result.playerId).toBe(1);
  });

  it('should spread other properties through', () => {
    const raw = { playerId: 1, ball1: 100, custom: 'data' };
    const result = normalizeScore(raw);
    expect(result.custom).toBe('data');
  });
});

// ── normalizeScores ──────────────────────────────────────────────────
describe('normalizeScores', () => {
  it('should normalize an array of scores', () => {
    const arr = [
      { player_id: 1, event_id: 10, order_number: 1, machine_id: 5 },
      { player_id: 2, event_id: 10, order_number: 2, machine_id: 5 }
    ];
    const result = normalizeScores(arr);
    expect(result).toHaveLength(2);
    expect(result[0].playerId).toBe(1);
    expect(result[1].orderNumber).toBe(2);
  });

  it('should return empty array for null input', () => {
    expect(normalizeScores(null)).toEqual([]);
  });

  it('should return empty array for undefined input', () => {
    expect(normalizeScores(undefined)).toEqual([]);
  });
});

// ── groupTargetsByEvent ──────────────────────────────────────────────
describe('groupTargetsByEvent', () => {
  it('should group targets by eventId', () => {
    const targets = [
      { eventId: 1, machineName: 'A' },
      { eventId: 1, machineName: 'B' },
      { eventId: 2, machineName: 'C' }
    ];
    const result = groupTargetsByEvent(targets);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result[1]).toHaveLength(2);
    expect(result[2]).toHaveLength(1);
    expect(result[1][0].machineName).toBe('A');
  });

  it('should return empty object for null input', () => {
    expect(groupTargetsByEvent(null)).toEqual({});
  });

  it('should return empty object for undefined input', () => {
    expect(groupTargetsByEvent(undefined)).toEqual({});
  });

  it('should return empty object for empty array', () => {
    expect(groupTargetsByEvent([])).toEqual({});
  });

  it('should handle single target', () => {
    const result = groupTargetsByEvent([{ eventId: 5, machineName: 'X' }]);
    expect(result[5]).toHaveLength(1);
  });
});

// ── groupScoresByEventAndPlayer ──────────────────────────────────────
describe('groupScoresByEventAndPlayer', () => {
  it('should group scores by eventId then playerId', () => {
    const scores = [
      { eventId: 1, playerId: 10, ball1: 100 },
      { eventId: 1, playerId: 10, ball1: 200 },
      { eventId: 1, playerId: 20, ball1: 300 },
      { eventId: 2, playerId: 10, ball1: 400 }
    ];
    const result = groupScoresByEventAndPlayer(scores);
    expect(result[1][10]).toHaveLength(2);
    expect(result[1][20]).toHaveLength(1);
    expect(result[2][10]).toHaveLength(1);
  });

  it('should return empty object for null input', () => {
    expect(groupScoresByEventAndPlayer(null)).toEqual({});
  });

  it('should return empty object for undefined input', () => {
    expect(groupScoresByEventAndPlayer(undefined)).toEqual({});
  });

  it('should handle scores across multiple events and players', () => {
    const scores = [
      { eventId: 'a', playerId: 'p1', ball1: 1 },
      { eventId: 'b', playerId: 'p2', ball1: 2 }
    ];
    const result = groupScoresByEventAndPlayer(scores);
    expect(result.a.p1).toHaveLength(1);
    expect(result.b.p2).toHaveLength(1);
  });
});

// ── groupScoresByPlayer ──────────────────────────────────────────────
describe('groupScoresByPlayer', () => {
  it('should group scores by playerId', () => {
    const scores = [
      { playerId: 1, ball1: 100 },
      { playerId: 1, ball1: 200 },
      { playerId: 2, ball1: 300 }
    ];
    const result = groupScoresByPlayer(scores);
    expect(result[1]).toHaveLength(2);
    expect(result[2]).toHaveLength(1);
  });

  it('should return empty object for null input', () => {
    expect(groupScoresByPlayer(null)).toEqual({});
  });

  it('should return empty object for undefined input', () => {
    expect(groupScoresByPlayer(undefined)).toEqual({});
  });
});

// ── buildScoreMapFromRows ────────────────────────────────────────────
describe('buildScoreMapFromRows', () => {
  it('should build a score map from row data with string keys', () => {
    const rows = [
      { orderNumber: 1, ball1: 5000, ball2: 8000, ball3: 0 },
      { orderNumber: 2, ball1: 3000, ball2: 6000, ball3: 9000 }
    ];
    const result = buildScoreMapFromRows(rows);
    // Keys are String(orderNumber)
    expect(result['1']).toEqual({ ball1: 5000, ball2: 8000, ball3: 0 });
    expect(result['2']).toEqual({ ball1: 3000, ball2: 6000, ball3: 9000 });
  });

  it('should coerce ball values to numbers', () => {
    const rows = [
      { orderNumber: 1, ball1: '5000', ball2: '8000', ball3: '0' }
    ];
    const result = buildScoreMapFromRows(rows);
    expect(result['1'].ball1).toBe(5000);
    expect(result['1'].ball2).toBe(8000);
    expect(result['1'].ball3).toBe(0);
  });

  it('should return empty object for null input', () => {
    expect(buildScoreMapFromRows(null)).toEqual({});
  });

  it('should return empty object for undefined input', () => {
    expect(buildScoreMapFromRows(undefined)).toEqual({});
  });

  it('should return empty object for empty array', () => {
    expect(buildScoreMapFromRows([])).toEqual({});
  });

  it('should handle missing ball fields as NaN', () => {
    const rows = [{ orderNumber: 1 }];
    const result = buildScoreMapFromRows(rows);
    // Number(undefined) → NaN
    expect(result['1'].ball1).toBeNaN();
  });
});

// ── buildScoreMapFromDOM ─────────────────────────────────────────────
describe('buildScoreMapFromDOM', () => {
  it('should return empty object for null container', () => {
    expect(buildScoreMapFromDOM(null)).toEqual({});
  });

  it('should return empty object for undefined container', () => {
    expect(buildScoreMapFromDOM(undefined)).toEqual({});
  });

  it('should build score map from DOM elements', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="round-row" data-order-number="1">
        <input data-ball="1" value="5000" />
        <input data-ball="2" value="8000" />
        <input data-ball="3" value="0" />
      </div>
      <div class="round-row" data-order-number="2">
        <input data-ball="1" value="3000" />
        <input data-ball="2" value="6000" />
        <input data-ball="3" value="9000" />
      </div>
    `;
    const result = buildScoreMapFromDOM(container);
    expect(result[1]).toEqual({ ball1: 5000, ball2: 8000, ball3: 0 });
    expect(result[2]).toEqual({ ball1: 3000, ball2: 6000, ball3: 9000 });
  });

  it('should strip non-numeric characters from input values', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="round-row" data-order-number="1">
        <input data-ball="1" value="5,000" />
        <input data-ball="2" value="8k" />
        <input data-ball="3" value="abc" />
      </div>
    `;
    const result = buildScoreMapFromDOM(container);
    expect(result[1].ball1).toBe(5000);
    expect(result[1].ball2).toBe(8);
    expect(result[1].ball3).toBe(0);
  });

  it('should default to 0 when ball input elements are missing', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="round-row" data-order-number="1">
        <input data-ball="1" value="5000" />
      </div>
    `;
    const result = buildScoreMapFromDOM(container);
    expect(result[1].ball1).toBe(5000);
    expect(result[1].ball2).toBe(0);
    expect(result[1].ball3).toBe(0);
  });

  it('should return empty object when no round-row elements exist', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>No rounds here</p>';
    const result = buildScoreMapFromDOM(container);
    expect(result).toEqual({});
  });

  it('should handle empty input values as 0', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="round-row" data-order-number="3">
        <input data-ball="1" value="" />
        <input data-ball="2" value="" />
        <input data-ball="3" value="" />
      </div>
    `;
    const result = buildScoreMapFromDOM(container);
    expect(result[3]).toEqual({ ball1: 0, ball2: 0, ball3: 0 });
  });
});
