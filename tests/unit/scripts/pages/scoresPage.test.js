/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initScoresPage } from '@pages/scoresPage.js';
import { PB_API } from '@services/api.js';
import * as Utils from '@scripts/utils.js';
import { getScoreAccessLevel } from '@services/auth.js';
import { showAlert } from '@ui/dialogs.js';
import { printBlankScoreSheet } from '@ui/printing.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    auth: { me: vi.fn() },
    leagues: {
      getAll: vi.fn(),
    },
    players: { getAll: vi.fn().mockResolvedValue([]) },
    machines: { getTargets: vi.fn() },
    scores: { get: vi.fn(), save: vi.fn() },
    matchups: { get: vi.fn(), save: vi.fn() },
  },
}));

vi.mock('@scripts/utils.js', () => ({
  getActiveEventId: vi.fn(),
  getActiveLeagueId: vi.fn(),
  setActiveEventId: vi.fn(),
  setActiveLeagueId: vi.fn(),
  setActiveEventIdSilent: vi.fn(),
  setActiveLeagueIdSilent: vi.fn(),
  getCurrentPlayerId: vi.fn(),
  setCurrentPlayerId: vi.fn(),
  setCurrentPlayerIdSilent: vi.fn(),
  getActiveEventMatchupId: vi.fn(),
  setActiveEventMatchupIdSilent: vi.fn(),
  formatNumber: (n) => String(n),
  applyScoreFormatting: vi.fn(),
  renderThresholdGrid: vi.fn(() => 'Grid'),
  loadPage: vi.fn(), // Added mock for loadPage
  escapeHTML: vi.fn(str => str), // Mock escapeHTML
}));

vi.mock('@services/auth.js', () => ({
  can: vi.fn().mockResolvedValue(true),
  getScoreAccessLevel: vi.fn().mockResolvedValue({ access: 'allowed' }),
  filterLeaguesForUser: vi.fn((leagues) => leagues),
  filterPlayersForUser: vi.fn((players) => players),
  PERMISSIONS: {
    CREATE_SESSION: 'CREATE_SESSION',
    JOIN_SESSION: 'JOIN_SESSION',
    ADD_ANY_SCORE: 'ADD_ANY_SCORE',
    UPDATE_ANY_SCORE: 'UPDATE_ANY_SCORE',
    MANAGE_LEAGUES: 'MANAGE_LEAGUES',
    MANAGE_TEAMS: 'MANAGE_TEAMS',
    MANAGE_MACHINES: 'MANAGE_MACHINES',
    MANAGE_PLAYERS: 'MANAGE_PLAYERS',
    ADD_LOCATION_MACHINE: 'ADD_LOCATION_MACHINE',
    UPDATE_SELF: 'UPDATE_SELF',
    RUN_CLEANUP: 'RUN_CLEANUP',
  },
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    calculateTurnResults: vi.fn(() => ({ turnResults: [], total: 0 })),
    getRoundLabel: () => 'Frame',
    getPrimaryTargetLabel: () => 'Strike',
    getRoundRowContext: () => ({}),
    getRequiredEventData: (eventId, api) => ({
      eventMatchups: api.matchups?.get ? Promise.resolve(api.matchups.get(eventId)).then(r => r || []).catch(() => []) : Promise.resolve([]),
      allEventScores: api.scores?.get ? Promise.resolve(api.scores.get(null, Number(eventId))).then(r => r || []).catch(() => []) : Promise.resolve([])
    }),
    enrichScoreMap: (sm) => sm || ({}),
    renderResults: () => ({}),
    getRowSummaryHtml: vi.fn(() => '<div>Summary</div>'),
    getRowSummaryData: vi.fn(() => ({ label: 'Strike', value: 1000 })),
    getBonusTargets: vi.fn(() => ({ t1: 0, t2: 0 })),
    getMarkFormatting: vi.fn((mark) => (mark === 10 ? 'golf-eagle' : '')),
    formatMark: vi.fn((turn) => turn.mark),
    filterThresholds: vi.fn(v => v),
    formatTotalScore: vi.fn((t) => String(t)),
    getLastFrameHint: vi.fn(() => ''),
    getMatchupDescription: () => ({ description: '', details: [] }),
    buildPlayerScoreMap: (_playerId, playerScores) => {
      const map = {};
      for (const s of (playerScores || [])) {
        if (s.orderNumber != null) map[`order_${s.orderNumber}`] = s;
      }
      return map;
    },
  })),
}));

