/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    leagues: {
      getAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      addPlayer: vi.fn(),
      removePlayer: vi.fn(),
      updateSeason: vi.fn()
    },
    players: {
      getAll: vi.fn()
    },
    locations: {
      getAll: vi.fn()
    },
    teams: {
      getAll: vi.fn(),
      addToLeague: vi.fn(),
      removeFromLeague: vi.fn()
    },
    events: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  }
}));

const { mockLeagueState } = vi.hoisted(() => ({
  mockLeagueState: { activeId: null }
}));

vi.mock('@services/auth.js', () => ({
  isManagementAuthorized: vi.fn(),
  runAuthorizedLeagueAction: vi.fn((id, cb) => cb())
}));

vi.mock('@scripts/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    setActiveLeagueId: vi.fn((id) => { mockLeagueState.activeId = id; }),
    setActiveEventId: vi.fn(),
    setActiveLeagueIdSilent: vi.fn((id) => { mockLeagueState.activeId = id; }),
    setActiveEventIdSilent: vi.fn(),
    getActiveLeagueId: vi.fn(() => mockLeagueState.activeId),
    loadPage: vi.fn(),
    getCookie: vi.fn(() => 'bowling'), // Mock getCookie to return a default value for tests
  };
});

const uiMocks = vi.hoisted(() => ({
  setupLiveFilter: vi.fn((input, data, options) => {
    let currentData = typeof data === 'function' ? data() : data;
    const filterInstance = {
      setData: vi.fn((newData) => { currentData = newData; }),
      performFilter: () => {
        const query = (input ? input.value || '' : '').toLowerCase();
        const filtered = currentData.filter(item => {
          const label = item[options.labelKey] || '';
          return label.toLowerCase().includes(query);
        });
        options.onFilter(filtered, query);
      }
    };
    // Add input event listener to trigger filtering on input changes
    if (input) {
      input.addEventListener('input', () => filterInstance.performFilter());
    }
    return filterInstance;
  }),
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showPlayerSelectionDialog: vi.fn(),
  showAlert: vi.fn(),
  showDialog: vi.fn(),
  getFormatBadgeHtml: vi.fn((f) => `<span>${f || 'bowling'}</span>`),
  applyPreferredTheme: vi.fn(),
  createSkeletonLoader: vi.fn(() => ({ remove: vi.fn() })),
  createExpandableRow: vi.fn((container, options) => {
    const row = document.createElement('div');
    row.className = options.className || '';
    row.innerHTML = `
      <div class="league-header">${options.headerHtml}</div>
      <div class="league-details ${options.isExpanded ? '' : 'hidden'}">${options.contentHtml}</div>
    `;
    container.appendChild(row);
    if (options.onHeaderClick) {
      row.querySelector('.league-header').addEventListener('click', options.onHeaderClick);
    }
    return row;
  }),
}));

vi.mock('@core/engine.js', () => ({
  SCORING_FORMATS: [
    { value: 'bowling', label: 'Bowling (Marks & Frames)' },
    { value: 'golf', label: 'Golf (Strokes vs Par)' }
  ],
  getScoringEngine: vi.fn()
}));
vi.mock('@scripts/routes.js', () => ({
  ROUTE_PATHS: {
    HOME: () => '/',
    LEAGUE_SETUP: (o) => `/setup?leagueId=${o.leagueId}&eventId=${o.eventId}`,
    LEAGUES: (id) => `/leagues?id=${id}`
  },
}));

vi.mock('@ui/selectors.js', () => uiMocks);
vi.mock('@ui/dialogs.js', () => uiMocks);
vi.mock('@ui/branding.js', () => uiMocks);

import { initLeaguesPage } from '@scripts/pages/leaguesPage.js';
import { PB_API } from '@services/api.js';
import { isManagementAuthorized } from '@services/auth.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { showConfirm, showPlayerSelectionDialog } from '@ui/dialogs.js';

