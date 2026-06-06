/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initScoresPage } from '@pages/scoresPage.js';
import { PB_API } from '@services/api.js';
import * as Utils from '@scripts/utils.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getLeague: vi.fn(),
    getPlayers: vi.fn(),
    getTargetScores: vi.fn(),
    getScores: vi.fn(),
    saveScore: vi.fn(),
    getCurrentUser: vi.fn(),
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
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    calculateTurnResults: vi.fn(() => ({ turnResults: [], total: 0 })),
    getRoundLabel: () => 'Frame',
    getPrimaryTargetLabel: () => 'Strike',
    getBonusTargetHtml: () => '',
    getRowSummaryHtml: vi.fn(() => '<div>Summary</div>'),
    getMarkFormatting: vi.fn((mark, par) => (mark === 10 ? 'golf-eagle' : '')), // Mock some formatting
    formatMark: vi.fn((turn) => turn.mark),
    filterThresholds: vi.fn(v => v),
    formatTotalScore: vi.fn((t) => String(t)),
  })),
}));

const uiMocks = vi.hoisted(() => ({
  createSearchableSelect: vi.fn(() => ({ updateOptions: vi.fn() })),
  initTournamentSelector: vi.fn((container, options) => Promise.resolve(options?.onRefresh?.())),
  applyPreferredTheme: vi.fn(),
  renderActionSummary: vi.fn((container, title, actions = []) => {
    if (container) container.innerHTML = title;
    if (container) container._actions = actions;
    if (container) container.classList.remove('hidden');
  }),
}));

vi.mock('@ui/selectors.js', () => uiMocks);
vi.mock('@ui/branding.js', () => uiMocks);

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
    PB_API.getLeagues.mockResolvedValue([{ id: '1', events: [{ id: '101', eventName: 'Week 1' }] }]);
    PB_API.getLeague.mockResolvedValue({ id: '1', players: [] });
    PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineName: 'M1', machineId: 5, values: { 10: 100 } }]);
    PB_API.getScores.mockResolvedValue([]);
    PB_API.getCurrentUser.mockResolvedValue(null);
  });

  it('should hide selector and show summary when event is active', async () => {
    await initScoresPage();
    expect(document.getElementById('tournament-summary').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tournament-summary').textContent).toContain('Week 1');
  });

  it('should load inputs and results when a player is selected', async () => {
    Utils.getCurrentPlayerId.mockReturnValue('20');
    PB_API.getLeague.mockResolvedValue({ id: 1, players: [{ id: 20, playerName: 'Alice' }] });
    
    await initScoresPage();
    
    expect(document.getElementById('scoring-card').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('rounds-input').children.length).toBe(1);
  });

});