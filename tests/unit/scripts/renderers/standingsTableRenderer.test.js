/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { computeRanks, renderStandingsTable } from '../../../../scripts/renderers/standingsTableRenderer.js';

describe('standingsTableRenderer', () => {
  describe('computeRanks', () => {
    it('returns empty array when given empty items', () => {
      const ranks = computeRanks([], () => false);
      expect(ranks).toEqual([]);
    });

    it('assigns rank 1 to single item', () => {
      const items = [{ score: 100 }];
      const ranks = computeRanks(items, (a, b) => a.score === b.score);
      expect(ranks).toEqual([1]);
    });

    it('assigns sequential rank numbers when there are no ties', () => {
      const items = [{ score: 100 }, { score: 90 }, { score: 80 }, { score: 70 }];
      const ranks = computeRanks(items, (a, b) => a.score === b.score);
      expect(ranks).toEqual([1, 2, 3, 4]);
    });

    it('assigns tied ranks and skips next rank for two-way tie', () => {
      const items = [{ score: 100 }, { score: 90 }, { score: 90 }, { score: 70 }];
      const ranks = computeRanks(items, (a, b) => a.score === b.score);
      expect(ranks).toEqual([1, 2, 2, 4]);
    });

    it('assigns tied ranks and skips next ranks for three-way tie at rank 1', () => {
      const items = [{ score: 100 }, { score: 100 }, { score: 100 }, { score: 70 }];
      const ranks = computeRanks(items, (a, b) => a.score === b.score);
      expect(ranks).toEqual([1, 1, 1, 4]);
    });

    it('assigns rank 1 to all items when all are tied', () => {
      const items = [{ score: 50 }, { score: 50 }, { score: 50 }, { score: 50 }];
      const ranks = computeRanks(items, (a, b) => a.score === b.score);
      expect(ranks).toEqual([1, 1, 1, 1]);
    });

    it('handles multiple separate ties correctly', () => {
      const items = [
        { score: 100 }, { score: 100 }, // tied for 1st
        { score: 80 },                  // 3rd
        { score: 70 }, { score: 70 }   // tied for 4th
      ];
      const ranks = computeRanks(items, (a, b) => a.score === b.score);
      expect(ranks).toEqual([1, 1, 3, 4, 4]);
    });
  });

  describe('renderStandingsTable', () => {
    it('renders weekly H2H standings table with score displays and correct ranks', () => {
      const headerEl = document.createElement('thead');
      const bodyEl = document.createElement('tbody');

      const rows = [
        { player: { id: 1, playerName: 'Andrew Spillios' }, total: 5, result: 'Win', hasScores: true },
        { player: { id: 2, playerName: 'Adam Bowman' }, total: 4, result: 'Win', hasScores: true },
        { player: { id: 3, playerName: 'Kyle Voorhees' }, total: 3, result: 'Loss', hasScores: true },
        { player: { id: 4, playerName: 'Adam Yates' }, total: 2, result: 'Loss', hasScores: true }
      ];

      const head2headRecordsMap = {
        1: { wins: 1, losses: 0, ties: 0, winRate: 1.0, scoreDiff: 3, totalScore: 5, headToHead: {} },
        2: { wins: 1, losses: 0, ties: 0, winRate: 1.0, scoreDiff: 1, totalScore: 4, headToHead: {} },
        3: { wins: 0, losses: 1, ties: 0, winRate: 0.0, scoreDiff: -1, totalScore: 3, headToHead: {} },
        4: { wins: 0, losses: 1, ties: 0, winRate: 0.0, scoreDiff: -3, totalScore: 2, headToHead: {} }
      };

      const matchupScoreMap = {
        1: '5-2',
        2: '4-3',
        3: '3-4',
        4: '2-5'
      };

      const engine = {
        sortStandings: (r) => r,
        isTie: (a, b, opts) => {
          const recA = opts.head2headRecordsMap[a.player.id];
          const recB = opts.head2headRecordsMap[b.player.id];
          return recA.winRate === recB.winRate && recA.scoreDiff === recB.scoreDiff;
        }
      };

      renderStandingsTable({
        headerEl,
        bodyEl,
        isSummary: false,
        league: { participationType: 'individual' },
        event: {},
        isTeamLeague: false,
        rows,
        columns: [],
        engine,
        supportsMatchups: true,
        head2headRecordsMap,
        matchupScoreMap
      });

      const rowsText = Array.from(bodyEl.querySelectorAll('tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
      );

      // Verify row 1: Rank 1, Andrew Spillios, Win, Score 5-2, Record 1-0
      expect(rowsText[0]).toEqual(['1', 'Andrew Spillios', 'Win', '5-2', '1-0']);
      // Verify row 2: Rank 2, Adam Bowman, Win, Score 4-3, Record 1-0
      expect(rowsText[1]).toEqual(['2', 'Adam Bowman', 'Win', '4-3', '1-0']);
      // Verify row 3: Rank 3, Kyle Voorhees, Loss, Score 3-4, Record 0-1
      expect(rowsText[2]).toEqual(['3', 'Kyle Voorhees', 'Loss', '3-4', '0-1']);
      // Verify row 4: Rank 4, Adam Yates, Loss, Score 2-5, Record 0-1
      expect(rowsText[3]).toEqual(['4', 'Adam Yates', 'Loss', '2-5', '0-1']);
    });

    it('renders Golf Skins standings table with per-hole scores and total skins ranking', () => {
      const headerEl = document.createElement('thead');
      const bodyEl = document.createElement('tbody');

      const rows = [
        { player: { id: 1, playerName: 'Kyle Voorhees' } },
        { player: { id: 2, playerName: 'Adam Bowman' } }
      ];

      const columns = [
        { orderNumber: 1, machineName: 'Hole 1' },
        { orderNumber: 2, machineName: 'Hole 2' }
      ];

      const scoresByPlayer = {
        1: [ { orderNumber: 1, ball1: 3 }, { orderNumber: 2, ball1: 2 } ],
        2: [ { orderNumber: 1, ball1: 3 }, { orderNumber: 2, ball1: 4 } ]
      };

      const engine = {
        config: { format: 'golf_skins' },
        calculateSkinsResults: () => ({
          holeResults: [
            { orderNumber: 1, winnerId: null, skinsAwarded: 0, carryover: 1, tied: true, strokes: { 1: 3, 2: 3 } },
            { orderNumber: 2, winnerId: 1, skinsAwarded: 2, carryover: 0, tied: false, strokes: { 1: 2, 2: 4 } }
          ],
          skinsWon: { 1: 2, 2: 0 },
          totalStrokes: { 1: 5, 2: 7 }
        })
      };

      renderStandingsTable({
        headerEl,
        bodyEl,
        isSummary: false,
        league: { participationType: 'individual', scoringFormat: 'golf_skins' },
        event: { scoringFormat: 'golf_skins' },
        isTeamLeague: false,
        rows,
        columns,
        engine,
        supportsMatchups: true,
        scoresByPlayer
      });

      const headerText = Array.from(headerEl.querySelectorAll('th')).map(th => th.textContent.trim());
      expect(headerText).toEqual(['#', 'Player', 'Hole 1', 'Hole 2', 'Total']);

      const rowsText = Array.from(bodyEl.querySelectorAll('tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
      );

      // Rank 1: Kyle Voorhees with 2 Skins (Hole 1: 3 (-), Hole 2: 2 (+2))
      expect(rowsText[0][0]).toBe('1');
      expect(rowsText[0][1]).toBe('Kyle Voorhees');
      expect(rowsText[0][2]).toContain('3 (-)');
      expect(rowsText[0][3]).toContain('2 (+2)');
      expect(rowsText[0][4]).toBe('2 Skins');

      // Rank 2: Adam Bowman with 0 Skins (Hole 1: 3 (-), Hole 2: 4)
      expect(rowsText[1][0]).toBe('2');
      expect(rowsText[1][1]).toBe('Adam Bowman');
      expect(rowsText[1][2]).toContain('3 (-)');
      expect(rowsText[1][3]).toBe('4');
      expect(rowsText[1][4]).toBe('0 Skins');
    });
  });
});
