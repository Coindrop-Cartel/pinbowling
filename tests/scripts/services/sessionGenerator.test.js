/** @vitest-environment jsdom */
import { vi, describe, it, expect } from 'vitest';
import {
  generatePars,
  generateSessionName,
  selectRandomMachines,
  getTargetScoreForDifficulty
} from '@services/sessionGenerator.js';

// ── generatePars ─────────────────────────────────────────────────────
describe('generatePars', () => {
  it('should return empty array for non-golf format', () => {
    expect(generatePars('bowling', 10)).toEqual([]);
    expect(generatePars('other', 18)).toEqual([]);
    expect(generatePars('', 9)).toEqual([]);
  });

  it('should return array of correct length for golf', () => {
    expect(generatePars('golf', 9)).toHaveLength(9);
    expect(generatePars('golf', 18)).toHaveLength(18);
    expect(generatePars('golf', 3)).toHaveLength(3);
  });

  it('should guarantee at least one par 3, 4, and 5', () => {
    const pars = generatePars('golf', 18);
    expect(pars.filter(p => p === 3).length).toBeGreaterThanOrEqual(1);
    expect(pars.filter(p => p === 4).length).toBeGreaterThanOrEqual(1);
    expect(pars.filter(p => p === 5).length).toBeGreaterThanOrEqual(1);
  });

  it('should only contain par values 3, 4, or 5', () => {
    const pars = generatePars('golf', 18);
    pars.forEach(p => {
      expect(p).toBeGreaterThanOrEqual(3);
      expect(p).toBeLessThanOrEqual(5);
    });
  });

  it('should handle frameCount of 3 (minimum with guarantees)', () => {
    const pars = generatePars('golf', 3);
    expect(pars).toHaveLength(3);
    // Should contain exactly one of each
    expect(pars).toContain(3);
    expect(pars).toContain(4);
    expect(pars).toContain(5);
  });

  it('should produce different orders on multiple calls (randomness)', () => {
    // Run multiple times and check that not all results are identical
    const results = new Set();
    for (let i = 0; i < 20; i++) {
      results.add(generatePars('golf', 9).join(','));
    }
    // With shuffling, it's extremely unlikely all 20 are identical
    expect(results.size).toBeGreaterThan(1);
  });
});

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

  it('should return 1000000 fallback for unknown difficulty', () => {
    expect(getTargetScoreForDifficulty(machine, 'extreme')).toBe(1000000);
  });

  it('should return 1000000 fallback when machine lacks the property', () => {
    const partial = { targetEasy: 5000 };
    expect(getTargetScoreForDifficulty(partial, 'hard')).toBe(1000000);
  });

  it('should return 1000000 for empty difficulty string', () => {
    expect(getTargetScoreForDifficulty(machine, '')).toBe(1000000);
  });

  it('should handle difficulty with mixed case key construction', () => {
    // 'easy' → 'target' + 'E' + 'asy' = 'targetEasy'
    expect(getTargetScoreForDifficulty(machine, 'easy')).toBe(machine.targetEasy);
  });
});
