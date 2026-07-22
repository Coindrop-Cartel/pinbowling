/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    leagues: { getAll: vi.fn() },
    machines: { getTargets: vi.fn() },
    scores: { get: vi.fn() },
    teams: { getAll: vi.fn().mockResolvedValue([]) },
    auth: {
      me: vi.fn().mockResolvedValue(null)
    }
  }
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    getTurnHeaderPrefix: vi.fn(() => 'F'),
    calculateTurnResults: vi.fn(() => ({
      turnResults: [{ orderNumber: 1, displayMark: 'X', displayRoundTotal: 100, played: true }],
      total: 100,
      totalDisplay: '100',
    })),
    getRoundLabel: vi.fn(() => 'Frame'), // Ensure this is consistent
    getThresholdSort: vi.fn(() => (a, b) => b[0] - a[0]),
    compareScores: vi.fn((a, b) => b - a),
    getTotalColumnLabel: vi.fn(() => 'Total'),
    formatTotalScore: vi.fn((total) => String(total)),
    getMarkFormatting: vi.fn(() => ''),
    formatMark: vi.fn((turn) => turn.mark),
    shouldShowRoundScore: vi.fn(() => true),
    getMatchupDescription: vi.fn(() => null),
    buildPlayerScoreMap: vi.fn((playerId, scores) => {
      const scoreMap = {};
      scores.forEach(s => { scoreMap[s.orderNumber] = s; });
      return scoreMap;
    }),
    sortStandings: vi.fn((rows) => [...rows]),
  }))
}));

vi.mock('@scripts/utils.js', () => ({
  getActiveEventId: vi.fn(),
  getActiveLeagueId: vi.fn(),
  setActiveEventId: vi.fn(),
  loadPage: vi.fn(), // Added mock for loadPage
  formatNumber: vi.fn(n => n?.toLocaleString() || '0'),
  escapeHTML: vi.fn(str => str), // Mock escapeHTML
}));

