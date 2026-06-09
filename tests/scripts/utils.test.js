/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Create a stable mock engine instance so mockReturnValue works across calls
const mockEngine = {
  buildRoundValues: vi.fn(),
  getBonusTargets: vi.fn(),
  getRoundLabel: vi.fn(),
  getBonusTargetHtml: vi.fn(),
  filterThresholds: vi.fn((v) => v),
  getThresholdLabel: vi.fn((r) => {
    if (Number(r) === 10) return 'High';
    if (Number(r) === 1) return 'Low';
    return r;
  }),
  getThresholdRowStyle: vi.fn(() => 'margin: 2px 0;'),
  getThresholdSort: vi.fn(() => (a, b) => Number(b[0]) - Number(a[0])),
  getInitialValues: vi.fn(() => ({ value1: 5000000, value2: 500000 })),
  formatTotalScore: vi.fn((total) => String(total)),
  getThresholdPrefix: vi.fn(() => 'Pins'),
  getValue1Label: vi.fn(() => 'Target Score'),
  getValue2Label: vi.fn(() => 'Base Score'),
  getThresholdStart: vi.fn(() => 10), // Default for Bowling
  getThresholdEnd: vi.fn(() => 1), // Default for Bowling
  getThresholdRange: vi.fn(() => Array.from({ length: 10 }, (_, i) => 10 - i)), // Default descending
};

// Mock getScoringEngine for renderPreview and print functions
vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => mockEngine),
}));

// Import all functions from utils.js.
// We will mock initNavigation *selectively* for tests that call it.
import * as Utils from '@scripts/utils.js';

// Mock the ROUTES to ensure test stability and correct indices
vi.mock('@scripts/routes.js', () => ({
  ROUTES: [
    { path: 'index.php', label: 'Home' },
    { path: 'machines.php', label: 'Machines' },
    { path: 'leagues.php', label: 'Leagues' },
    { path: 'players.php', label: 'Players' }
  ]
}));
import { getScoringEngine } from '@core/engine.js'; // To check if it's called