vi.mock('@ui/printing.js', () => ({
  printBlankScoreSheet: vi.fn(),
}));

vi.mock('@services/scoringFormatBranding.js', () => ({
  FormatBranding: {
    get: vi.fn(() => ({
      brandName: 'PinBowling',
      logoImage: 'logo.png',
      playActionLabel: 'Play',
      themeClass: 'theme-bowling',
      roundLabel: 'Frame',
      turnHeaderPrefix: 'Frame',
      primaryTargetLabel: 'Strike',
      scoringHint: 'Aim for strikes',
      lastFrameHint: ''
    }))
  }
}));

vi.mock('@ui/dialogs.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    showAlert: vi.fn(),
  };
});

vi.mock('@ui/selectors.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual, // Spread actual to ensure all exports exist
    createSearchableSelect: vi.fn().mockReturnValue({
      updateOptions: vi.fn(),
      setData: vi.fn(), // If you add a new method to the real file, add it here too
    }),
    initTournamentSelector: vi.fn().mockImplementation(async (container, options) => {
      if (options?.onRefresh) await options.onRefresh();
      return {
        setData: vi.fn(),
      };
    }),
    renderActionSummary: vi.fn((container, title, actions = []) => {
      if (container) {
        container.innerHTML = title;
        container._actions = actions;
        container.classList.remove('hidden');
      }
    }),
  };
});

vi.mock('@ui/branding.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    applyPreferredTheme: vi.fn(),
  };
});

