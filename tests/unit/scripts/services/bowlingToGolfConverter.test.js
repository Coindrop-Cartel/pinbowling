/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { 
  convertBowlingToGolf, 
  convertAllBowlingToGolf, 
  calculateRawGolfTotal, 
  GOLF_CONVERSION_PAR 
} from '@services/bowlingToGolfConverter.js';

/**
 * Helper to create a bowling turn result for regular frames.
 */
function makeTurn(orderNumber, type, mark, first = 0, second = 0, third = 0, score = null) {
  const pinCount = score !== null ? score : (first + second + third);
  return {
    orderNumber,
    machineName: `Machine ${orderNumber}`,
    type,
    mark,
    first,
    second,
    third,
    score: pinCount,
    played: true,
    displayMark: mark
  };
}

/**
 * Helper to create N machines.
 */
function makeMachines(count = 10) {
  return Array.from({ length: count }, (_, i) => ({
    orderNumber: i + 1,
    machineName: `Machine ${i + 1}`,
    value2: 3
  }));
}

/**
 * Helper to create a mock player row for testing.
 */
function makeRow(player, bowlingTotal, turns = []) {
  const defaultTurns = Array.from({ length: 10 }, (_, i) => makeTurn(i + 1, 'open', '7 2', 7, 2, 0, 9));
  return {
    player: typeof player === 'string' ? { playerName: player } : player,
    bowlingTotal,
    total: bowlingTotal,
    turnResults: turns.length > 0 ? turns : defaultTurns,
    hasScores: true
  };
}