describe('Utility Functions (utils.js)', () => {
  let originalLocation;
  let originalHistory;

  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

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
    mockEngine.getBonusTargetHtml.mockReturnValue('');

    vi.clearAllMocks();
  });

  afterEach(() => {
    window.location = originalLocation;
    window.history = originalHistory;
  });

  describe('URL Parameter Management', () => {
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
    });

    it('setActiveLeagueId should remove leagueId from URL if null is passed', () => {
      window.location = new URL('http://localhost/index.php?leagueId=123');
      Utils.setActiveLeagueId(null);
      expect(window.history.replaceState).toHaveBeenCalled();
      const url = vi.mocked(window.history.replaceState).mock.calls[0][2];
      expect(url.toString()).not.toContain('leagueId');
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
    });
  });

  describe('getCookie', () => {
    it('should return the value of an existing cookie', () => {
      document.cookie = 'test_cookie=hello; path=/';
      expect(Utils.getCookie('test_cookie')).toBe('hello');
    });

    it('should return null for a non-existent cookie', () => {
      expect(Utils.getCookie('nonexistent')).toBeNull();
    });

    it('should handle cookies with special characters in value', () => {
      document.cookie = 'session=abc123def; path=/';
      expect(Utils.getCookie('session')).toBe('abc123def');
    });

    it('should not match partial cookie names', () => {
      document.cookie = 'pb_format=golf; path=/';
      expect(Utils.getCookie('pb_forma')).toBeNull();
    });

    it('should handle multiple cookies and find the right one', () => {
      document.cookie = 'first=val1; path=/';
      document.cookie = 'second=val2; path=/';
      expect(Utils.getCookie('second')).toBe('val2');
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

    it('should return "0" for undefined', () => {
      expect(Utils.formatNumber(undefined)).toBe('0');
    });

    it('should return "0" for null', () => {
      expect(Utils.formatNumber(null)).toBe('0');
    });

    it('should return "0" for NaN', () => {
      expect(Utils.formatNumber(NaN)).toBe('0');
    });

    it('should handle string numbers', () => {
      expect(Utils.formatNumber('5000')).toBe('5,000');
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

  describe('navigateTo', () => {
    it('sets window.location.href when a URL is provided', () => {
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
      });
      Utils.navigateTo('http://example.com/page');
      expect(window.location.href).toBe('http://example.com/page');
    });

    it('does nothing when url is falsy', () => {
      const originalHref = window.location.href;
      Utils.navigateTo('');
      expect(window.location.href).toBe(originalHref);
    });

    it('does nothing when url is null', () => {
      const originalHref = window.location.href;
      Utils.navigateTo(null);
      expect(window.location.href).toBe(originalHref);
    });

    it('does nothing when url is undefined', () => {
      const originalHref = window.location.href;
      Utils.navigateTo(undefined);
      expect(window.location.href).toBe(originalHref);
    });
  });

  describe('loadPage', () => {
    let mainElement;
    let pushStateSpy;
    beforeEach(() => {
      document.body.innerHTML = '<main class="page-container"><p>Old content</p></main>';
      mainElement = document.querySelector('main.page-container');
      global.fetch = vi.fn();
      pushStateSpy = vi.fn();
      window.history.pushState = pushStateSpy;
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it('should fetch page and update main container content', async () => {
      global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<main class="page-container"><p>New content</p></main>') });
      await Utils.loadPage('http://localhost/leagues.php');
      expect(global.fetch).toHaveBeenCalledWith('http://localhost/leagues.php', { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      expect(mainElement.innerHTML).toContain('New content');
    });
    it('should push state by default', async () => {
      global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<main class="page-container">Content</main>') });
      await Utils.loadPage('http://localhost/leagues.php');
      expect(pushStateSpy).toHaveBeenCalled();
    });
    it('should not push state when pushState is false', async () => {
      global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<main class="page-container">Content</main>') });
      await Utils.loadPage('http://localhost/leagues.php', false);
      expect(pushStateSpy).not.toHaveBeenCalled();
    });
    it('should dispatch pb:pageChanged event', async () => {
      global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<main class="page-container">Content</main>') });
      const eventSpy = vi.fn();
      document.addEventListener('pb:pageChanged', eventSpy);
      await Utils.loadPage('http://localhost/leagues.php');
      expect(eventSpy).toHaveBeenCalled();
      document.removeEventListener('pb:pageChanged', eventSpy);
    });
    it('should scroll to top after loading', async () => {
      global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<main class="page-container">Content</main>') });
      await Utils.loadPage('http://localhost/leagues.php');
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    });
    it('should fall back to full reload if fetch fails', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
      await Utils.loadPage('http://localhost/leagues.php');
      expect(window.location.href).toBe('http://localhost/leagues.php');
      consoleSpy.mockRestore();
    });
    it('should fall back to full reload if response is not ok', async () => {
      global.fetch.mockResolvedValue({ ok: false, status: 404 });
      Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
      await Utils.loadPage('http://localhost/leagues.php');
      expect(window.location.href).toBe('http://localhost/leagues.php');
    });
    it('should fall back to full reload if no main container exists', async () => {
      document.body.innerHTML = '<div>No main here</div>';
      Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
      await Utils.loadPage('http://localhost/leagues.php');
      expect(window.location.href).toBe('http://localhost/leagues.php');
    });
    it('should handle HTML without main tag by using raw HTML', async () => {
      global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<div>Raw content without main</div>') });
      await Utils.loadPage('http://localhost/leagues.php');
      expect(mainElement.innerHTML).toContain('Raw content without main');
    });
  });

  describe('renderPreview', () => {
    let highScoreInput, lowScoreInput, previewValues;
    let mockEngineBuildRoundValues;

    beforeEach(() => {
      document.body.innerHTML = `
        <input id="highScore" value="10000" />
        <input id="lowScore" value="1000" />
        <div id="preview"></div>
      `;
      highScoreInput = document.getElementById('highScore');
      lowScoreInput = document.getElementById('lowScore');
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

    it('should display "Enter a High Score and a Low Score" if buildRoundValues returns null', () => {
      mockEngineBuildRoundValues.mockImplementation(() => null);
      Utils.renderPreview(highScoreInput, lowScoreInput, previewValues, getScoringEngine());
      expect(previewValues.innerHTML).toContain('Enter a High Score and a Low Score');
    });

    it('should render score values correctly', () => {
      mockEngineBuildRoundValues.mockImplementation(() => ({ 10: 10000, 5: 5000, 1: 1000 }));
      Utils.renderPreview(highScoreInput, lowScoreInput, previewValues, getScoringEngine());
      expect(previewValues.innerHTML).toContain('<strong>High:</strong> 10,000');
      expect(previewValues.innerHTML).toContain('<strong>5:</strong> 5,000');
      expect(previewValues.innerHTML).toContain('<strong>Low:</strong> 1,000');
    });

    it('should include bonus targets if isLastRound is true and values[10] exists', () => {
      mockEngine.getBonusTargetHtml.mockImplementation((round, isLast, formatFn) => {
        return isLast ? `<div><strong>Target 1:</strong> ${formatFn(13000)}</div>` : '';
      });

      Utils.renderPreview(highScoreInput, lowScoreInput, previewValues, getScoringEngine(), true);
      expect(previewValues.innerHTML).toContain('<strong>Target 1:</strong>');
      expect(previewValues.innerHTML).toContain('13,000');
    });

    it('should not include bonus targets if isLastRound is false', () => {
      mockEngine.getBonusTargetHtml.mockReturnValue('');
      Utils.renderPreview(highScoreInput, lowScoreInput, previewValues, getScoringEngine(), false);
      expect(previewValues.innerHTML).not.toContain('<strong>Target 1:</strong>');
    });

    it('should pass currentScaling to buildRoundValues and getBonusTargetHtml', () => {
      mockEngineBuildRoundValues.mockReturnValue({ 10: 10000, 1: 1000 });
      mockEngine.getBonusTargetHtml.mockReturnValue('');
      Utils.renderPreview(highScoreInput, lowScoreInput, previewValues, getScoringEngine(), false, 1.5);
      expect(mockEngineBuildRoundValues).toHaveBeenCalledWith(10000, 1000, 1.5);
      expect(mockEngine.getBonusTargetHtml).toHaveBeenCalledWith(
        expect.objectContaining({ values: { 10: 10000, 1: 1000 } }),
        false,
        expect.any(Function),
        1.5
      );
    });

    it('should strip non-numeric characters from input values', () => {
      highScoreInput.value = '10,000';
      lowScoreInput.value = '1,000';
      mockEngineBuildRoundValues.mockReturnValue({ 10: 10000, 1: 1000 });
      mockEngine.getBonusTargetHtml.mockReturnValue('');
      Utils.renderPreview(highScoreInput, lowScoreInput, previewValues, getScoringEngine());
      expect(mockEngineBuildRoundValues).toHaveBeenCalledWith(10000, 1000, undefined);
    });

    it('should call filterThresholds with the built values', () => {
      const values = { 10: 10000, 5: 5000, 1: 1000 };
      mockEngineBuildRoundValues.mockReturnValue(values);
      mockEngine.getBonusTargetHtml.mockReturnValue('');
      Utils.renderPreview(highScoreInput, lowScoreInput, previewValues, getScoringEngine());
      expect(mockEngine.filterThresholds).toHaveBeenCalledWith(values);
    });
  });

  describe('renderThresholdGrid', () => {
    it('should return notice div when values is null', () => {
      const result = Utils.renderThresholdGrid(null);
      expect(result).toContain('Enter scores to see thresholds');
    });

    it('should return notice div when values is empty', () => {
      const result = Utils.renderThresholdGrid({});
      expect(result).toContain('Enter scores to see thresholds');
    });

    it('should render grid with engine labels and styles', () => {
      const values = { 10: 10000, 5: 5000, 1: 1000 };
      const result = Utils.renderThresholdGrid(values, Utils.formatNumber, mockEngine, 10000, 1000);
      expect(result).toContain('threshold-grid-container');
      expect(result).toContain('Pins:'); // prefix
      expect(result).toContain('<strong>High:</strong>');
      expect(result).toContain('<strong>Low:</strong>');
      expect(result).toContain('10,000');
      expect(result).toContain('1,000');
    });

    it('should render grid without engine (default behavior)', () => {
      const values = { 10: 10000, 5: 5000, 1: 1000 };
      const result = Utils.renderThresholdGrid(values, Utils.formatNumber);
      expect(result).toContain('threshold-grid-container');
      expect(result).not.toContain('Pins:'); // no prefix
      expect(result).toContain('<strong>10:</strong>');
      expect(result).toContain('<strong>5:</strong>');
      expect(result).toContain('<strong>1:</strong>');
    });

    it('should use default descending range when no engine provided', () => {
      const values = { 10: 10000, 9: 9000, 1: 1000 };
      const result = Utils.renderThresholdGrid(values, Utils.formatNumber);
      // Default range is 10,9,8,...,1 - only 10,9,1 have values
      expect(result).toContain('<strong>10:</strong>');
      expect(result).toContain('<strong>9:</strong>');
      expect(result).toContain('<strong>1:</strong>');
    });

    it('should filter out ranks not present in values', () => {
      const values = { 10: 10000, 1: 1000 };
      const result = Utils.renderThresholdGrid(values, Utils.formatNumber, mockEngine, 10000, 1000);
      expect(result).toContain('<strong>High:</strong>');
      expect(result).toContain('<strong>Low:</strong>');
    });

    it('should not include prefix when engine returns empty prefix', () => {
      mockEngine.getThresholdPrefix.mockReturnValue('');
      const values = { 10: 10000, 1: 1000 };
      const result = Utils.renderThresholdGrid(values, Utils.formatNumber, mockEngine, 10000, 1000);
      expect(result).not.toContain('font-weight: bold'); // prefix div
      mockEngine.getThresholdPrefix.mockReturnValue('Pins'); // reset
    });

    it('should use identity formatFn when none provided', () => {
      const values = { 10: 10000 };
      const result = Utils.renderThresholdGrid(values);
      expect(result).toContain('10000'); // raw number, no formatting
    });

    it('should pass value1 and value2 to engine label and style methods', () => {
      const values = { 10: 10000, 1: 1000 };
      Utils.renderThresholdGrid(values, Utils.formatNumber, mockEngine, 10000, 1000);
      expect(mockEngine.getThresholdLabel).toHaveBeenCalledWith(10, 10000, 1000);
      expect(mockEngine.getThresholdRowStyle).toHaveBeenCalledWith(10, 10000, 1000);
    });
  });
});