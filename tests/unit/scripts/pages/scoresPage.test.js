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
  },
}));

vi.mock('@scripts/utils.js', () => ({
  getActiveEventId: vi.fn(),
  getActiveLeagueId: vi.fn(),
  getCurrentPlayerId: vi.fn(),
  setCurrentPlayerId: vi.fn(),
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
    getBonusTargetHtml: () => '',
    getRoundRowContext: () => '',
    enrichScoreMap: () => '',
    renderResults: () => '',
    getRowSummaryHtml: vi.fn(() => '<div>Summary</div>'),
    getMarkFormatting: vi.fn((mark) => (mark === 10 ? 'golf-eagle' : '')),
    formatMark: vi.fn((turn) => turn.mark),
    filterThresholds: vi.fn(v => v),
    formatTotalScore: vi.fn((t) => String(t)),
    getLastFrameHint: vi.fn(() => ''),
  })),
}));

vi.mock('@ui/printing.js', () => ({
  printBlankScoreSheet: vi.fn(),
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

});