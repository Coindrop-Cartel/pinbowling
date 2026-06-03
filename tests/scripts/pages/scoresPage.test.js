/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getLeague: vi.fn(),
    getPlayers: vi.fn(),
    getScores: vi.fn(),
    saveScore: vi.fn(),
    getTargetScores: vi.fn(),
    getCurrentUser: vi.fn()
  }
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    getRoundLabel: vi.fn(() => 'Frame'),
    getPrimaryTargetLabel: vi.fn(() => 'Strike'),
    getBonusTargetHtml: vi.fn(() => ''),
    calculateTurnResults: vi.fn(() => ({ turnResults: [{ orderNumber: 1, mark: 'X', score: 30 }], total: 30 })),
    filterThresholds: vi.fn((v) => v),
  }))
}));

vi.mock('@scripts/utils.js', () => ({
  formatNumber: vi.fn(n => n?.toLocaleString() || '0'),
  applyScoreFormatting: vi.fn(),
  getActiveEventId: vi.fn(() => '101'),
  getActiveLeagueId: vi.fn(() => '1'),
  getCurrentPlayerId: vi.fn(),
  setCurrentPlayerId: vi.fn(),
  renderThresholdGrid: vi.fn(() => 'Grid'),
}));

vi.mock('@ui/uiComponents.js', () => ({
  initTournamentSelector: vi.fn(async (selector, options) => {
    if (options.onRefresh) await options.onRefresh();
  }),
  createSearchableSelect: vi.fn(() => ({ updateOptions: vi.fn() }))
}));

import { initScoresPage } from '@scripts/pages/scoresPage.js';
import { PB_API } from '@services/api.js';
import { getCurrentPlayerId } from '@scripts/utils.js';