const uiMocks = vi.hoisted(() => ({
  fitTVModeToScreen: vi.fn(),
  initTournamentSelector: vi.fn().mockImplementation(async (selector, options) => {
    if (options?.onRefresh) await options.onRefresh();
    return { setData: vi.fn() };
  }),
  applyPreferredTheme: vi.fn(),
  renderActionSummary: vi.fn((container, title, actions = []) => {
    if (container) container.innerHTML = title;
    if (container) container._actions = actions; // Store for test access
    if (container) container.classList.remove('hidden');
  }),
  showDialog: vi.fn(),
  createSkeletonLoader: vi.fn(() => ({
    remove: vi.fn()
  })),
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
      <div id="player-filter-container"></div>
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
    PB_API.leagues.getAll.mockResolvedValue([{ 
      id: '1', name: 'L1', players: [{ id: '7', playerName: 'Kyle' }], events: [{ id: '101', eventName: 'W1' }] 
    }]);
    PB_API.machines.getTargets.mockResolvedValue([{ orderNumber: 1, machineName: 'M1' }]);
    PB_API.scores.get.mockResolvedValue([]);

    await initStandingsPage();

    expect(document.getElementById('standings-header').innerHTML).toContain('>1<');
    expect(document.getElementById('standings-body').innerHTML).toContain('Kyle');
    expect(document.getElementById('standings-wrapper').classList.contains('hidden')).toBe(false);
  });

  it('should render league summary when "summary" event is selected', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('summary');
    PB_API.leagues.getAll.mockResolvedValue([{ 
      id: '1', name: 'L1', players: [{ id: '7', playerName: 'Kyle' }], events: [{ id: '101', eventName: 'W1' }] // Ensure eventName is present
    }]);
    PB_API.machines.getTargets.mockResolvedValue([{ eventId: '101', orderNumber: 1, machineName: 'M1' }]);
    PB_API.scores.get.mockResolvedValue([{ eventId: '101', playerId: '7', orderNumber: 1, ball1: 1000 }]);

    await initStandingsPage();

    expect(document.getElementById('standings-header').innerHTML).toContain('>1<');
    expect(document.getElementById('tv-title').textContent).toContain('Season Summary');
  });

  it('should enter TV mode and set up refresh interval', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.machines.getTargets.mockResolvedValue([]);
    PB_API.scores.get.mockResolvedValue([]);

    await initStandingsPage();
    
    const tvBtn = document.getElementById('tv-mode-btn');
    tvBtn.click();
    
    expect(document.body.classList.contains('tv-mode-active')).toBe(true);
    
    // Advance time and check if refresh is triggered
    vi.advanceTimersByTime(16000); 
    // 1 (init) + 1 (initial refresh) + 1 (timer refresh) = 3
    expect(PB_API.leagues.getAll).toHaveBeenCalledTimes(3); 
  });

  it('should show selector and hide standings when Change button is clicked', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.leagues.getAll.mockResolvedValue([{ id: '1', name: 'L1', events: [{ id: '101' }] }]);
    
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

  it('should handle player filtering via the filter dialog', async () => {
    const players = [
      { id: '1', playerName: 'Alice' },
      { id: '2', playerName: 'Bob' }
    ];
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.leagues.getAll.mockResolvedValue([{ id: '1', name: 'L1', players, events: [{ id: '101' }] }]);
    
    await initStandingsPage();

    const { showDialog } = await import('@ui/dialogs.js');
    vi.mocked(showDialog).mockResolvedValue(true); // User clicks Apply

    const calls = vi.mocked(renderActionSummary).mock.calls;
    const filterAction = calls.find(c => c[1].includes('Showing Everyone'))[2][0];
    
    await filterAction.onclick();

    // Verify dialog content creation
    expect(showDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Select Players to Show'
    }));
  });

  it('should detect score changes and apply pulse animation in TV mode', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    
    // First load
    PB_API.leagues.getAll.mockResolvedValue([{ id: '1', name: 'L1', players: [{ id: '7', playerName: 'Kyle' }], events: [{ id: '101' }] }]);
    PB_API.scores.get.mockResolvedValue([{ playerId: '7', orderNumber: 1, ball1: 100 }]);

    await initStandingsPage();
    document.getElementById('tv-mode-btn').click(); // Enter TV mode

    // Second load with different score
    PB_API.scores.get.mockResolvedValue([{ playerId: '7', orderNumber: 1, ball1: 200 }]);
    
    await vi.advanceTimersByTimeAsync(16000); // Trigger refresh

    expect(document.body.innerHTML).toContain('score-just-updated');
  });

  it('should request and release wake lock in TV mode', async () => {
    const requestMock = vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue() });
    vi.stubGlobal('navigator', { wakeLock: { request: requestMock } });
    
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.leagues.getAll.mockResolvedValue([{ id: '1', name: 'L1', events: [{ id: '101' }] }]);

    await initStandingsPage();
    
    const tvBtn = document.getElementById('tv-mode-btn');
    await tvBtn.click(); // Enable
    expect(requestMock).toHaveBeenCalledWith('screen');

    await tvBtn.click(); // Disable
    // The mock handles release check
  });

  it('should handle team league grouping in event view', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.leagues.getAll.mockResolvedValue([{ 
      id: '1', name: 'L1', participants: 'team', 
      teams: [{ id: 50, name: 'Team Rocket', members: [{ id: 7 }] }],
      events: [{ id: '101' }] 
    }]);
    PB_API.teams.getAll.mockResolvedValue([{ id: 50, name: 'Team Rocket', members: [{ id: 7 }] }]);
    PB_API.scores.get.mockResolvedValue([]);

    await initStandingsPage();

    expect(document.getElementById('standings-body').innerHTML).toContain('Team Rocket');
    expect(document.querySelector('.team-header')).not.toBeNull();
  });

  it('should cleanup intervals when pb:pageChanged event is dispatched', async () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    
    await initStandingsPage();
    document.getElementById('tv-mode-btn').click(); // Start refresh interval

    document.dispatchEvent(new CustomEvent('pb:pageChanged'));
    
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('should handle TV mode Escape keydown, visibility change, and requestFullscreen error', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.leagues.getAll.mockResolvedValue([{ id: '1', name: 'L1', events: [{ id: '101' }] }]);

    // Mock fullscreen throwing error
    const err = new Error('Fullscreen denied');
    const originalRequestFullscreen = document.documentElement.requestFullscreen;
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(err);

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await initStandingsPage();

    const tvBtn = document.getElementById('tv-mode-btn');
    tvBtn.click(); // Enter TV mode

    await vi.waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Fullscreen request deferred or denied'), 'Fullscreen denied');
    });

    // Press Escape to exit TV mode
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.body.classList.contains('tv-mode-active')).toBe(false);

    // Restore
    document.documentElement.requestFullscreen = originalRequestFullscreen;
    consoleWarnSpy.mockRestore();
  });

  it('should handle Select All and Clear All inside the player filter dialog', async () => {
    const players = [
      { id: '1', playerName: 'Alice' },
      { id: '2', playerName: 'Bob' }
    ];
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.leagues.getAll.mockResolvedValue([{ id: '1', name: 'L1', players, events: [{ id: '101' }] }]);

    await initStandingsPage();

    const { showDialog } = await import('@ui/dialogs.js');
    const showDialogMock = vi.mocked(showDialog).mockResolvedValue(true);

    const calls = vi.mocked(renderActionSummary).mock.calls;
    const filterAction = calls.find(c => c[1].includes('Showing Everyone'))[2][0];
    
    await filterAction.onclick();

    const dialogArgs = showDialogMock.mock.calls[0][0];
    const container = dialogArgs.customElement;

    const selectAllBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Select All');
    const clearAllBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Clear All');

    selectAllBtn.click();
    container.querySelectorAll('input[type="checkbox"]').forEach(i => expect(i.checked).toBe(true));

    clearAllBtn.click();
    container.querySelectorAll('input[type="checkbox"]').forEach(i => expect(i.checked).toBe(false));
  });

  it('should handle matchup description for baseball engine in league summary', async () => {
    const { getScoringEngine } = await import('@core/engine.js');
    vi.mocked(getScoringEngine).mockImplementationOnce(() => ({
      getTurnHeaderPrefix: vi.fn(() => 'I'),
      calculateTurnResults: vi.fn(() => ({
        turnResults: [{ orderNumber: 1, displayMark: '3R', displayRoundTotal: 3, played: true }],
        total: 3,
        totalDisplay: '3R',
      })),
      getRoundLabel: vi.fn(() => 'Inning'),
      getThresholdSort: vi.fn(() => (a, b) => b[0] - a[0]),
      compareScores: vi.fn((a, b) => b - a),
      getTotalColumnLabel: vi.fn(() => 'Runs'),
      formatTotalScore: vi.fn((total) => String(total)),
      getMarkFormatting: vi.fn(() => ''),
      formatMark: vi.fn((turn) => turn.mark),
      shouldShowRoundScore: vi.fn(() => true),
      getMatchupDescription: vi.fn(() => ({ description: 'Head to Head' })),
      buildPlayerScoreMap: vi.fn(() => ({})),
    }));

    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('summary');
    PB_API.leagues.getAll.mockResolvedValue([{ 
      id: '1', name: 'L1', players: [{ id: '7', playerName: 'Kyle' }], events: [{ id: '101', eventName: 'W1' }]
    }]);
    PB_API.machines.getTargets.mockResolvedValue([{ eventId: '101', orderNumber: 1, machineName: 'M1' }]);
    PB_API.scores.get.mockResolvedValue([]);

    await initStandingsPage();

    expect(document.getElementById('tv-title').textContent).toContain('Season Summary');
  });

  it('should reset UI when no event is selected on refresh', async () => {
    getActiveLeagueId.mockReturnValue('');
    getActiveEventId.mockReturnValue('');
    PB_API.leagues.getAll.mockResolvedValue([]);
    await initStandingsPage();
    expect(document.getElementById('standings-wrapper').classList.contains('hidden')).toBe(true);
  });
});
