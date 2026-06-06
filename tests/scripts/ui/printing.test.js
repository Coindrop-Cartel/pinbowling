/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { printMachineScores, printBlankScoreSheet } from '@ui/printing.js';

// Mock engine and scoring labels
const mockEngine = {
  getBonusTargets: vi.fn(() => ({ t1: 13000, t2: 16900 })),
  getRoundLabel: vi.fn(() => 'Frame'),
  getScoringHint: vi.fn(() => 'Hint'),
  getLastFrameHint: vi.fn(() => 'Last Hint'),
};

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => mockEngine),
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
      printBlankScoreSheet(machines);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockPrintWindow.document.write).toHaveBeenCalled();
      const html = mockPrintWindow.document.write.mock.calls[0][0];
      expect(html).toContain('Frame 1');
      expect(html).toContain('Game: <strong>Machine A</strong>');
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
});