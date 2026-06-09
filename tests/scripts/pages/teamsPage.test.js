/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTeamsPage } from '@scripts/pages/teamsPage.js';
import { PB_API } from '@services/api.js';
import { isManagementAuthorized } from '@services/auth.js';
import { showConfirm, showPlayerSelectionDialog } from '@ui/dialogs.js';


// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getTeams: vi.fn(),
    getPlayers: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
    addTeamMember: vi.fn(),
    removeTeamMember: vi.fn()
  }
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(() => Promise.resolve(true)),
  isManagementAuthorized: vi.fn(() => Promise.resolve(true))
}));

vi.mock('@scripts/utils.js', () => ({
  applyScoreFormatting: vi.fn(),
  formatNumber: vi.fn(n => String(n)),
  getActiveLeagueId: vi.fn(() => '1')
}));

const uiMocks = vi.hoisted(() => ({
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showPlayerSelectionDialog: vi.fn(),
  setupLiveFilter: vi.fn((input, data, options) => {
    const filterInstance = {
      performFilter: vi.fn(() => {
        if (options && options.onFilter) {
          const query = (input ? input.value || '' : '').toLowerCase();
          const filtered = data.filter(item => 
            item[options.labelKey || 'name'].toLowerCase().includes(query)
          );
          options.onFilter(filtered, query);
        }
      })
    };
    if (input) input.addEventListener('input', () => filterInstance.performFilter());
    return filterInstance;
  }),
  createExpandableRow: vi.fn((container, options) => {
    const row = document.createElement('div');
    row.className = options.className || 'team-registry-item';
    row.innerHTML = `
      <div class="team-header">${options.headerHtml || ''}</div>
      <div class="team-details ${options.isExpanded ? '' : 'hidden'}">${options.contentHtml || ''}</div>
    `;
    container.appendChild(row);
    if (options.onHeaderClick) {
      row.querySelector('.team-header').addEventListener('click', options.onHeaderClick);
    }
    return row;
  }),
}));

vi.mock('@ui/selectors.js', () => ({
  setupLiveFilter: uiMocks.setupLiveFilter,
  createExpandableRow: uiMocks.createExpandableRow
}));
vi.mock('@ui/dialogs.js', () => ({
  showConfirm: uiMocks.showConfirm,
  showPrompt: uiMocks.showPrompt,
  showPlayerSelectionDialog: uiMocks.showPlayerSelectionDialog
}));

