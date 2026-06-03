/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getPlayers: vi.fn(),
    getLocations: vi.fn(),
    createLeague: vi.fn(),
    deleteLeague: vi.fn(),
    addLeaguePlayer: vi.fn(),
    removeLeaguePlayer: vi.fn(),
    createEvent: vi.fn(),
    updateEvent: vi.fn(),
    deleteEvent: vi.fn()
  }
}));

vi.mock('@services/auth.js', () => ({
  isManagementAuthorized: vi.fn(),
  runAuthorizedLeagueAction: vi.fn((id, cb) => cb())
}));

vi.mock('@scripts/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    setActiveLeagueId: vi.fn(),
    setActiveEventId: vi.fn(),
    getActiveLeagueId: vi.fn(),
    navigateTo: vi.fn(),
    getCookie: vi.fn(() => 'bowling'), // Mock getCookie to return a default value for tests
    ROUTES: {
      HOME: '/',
      LEAGUE_SETUP: (o) => `/setup?l=${o.leagueId}&e=${o.eventId}`
    }
  };
});

vi.mock('@ui/uiComponents.js', () => ({
  setupLiveFilter: vi.fn((input, data, options) => ({
    performFilter: () => options.onFilter(data, input.value.toLowerCase())
  })),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showPlayerSelectionDialog: vi.fn(),
  showAlert: vi.fn(),
  getFormatBadgeHtml: vi.fn((f) => `<span>${f || 'bowling'}</span>`),
}));

import { initLeaguesPage } from '@scripts/pages/leaguesPage.js';
import { PB_API } from '@services/api.js';
import { isManagementAuthorized } from '@services/auth.js';
import { showConfirm, showPlayerSelectionDialog } from '@ui/uiComponents.js';

describe('Leagues Page (leaguesPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="league-form">
        <input id="league-name" />
        <div id="league-date-row" class="hidden">
           <input id="league-start-date" />
        </div>
        <div id="league-format-row" class="hidden">
           <select id="league-scoring-format"></select>
        </div>
        <div class="form-actions hidden">
           <button id="create-league-btn"></button>
        </div>
      </form>
      <div id="leagues-list"></div>
      <div id="leagues-list-empty"></div>
      <div id="event-form-card" class="hidden">
        <h2 id="event-form-title"></h2>
        <form id="event-form">
          <input id="event-league-id" />
          <input id="event-id" />
          <input id="event-name" />
          <input id="event-date" />
          <select id="event-location"></select>
          <select id="event-scoring-format"></select>
          <button id="cancel-event-edit"></button>
        </form>
      </div>
    `;
    vi.clearAllMocks();
  });

  it('should render the league list and toggle expansion', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeagues = [{ id: 1, name: 'L1', players: [], events: [] }];
    PB_API.getLeagues.mockResolvedValue(mockLeagues);
    PB_API.getPlayers.mockResolvedValue([]);

    await initLeaguesPage();

    const item = document.querySelector('.league-registry-item');
    expect(item.innerHTML).toContain('L1');

    const header = item.querySelector('.league-header');
    header.click();

    expect(item.querySelector('.league-details').classList.contains('hidden')).toBe(false);
  });

  it('should prompt for player selection when adding a player', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1', players: [] }]);
    PB_API.getPlayers.mockResolvedValue([{ id: 10, playerName: 'Kyle' }]);
    showPlayerSelectionDialog.mockResolvedValue('10');

    await initLeaguesPage();
    document.querySelector('.league-header').click();
    document.querySelector('.add-player-btn').click();

    expect(showPlayerSelectionDialog).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(PB_API.addLeaguePlayer).toHaveBeenCalledWith(1, 10);
    });
  });
});