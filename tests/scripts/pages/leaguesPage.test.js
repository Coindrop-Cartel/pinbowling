/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initLeaguesPage } from '@pages/leaguesPage.js';
import { PB_API } from '@services/api.js';
import * as Auth from '@services/auth.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getPlayers: vi.fn(),
    createLeague: vi.fn(),
    deleteLeague: vi.fn(),
    createEvent: vi.fn(),
  },
}));

vi.mock('@services/auth.js', () => {
  const requireAdmin = vi.fn();
  return {
    requireAdmin,
    isManagementAuthorized: vi.fn(() => Promise.resolve(true)),
    // Ensure the wrapper mock actually calls the requireAdmin mock to reflect real behavior
    runAuthorizedLeagueAction: vi.fn(async (id, action) => (await requireAdmin()) ? action() : null),
  };
});

vi.mock('@ui/uiComponents.js', () => ({
  setupLiveFilter: vi.fn((input, data, options) => ({
    performFilter: () => {
      const query = input.value.toLowerCase();
      const filtered = data.filter(item => item.name.toLowerCase().includes(query));
      options.onFilter(filtered, query);
    }
  })),
  showConfirm: vi.fn(() => Promise.resolve(true)),
  showPrompt: vi.fn(),
  showPlayerSelectionDialog: vi.fn(),
  showDialog: vi.fn(),
  initTournamentSelector: vi.fn(),
}));

describe('Leagues Management Page (leaguesPage.js)', () => {
  const mockLeagues = [
    { id: 1, name: 'Monday Pinball', startDate: '2024-01-01', events: [], players: [] }
  ];

  beforeEach(() => {
    // Mock layout methods not implemented in JSDOM
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

    document.body.innerHTML = `
      <form id="league-form">
        <input id="league-name" />
        <div class="form-row"><input id="league-start-date" /></div>
        <div class="form-actions"><button id="create-league-btn">Save</button></div>
      </form>
      <div id="leagues-list"></div>
      <div id="leagues-list-empty" class="hidden"></div>
      <div id="event-form-card" class="hidden">
         <h2 id="event-form-title"></h2>
         <form id="event-form">
            <input id="event-league-id" />
            <input id="event-id" />
            <input id="event-name" />
            <input id="event-date" />
            <select id="event-location"></select>
            <button id="cancel-event-edit">Cancel</button>
         </form>
      </div>
    `;

    vi.clearAllMocks();
    PB_API.getLeagues.mockResolvedValue(mockLeagues);
    PB_API.getPlayers.mockResolvedValue([]);
  });

  it('should fetch and display leagues on init', async () => {
    await initLeaguesPage();
    expect(PB_API.getLeagues).toHaveBeenCalled();
    
    // Check if the list rendered the league
    const list = document.getElementById('leagues-list');
    expect(list.innerHTML).toContain('Monday Pinball');
  });

  it('should toggle the creation form when "Create New League" is clicked', async () => {
    await initLeaguesPage();
    const toggle = document.querySelector('button.secondary'); // The dynamic toggle
    const dateRow = document.getElementById('league-start-date').closest('.form-row');
    
    toggle.click();
    expect(dateRow.classList.contains('hidden')).toBe(false);
    expect(toggle.textContent).toBe('Cancel');
  });

  it('should create a league on form submission', async () => {
    await initLeaguesPage();
    const UI = await import('@ui/uiComponents.js');
    
    PB_API.createLeague.mockResolvedValue({ id: 2, name: 'New League' });
    
    document.getElementById('league-name').value = 'New League';
    document.getElementById('league-name').dispatchEvent(new Event('input'));
    document.getElementById('league-start-date').value = '2024-05-01';
    document.getElementById('league-start-date').dispatchEvent(new Event('input'));

    document.getElementById('create-league-btn').click();
    
    await vi.waitFor(() => {
      expect(PB_API.createLeague).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New League'
      }));
    });
  });

  it('should delete a league after confirmation and admin check', async () => {
    await initLeaguesPage();
    const UI = await import('@ui/uiComponents.js');
    UI.showConfirm.mockResolvedValue(true);
    Auth.requireAdmin.mockResolvedValue(true);

    const deleteBtn = document.querySelector('.delete-league-btn');
    deleteBtn.click();

    await vi.waitFor(() => {
      expect(PB_API.deleteLeague).toHaveBeenCalledWith(1);
    });
  });
});