describe('Scores Page (scoresPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="scoring-card" class="hidden">
        <div id="rounds-input"></div>
      </div>
      <div id="results-card" class="hidden">
        <div id="results-panel">
          <table><thead><tr><th>Frame</th></tr></thead><tbody id="results-body"></tbody></table>
          <span id="total-score"></span>
        </div>
        <div id="results-empty"></div>
      </div>
      <div id="player-selection-card" class="hidden">
        <select id="player-select"></select>
      </div>
      <div id="player-warning" class="hidden"></div>
      <div id="tournament-selector-ui"></div>
      <div id="tournament-summary" class="hidden"><span id="tournament-summary-text"></span><button id="change-tournament-btn"></button></div>
      <div id="player-selector-ui"></div>
      <div id="player-summary" class="hidden"><span id="player-summary-text"></span><button id="change-player-btn"></button></div>
      <div class="tournament-selector-container"></div>
    `;
    vi.clearAllMocks();
    PB_API.getCurrentUser.mockResolvedValue({ role: 'player', player_id: '7' });
  });

  it('should load machines and reveal player selection on init', async () => {
    PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1', events: [{ id: 101, eventName: 'W1' }] }]);
    PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineName: 'M1', value1: 1000, values: { 10: 1000 } }]);
    PB_API.getLeague.mockResolvedValue({ players: [] });

    await initScoresPage();

    expect(document.getElementById('player-selection-card').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('tournament-summary-text').textContent).toContain('L1 - W1');
  });

  it('should render input rows and results when a player is selected', async () => {
    PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1', events: [{ id: 101, eventName: 'W1' }] }]);
    PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineId: 5, machineName: 'M1', value1: 1000, values: { 10: 1000 } }]);
    PB_API.getLeague.mockResolvedValue({ players: [{ id: 7, playerName: 'Kyle' }] });
    getCurrentPlayerId.mockReturnValue('7');
    PB_API.getScores.mockResolvedValue([]);

    await initScoresPage();

    expect(document.getElementById('rounds-input').children.length).toBe(1);
    expect(document.getElementById('total-score').textContent).toBe('30');
  });

  it('should trigger save score API when save button is clicked', async () => {
    PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1' }]);
    PB_API.getLeague.mockResolvedValue({ players: [{ id: 7, playerName: 'Kyle' }] });
    PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineId: 5, machineName: 'M1', value1: 1000, values: { 10: 1000 } }]);
    getCurrentPlayerId.mockReturnValue('7');
    PB_API.getScores.mockResolvedValue([]);
    
    await initScoresPage();
    
    // Simulate user input to enable the save button
    const rollInput = document.querySelector('.roll-input');
    rollInput.value = '1,000';
    rollInput.dispatchEvent(new Event('input'));

    const saveBtn = document.querySelector('.save-round-button');
    saveBtn.click();

    await vi.waitFor(() => {
      expect(PB_API.saveScore).toHaveBeenCalledWith(expect.objectContaining({
        playerId: 7,
        machineId: 5
      }));
    });
  });

  describe('Permissions & Security', () => {
    it('Admin should be able to edit existing scores in standard leagues', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'admin', player_id: '1' });
      PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1', type: 'standard' }]);
      PB_API.getLeague.mockResolvedValue({ id: 1, players: [{ id: 7, playerName: 'Kyle', userId: 123 }] });
      PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineId: 5, machineName: 'M1', value1: 1000, values: { 10: 1000 } }]);
      PB_API.getScores.mockResolvedValue([{ orderNumber: 1, ball1: 500, ball2: 0, ball3: 0 }]); // Existing score
      getCurrentPlayerId.mockReturnValue('7');

      await initScoresPage();

      const saveBtn = document.querySelector('.save-round-button');
      expect(saveBtn.style.display).not.toBe('none');
      expect(document.body.innerHTML).not.toContain('Updates locked');
    });

    it('Regular User should be locked from editing existing scores in standard leagues', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'player', player_id: '7' });
      PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1', type: 'standard' }]);
      PB_API.getLeague.mockResolvedValue({ id: 1, players: [{ id: 7, playerName: 'Kyle', userId: 777 }] });
      PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineId: 5, machineName: 'M1', value1: 1000, values: { 10: 1000 } }]);
      PB_API.getScores.mockResolvedValue([{ orderNumber: 1, ball1: 500, ball2: 0, ball3: 0 }]); // Existing score
      getCurrentPlayerId.mockReturnValue('7');

      await initScoresPage();

      expect(document.body.innerHTML).toContain('Updates locked');
      const saveBtn = document.querySelector('.save-round-button');
      expect(saveBtn.style.display).toBe('none');
    });

    it('Regular User can edit an unregistered user score', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'player', player_id: '7' });
      PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1', type: 'session' }]);
      // Player 8 has no userId (unregistered guest)
      PB_API.getLeague.mockResolvedValue({ id: 1, players: [{ id: 8, playerName: 'Guest', userId: null }] });
      PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineId: 5, machineName: 'M1', value1: 1000, values: { 10: 1000 } }]);
      PB_API.getScores.mockResolvedValue([]);
      getCurrentPlayerId.mockReturnValue('8');

      await initScoresPage();

      const saveBtn = document.querySelector('.save-round-button');
      expect(saveBtn.style.display).not.toBe('none');
      expect(document.body.innerHTML).not.toContain('Guest Only');
    });

    it('Regular User cannot edit another registered user score', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'player', player_id: '7' });
      PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1', type: 'session' }]);
      // Player 9 is registered (has userId) but is not the current user (7)
      PB_API.getLeague.mockResolvedValue({ id: 1, players: [{ id: 9, playerName: 'Other', userId: 999 }] });
      PB_API.getTargetScores.mockResolvedValue([{ orderNumber: 1, machineId: 5, machineName: 'M1', value1: 1000, values: { 10: 1000 } }]);
      PB_API.getScores.mockResolvedValue([]);
      getCurrentPlayerId.mockReturnValue('9');

      await initScoresPage();

      expect(document.body.innerHTML).toContain('Guest Only');
      const saveBtn = document.querySelector('.save-round-button');
      expect(saveBtn.style.display).toBe('none');
    });
  });
});