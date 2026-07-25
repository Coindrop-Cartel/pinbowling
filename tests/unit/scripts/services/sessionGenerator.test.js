/** @vitest-environment jsdom */
import { vi, describe, it, expect } from 'vitest';
import {
  generateSessionName,
  selectRandomMachines,
  getTargetScoreForDifficulty
} from '@services/sessionGenerator.js';

// ── generateSessionName ──────────────────────────────────────────────
describe('generateSessionName', () => {
  it('should use custom name when provided', () => {
    const result = generateSessionName('My Event', 'Main St', '2024-01-15', '6:00 PM');
    expect(result).toBe('My Event - Main St - 2024-01-15 - 6:00 PM');
  });

  it('should omit custom name when empty string', () => {
    const result = generateSessionName('', 'Main St', '2024-01-15', '6:00 PM');
    expect(result).toBe('Main St - 2024-01-15 - 6:00 PM');
  });

  it('should omit custom name when null', () => {
    const result = generateSessionName(null, 'Downtown', '2024-06-01', '7:30 PM');
    expect(result).toBe('Downtown - 2024-06-01 - 7:30 PM');
  });

  it('should omit custom name when undefined', () => {
    const result = generateSessionName(undefined, 'Arcade', '2024-12-25', '12:00 PM');
    expect(result).toBe('Arcade - 2024-12-25 - 12:00 PM');
  });

  it('should handle all empty parts gracefully', () => {
    const result = generateSessionName('', '', '', '');
    expect(result).toBe(' -  - ');
  });
});

// ── selectRandomMachines ─────────────────────────────────────────────
describe('selectRandomMachines', () => {
  const machines = [
    { id: 1, name: 'Machine A' },
    { id: 2, name: 'Machine B' },
    { id: 3, name: 'Machine C' },
    { id: 4, name: 'Machine D' },
    { id: 5, name: 'Machine E' }
  ];

  it('should return the requested count of machines', () => {
    const result = selectRandomMachines(machines, 3);
    expect(result).toHaveLength(3);
  });

  it('should return all machines when count equals pool size', () => {
    const result = selectRandomMachines(machines, 5);
    expect(result).toHaveLength(5);
    const ids = result.map(m => m.id).sort();
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it('should return fewer machines when count is less than pool', () => {
    const result = selectRandomMachines(machines, 2);
    expect(result).toHaveLength(2);
    // Each should be from the original pool
    result.forEach(m => {
      expect(machines).toContainEqual(expect.objectContaining({ id: m.id }));
    });
  });

  it('should fill with duplicates when pool is smaller than count', () => {
    const smallPool = [{ id: 1, name: 'Only' }];
    const result = selectRandomMachines(smallPool, 5);
    expect(result).toHaveLength(5);
    result.forEach(m => {
      expect(m.id).toBe(1);
    });
  });

  it('should return empty array when count is 0', () => {
    const result = selectRandomMachines(machines, 0);
    expect(result).toHaveLength(0);
  });

  it('should not mutate the original machines array', () => {
    const original = [...machines];
    selectRandomMachines(machines, 3);
    expect(machines).toEqual(original);
  });
});

// ── getTargetScoreForDifficulty ──────────────────────────────────────
describe('getTargetScoreForDifficulty', () => {
  const machine = {
    targetEasy: 5000,
    targetMed: 10000,
    targetHard: 20000
  };

  it('should return targetEasy for difficulty "easy"', () => {
    expect(getTargetScoreForDifficulty(machine, 'easy')).toBe(5000);
  });

  it('should return targetMed for difficulty "med"', () => {
    expect(getTargetScoreForDifficulty(machine, 'med')).toBe(10000);
  });

  it('should return targetHard for difficulty "hard"', () => {
    expect(getTargetScoreForDifficulty(machine, 'hard')).toBe(20000);
  });

  it('should return 50M fallback for unknown difficulty in bowling', () => {
    expect(getTargetScoreForDifficulty(machine, 'extreme')).toBe(50000000);
  });

  it('should return 100M hard fallback when machine lacks hard target in bowling', () => {
    const partial = { targetEasy: 5000 };
    expect(getTargetScoreForDifficulty(partial, 'hard')).toBe(100000000);
  });

  it('should default to "med" target (10000) when difficulty string is empty', () => {
    expect(getTargetScoreForDifficulty(machine, '')).toBe(10000);
  });

  it('should handle difficulty with mixed case key construction', () => {
    expect(getTargetScoreForDifficulty(machine, 'easy')).toBe(machine.targetEasy);
  });

  it('should prioritize location target for requested format (level 1)', () => {
    const m = {
      scores: {
        baseball: { targetMed: 4000000 },
        bowling: { targetMed: 40000000 }
      }
    };
    expect(getTargetScoreForDifficulty(m, 'med', 'baseball')).toBe(4000000);
    expect(getTargetScoreForDifficulty(m, 'med', 'bowling')).toBe(40000000);
  });

  it('should prioritize master machine target for requested format (level 2)', () => {
    const m = {
      masterScores: {
        baseball: { targetMed: 6000000 }
      }
    };
    expect(getTargetScoreForDifficulty(m, 'med', 'baseball')).toBe(6000000);
  });

  it('should perform cross-format conversion for baseball (/10) when no baseball target exists (level 3)', () => {
    const m = {
      scores: {
        bowling: { targetMed: 50000000 }
      }
    };
    // 50,000,000 / 10 = 5,000,000
    expect(getTargetScoreForDifficulty(m, 'med', 'baseball')).toBe(5000000);
  });

  it('should check bowling before baseball for golf, returning 1:1 for bowling target', () => {
    const m = {
      scores: {
        bowling: { targetMed: 25000000 },
        baseball: { targetMed: 4000000 }
      }
    };
    // For golf, checks bowling first -> 25,000,000 (1:1) instead of baseball (4,000,000 * 10 = 40,000,000)
    expect(getTargetScoreForDifficulty(m, 'med', 'golf')).toBe(25000000);
  });

  it('should check golf before baseball for bowling, returning 1:1 for golf target', () => {
    const m = {
      scores: {
        golf: { targetMed: 30000000 },
        baseball: { targetMed: 4000000 }
      }
    };
    // For bowling, checks golf first -> 30,000,000 (1:1) instead of baseball
    expect(getTargetScoreForDifficulty(m, 'med', 'bowling')).toBe(30000000);
  });

  it('should fall back to baseball (*10) for golf/bowling when neither golf nor bowling targets exist', () => {
    const m = {
      scores: {
        baseball: { targetMed: 4000000 }
      }
    };
    // 4,000,000 * 10 = 40,000,000
    expect(getTargetScoreForDifficulty(m, 'med', 'golf')).toBe(40000000);
    expect(getTargetScoreForDifficulty(m, 'med', 'bowling')).toBe(40000000);
  });

  it('should fall back to format default (5M baseball, 50M golf/bowling) when no targets exist (level 4)', () => {
    const emptyMachine = {};
    expect(getTargetScoreForDifficulty(emptyMachine, 'med', 'baseball')).toBe(5000000);
    expect(getTargetScoreForDifficulty(emptyMachine, 'med', 'golf')).toBe(50000000);
    expect(getTargetScoreForDifficulty(emptyMachine, 'med', 'bowling')).toBe(50000000);
  });
});
