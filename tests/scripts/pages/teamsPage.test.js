/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initTeamsPage } from '@scripts/pages/teamsPage.js';
import { PB_API } from '@services/api.js';
import { isManagementAuthorized } from '@services/auth.js';
import { showConfirm, showPlayerSelectionDialog } from '@ui/dialogs.js';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getTeams: vi.fn().mockResolvedValue([]),
    getPlayers: vi.fn().mockResolvedValue([]),
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
  showAlert: vi.fn(),
  setupLiveFilter: vi.fn((input, data, options) => {
    const filterInstance = {
      performFilter: vi.fn(() => {
        const currentData = typeof data === 'function' ? data() : data;
        if (options && options.onFilter) {
          const query = (input ? input.value || '' : '').toLowerCase();
          const filtered = currentData.filter(item =>
            (item[options.labelKey || 'name'] || '').toLowerCase().includes(query)
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
  showPlayerSelectionDialog: uiMocks.showPlayerSelectionDialog,
  showAlert: uiMocks.showAlert,
}));

describe('Teams Page (teamsPage.js)', () => {
  let originalLocation;

  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    originalLocation = window.location;
    delete window.location;
    const mockLocation = new URL('http://localhost/teams.php');
    mockLocation.assign = vi.fn();
    mockLocation.replace = vi.fn();
    mockLocation.reload = vi.fn();
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
    isManagementAuthorized.mockResolvedValue(true);
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
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

    it('should show empty message when no teams exist', async () => {
      PB_API.getTeams.mockResolvedValue([]);
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      const emptyEl = document.getElementById('teams-list-empty');
      expect(emptyEl.textContent).toContain('No teams created yet');
    });

    it('should handle API errors gracefully during initialization', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      PB_API.getTeams.mockRejectedValue(new Error('Network Error'));
      await initTeamsPage();
      expect(consoleSpy).toHaveBeenCalled();
      expect(document.getElementById('teams-list').innerHTML).toBe('');
      consoleSpy.mockRestore();
    });

    it('should hide management actions if not authorized', async () => {
      isManagementAuthorized.mockResolvedValue(false);
      PB_API.getTeams.mockResolvedValue([{ id: 1, name: 'ReadOnly Team', members: [] }]);
      await initTeamsPage();
      expect(document.getElementById('team-form-card').classList.contains('hidden')).toBe(true);
      expect(document.querySelector('.edit-team-btn')).toBeNull();
      expect(document.querySelector('.delete-team-btn')).toBeNull();
    });

    it('should render team members in expandable row', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [{ id: 99, playerName: 'John Doe' }] }];
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      const list = document.getElementById('teams-list');
      expect(list.innerHTML).toContain('John Doe');
    });
  });

  describe('Filtering', () => {
    it('should filter teams by name input', async () => {
      const mockTeams = [
        { id: 1, name: 'Austin Power', members: [] },
        { id: 2, name: 'Dallas Stars', members: [] }
      ];
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
  });

  describe('Edit Team', () => {
    it('should open edit form when edit button is clicked', async () => {
      const mockTeams = [{ id: 123, name: 'Original Team', city: 'Old', state: 'ST', members: [] }];
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      const editBtn = document.querySelector('.edit-team-btn');
      editBtn.click();
      expect(document.getElementById('team-id').value).toBe('123');
      expect(document.getElementById('team-name').value).toBe('Original Team');
      expect(document.getElementById('team-city').value).toBe('Old');
      expect(document.getElementById('team-state').value).toBe('ST');
      expect(document.getElementById('save-team-btn').textContent).toBe('Update Team');
    });

    it('should show cancel button when editing', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', city: 'City', state: 'ST', members: [] }];
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      document.querySelector('.edit-team-btn').click();
      expect(document.getElementById('cancel-team-btn').classList.contains('hidden')).toBe(false);
    });

    it('should clear form when cancel button is clicked', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', city: 'City', state: 'ST', members: [] }];
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      document.querySelector('.edit-team-btn').click();
      const cancelBtn = document.getElementById('cancel-team-btn');
      cancelBtn.click();
      expect(document.getElementById('team-id').value).toBe('');
      expect(document.getElementById('team-name').value).toBe('');
      expect(document.getElementById('team-form-title').textContent).toBe('Add New Team');
      expect(cancelBtn.classList.contains('hidden')).toBe(true);
    });

    it('should call updateTeam on form submit when editing', async () => {
      const mockTeams = [{ id: 123, name: 'Original Team', city: 'Old', state: 'ST', members: [] }];
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      PB_API.updateTeam.mockResolvedValue({ success: true });
      await initTeamsPage();
      document.querySelector('.edit-team-btn').click();
      document.getElementById('team-name').value = 'Updated Team';
      document.getElementById('team-form').dispatchEvent(new Event('submit'));
      expect(PB_API.updateTeam).toHaveBeenCalledWith(123, expect.objectContaining({
        name: 'Updated Team',
      }));
    });

    it('should not submit if team name is empty', async () => {
      PB_API.getTeams.mockResolvedValue([]); // Override default for this test
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      document.getElementById('team-name').value = '';
      document.getElementById('team-form').dispatchEvent(new Event('submit'));
      expect(PB_API.createTeam).not.toHaveBeenCalled();
    });
  });


  describe('Create Team', () => {
    it('should call PB_API.createTeam for new team submission', async () => {
      PB_API.getTeams.mockResolvedValue([]);
      PB_API.getPlayers.mockResolvedValue([]);
      PB_API.createTeam.mockResolvedValue({ success: true });
      await initTeamsPage();
      document.getElementById('team-name').value = 'New Team';
      document.getElementById('team-city').value = 'Houston';
      document.getElementById('team-state').value = 'TX';
      document.getElementById('team-form').dispatchEvent(new Event('submit'));
      expect(PB_API.createTeam).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Team',
        city: 'Houston',
        state: 'TX',
      }));
    });

    it('should handle API error on create', async () => {
      PB_API.getTeams.mockResolvedValue([]);
      PB_API.getPlayers.mockResolvedValue([]);
      PB_API.createTeam.mockRejectedValue(new Error('Create failed'));
      await initTeamsPage();
      document.getElementById('team-name').value = 'New Team';
      document.getElementById('team-form').dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(expect.stringContaining('Failed to save team'));
      });
    });
  });

  describe('Duplicate Name Validation', () => {
    it('should disable save button when duplicate team name is entered', async () => {
      const mockTeams = [{ id: 1, name: 'Existing Team', city: 'City', state: 'ST', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      const nameInput = document.getElementById('team-name');
      nameInput.value = 'Existing Team';
      nameInput.dispatchEvent(new Event('input'));
      expect(document.getElementById('save-team-btn').disabled).toBe(true);
    });

    it('should allow save when editing the same team (same name)', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', city: 'City', state: 'ST', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      document.querySelector('.edit-team-btn').click();
      // Name is already "Team 1" but we're editing it
      expect(document.getElementById('save-team-btn').disabled).toBe(false);
    });

    it('should set title tooltip on duplicate name', async () => {
      const mockTeams = [{ id: 1, name: 'Existing Team', city: 'City', state: 'ST', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      await initTeamsPage();
      const nameInput = document.getElementById('team-name');
      nameInput.value = 'Existing Team';
      nameInput.dispatchEvent(new Event('input'));
      expect(document.getElementById('save-team-btn').title).toContain('already exists');
    });
  });

  describe('Delete Team', () => {
    it('should delete a team after confirmation', async () => {
      const mockTeams = [{ id: 55, name: 'Team to Delete', members: [] }]; // Override default for this test
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

    it('should not delete if user cancels confirmation', async () => {
      const mockTeams = [{ id: 55, name: 'Team to Delete', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      showConfirm.mockResolvedValue(false);
      await initTeamsPage();
      const deleteBtn = document.querySelector('.delete-team-btn');
      deleteBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.deleteTeam).not.toHaveBeenCalled();
      });
    });

    it('should handle API error on delete', async () => {
      const mockTeams = [{ id: 55, name: 'Team to Delete', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      showConfirm.mockResolvedValue(true);
      PB_API.deleteTeam.mockRejectedValue(new Error('Delete failed'));
      await initTeamsPage();
      const deleteBtn = document.querySelector('.delete-team-btn');
      deleteBtn.click();
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(expect.stringContaining('Failed to delete team'));
      });
    });
  });

  describe('Add Member', () => {
    it('should add a member when add button is clicked', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([{ id: 77, playerName: 'New Player' }]);
      showPlayerSelectionDialog.mockResolvedValue('77');
      PB_API.addTeamMember.mockResolvedValue({ success: true });
      await initTeamsPage();
      document.querySelector('.team-header').click();
      const addMemberBtn = document.querySelector('.add-member-btn');
      addMemberBtn.click();
      await vi.waitFor(() => {
        expect(showPlayerSelectionDialog).toHaveBeenCalled();
        expect(PB_API.addTeamMember).toHaveBeenCalledWith(1, "77");
      });
    });

    it('should filter out already-assigned players from selection dialog', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [{ id: 99, playerName: 'John Doe' }] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([
        { id: 99, playerName: 'John Doe' },
        { id: 77, playerName: 'New Player' }
      ]);
      showPlayerSelectionDialog.mockResolvedValue(null);
      await initTeamsPage();
      document.querySelector('.team-header').click();
      const addMemberBtn = document.querySelector('.add-member-btn');
      addMemberBtn.click();
      await vi.waitFor(() => {
        const call = showPlayerSelectionDialog.mock.calls[0];
        const availablePlayers = call[2]; // Third arg is the options list
        const assignedPlayer = availablePlayers.find(p => p.id === 99 || p.value === 99);
        expect(assignedPlayer).toBeUndefined();
      });
    });

    it('should show alert when all players are already assigned', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [{ id: 99, playerName: 'John Doe' }] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([{ id: 99, playerName: 'John Doe' }]);
      await initTeamsPage();
      document.querySelector('.team-header').click();
      const addMemberBtn = document.querySelector('.add-member-btn');
      addMemberBtn.click();
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(expect.stringContaining('All players are already assigned to this team.'));
      });
    });

    it('should not add member if dialog is cancelled', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([{ id: 77, playerName: 'New Player' }]);
      showPlayerSelectionDialog.mockResolvedValue(null);
      await initTeamsPage();
      document.querySelector('.team-header').click();
      const addMemberBtn = document.querySelector('.add-member-btn');
      addMemberBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.addTeamMember).not.toHaveBeenCalled();
      });
    });

    it('should handle API error on add member', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([{ id: 77, playerName: 'New Player' }]);
      showPlayerSelectionDialog.mockResolvedValue('77');
      PB_API.addTeamMember.mockRejectedValue(new Error('Add member failed'));
      await initTeamsPage();
      document.querySelector('.team-header').click();
      const addMemberBtn = document.querySelector('.add-member-btn');
      addMemberBtn.click();
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(expect.stringContaining('Failed to add member'));
      });
    });
  });

  describe('Remove Member', () => {
    it('should remove a member when remove button is clicked', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [{ id: 99, playerName: 'John Doe' }] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      showConfirm.mockResolvedValue(true);
      PB_API.removeTeamMember.mockResolvedValue({ success: true });
      await initTeamsPage();
      document.querySelector('.team-header').click();
      const removeBtn = document.querySelector('.remove-member-btn');
      removeBtn.click();
      await vi.waitFor(() => {
        expect(showConfirm).toHaveBeenCalledWith(expect.stringContaining('John Doe'), 'Remove Member');
        expect(PB_API.removeTeamMember).toHaveBeenCalledWith("1", "99");
      });
    });

    it('should not remove member if user cancels confirmation', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [{ id: 99, playerName: 'John Doe' }] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      showConfirm.mockResolvedValue(false);
      await initTeamsPage();
      document.querySelector('.team-header').click();
      const removeBtn = document.querySelector('.remove-member-btn');
      removeBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.removeTeamMember).not.toHaveBeenCalled();
      });
    });

    it('should handle API error on remove member', async () => {
      const mockTeams = [{ id: 1, name: 'Team 1', members: [{ id: 99, playerName: 'John Doe' }] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      showConfirm.mockResolvedValue(true);
      PB_API.removeTeamMember.mockRejectedValue(new Error('Remove failed'));
      await initTeamsPage();
      document.querySelector('.team-header').click();
      const removeBtn = document.querySelector('.remove-member-btn');
      removeBtn.click();
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(expect.stringContaining('Failed to remove member'));
      });
    });
  });

  describe('API Error Handling on Save', () => {
    it('should handle API error on update team', async () => {
      const mockTeams = [{ id: 123, name: 'Original Team', city: 'Old', state: 'ST', members: [] }]; // Override default for this test
      PB_API.getTeams.mockResolvedValue(mockTeams);
      PB_API.getPlayers.mockResolvedValue([]);
      PB_API.updateTeam.mockRejectedValue(new Error('Update failed'));
      await initTeamsPage();
      document.querySelector('.edit-team-btn').click();
      document.getElementById('team-name').value = 'Updated Team';
      document.getElementById('team-form').dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(expect.stringContaining('Failed to save team'));
      });
    });
  });
});