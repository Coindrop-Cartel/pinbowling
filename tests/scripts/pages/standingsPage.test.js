/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getTargetScores: vi.fn(),
    getScores: vi.fn()
  }
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    getTurnHeaderPrefix: vi.fn(() => 'F'),
    calculateTurnResults: vi.fn(() => ({ turnResults: [], total: 100 })),
    getRoundLabel: vi.fn(() => 'Frame'), // Ensure this is consistent
    getThresholdSort: vi.fn(() => (a, b) => b[0] - a[0]),
    compareScores: vi.fn((a, b) => b - a),
    getTotalColumnLabel: vi.fn(() => 'Total'),
    formatTotalScore: vi.fn((total) => String(total)),
    getMarkFormatting: vi.fn(() => ''),
    formatMark: vi.fn((turn) => turn.mark),
    shouldShowRoundScore: vi.fn(() => true),
  }))
}));

vi.mock('@scripts/utils.js', () => ({
  getActiveEventId: vi.fn(),
  getActiveLeagueId: vi.fn(),
  setActiveEventId: vi.fn(),
  formatNumber: vi.fn(n => n?.toLocaleString() || '0'),
}));

const uiMocks = vi.hoisted(() => ({
  fitTVModeToScreen: vi.fn(),
  initTournamentSelector: vi.fn(async (selector, options) => {
    if (options.onRefresh) await options.onRefresh();
  }),
  applyPreferredTheme: vi.fn(),
  renderActionSummary: vi.fn((container, title, actions = []) => {
    if (container) container.innerHTML = title;
    if (container) container._actions = actions; // Store for test access
    if (container) container.classList.remove('hidden');
  }),
  showDialog: vi.fn(),
}));

vi.mock('@ui/selectors.js', () => uiMocks);
vi.mock('@ui/branding.js', () => uiMocks);
vi.mock('@ui/dialogs.js', () => uiMocks);

import { initStandingsPage } from '@scripts/pages/standingsPage.js';
import { PB_API } from '@services/api.js';
import { getActiveEventId, getActiveLeagueId } from '@scripts/utils.js';
import { renderActionSummary } from '@ui/selectors.js';

describe('Standings Page (standingsPage.js)', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    document.body.innerHTML = `
      <div id="tournament-selector-ui"></div>
      <div id="tournament-summary" class="hidden"><span id="tournament-summary-text"></span><button id="change-tournament-btn"></button></div>
      <h2 id="tv-title"></h2>
      <button id="tv-mode-btn" class="hidden"></button>
      <div id="standings-wrapper" class="hidden">
        <table><thead id="standings-header"></thead><tbody id="standings-body"></tbody></table>
      </div>
      <div id="standings-empty"></div>
      <div class="tournament-selector-container"></div>
    `;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('scrollTo', vi.fn());
    vi.stubGlobal('scrollBy', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should render event standings when an event is selected', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.getLeagues.mockResolvedValue([{ 
      id: '1', name: 'L1', players: [{ id: '7', playerName: 'Kyle' }], events: [{ id: '101', eventName: 'W1' }] 
    }]);
    PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineName: 'M1' }]);
    PB_API.getScores.mockResolvedValue([]);

    await initStandingsPage();

    expect(document.getElementById('standings-header').innerHTML).toContain('F 1');
    expect(document.getElementById('standings-body').innerHTML).toContain('Kyle');
    expect(document.getElementById('standings-wrapper').classList.contains('hidden')).toBe(false);
  });

  it('should render league summary when "summary" event is selected', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('summary');
    PB_API.getLeagues.mockResolvedValue([{ 
      id: '1', name: 'L1', players: [{ id: '7', playerName: 'Kyle' }], events: [{ id: '101', eventName: 'W1' }] // Ensure eventName is present
    }]);
    PB_API.getTargetScores.mockResolvedValue([{ eventId: '101', orderNumber: 1, machineName: 'M1' }]);
    PB_API.getScores.mockResolvedValue([{ eventId: '101', playerId: '7', orderNumber: 1, ball1: 1000 }]);

    await initStandingsPage();

    expect(document.getElementById('standings-header').innerHTML).toContain('W1');
    expect(document.getElementById('tv-title').textContent).toContain('Season Summary');
  });

  it('should enter TV mode and set up refresh interval', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.getLeagues.mockResolvedValue([]);
    PB_API.getTargetScores.mockResolvedValue([]);
    PB_API.getScores.mockResolvedValue([]);

    await initStandingsPage();
    
    const tvBtn = document.getElementById('tv-mode-btn');
    tvBtn.click();

    expect(document.body.classList.contains('tv-mode-active')).toBe(true);
    
    // Advance time and check if refresh is triggered
    vi.advanceTimersByTime(16000); 
    // 1 (init) + 1 (initial refresh) + 1 (timer refresh) = 3
    expect(PB_API.getLeagues).toHaveBeenCalledTimes(3); 
  });

  it('should show selector and hide standings when Change button is clicked', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.getLeagues.mockResolvedValue([{ id: '1', name: 'L1', events: [{ id: '101' }] }]);
    
    await initStandingsPage();

    // Extract the handleTournamentChange callback from the renderActionSummary mock
    const calls = vi.mocked(renderActionSummary).mock.calls;
    const summaryCall = calls.find(c => c[1].includes('L1'));
    const changeAction = summaryCall[2].find(a => a.text === 'Change' || a.text === 'Change Tournament');
    
    changeAction.onclick();

    expect(document.getElementById('tournament-selector-ui').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tournament-summary').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('standings-wrapper').classList.contains('hidden')).toBe(true);
  });
});