describe('Scoring Entry Page (scoresPage.js)', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

    document.body.innerHTML = `
      <div id="tournament-selector-ui"></div>
      <div id="tournament-summary" class="hidden"><span id="tournament-summary-text"></span><button id="change-tournament-btn"></button></div>
      <div id="player-selection-card" class="hidden">
         <div id="player-selector-ui"><select id="player-select"></select></div>
         <div id="player-summary" class="hidden"><span id="player-summary-text"></span><button id="change-player-btn"></button></div>
      </div>
      <div id="scoring-card" class="hidden"><div id="rounds-input"></div></div>
      <div id="results-card" class="hidden">
         <div id="results-panel" class="hidden">
            <table><thead><tr><th></th></tr></thead><tbody id="results-body"></tbody></table>
            <div id="total-score"></div>
         </div>
         <div id="results-empty"></div>
      </div>
      <div id="player-warning" class="hidden"></div>
      <div id="matchups-schedule-container" class="hidden"><ul class="week-matchups-list"></ul></div>
    `;

    vi.clearAllMocks();
    Utils.getActiveLeagueId.mockReturnValue('1');
    Utils.getActiveEventId.mockReturnValue('101');
    PB_API.leagues.getAll.mockResolvedValue([{ id: '1', name: 'Standard League', players: [], events: [{ id: '101', eventName: 'Week 1' }] }]);
    PB_API.machines.getTargets.mockResolvedValue([{ orderNumber: 1, machineName: 'M1', machineId: 5, values: { 10: 100 } }]);
    PB_API.scores.get.mockResolvedValue([]);
    PB_API.auth.me.mockResolvedValue(null);
  });

  it('should hide selector and show summary when event is active', async () => {
    await initScoresPage();
    expect(document.getElementById('tournament-summary').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tournament-summary').textContent).toContain('Week 1');
  });

  it('should load inputs and results when a player is selected', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.players.getAll.mockResolvedValue([{ id: 20, playerName: 'Alice' }]);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, players: [{ id: 20, playerName: 'Alice' }] }]);
    
    await initScoresPage();
    
    expect(document.getElementById('scoring-card').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('rounds-input').children.length).toBe(1);
  });

  it('should handle tournament change and player change actions', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.players.getAll.mockResolvedValue([{ id: 20, playerName: 'Alice' }]);
    
    await initScoresPage();

    // Verify tournament summary click/action triggers tournament change
    const tourSummary = document.getElementById('tournament-summary');
    expect(tourSummary._actions).toBeDefined();
    const changeTourAction = tourSummary._actions.find(a => a.text === 'Change');
    expect(changeTourAction).toBeDefined();
    changeTourAction.onclick();
    expect(document.getElementById('tournament-selector-ui').classList.contains('hidden')).toBe(false);

    // Verify player summary click/action triggers player change
    const playSummary = document.getElementById('player-summary');
    expect(playSummary._actions).toBeDefined();
    const changePlayAction = playSummary._actions.find(a => a.text === 'Change');
    expect(changePlayAction).toBeDefined();
    changePlayAction.onclick();
    expect(document.getElementById('player-selector-ui').classList.contains('hidden')).toBe(false);
  });

  it('should print blank score sheet when clicked', async () => {
    await initScoresPage();
    const tourSummary = document.getElementById('tournament-summary');
    const printAction = tourSummary._actions.find(a => a.text === 'Print Blank Score Sheet');
    expect(printAction).toBeDefined();
    printAction.onclick();
    expect(printBlankScoreSheet).toHaveBeenCalled();
  });

  it('should toggle target details when clicking round-info or target-details', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.players.getAll.mockResolvedValue([{ id: 20, playerName: 'Alice' }]);
    await initScoresPage();

    const infoDiv = document.querySelector('.round-info');
    const detailsDiv = document.querySelector('.target-details');
    expect(detailsDiv.classList.contains('hidden')).toBe(true);

    // Click to show
    infoDiv.click();
    expect(detailsDiv.classList.contains('hidden')).toBe(false);

    // Click to hide
    detailsDiv.click();
    expect(detailsDiv.classList.contains('hidden')).toBe(true);
  });

  it('should enable save button on input and handle successful save', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.players.getAll.mockResolvedValue([{ id: 20, playerName: 'Alice' }]);
    PB_API.scores.save.mockResolvedValue({ success: true });
    await initScoresPage();

    const saveBtn = document.querySelector('.save-round-button');
    const input = document.querySelector('.roll-input');
    expect(saveBtn.disabled).toBe(true);

    // Input score
    input.value = '10000';
    input.dispatchEvent(new Event('input'));
    expect(saveBtn.disabled).toBe(false);
    expect(saveBtn.classList.contains('is-dirty')).toBe(true);

    // Save score
    await saveBtn.click();
    expect(PB_API.scores.save).toHaveBeenCalled();
  });

  it('should show alert warning when saving fails', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.players.getAll.mockResolvedValue([{ id: 20, playerName: 'Alice' }]);
    PB_API.scores.save.mockRejectedValue(new Error('Save Failed'));
    await initScoresPage();

    const saveBtn = document.querySelector('.save-round-button');
    const input = document.querySelector('.roll-input');

    input.value = '10000';
    input.dispatchEvent(new Event('input'));
    await saveBtn.click();
    await vi.waitFor(() => expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Failed to save score: Save Failed'), 'Error'));
  });

  it('should show setup warning when event has no machines', async () => {
    PB_API.machines.getTargets.mockResolvedValue([]);
    await initScoresPage();

    expect(document.getElementById('player-warning').innerHTML).toContain('not been setup');
  });

  it('should render warning reason and lock input when access is denied', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.players.getAll.mockResolvedValue([{ id: 20, playerName: 'Alice' }]);
    getScoreAccessLevel.mockResolvedValueOnce({ access: 'denied', reason: 'Time locked' });
    await initScoresPage();

    expect(document.querySelector('.round-msg').textContent).toBe('Time locked');
    expect(document.querySelector('.save-round-button').hidden).toBe(true);
  });

  it('should handle API errors gracefully during init', async () => {
    PB_API.leagues.getAll.mockRejectedValueOnce(new Error('API failure'));
    PB_API.auth.me.mockRejectedValueOnce(new Error('Auth failure'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await initScoresPage();

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch leagues'), expect.any(Object));
    consoleErrorSpy.mockRestore();
  });

  it('should reset event ID if virtual summary event is loaded', async () => {
    Utils.getActiveLeagueId.mockReturnValue('1');
    Utils.getActiveEventId.mockReturnValue('summary');
    await initScoresPage();
    expect(Utils.setActiveEventIdSilent).toHaveBeenCalledWith('');
  });

  it('should resolve and render player selection for team participant leagues', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.players.getAll.mockResolvedValue([
      { id: 20, playerName: 'Alice' },
      { id: 30, playerName: 'Bob' }
    ]);
    PB_API.leagues.getAll.mockResolvedValue([
      {
        id: 1,
        participants: 'team',
        teams: [
          { id: 10, name: 'Team A', members: [{ id: 20, playerName: 'Alice' }] }
        ],
        events: [{ id: 101, eventName: 'Week 1' }]
      }
    ]);

    await initScoresPage();

    expect(document.getElementById('scoring-card').classList.contains('hidden')).toBe(false);
  });

  it('should lock inputs when certain balls are marked as locked', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.players.getAll.mockResolvedValue([{ id: 20, playerName: 'Alice' }]);
    getScoreAccessLevel.mockResolvedValueOnce({
      access: 'allowed',
      reason: '',
      lockedBalls: { ball1: true }
    });

    await initScoresPage();

    const input1 = document.querySelector('[data-ball="1"]');
    expect(input1.readOnly).toBe(true);
    expect(input1.classList.contains('ball-locked')).toBe(true);
  });

  it('should render schedule list on scores page for head-to-head league when no matchup is active', async () => {
    Utils.getActiveLeagueId.mockReturnValue('1');
    Utils.getActiveEventId.mockReturnValue('101');
    Utils.getActiveEventMatchupId.mockReturnValue('');

    PB_API.leagues.getAll.mockResolvedValue([
      { 
        id: 1, 
        name: 'H2H League', 
        participants: 'head2head', 
        scoringFormat: 'baseball',
        events: [{ 
          id: 101, 
          eventName: 'Week 1',
          matchups: [
            { id: 50, eventId: 101, player1Id: 10, player1Name: 'Home P', player2Id: 20, player2Name: 'Away P', status: 'pending' }
          ]
        }] 
      }
    ]);
    PB_API.matchups.get.mockImplementation((eventId, eventMatchupId) => {
      if (eventMatchupId) {
        return Promise.resolve({
          id: 50, eventId: 101, player1Id: 10, player1Name: 'Home P', player2Id: 20, player2Name: 'Away P', status: 'pending',
          entries: [{ id: 1, orderNumber: 1, machineId: 5, machineName: 'M1' }]
        });
      }
      return Promise.resolve([
        { id: 50, eventId: 101, player1Id: 10, player1Name: 'Home P', player2Id: 20, player2Name: 'Away P', status: 'pending' }
      ]);
    });

    await initScoresPage();

    const scheduleContainer = document.getElementById('matchups-schedule-container');
    expect(scheduleContainer.classList.contains('hidden')).toBe(false);
    expect(scheduleContainer.innerHTML).toContain('Away P');
    expect(scheduleContainer.innerHTML).toContain('Home P');
  });

  it('should render spectator mode notice and disable inputs when spectator tries to view matchup', async () => {
    Utils.getActiveLeagueId.mockReturnValue('1');
    Utils.getActiveEventId.mockReturnValue('101');
    Utils.getActiveEventMatchupId.mockReturnValue('50');
    Utils.getCurrentPlayerId.mockReturnValue('30');

    PB_API.leagues.getAll.mockResolvedValue([
      { 
        id: 1, 
        name: 'H2H League', 
        participants: 'head2head', 
        scoringFormat: 'baseball',
        events: [{ id: 101, eventName: 'Week 1' }] 
      }
    ]);
    PB_API.matchups.get.mockImplementation((eventId, eventMatchupId) => {
      if (eventMatchupId) {
        return Promise.resolve({
          id: 50, eventId: 101, player1Id: 10, player1Name: 'Home P', player2Id: 20, player2Name: 'Away P', status: 'pending',
          entries: [{ id: 1, orderNumber: 1, machineId: 5, machineName: 'M1' }]
        });
      }
      return Promise.resolve([
        { id: 50, eventId: 101, player1Id: 10, player1Name: 'Home P', player2Id: 20, player2Name: 'Away P', status: 'pending' }
      ]);
    });
    PB_API.auth.me.mockResolvedValue({ player_id: 30 });
    const { can } = await import('@services/auth.js');
    can.mockResolvedValue(false);

    getScoreAccessLevel.mockResolvedValueOnce({
      access: 'denied',
      reason: 'Spectator',
      lockedBalls: {}
    });

    await initScoresPage();

    const warningEl = document.getElementById('player-warning');
    expect(warningEl.classList.contains('hidden')).toBe(false);
    expect(warningEl.textContent).toContain('Spectator Mode');
  });
});