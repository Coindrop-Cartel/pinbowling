/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { printMachineScores, printBlankScoreSheet, printScoreSheet, printSeasonResults } from '@ui/printing.js'; // Import actual functions

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    getPrintTargetSummaryHtml: () => '<div>Strike: <strong>10,000</strong></div>',
    getScoringHint: () => '',
    getLastFrameHint: () => '',
    getRoundLabel: () => 'Frame',
    getBonusTargets: () => ({ t1: 13000, t2: 16900 }),
    calculateTurnResults: () => ({ total: 100, turnResults: [] }),
    compareScores: (a, b) => b - a,
    formatTotalScore: (score) => String(score),
    getMatchupDescription: () => ({ description: '', details: [] }),
    buildPlayerScoreMap: () => ({ isPlayer1: true, opponent: {} })
  })),
}));

// Mock utils.js to provide escapeHTML
vi.mock('@scripts/utils.js', () => ({
  formatNumber: vi.fn(n => n?.toLocaleString() || '0'),
  escapeHTML: vi.fn(str => str)
}));

describe('Printing Utilities (printing.js)', () => {
  let mockPrintWindow;

  beforeEach(() => {
    mockPrintWindow = {
      document: {
        write: vi.fn(),
        close: vi.fn(),
      },
      print: vi.fn(),
      close: vi.fn(),
    };
    
    vi.spyOn(window, 'open').mockReturnValue(mockPrintWindow);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('printMachineScores', () => {
    it('should open a new window and write machine scores HTML', () => {
      const machines = [
        { id: 1, machineName: 'Machine A', orderNumber: 1, values: { 10: 10000, 1: 1000 } },
        { id: 2, machineName: 'Machine B', orderNumber: 2, values: { 10: 20000, 1: 2000 } },
      ];
      printMachineScores(machines);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockPrintWindow.document.write).toHaveBeenCalled();
      const html = mockPrintWindow.document.write.mock.calls[0][0];
      expect(html).toContain('Machine A');
      expect(html).toContain('Machine B');
      expect(html).toContain('Frame 1');
      expect(html).toContain('Frame 2');
      expect(html).toContain('10,000'); 
      expect(html).toContain('20,000');
    });

    it('should include bonus targets for the last machine', () => {
      const machines = [
        { id: 1, machineName: 'Machine A', orderNumber: 1, values: { 10: 10000, 1: 1000 } },
      ];
      printMachineScores(machines);
      const html = mockPrintWindow.document.write.mock.calls[0][0];
      expect(html).toContain('Target 1: 13,000');
      expect(html).toContain('Target 2: 16,900');
    });

    it('should call print and close after a timeout', async () => {
      printMachineScores([]);
      vi.advanceTimersByTime(250);
      expect(mockPrintWindow.print).toHaveBeenCalledTimes(1);
      expect(mockPrintWindow.close).toHaveBeenCalledTimes(1);
    });

    it('should alert if window.open fails', () => {
      window.open.mockReturnValue(null);
      printMachineScores([]);
      expect(window.alert).toHaveBeenCalledWith('Please allow popups to print.');
    });
  });

  describe('printBlankScoreSheet', () => {
    it('should open a new window and write blank score sheet HTML', () => {
      const machines = [
        { id: 1, machineName: 'Machine A', orderNumber: 1, values: { 10: 10000 } },
      ];
      printBlankScoreSheet(machines, 'Test League', 'Test Event');
      
      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockPrintWindow.document.write).toHaveBeenCalled();
      const html = mockPrintWindow.document.write.mock.calls[0][0];
      expect(html).toContain('Test League');
      expect(html).toContain('Test Event');
      expect(html).toContain('Frame 1: Machine A');
      expect(html).toContain('Strike: <strong>10,000</strong>');
      expect(html).toContain('Ball 1');
      expect(html).toContain('Ball 2');
      expect(html).toContain('Ball 3');
    });

    it('should call print and close after a timeout', async () => {
      printBlankScoreSheet([]);
      vi.advanceTimersByTime(250);
      expect(mockPrintWindow.print).toHaveBeenCalledTimes(1);
      expect(mockPrintWindow.close).toHaveBeenCalledTimes(1);
    });

    it('should alert if window.open fails', () => {
      window.open.mockReturnValue(null);
      printBlankScoreSheet([]);
      expect(window.alert).toHaveBeenCalledWith('Please allow popups to print.');
    });
  });

  describe('printScoreSheet', () => {
    it('should open a new window, write score sheet with filled scores, and include results', () => {
      const machines = [
        { id: 1, machineName: 'Machine A', orderNumber: 1, values: { 10: 10000 } },
      ];
      const player = { playerName: 'John Doe' };
      const scoreMap = {
        '1': { ball1: 5000, ball2: 7500, ball3: 10000 }
      };
      const resultsHtml = '<div class="test-results">Inning 1 Score: 10</div>';

      printScoreSheet(machines, 'Test League', 'Test Event', 'bowling', player, scoreMap, resultsHtml);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockPrintWindow.document.write).toHaveBeenCalled();
      const html = mockPrintWindow.document.write.mock.calls[0][0];
      expect(html).toContain('Test League');
      expect(html).toContain('Test Event');
      expect(html).toContain('John Doe');
      expect(html).toContain('5,000');
      expect(html).toContain('7,500');
      expect(html).toContain('10,000');
      expect(html).toContain('test-results');
      expect(html).toContain('Inning 1 Score: 10');
    });

    it('should call print and close after a timeout', async () => {
      printScoreSheet([], 'L', 'E', 'bowling', {}, {}, '');
      vi.advanceTimersByTime(250);
      expect(mockPrintWindow.print).toHaveBeenCalledTimes(1);
      expect(mockPrintWindow.close).toHaveBeenCalledTimes(1);
    });

    it('should alert if window.open fails', () => {
      window.open.mockReturnValue(null);
      printScoreSheet([]);
      expect(window.alert).toHaveBeenCalledWith('Please allow popups to print.');
    });
  });

  describe('printSeasonResults', () => {
    it('should open a new window and write season results booklet HTML', () => {
      const league = { id: 1, name: 'My League', startDate: '2026-01-01', participants: 'individual', scoringFormat: 'bowling', seasonScoring: 'weekly', dropLowestWeeks: 1 };
      const players = [{ id: 1, playerName: 'John Doe', ifpaNumber: '12345' }];
      const events = [{ id: 101, eventName: 'Week 1', eventDate: '2026-01-08', locationId: 201 }];
      const locations = [{ id: 201, name: 'Test Pinball Hall' }];
      const allLeagueTargets = [{ id: 50, eventId: 101, machineName: 'Addams Family', orderNumber: 1, values: { 10: 10000 } }];
      const rawScores = [{ playerId: 1, eventId: 101, orderNumber: 1, ball1: 5000, ball2: 7500, ball3: 10000 }];
      const engine = {
        getPrintTargetSummaryHtml: () => '<div>Strike: 10,000</div>',
        getRoundLabel: () => 'Frame',
        calculateTurnResults: () => ({ total: 100, turnResults: [{ orderNumber: 1, machineName: 'Addams Family', displayMark: 'Strike', displayRunningTotal: '100' }] }),
        compareScores: (a, b) => b - a,
        formatTotalScore: (score) => String(score),
        getMatchupDescription: () => null,
        buildPlayerScoreMap: (_playerId, playerScores) => {
          const map = {};
          for (const s of (playerScores || [])) {
            if (s.orderNumber != null) map[`order_${s.orderNumber}`] = s;
          }
          return map;
        },
      };

      printSeasonResults(league, players, events, locations, allLeagueTargets, rawScores, engine);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockPrintWindow.document.write).toHaveBeenCalled();
      const html = mockPrintWindow.document.write.mock.calls[0][0];
      expect(html).toContain('My League');
      expect(html).toContain('John Doe');
      expect(html).toContain('12345');
      expect(html).toContain('Week 1');
      expect(html).toContain('Test Pinball Hall');
      expect(html).toContain('Addams Family');
      expect(html).toContain('Season Scoreboard');
    });

    it('should call print and close after a timeout', async () => {
      const league = { id: 1, name: 'L', participants: 'individual', scoringFormat: 'bowling' };
      printSeasonResults(league, [], [], [], [], [], {
        calculateTurnResults: () => ({ total: 0 }),
        compareScores: () => 0,
        formatTotalScore: () => '',
        getMatchupDescription: () => null,
        buildPlayerScoreMap: () => ({}),
      });
      vi.advanceTimersByTime(250);
      expect(mockPrintWindow.print).toHaveBeenCalledTimes(1);
      expect(mockPrintWindow.close).toHaveBeenCalledTimes(1);
    });

    it('should alert if window.open fails', () => {
      window.open.mockReturnValue(null);
      const league = { id: 1, name: 'L', participants: 'individual', scoringFormat: 'bowling' };
      printSeasonResults(league, [], [], [], [], [], {});
      expect(window.alert).toHaveBeenCalledWith('Please allow popups to print.');
    });

    it('should skip player scorecard if they have no scores for that week', () => {
      const league = { id: 1, name: 'My League', startDate: '2026-01-01', participants: 'individual', scoringFormat: 'bowling', seasonScoring: 'weekly', dropLowestWeeks: 1 };
      const players = [{ id: 1, playerName: 'John Doe', ifpaNumber: '12345' }, { id: 2, playerName: 'Jane Smith' }];
      const events = [{ id: 101, eventName: 'Week 1', eventDate: '2026-01-08', locationId: 201 }];
      const locations = [{ id: 201, name: 'Test Pinball Hall' }];
      const allLeagueTargets = [{ id: 50, eventId: 101, machineName: 'Addams Family', orderNumber: 1, values: { 10: 10000 } }];
      const rawScores = [{ playerId: 1, eventId: 101, orderNumber: 1, ball1: 5000, ball2: 7500, ball3: 10000 }];
      const engine = {
        getPrintTargetSummaryHtml: () => '<div>Strike: 10,000</div>',
        getRoundLabel: () => 'Frame',
        calculateTurnResults: () => ({ total: 100, turnResults: [{ orderNumber: 1, machineName: 'Addams Family', displayMark: 'Strike', displayRunningTotal: '100' }] }),
        compareScores: (a, b) => b - a,
        formatTotalScore: (score) => String(score),
        getMatchupDescription: () => null,
        buildPlayerScoreMap: (_playerId, playerScores) => {
          const map = {};
          for (const s of (playerScores || [])) {
            if (s.orderNumber != null) map[`order_${s.orderNumber}`] = s;
          }
          return map;
        },
      };

      printSeasonResults(league, players, events, locations, allLeagueTargets, rawScores, engine);

      const html = mockPrintWindow.document.write.mock.calls[0][0];
      expect(html).toContain('John Doe');
      expect(html).not.toContain('<strong>Player:</strong> Jane Smith'); // Jane Smith has no scores, so should be skipped
    });
  });
});