describe('Teams Page (teamsPage.js)', () => {
  let originalLocation;

  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());

    // Correct way to mock location in JSDOM/Vitest to avoid "Cannot redefine property" errors
    originalLocation = window.location;
    delete window.location;
    const mockLocation = new URL('http://localhost/teams.php');
    // Stub navigation methods to silence "Not implemented" errors
    mockLocation.assign = vi.fn();
    mockLocation.replace = vi.fn();
    mockLocation.reload = vi.fn();
    // Define href as a simple data property so setting it doesn't trigger JSDOM navigation logic
    Object.defineProperty(mockLocation, 'href', { writable: true, value: mockLocation.href });
    window.location = mockLocation;

    Element.prototype.scrollIntoView = vi.fn();

    document.body.innerHTML = `
      <form id="team-form">
        <input id="team-id" />
        <input id="team-name" />
        <input id="team-city" />
        <input id="team-state" />
        <div id="team-form-card">
          <h2 id="team-form-title">Add New Team</h2>
          <button id="save-team-btn">Save Team</button>
          <button id="cancel-team-btn" class="hidden">Cancel</button>
        </div>
      </form>
      <div id="teams-list"></div>
      <div id="teams-list-empty"></div>
    `;
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  it('should render teams list on initialization', async () => {
    const mockTeams = [{ id: 1, name: 'Team Alpha', city: 'Austin', state: 'TX', members: [] }];
    PB_API.getTeams.mockResolvedValue(mockTeams);
    PB_API.getPlayers.mockResolvedValue([]);

    await initTeamsPage();

    expect(PB_API.getTeams).toHaveBeenCalled();
    const list = document.getElementById('teams-list');
    expect(list.innerHTML).toContain('Team Alpha');
    expect(list.innerHTML).toContain('Austin, TX');
  });

  it('should filter teams by name input', async () => {
    const mockTeams = [{ id: 1, name: 'Austin Power', members: [] }, { id: 2, name: 'Dallas Stars', members: [] }];
    PB_API.getTeams.mockResolvedValue(mockTeams);
    PB_API.getPlayers.mockResolvedValue([]);

    await initTeamsPage();

    const nameInput = document.getElementById('team-name');
    nameInput.value = 'Austin';
    nameInput.dispatchEvent(new Event('input'));

    const items = document.querySelectorAll('.team-registry-item');
    expect(items.length).toBe(1);
    expect(items[0].innerHTML).toContain('Austin Power');
  });

  it('should open edit form when edit button is clicked', async () => {
    const mockTeams = [{ id: 123, name: 'Original Team', city: 'Old', state: 'ST', members: [] }];
    PB_API.getTeams.mockResolvedValue(mockTeams);
    PB_API.getPlayers.mockResolvedValue([]);

    await initTeamsPage();

    const editBtn = document.querySelector('.edit-team-btn');
    editBtn.click();

    expect(document.getElementById('team-id').value).toBe('123');
    expect(document.getElementById('team-name').value).toBe('Original Team');
    expect(document.getElementById('save-team-btn').textContent).toBe('Update Team');
  });

  it('should clear form when cancel button is clicked', async () => {
    const mockTeams = [{ id: 1, name: 'Team 1', city: 'City', state: 'ST', members: [] }];
    PB_API.getTeams.mockResolvedValue(mockTeams);
    PB_API.getPlayers.mockResolvedValue([]);

    await initTeamsPage();

    // Enter edit mode
    document.querySelector('.edit-team-btn').click();
    const cancelBtn = document.getElementById('cancel-team-btn');
    
    // Click cancel
    cancelBtn.click();

    expect(document.getElementById('team-id').value).toBe('');
    expect(document.getElementById('team-name').value).toBe('');
    expect(document.getElementById('team-form-title').textContent).toBe('Add New Team');
    expect(cancelBtn.classList.contains('hidden')).toBe(true);
  });

  it('should delete a team after confirmation', async () => {
    const mockTeams = [{ id: 55, name: 'Team to Delete', members: [] }];
    PB_API.getTeams.mockResolvedValue(mockTeams);
    PB_API.getPlayers.mockResolvedValue([]);
    showConfirm.mockResolvedValue(true);
    PB_API.deleteTeam.mockResolvedValue({ success: true });

    await initTeamsPage();

    const deleteBtn = document.querySelector('.delete-team-btn');
    deleteBtn.click();

    await vi.waitFor(() => {
      expect(showConfirm).toHaveBeenCalledWith(
        expect.stringContaining('Team to Delete'),
        'Delete Team'
      );
      expect(PB_API.deleteTeam).toHaveBeenCalledWith(55);
      expect(PB_API.getTeams).toHaveBeenCalledTimes(2);
    });
  });

  it('should call PB_API.createTeam for new team submission', async () => {
    PB_API.getTeams.mockResolvedValue([]);
    PB_API.getPlayers.mockResolvedValue([]);

    await initTeamsPage();

    document.getElementById('team-name').value = 'New Team';
    const form = document.getElementById('team-form');
    form.dispatchEvent(new Event('submit'));

    expect(PB_API.createTeam).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Team' }));
  });

  it('should add a member when add button is clicked', async () => {
    const mockTeams = [{ id: 1, name: 'Team 1', members: [] }];
    PB_API.getTeams.mockResolvedValue(mockTeams);
    PB_API.getPlayers.mockResolvedValue([{ id: 77, playerName: 'New Player' }]);
    showPlayerSelectionDialog.mockResolvedValue('77');

    await initTeamsPage();
    document.querySelector('.team-header').click();
    
    const addMemberBtn = document.querySelector('.add-member-btn');
    addMemberBtn.click();

    await vi.waitFor(() => {
      expect(showPlayerSelectionDialog).toHaveBeenCalled();
      expect(PB_API.addTeamMember).toHaveBeenCalledWith(1, "77");
    });
  });

  it('should remove a member when remove button is clicked', async () => {
    const mockTeams = [{ 
      id: 1, 
      name: 'Team 1', 
      members: [{ id: 99, playerName: 'John Doe' }] 
    }];
    PB_API.getTeams.mockResolvedValue(mockTeams);
    PB_API.getPlayers.mockResolvedValue([]);
    showConfirm.mockResolvedValue(true);

    await initTeamsPage();
    document.querySelector('.team-header').click();
    
    const removeBtn = document.querySelector('.remove-member-btn');
    removeBtn.click();

    await vi.waitFor(() => {
      expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining('John Doe'), 'Remove Member');
      expect(PB_API.removeTeamMember).toHaveBeenCalledWith("1", "99");
    });
  });

  it('should hide management actions if not authorized', async () => {
    // Mock management check to return false
    isManagementAuthorized.mockResolvedValue(false);
    PB_API.getTeams.mockResolvedValue([{ id: 1, name: 'ReadOnly Team', members: [] }]);

    await initTeamsPage();

    // The Add Team form card should be hidden for non-authorized users
    expect(document.getElementById('team-form-card').classList.contains('hidden')).toBe(true);
    
    // Action buttons (edit/delete) should not be rendered
    expect(document.querySelector('.edit-team-btn')).toBeNull();
    expect(document.querySelector('.delete-team-btn')).toBeNull();
  });

  it('should handle API errors gracefully during initialization', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    PB_API.getTeams.mockRejectedValue(new Error('Network Error'));

    await initTeamsPage();

    expect(consoleSpy).toHaveBeenCalled();
    expect(document.getElementById('teams-list').innerHTML).toBe('');
    consoleSpy.mockRestore();
  });
});