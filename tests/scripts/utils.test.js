/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Create a stable mock engine instance so mockReturnValue works across calls
const mockEngine = {
  buildRoundValues: vi.fn(),
  getBonusTargets: vi.fn(),
  getRoundLabel: vi.fn(),
};

// Mock getScoringEngine for renderPreview and print functions
vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => mockEngine),
}));

// Import all functions from utils.js.
// We will mock initNavigation *selectively* for tests that call it.
import * as Utils from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js'; // To check if it's called

describe('Utility Functions (utils.js)', () => {
  let originalLocation;
  let originalHistory;

  beforeEach(() => {
    originalLocation = window.location;
    originalHistory = window.history;

    // Reset URL for each test
    delete window.location;
    window.location = new URL('http://localhost/index.php');
    window.history.replaceState = vi.fn();

    // Set default mock implementations
    mockEngine.buildRoundValues.mockImplementation((s10, s1) => {
      if (s10 > 0 && s1 > 0) {
        const values = {};
        for (let rank = 1; rank <= 10; rank++) {
          values[rank] = Math.round(s1 + (s10 - s1) * ((rank - 1) / 9));
        }
        return values;
      }
      return null;
    });
    mockEngine.getBonusTargets.mockReturnValue({ t1: 13000, t2: 16900 });
    mockEngine.getRoundLabel.mockReturnValue('Frame');

    vi.clearAllMocks();
  });

  afterEach(() => {
    window.location = originalLocation;
    window.history = originalHistory;
  });

  describe('URL Parameter Management', () => {
    // Temporarily mock initNavigation for these tests as they call it
    beforeEach(() => {
      vi.spyOn(Utils, 'initNavigation').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.mocked(Utils.initNavigation).mockRestore();
    });

    it('getActiveLeagueId should return the correct leagueId from URL', () => {
      window.location = new URL('http://localhost/index.php?leagueId=123');
      expect(Utils.getActiveLeagueId()).toBe('123');
    });

    it('getActiveLeagueId should return null if leagueId is not present', () => {
      window.location = new URL('http://localhost/index.php');
      expect(Utils.getActiveLeagueId()).toBeNull();
    });

    it('setActiveLeagueId should set leagueId in URL and call initNavigation', () => {
      Utils.setActiveLeagueId('456');
      expect(window.history.replaceState).toHaveBeenCalled();
      const url = vi.mocked(window.history.replaceState).mock.calls[0][2];
      expect(url.toString()).toContain('leagueId=456');
      expect(Utils.initNavigation).toHaveBeenCalledTimes(1);
    });

    it('setActiveLeagueId should remove leagueId from URL if null is passed', () => {
      window.location = new URL('http://localhost/index.php?leagueId=123');
      Utils.setActiveLeagueId(null);
      expect(window.history.replaceState).toHaveBeenCalled();
      const url = vi.mocked(window.history.replaceState).mock.calls[0][2];
      expect(url.toString()).not.toContain('leagueId');
      expect(Utils.initNavigation).toHaveBeenCalledTimes(1);
    });

    it('getActiveEventId should return the correct eventId from URL', () => {
      window.location = new URL('http://localhost/index.php?eventId=789');
      expect(Utils.getActiveEventId()).toBe('789');
    });

    it('setActiveEventId should set eventId in URL and call initNavigation', () => {
      Utils.setActiveEventId('101');
      expect(window.history.replaceState).toHaveBeenCalled();
      const url = vi.mocked(window.history.replaceState).mock.calls[0][2];
      expect(url.toString()).toContain('eventId=101');
      expect(Utils.initNavigation).toHaveBeenCalledTimes(1);
    });

    it('getCurrentPlayerId should return the correct playerId from URL', () => {
      window.location = new URL('http://localhost/index.php?playerId=55');
      expect(Utils.getCurrentPlayerId()).toBe('55');
    });

    it('setCurrentPlayerId should set playerId in URL and call initNavigation', () => {
      Utils.setCurrentPlayerId('66');
      expect(window.history.replaceState).toHaveBeenCalled();
      const url = vi.mocked(window.history.replaceState).mock.calls[0][2];
      expect(url.toString()).toContain('playerId=66');
      expect(Utils.initNavigation).toHaveBeenCalledTimes(1);
    });
  });

  describe('formatNumber', () => {
    it('should format numbers with locale-specific thousands separators', () => {
      expect(Utils.formatNumber(1234567)).toBe('1,234,567'); // Assumes en-US locale for JSDOM
      expect(Utils.formatNumber(1000)).toBe('1,000');
      expect(Utils.formatNumber(123)).toBe('123');
      expect(Utils.formatNumber(0)).toBe('0');
      expect(Utils.formatNumber(1234.56)).toBe('1,234.56');
    });
  });

  describe('applyScoreFormatting', () => {
    let inputElement;

    beforeEach(() => {
      document.body.innerHTML = '<input id="test-input" />';
      inputElement = document.getElementById('test-input');
      Utils.applyScoreFormatting(inputElement);
    });

    it('should set input type and inputMode', () => {
      expect(inputElement.type).toBe('text');
      expect(inputElement.inputMode).toBe('numeric');
    });

    it('should format the input value on input event', () => {
      inputElement.value = '12345';
      inputElement.dispatchEvent(new Event('input'));
      expect(inputElement.value).toBe('12,345');
    });

    it('should handle empty input', () => {
      inputElement.value = 'abc';
      inputElement.dispatchEvent(new Event('input'));
      expect(inputElement.value).toBe('');
    });

    it('should handle non-numeric input by clearing it', () => {
      inputElement.value = '1a2b3';
      inputElement.dispatchEvent(new Event('input'));
      // Use a regex to be resilient to JSDOM environments that might not emit commas
      expect(inputElement.value).toMatch(/^1[,]?23$/); 
    });

    it('should maintain cursor position (basic check)', () => {
      inputElement.value = '123456';
      inputElement.selectionStart = 3; // Cursor after '3'
      inputElement.selectionEnd = 3;
      inputElement.dispatchEvent(new Event('input'));
      // Original: 123|456 -> Formatted: 123,|456 (cursor should be after comma)
      // This is a simplified check, full cursor position logic is complex.
      expect(inputElement.selectionStart).toBe(4);
    });

    it('should not apply formatting if input element is null', () => {
      const spy = vi.spyOn(inputElement, 'addEventListener');
      Utils.applyScoreFormatting(null);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('initNavigation', () => {
    let navLinks;

    beforeEach(() => {
      document.body.innerHTML = `
        <a class="nav-item" href="index.php">Home</a>
        <a class="nav-item" href="machines.php">Machines</a>
        <a class="nav-item" href="leagues.php?leagueId=1">League 1</a>
        <a class="nav-item" href="leagues.php?eventId=2">Event 2</a>
        <a class="nav-item" href="players.php">Players</a>
      `;
      navLinks = document.querySelectorAll('.nav-item');
    });

    it('should set "active" class on the current page link', () => {
      window.location = new URL('http://localhost/machines.php');
      Utils.initNavigation();
      expect(navLinks[0].classList.contains('active')).toBe(false); // Home
      expect(navLinks[1].classList.contains('active')).toBe(true);  // Machines
    });

    it('should handle clean URLs (no .php extension)', () => {
      window.location = new URL('http://localhost/machines');
      Utils.initNavigation();
      expect(navLinks[1].classList.contains('active')).toBe(true); // Machines
    });

    it('should propagate URL parameters to navigation links', () => {
      window.location = new URL('http://localhost/players.php?leagueId=10&eventId=20');
      Utils.initNavigation();

      // Check the 'Machines' link, it should now have leagueId and eventId
      expect(navLinks[1].getAttribute('href')).toBe('machines?leagueId=10&eventId=20');
      // Check the 'League 1' link, it should keep its own leagueId and add eventId
      expect(navLinks[2].getAttribute('href')).toBe('leagues?leagueId=1&eventId=20');
    });

    it('should not propagate parameters if target link already has them', () => {
      window.location = new URL('http://localhost/players.php?leagueId=10&eventId=20');
      Utils.initNavigation();
      // The 'League 1' link already has leagueId=1, so it should not be overwritten by leagueId=10
      expect(navLinks[2].getAttribute('href')).toBe('leagues?leagueId=1&eventId=20');
    });

    it('should handle index.php as default base', () => {
      window.location = new URL('http://localhost/index.php');
      Utils.initNavigation();
      expect(navLinks[0].classList.contains('active')).toBe(true); // Home
    });
  });

  describe('renderPreview', () => {
    let score10Input, score1Input, previewValues;
    let mockEngineBuildRoundValues;

    beforeEach(() => {
      document.body.innerHTML = `
        <input id="score10" value="10000" />
        <input id="score1" value="1000" />
        <div id="preview"></div>
      `;
      score10Input = document.getElementById('score10');
      score1Input = document.getElementById('score1');
      previewValues = document.getElementById('preview');

      // Get the mocked engine's methods
      mockEngineBuildRoundValues = vi.mocked(getScoringEngine()).buildRoundValues;
      vi.mocked(getScoringEngine()).getBonusTargets.mockReturnValue({ t1: 13000, t2: 16900 });

      // Provide default valid implementation for interpolation tests
      mockEngineBuildRoundValues.mockImplementation((s10, s1) => {
        if (s10 > 0 && s1 > 0) {
          const values = {};
          for (let rank = 10; rank >= 1; rank--) {
            values[rank] = Math.round(s1 + (s10 - s1) * ((rank - 1) / 9));
          }
          return values;
        }
        return null;
      });
    });

    it('should display "Enter a 10 score or a 1 score" if buildRoundValues returns null', () => {
      mockEngineBuildRoundValues.mockImplementation(() => null);
      Utils.renderPreview(score10Input, score1Input, previewValues, getScoringEngine());
      expect(previewValues.innerHTML).toContain('Enter a 10 score or a 1 score');
    });

    it('should render score values correctly', () => {
      mockEngineBuildRoundValues.mockImplementation(() => ({ 10: 10000, 5: 5000, 1: 1000 }));
      Utils.renderPreview(score10Input, score1Input, previewValues, getScoringEngine());
      expect(previewValues.innerHTML).toContain('<strong>10:</strong> 10,000');
      expect(previewValues.innerHTML).toContain('<strong>5:</strong> 5,000');
      expect(previewValues.innerHTML).toContain('<strong>1:</strong> 1,000');
    });

    it('should include bonus targets if isLastRound is true and values[10] exists', () => {
      Utils.renderPreview(score10Input, score1Input, previewValues, getScoringEngine(), true);
      expect(previewValues.innerHTML).toContain('<strong>Target 1:</strong>');
      expect(previewValues.innerHTML).toContain('13,000');
    });

    it('should not include bonus targets if isLastRound is false', () => {
      Utils.renderPreview(score10Input, score1Input, previewValues, getScoringEngine(), false);
      expect(previewValues.innerHTML).not.toContain('<strong>Target 1:</strong>');
    });

    it('should not include bonus targets if values[10] is missing', () => {
      mockEngineBuildRoundValues.mockImplementation(() => ({ 9: 9000, 1: 1000 }));
      Utils.renderPreview(score10Input, score1Input, previewValues, getScoringEngine(), true);
      expect(previewValues.innerHTML).not.toContain('Target 1:');
    });
  });
});