describe('bowlingToGolfConverter', () => {
  describe('GOLF_CONVERSION_PAR', () => {
    it('should be 4', () => {
      expect(GOLF_CONVERSION_PAR).toBe(4);
    });
  });

  describe('calculateRawGolfTotal', () => {
    it('maps 200 bowling score to 40 (Even Par)', () => {
      expect(calculateRawGolfTotal(200)).toBe(40);
    });

    it('maps 300 bowling score to 10 (10 Aces)', () => {
      expect(calculateRawGolfTotal(300)).toBe(10);
    });

    it('maps 0 bowling score to 100 (10 per hole)', () => {
      expect(calculateRawGolfTotal(0)).toBe(100);
    });

    it('maps intermediate scores linearly', () => {
      // 100 pins -> 100 - 30 = 70
      expect(calculateRawGolfTotal(100)).toBe(70);
    });
  });

  describe('convertAllBowlingToGolf monotonic rank preservation', () => {
    it('strictly preserves relative standings order across players', () => {
      const rows = [
        makeRow('Player Low', 82),
        makeRow('Player High', 216),
        makeRow('Player Mid', 132)
      ];
      const machines = makeMachines(10);

      convertAllBowlingToGolf(rows, machines);

      const high = rows.find(r => r.player.playerName === 'Player High');
      const mid = rows.find(r => r.player.playerName === 'Player Mid');
      const low = rows.find(r => r.player.playerName === 'Player Low');

      // Higher bowling score MUST result in strictly lower (better) golf strokes
      expect(high.total).toBeLessThan(mid.total);
      expect(mid.total).toBeLessThan(low.total);
    });

    it('preserves exact ties in bowling score as tied golf total', () => {
      const rows = [
        makeRow('Player A', 95),
        makeRow('Player B', 95),
        makeRow('Player C', 120)
      ];
      const machines = makeMachines(10);

      convertAllBowlingToGolf(rows, machines);

      const a = rows.find(r => r.player.playerName === 'Player A');
      const b = rows.find(r => r.player.playerName === 'Player B');
      const c = rows.find(r => r.player.playerName === 'Player C');

      expect(c.total).toBeLessThan(a.total);
      expect(a.total).toBe(b.total); // Tied!
    });

    it('guarantees per-frame strokes sum to total strokes pool exactly', () => {
      const row = makeRow('Test Player', 163);
      const machines = makeMachines(10);

      convertAllBowlingToGolf([row], machines);

      const frameSum = row.turnResults.reduce((sum, t) => sum + t.score, 0);
      expect(frameSum).toBe(row.total);
    });

    it('allocates fewer strokes to strikes than open frames', () => {
      const turns = [
        makeTurn(1, 'strike', 'X', 10, 0, 0, 10),
        makeTurn(2, 'open', '0 0', 0, 0, 0, 0),
        ...Array.from({ length: 8 }, (_, i) => makeTurn(i + 3, 'open', '5 3', 5, 3, 0, 8))
      ];
      const row = makeRow('Test Player', 150, turns);
      const machines = makeMachines(10);

      convertAllBowlingToGolf([row], machines);

      const strikeFrame = row.turnResults[0].score;
      const gutterFrame = row.turnResults[1].score;

      expect(strikeFrame).toBeLessThan(gutterFrame);
    });
  });

  describe('Verification with User Sample Data', () => {
    it('preserves exact 1-12 standings order for the provided user dataset', () => {
      const dataset = [
        makeRow('Andrew Spillios', 216),
        makeRow('Adam Bowman', 163),
        makeRow('Courtland Cain', 132),
        makeRow('Noah Clarke', 104),
        makeRow('Cailan Curtis', 102),
        makeRow('Brian Tavener', 95),
        makeRow('Laura Varney', 95),
        makeRow('Brian Dunn', 91),
        makeRow('Kyle Voorhees', 86),
        makeRow('Brendan Newman', 82),
        makeRow('Mark Lathrop', 72),
        makeRow('Zachary Hiller', 44)
      ];

      const machines = makeMachines(10);
      convertAllBowlingToGolf(dataset, machines);

      // Sort converted rows by Golf strokes ascending (best to worst)
      const sortedGolf = [...dataset].sort((a, b) => a.total - b.total);

      // Player names in order of Golf performance
      const convertedNames = sortedGolf.map(r => r.player.playerName);

      // Verify Andrew #1, Adam #2, Courtland #3, Noah #4, Cailan #5
      expect(convertedNames[0]).toBe('Andrew Spillios');
      expect(convertedNames[1]).toBe('Adam Bowman');
      expect(convertedNames[2]).toBe('Courtland Cain');
      expect(convertedNames[3]).toBe('Noah Clarke');
      expect(convertedNames[4]).toBe('Cailan Curtis');

      // Verify Brian Tavener and Laura Varney are tied at #6
      const brianT = dataset.find(r => r.player.playerName === 'Brian Tavener');
      const lauraV = dataset.find(r => r.player.playerName === 'Laura Varney');
      expect(brianT.total).toBe(lauraV.total);

      // Verify remaining order #8 through #12
      expect(dataset.find(r => r.player.playerName === 'Brian Dunn').total).toBeLessThan(
        dataset.find(r => r.player.playerName === 'Kyle Voorhees').total
      );
      expect(dataset.find(r => r.player.playerName === 'Kyle Voorhees').total).toBeLessThan(
        dataset.find(r => r.player.playerName === 'Brendan Newman').total
      );
      expect(dataset.find(r => r.player.playerName === 'Brendan Newman').total).toBeLessThan(
        dataset.find(r => r.player.playerName === 'Mark Lathrop').total
      );
      expect(dataset.find(r => r.player.playerName === 'Mark Lathrop').total).toBeLessThan(
        dataset.find(r => r.player.playerName === 'Zachary Hiller').total
      );
    });
  });

  describe('convertBowlingToGolf single-player helper fallback', () => {
    it('returns valid converted results object for a single player', () => {
      const turns = Array.from({ length: 10 }, (_, i) => makeTurn(i + 1, 'strike', 'X', 10, 0, 0, 10));
      const machines = makeMachines(10);

      const result = convertBowlingToGolf(turns, machines);

      expect(result.total).toBeDefined();
      expect(result.totalDisplay).toContain('(');
      expect(result.turnResults.length).toBe(10);
    });
  });
});