describe('Leagues Page (leaguesPage.js)', () => {
  beforeEach(() => {
    // Mock layout methods not implemented in JSDOM
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('scrollTo', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();

    document.body.innerHTML = `
      <section class="card">
        <form id="league-form">
          <h2 id="league-form-title">Add New League</h2>
          <input id="league-name" />
          <button id="create-league-toggle" type="button">Create League</button>
          <div id="league-date-row" class="form-row hidden">
            <input id="league-start-date" />
          </div>
          <div id="league-format-row" class="hidden">
            <select id="league-scoring-format"></select>
          </div>
          <div id="league-season-scoring-row" class="form-row hidden">
            <select id="league-season-scoring"></select>
          </div>
          <div id="league-weekly-points-row" class="form-row hidden">
            <input id="league-weekly-points" type="number" />
          </div>
          <div id="league-point-spread-row" class="form-row hidden">
            <input id="league-point-spread" type="number" />
          </div>
          <div id="league-competition-row" class="form-row hidden">
            <select id="league-competition"><option value="group">Group Play</option><option value="head2head">Head to Head</option></select>
          </div>
          <div id="league-participants-row" class="form-row hidden">
            <select id="league-participants"><option value="individual">Individual</option><option value="team">Team</option></select>
          </div>
          <div id="league-drop-weeks-row" class="form-row hidden">
            <input id="league-drop-weeks" type="number" />
          </div>
          <div class="form-actions hidden">
            <button id="create-league-btn"></button>
          </div>
        </form>
      </section>
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
    mockLeagueState.activeId = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should handle unauthorized access by hiding management tools', async () => {
    isManagementAuthorized.mockResolvedValue(false);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    // Verify management elements are suppressed
    expect(document.querySelector('.add-event-btn')).toBeNull();
    expect(document.getElementById('create-league-btn').closest('.form-actions').classList.contains('hidden')).toBe(true);
  });

  it('should render the league list and toggle expansion', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeagues = [{ id: 1, name: 'L1', players: [], events: [] }];
    PB_API.leagues.getAll.mockResolvedValue(mockLeagues);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    const item = document.querySelector('.league-registry-item');
    expect(item.innerHTML).toContain('L1');

    const header = item.querySelector('.league-header');
    header.click();

    const updatedItem = document.querySelector('.league-registry-item');
    expect(updatedItem.querySelector('.league-details').classList.contains('hidden')).toBe(false);
  });

  it('should prompt for player selection when adding a player', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', players: [] }]);
    PB_API.players.getAll.mockResolvedValue([{ id: 10, playerName: 'Kyle' }]);
    showPlayerSelectionDialog.mockResolvedValue('10');

    await initLeaguesPage();
    document.querySelector('.league-header').click();
    document.querySelector('.add-player-btn').click();

    expect(showPlayerSelectionDialog).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(PB_API.leagues.addPlayer).toHaveBeenCalledWith(1, 10);
    });
  });

  it('should toggle the create league form', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([]);
    await initLeaguesPage();

    const toggle = document.getElementById('create-league-toggle');
    const dateRow = document.getElementById('league-start-date').closest('.form-row');

    expect(dateRow.classList.contains('hidden')).toBe(true);
    toggle.click();
    expect(dateRow.classList.contains('hidden')).toBe(false);
    toggle.click();
    expect(dateRow.classList.contains('hidden')).toBe(true);
  });

  it('should create a new league on form submission', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([]);
    await initLeaguesPage();

    document.getElementById('league-name').value = 'New Season';
    document.getElementById('league-start-date').value = '2024-01-01';
    
    // Trigger input to enable create button
    document.getElementById('league-name').dispatchEvent(new Event('input'));
    
    document.getElementById('league-form').dispatchEvent(new Event('submit'));
    expect(PB_API.leagues.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Season',
      startDate: '2024-01-01'
    }));
  });

  it('should remove a player from a league after confirmation', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ 
      id: 1, name: 'L1', players: [{ id: 10, playerName: 'Kyle' }] 
    }]);
    PB_API.players.getAll.mockResolvedValue([]);
    showConfirm.mockResolvedValue(true);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand row
    
    const removeBtn = document.querySelector('.remove-player-btn');
    removeBtn.click();

    expect(showConfirm).toHaveBeenCalled();
    await vi.waitFor(() => expect(PB_API.leagues.removePlayer).toHaveBeenCalledWith(1, 10));
  });

  it('should populate form fields when editing a league', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeague = { id: 5, name: 'EditMe', startDate: '2024-06-01', scoringFormat: 'golf', competitionFormat: 'group', participationType: 'team', seasonScoring: 'cumulative', dropLowestWeeks: 2, players: [], events: [] };
    PB_API.leagues.getAll.mockResolvedValue([mockLeague]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    const editBtn = document.querySelector('.edit-league-btn');
    editBtn.click();

    expect(document.getElementById('league-name').value).toBe('EditMe');
    expect(document.getElementById('league-start-date').value).toBe('2024-06-01');
    expect(document.getElementById('league-form-title').textContent).toContain('Edit League');
    expect(document.getElementById('create-league-btn').textContent).toBe('Update League');
    expect(document.getElementById('league-date-row').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('league-scoring-format').value).toBe('golf');
  });

  it('should call PB_API.leagues.update when editing and submitting', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeague = { id: 5, name: 'EditMe', startDate: '2024-06-01', scoringFormat: 'bowling', competitionFormat: 'group', participationType: 'individual', seasonScoring: 'weekly', dropLowestWeeks: 0, players: [], events: [] };
    PB_API.leagues.getAll.mockResolvedValue([mockLeague]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    // Click edit to populate form
    document.querySelector('.edit-league-btn').click();

    // Submit the form
    document.getElementById('league-form').dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(PB_API.leagues.update).toHaveBeenCalledWith(5, expect.objectContaining({ name: 'EditMe' }));
    });
  });

  it('should reset form when cancel is clicked during edit', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeague = { id: 5, name: 'EditMe', startDate: '2024-06-01', scoringFormat: 'bowling', players: [], events: [] };
    PB_API.leagues.getAll.mockResolvedValue([mockLeague]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    // Click edit
    document.querySelector('.edit-league-btn').click();
    expect(document.getElementById('league-form-title').textContent).toContain('Edit League');

    // Click cancel (toggle acts as cancel when form is open)
    document.getElementById('create-league-toggle').click();

    expect(document.getElementById('league-form-title').textContent).toBe('Create League');
    expect(document.getElementById('create-league-btn').textContent).toBe('Save League');
  });

  it('should delete a league after confirmation', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'ToDelete', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);
    showConfirm.mockResolvedValue(true);

    await initLeaguesPage();

    const deleteBtn = document.querySelector('.delete-league-btn');
    deleteBtn.click();

    expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining('ToDelete'), 'Delete League');
    await vi.waitFor(() => expect(PB_API.leagues.delete).toHaveBeenCalledWith(1));
  });

  it('should not delete a league if confirmation is denied', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'KeepMe', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);
    showConfirm.mockResolvedValue(false);

    await initLeaguesPage();

    document.querySelector('.delete-league-btn').click();

    expect(showConfirm).toHaveBeenCalled();
    // Give a tick for any async to settle
    await vi.waitFor(() => expect(PB_API.leagues.delete).not.toHaveBeenCalled());
  });

  it('should delete an event after confirmation and update local data', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeague = { id: 1, name: 'L1', players: [], events: [{ id: 50, eventName: 'E1', eventDate: '2024-01-01' }] };
    PB_API.leagues.getAll.mockResolvedValue([mockLeague]);
    PB_API.players.getAll.mockResolvedValue([]);
    showConfirm.mockResolvedValue(true);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    const deleteEventBtn = document.querySelector('.delete-event-btn');
    expect(deleteEventBtn).not.toBeNull();
    deleteEventBtn.click();

    expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining('L1'), 'Delete Event');
    await vi.waitFor(() => expect(PB_API.events.delete).toHaveBeenCalledWith(50, 1));
  });

  it('should show event form in create mode', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 10, name: 'Main St' }]);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    const addEventBtn = document.querySelector('.add-event-btn');
    addEventBtn.click();

    expect(document.getElementById('event-form-card').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('event-form-title').innerHTML).toContain('Add Event');
    expect(document.getElementById('event-id').value).toBe('');
  });

  it('should show event form in edit mode with pre-populated fields', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeague = { id: 1, name: 'L1', players: [], events: [{ id: 50, eventName: 'MyEvent', eventDate: '2024-03-15', scoringFormat: 'golf', locationId: 10 }] };
    PB_API.leagues.getAll.mockResolvedValue([mockLeague]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 10, name: 'Main St' }]);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    const editEventBtn = document.querySelector('.edit-event-btn');
    editEventBtn.click();

    expect(document.getElementById('event-form-card').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('event-form-title').innerHTML).toContain('Edit Event');
    expect(document.getElementById('event-name').value).toBe('MyEvent');
    expect(document.getElementById('event-date').value).toBe('2024-03-15');
  });

  it('should cancel event edit and hide form', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    // Show event form
    document.querySelector('.add-event-btn').click();
    expect(document.getElementById('event-form-card').classList.contains('hidden')).toBe(false);

    // Cancel
    document.getElementById('cancel-event-edit').click();
    expect(document.getElementById('event-form-card').classList.contains('hidden')).toBe(true);
  });

  it('should create a new event on event form submit', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 10, name: 'Main' }]);
    PB_API.events.create.mockResolvedValue({ id: 99 });

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    // Show event form
    document.querySelector('.add-event-btn').click();

    document.getElementById('event-name').value = 'New Event';
    document.getElementById('event-date').value = '2024-05-01';

    // Wait for showEventForm to populate the location dropdown, then set the value
    await vi.waitFor(() => {
      expect(document.getElementById('event-location').options.length).toBeGreaterThan(0);
    });
    document.getElementById('event-location').value = '10';
    document.getElementById('event-form').dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(PB_API.events.create).toHaveBeenCalledWith(expect.objectContaining({
        leagueId: '1',
        eventName: 'New Event',
        eventDate: '2024-05-01'
      }));
    });
  });

  it('should update an existing event on event form submit', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeague = { id: 1, name: 'L1', players: [], events: [{ id: 50, eventName: 'OldEvent', eventDate: '2024-01-01', scoringFormat: 'bowling' }] };
    PB_API.leagues.getAll.mockResolvedValue([mockLeague]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 10, name: 'Main' }]);
    PB_API.events.update.mockResolvedValue({ id: 50 });

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    // Click edit event
    document.querySelector('.edit-event-btn').click();

    document.getElementById('event-name').value = 'Updated Event';

    // Wait for showEventForm to populate the location dropdown, then set the value
    await vi.waitFor(() => {
      expect(document.getElementById('event-location').options.length).toBeGreaterThan(0);
    });
    document.getElementById('event-location').value = '10';
    document.getElementById('event-form').dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(PB_API.events.update).toHaveBeenCalledWith('50', expect.objectContaining({
        eventName: 'Updated Event'
      }));
    });
  });

  it('should add a team to a league via selection dialog', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', competitionFormat: 'group', participationType: 'team', teams: [], players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.teams.getAll.mockResolvedValue([{ id: 20, name: 'TeamA', city: 'NYC' }]);
    showPlayerSelectionDialog.mockResolvedValue('20');

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    const addTeamBtn = document.querySelector('.add-team-btn');
    addTeamBtn.click();

    await vi.waitFor(() => {
      expect(PB_API.teams.addToLeague).toHaveBeenCalledWith(1, 20);
    });
  });

  it('should alert when all teams are already in the league', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const existingTeam = { id: 20, name: 'TeamA', city: 'NYC' };
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', competitionFormat: 'group', participationType: 'team', teams: [existingTeam], players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.teams.getAll.mockResolvedValue([existingTeam]);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    document.querySelector('.add-team-btn').click();

    await vi.waitFor(() => {
      expect(alert).toHaveBeenCalledWith(expect.stringContaining('already in this league'));
    });
  });

  it('should remove a team from a league after confirmation', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', competitionFormat: 'group', participationType: 'team', teams: [{ id: 20, name: 'TeamA', city: 'NYC' }], players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);
    showConfirm.mockResolvedValue(true);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    const removeTeamBtn = document.querySelector('.remove-team-btn');
    removeTeamBtn.click();

    expect(showConfirm).toHaveBeenCalled();
    await vi.waitFor(() => expect(PB_API.teams.removeFromLeague).toHaveBeenCalledWith(1, 20));
  });

  it('should alert when all players are already in the league', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const existingPlayer = { id: 10, playerName: 'Kyle' };
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', players: [existingPlayer], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([existingPlayer]);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    document.querySelector('.add-player-btn').click();

    expect(alert).toHaveBeenCalledWith(expect.stringContaining('already in this league'));
  });

  it('should hide create toggle when duplicate league name exists', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'Existing League', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    // Type a name that matches an existing league
    const nameInput = document.getElementById('league-name');
    nameInput.value = 'Existing League';
    nameInput.dispatchEvent(new Event('input'));

    const toggle = document.getElementById('create-league-toggle');
    expect(toggle.classList.contains('hidden')).toBe(true);
  });

  it('should show create toggle when name is unique', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'Existing League', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    const nameInput = document.getElementById('league-name');
    nameInput.value = 'New Unique Name';
    nameInput.dispatchEvent(new Event('input'));

    const toggle = document.getElementById('create-league-toggle');
    expect(toggle.classList.contains('hidden')).toBe(false);
  });

  it('should disable create button when name matches existing league', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'Existing League', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    const nameInput = document.getElementById('league-name');
    nameInput.value = 'Existing League';
    nameInput.dispatchEvent(new Event('input'));

    const createBtn = document.getElementById('create-league-btn');
    expect(createBtn.disabled).toBe(true);
  });

  it('should show empty notice when no leagues exist', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    const emptyNotice = document.getElementById('leagues-list-empty');
    expect(emptyNotice.classList.contains('hidden')).toBe(false);
    expect(emptyNotice.textContent).toContain('No leagues created yet');
  });

  it('should show no matching leagues when filter has no results', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'Alpha', players: [], events: [] }]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    const nameInput = document.getElementById('league-name');
    nameInput.value = 'ZZZ';
    nameInput.dispatchEvent(new Event('input'));

    const emptyNotice = document.getElementById('leagues-list-empty');
    expect(emptyNotice.classList.contains('hidden')).toBe(false);
    expect(emptyNotice.textContent).toContain('No matching leagues found');
  });

  it('should show alert on league creation failure', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.leagues.create.mockRejectedValue(new Error('Server error'));

    await initLeaguesPage();

    document.getElementById('league-name').value = 'New League';
    document.getElementById('league-start-date').value = '2024-01-01';
    document.getElementById('league-name').dispatchEvent(new Event('input'));

    document.getElementById('league-form').dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(uiMocks.showAlert).toHaveBeenCalledWith(expect.stringContaining('Server error'), expect.any(String));
    });
  });

  it('should navigate to setup when Setup event button is clicked', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', players: [], events: [{ id: 50, eventName: 'E1', eventDate: '2024-01-01' }] }]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();
    document.querySelector('.league-header').click(); // Expand

    const setupBtn = document.querySelector('.setup-event-btn');
    setupBtn.click();

    const { setActiveLeagueIdSilent, setActiveEventIdSilent, loadPage } = await import('@scripts/utils.js');
    expect(setActiveLeagueIdSilent).toHaveBeenCalledWith(1);
    expect(setActiveEventIdSilent).toHaveBeenCalledWith(50);
    expect(loadPage).toHaveBeenCalledWith(ROUTE_PATHS.LEAGUE_SETUP({ leagueId: 1, eventId: 50 }));
  });

  it('should update league header stats for team leagues', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', competitionFormat: 'group', participationType: 'team', teams: [{ id: 1, name: 'T1' }], players: [], events: [{ id: 1 }], seasonScoring: 'weekly', dropLowestWeeks: 2 }]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    const small = document.querySelector('.league-header small');
    expect(small.textContent).toContain('Team');
    expect(small.textContent).toContain('Teams: 1');
    expect(small.textContent).toContain('Drop: 2');
  });

  it('should update league header stats for individual leagues', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.leagues.getAll.mockResolvedValue([{ id: 1, name: 'L1', competitionFormat: 'group', participationType: 'individual', players: [{ id: 1, playerName: 'P1' }], teams: [], events: [], seasonScoring: 'cumulative', dropLowestWeeks: 0 }]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    const small = document.querySelector('.league-header small');
    expect(small.textContent).toContain('Individual');
    expect(small.textContent).toContain('Players: 1');
    expect(small.textContent).toContain('Cumulative');
  });

  it('should prompt for confirmation and update season when Update Season is clicked', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeague = { 
      id: 1, 
      name: 'L1', 
      competitionFormat: 'head2head', participationType: 'individual', 
      status: 'active', 
      players: [{ id: 1, playerName: 'P1' }], 
      events: [{ id: 100, eventName: 'Week 1', matchups: [] }] 
    };
    PB_API.leagues.getAll.mockResolvedValue([mockLeague]);
    PB_API.players.getAll.mockResolvedValue([]);
    showConfirm.mockResolvedValue(true);

    const { setActiveLeagueId } = await import('@scripts/utils.js');
    setActiveLeagueId(1);

    await initLeaguesPage();

    const updateBtn = document.querySelector('.update-season-btn');
    expect(updateBtn).not.toBeNull();
    updateBtn.click();

    expect(showConfirm).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(PB_API.leagues.updateSeason).toHaveBeenCalledWith(1);
    });
  });

  it('should lock scoring format and league type when editing a league with events', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLeagueWithEvents = {
      id: 1,
      name: 'League With Events',
      competitionFormat: 'group', participationType: 'individual',
      scoringFormat: 'bowling',
      players: [],
      events: [{ id: 10, eventName: 'Week 1', matchups: [] }]
    };
    PB_API.leagues.getAll.mockResolvedValue([mockLeagueWithEvents]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initLeaguesPage();

    // Expand the league card
    const header = document.querySelector('.league-header');
    header.click();

    // Click edit league button
    const editBtn = document.querySelector('.edit-league-btn');
    expect(editBtn).not.toBeNull();
    editBtn.click();

    // Verify format and participant inputs are disabled
    const formatInput = document.getElementById('league-scoring-format');
    const competitionInput = document.getElementById('league-competition');
    const participantsInput = document.getElementById('league-participants');
    expect(formatInput.disabled).toBe(true);
    expect(competitionInput.disabled).toBe(true);
    expect(participantsInput.disabled).toBe(true);

    // Cancel / reset the form
    const toggleBtn = document.getElementById('create-league-toggle');
    toggleBtn.click(); // Cancels the edit and resets

    // Verify they are re-enabled
    expect(formatInput.disabled).toBe(false);
    expect(competitionInput.disabled).toBe(false);
    expect(participantsInput.disabled).toBe(false);
  });
});