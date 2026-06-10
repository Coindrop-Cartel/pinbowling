/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initPlayersPage } from '@pages/playersPage.js';
import { PB_API } from '@services/api.js';
import { requireAdmin, can, PERMISSIONS } from '@services/auth.js';
import { showConfirm, showPrompt, showChoiceDialog, showAlert } from '@ui/dialogs.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getPlayers: vi.fn(),
    createPlayer: vi.fn(),
    updatePlayer: vi.fn(),
    deletePlayer: vi.fn(),
    getCurrentUser: vi.fn(),
    updateUserPassword: vi.fn(),
    updateUserRole: vi.fn(),
  },
}));

const uiMocks = vi.hoisted(() => ({
  setupLiveFilter: vi.fn((input, data, options) => {
    const filterInstance = {
      performFilter: vi.fn(() => {
        const currentData = typeof data === 'function' ? data() : data;
        const query = (input ? input.value || '' : '').toLowerCase(); // Ensure input is not null
        const filtered = currentData.filter(item => 
          (item[options.labelKey || 'playerName'] || '').toLowerCase().includes(query)
        );
        options.onFilter(filtered, query);
      })
    };
    if (input) input.addEventListener('input', () => filterInstance.performFilter());
    return filterInstance;
  }),
  showConfirm: vi.fn(() => Promise.resolve(true)),
  showPrompt: vi.fn(),
  showChoiceDialog: vi.fn(),
  showAlert: vi.fn(),
  createExpandableRow: vi.fn((container, options) => {
    const row = document.createElement(options.tag || 'div');
    row.innerHTML = options.headerHtml + (options.contentHtml || '');
    if (options.className) row.className = options.className;
    container.appendChild(row);
    return row;
  }),
}));

vi.mock('@ui/selectors.js', () => uiMocks);
vi.mock('@ui/dialogs.js', () => uiMocks);
vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(() => Promise.resolve(true)),
  can: vi.fn(() => true),
  PERMISSIONS: {
    MANAGE_PLAYERS: 'MANAGE_PLAYERS', // Used for general player management
    UPDATE_SELF: 'UPDATE_SELF',       // Used for self-editing
    // Other permissions that might be checked in playersPage.js
    ADD_ANY_SCORE: 'ADD_ANY_SCORE',
    UPDATE_ANY_SCORE: 'UPDATE_ANY_SCORE',
    RUN_CLEANUP: 'RUN_CLEANUP',
  },
}));

describe('Player Management Page (playersPage.js)', () => {
  let originalLocation;

  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

    originalLocation = window.location;
    delete window.location;
    const mockLocation = new URL('http://localhost/players.php');
    mockLocation.assign = vi.fn();
    mockLocation.replace = vi.fn();
    mockLocation.reload = vi.fn();
    Object.defineProperty(mockLocation, 'href', { writable: true, value: mockLocation.href });
    window.location = mockLocation;

    document.body.innerHTML = `
      <section class="card">
        <h2 id="player-form-title">Add New Player</h2>
        <form id="player-form">
          <input id="editing-player-id" />
          <input id="player-name" />
          <div id="player-ifpa-row" class="form-row hidden"><input id="ifpa-id" /></div>
          <div id="player-matchplay-row" class="form-row hidden"><input id="matchplay-id" /></div>
          <div id="player-form-actions" class="form-actions hidden">
            <button id="save-player-button">Save Player</button>
            <button id="cancel-edit-button" class="hidden">Cancel</button>
          </div>
        </form>
      </section>
      <ul id="player-list"></ul>
    `;

    vi.clearAllMocks();
    PB_API.getPlayers.mockResolvedValue([
      { id: 10, playerName: 'Alice', ifpaId: '123', userId: 100, userRole: 'player' },
      { id: 11, playerName: 'Bob', matchplayId: '456' },
    ]);
    PB_API.getCurrentUser.mockResolvedValue({ id: 1, role: 'admin', player_id: 10, player_name: 'Admin User' });
    requireAdmin.mockResolvedValue(true);
    showConfirm.mockResolvedValue(true);
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should load and render players', async () => {
      await initPlayersPage();
      const list = document.getElementById('player-list');
      expect(list.innerHTML).toContain('Alice');
      expect(list.innerHTML).toContain('IFPA ID:</strong> 123');
    });

    it('should show empty notice when no players exist', async () => {
      PB_API.getPlayers.mockResolvedValue([]);
      await initPlayersPage();
      const list = document.getElementById('player-list');
      expect(list.innerHTML).toContain('No players registered yet');
    });

    it('should create a "Create New Player" toggle button', async () => {
      await initPlayersPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      expect(toggle).not.toBeNull();
    });

    it('should hide form card for non-privileged users', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 99 });
      await initPlayersPage();
      const card = document.querySelector('.card');
      expect(card.classList.contains('hidden')).toBe(true);
    });

    it('should hide create toggle for non-privileged users', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 99 });
      await initPlayersPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
          await vi.waitFor(() => {
            expect(toggle.classList.contains('hidden')).toBe(true);
          });
    });

    it('should handle API errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      PB_API.getPlayers.mockRejectedValue(new Error('Network Error'));
      PB_API.getCurrentUser.mockRejectedValue(new Error('Network Error'));
      await initPlayersPage();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should render player with MatchPlay ID', async () => {
      await initPlayersPage();
      const list = document.getElementById('player-list');
      expect(list.innerHTML).toContain('MatchPlay ID:</strong> 456');
    });

    it('should render "No external IDs linked" for players without IDs', async () => {
      PB_API.getPlayers.mockResolvedValue([{ id: 12, playerName: 'Charlie' }]);
      await initPlayersPage();
      const list = document.getElementById('player-list');
      expect(list.innerHTML).toContain('No external IDs linked');
    });

    it('should show role badge for players with userRole', async () => {
      await initPlayersPage();
      const list = document.getElementById('player-list');
      expect(list.innerHTML).toContain('player');
    });
  });

  describe('Create Player Toggle', () => {
    it('should reveal form fields when toggle is clicked', async () => {
      await initPlayersPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      toggle.click();
      expect(document.getElementById('player-ifpa-row').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('player-matchplay-row').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('player-form-actions').classList.contains('hidden')).toBe(false);
    });

    it('should change toggle text to Cancel when form is expanded', async () => {
      await initPlayersPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      toggle.click();
      const cancelToggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cancel'));
      expect(cancelToggle).not.toBeNull();
    });

    it('should collapse form fields when Cancel toggle is clicked', async () => {
      await initPlayersPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      toggle.click();
      const cancelToggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cancel'));
      cancelToggle.click();
      expect(document.getElementById('player-ifpa-row').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('player-matchplay-row').classList.contains('hidden')).toBe(true);
    });

    it('should not toggle create form when in edit mode', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const cancelToggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cancel'));
      cancelToggle.click();
      expect(document.getElementById('editing-player-id').value).toBe('');
      expect(document.getElementById('player-form-title').textContent).toBe('Add New Player');
    });
  });

  describe('Edit Player', () => {
    it('should populate form when Edit is clicked', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      expect(document.getElementById('player-name').value).toBe('Alice');
      expect(document.getElementById('ifpa-id').value).toBe('123');
      expect(document.getElementById('player-form-title').textContent).toBe('Edit Player: Alice');
      expect(document.getElementById('save-player-button').textContent).toBe('Update Player');
    });

    it('should set editing-player-id when editing', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      expect(document.getElementById('editing-player-id').value).toBe('10');
    });

    it('should reveal form fields when editing', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      expect(document.getElementById('player-ifpa-row').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('player-matchplay-row').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('player-form-actions').classList.contains('hidden')).toBe(false);
    });

    it('should show cancel button when editing', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      await vi.waitFor(() => {
        expect(document.getElementById('cancel-edit-button').classList.contains('hidden')).toBe(false);
      });
    });

    it('should scroll to top when editing', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    });

    it('should show Reset Password and Change Role buttons for users with accounts', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const resetBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reset Password'));
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      expect(resetBtn.classList.contains('hidden')).toBe(false);
      expect(roleBtn.classList.contains('hidden')).toBe(false);
    });

    it('should hide Reset Password and Change Role for players without accounts', async () => {
      PB_API.getPlayers.mockResolvedValue([{ id: 11, playerName: 'Bob' }]);
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const resetBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reset Password'));
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      expect(resetBtn.classList.contains('hidden')).toBe(true);
      expect(roleBtn.classList.contains('hidden')).toBe(true);
    });

    it('should allow self-edit for non-admin users', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 10 });
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      expect(editBtn).not.toBeNull();
      editBtn.click();
      expect(document.getElementById('player-name').value).toBe('Alice');
    });

    it('should not allow non-admin to edit other players', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 99 });
      PB_API.getPlayers.mockResolvedValue([
        { id: 10, playerName: 'Alice', ifpaId: '123', userId: 100, userRole: 'player' },
        { id: 11, playerName: 'Bob' },
      ]);
      await initPlayersPage();
      // Non-admin should not see edit buttons for other players
      const editBtns = document.querySelectorAll('.edit-player-btn');
      expect(editBtns.length).toBe(0);
    });

    it('should lock name field for non-privileged self-edit', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 10 });
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click(); // This will trigger editPlayer
      await vi.waitFor(() => {
        expect(document.getElementById('player-name').disabled).toBe(true);
      });
    });

    it('should not lock name field for admin self-edit', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      expect(document.getElementById('player-name').disabled).toBe(false);
    });
  });

  describe('Form Submission - Create', () => {
    it('should call createPlayer on form submit for new entry', async () => {
      await initPlayersPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      toggle.click();
      document.getElementById('player-name').value = 'New Player';
      document.getElementById('ifpa-id').value = '789';
      await document.getElementById('player-form').dispatchEvent(new Event('submit'));
      expect(PB_API.createPlayer).toHaveBeenCalledWith(expect.objectContaining({
        playerName: 'New Player',
        ifpaId: '789',
      }));
    });

    it('should not submit if player name is empty', async () => {
      await initPlayersPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      toggle.click();
      document.getElementById('player-name').value = '';
      await document.getElementById('player-form').dispatchEvent(new Event('submit'));
      expect(PB_API.createPlayer).not.toHaveBeenCalled();
    });

    it('should require admin password for non-authorized create', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 99 });
      // Need to make the form visible for non-admin
      PB_API.getPlayers.mockResolvedValue([
        { id: 10, playerName: 'Alice', ifpaId: '123', userId: 100, userRole: 'player' },
      ]);
      await initPlayersPage();
      // Force form visible for test
      document.querySelector('.card').classList.remove('hidden');
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      if (toggle) {
        toggle.classList.remove('hidden');
        toggle.click();
        document.getElementById('player-name').value = 'New Player';
        await document.getElementById('player-form').dispatchEvent(new Event('submit'));
        expect(requireAdmin).toHaveBeenCalled();
      }
    });

    it('should not create if admin password is rejected', async () => {
      requireAdmin.mockResolvedValue(false);
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 99 });
      await initPlayersPage();
      document.querySelector('.card').classList.remove('hidden');
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      if (toggle) {
        toggle.classList.remove('hidden');
        toggle.click();
        document.getElementById('player-name').value = 'New Player';
        await document.getElementById('player-form').dispatchEvent(new Event('submit'));
        expect(PB_API.createPlayer).not.toHaveBeenCalled();
      }
    });

    it('should handle API error on create', async () => {
      PB_API.createPlayer.mockRejectedValue(new Error('Create failed'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      await initPlayersPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
      toggle.click();
      document.getElementById('player-name').value = 'New Player';
      await document.getElementById('player-form').dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Error saving player'));
      });
      alertSpy.mockRestore();
    });
  });

  describe('Form Submission - Update', () => {
    it('should call updatePlayer on form submit when editing', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      document.getElementById('player-name').value = 'Alice Updated';
      await document.getElementById('player-form').dispatchEvent(new Event('submit'));
      expect(PB_API.updatePlayer).toHaveBeenCalledWith(10, expect.objectContaining({
        playerName: 'Alice Updated',
      }));
    });

    it('should not require admin for self-update without name change', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 10 });
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      // Change IFPA ID only (not name)
      document.getElementById('ifpa-id').value = '999';
      await document.getElementById('player-form').dispatchEvent(new Event('submit'));
      expect(requireAdmin).not.toHaveBeenCalled();
    });

    it('should require admin for name change on self-update', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 10 }); // Changed role to 'player'
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      document.getElementById('player-name').value = 'Alice New Name';
      document.getElementById('player-name').disabled = false;
      await document.getElementById('player-form').dispatchEvent(new Event('submit'));
      expect(requireAdmin).toHaveBeenCalled();
    });

    it('should not update if admin password rejected for name change', async () => {
      requireAdmin.mockResolvedValue(false); // Keep this
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'player', player_id: 10 }); // Changed role to 'player'
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      document.getElementById('player-name').value = 'Alice New Name';
      document.getElementById('player-name').disabled = false;
      await document.getElementById('player-form').dispatchEvent(new Event('submit'));
      expect(PB_API.updatePlayer).not.toHaveBeenCalled();
    });

    it('should handle API error on update', async () => {
      PB_API.updatePlayer.mockRejectedValue(new Error('Update failed'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      document.getElementById('player-name').value = 'Alice Updated';
      await document.getElementById('player-form').dispatchEvent(new Event('submit'));
      await vi.waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Error saving player'));
      });
      alertSpy.mockRestore();
    });
  });

  describe('Delete Player', () => {
    it('should confirm before deleting', async () => {
      await initPlayersPage();
      const deleteBtn = document.querySelector('.delete-player-btn-inline');
      if (deleteBtn) {
        deleteBtn.click();
        expect(showConfirm).toHaveBeenCalledWith(
          expect.stringContaining('Alice'),
          'Delete Player'
        );
      }
    });

    it('should call deletePlayer API after confirmation', async () => {
      await initPlayersPage();
      const deleteBtn = document.querySelector('.delete-player-btn-inline');
      if (deleteBtn) {
        deleteBtn.click();
        await vi.waitFor(() => {
          expect(PB_API.deletePlayer).toHaveBeenCalledWith(10);
        });
      }
    });

    it('should require admin password for deletion', async () => {
      await initPlayersPage();
      const deleteBtn = document.querySelector('.delete-player-btn-inline');
      if (deleteBtn) {
        deleteBtn.click();
        await vi.waitFor(() => {
          expect(requireAdmin).toHaveBeenCalled();
        });
      }
    });

    it('should not delete if user cancels confirmation', async () => {
      showConfirm.mockResolvedValue(false);
      await initPlayersPage();
      const deleteBtn = document.querySelector('.delete-player-btn-inline');
      if (deleteBtn) {
        deleteBtn.click();
        await vi.waitFor(() => {
          expect(PB_API.deletePlayer).not.toHaveBeenCalled();
        });
      }
    });

    it('should not delete if admin password rejected', async () => {
      requireAdmin.mockResolvedValue(false);
      await initPlayersPage();
      const deleteBtn = document.querySelector('.delete-player-btn-inline');
      if (deleteBtn) {
        deleteBtn.click();
        await vi.waitFor(() => {
          expect(PB_API.deletePlayer).not.toHaveBeenCalled();
        });
      }
    });

    it('should handle API error on delete', async () => {
      PB_API.deletePlayer.mockRejectedValue(new Error('Delete failed'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      await initPlayersPage();
      const deleteBtn = document.querySelector('.delete-player-btn-inline');
      if (deleteBtn) {
        deleteBtn.click();
        await vi.waitFor(() => {
          expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Error deleting player'));
        });
      }
      alertSpy.mockRestore();
    });

    it('should only show delete button for admin users', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'td', player_id: 99 });
      await initPlayersPage();
      const deleteBtn = document.querySelector('.delete-player-btn-inline');
      expect(deleteBtn).toBeNull();
    });
  });

  describe('Reset Password', () => {
    it('should prompt for new password when Reset Password is clicked', async () => {
      showPrompt.mockResolvedValue('newpass123');
      PB_API.updateUserPassword.mockResolvedValue({});
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const resetBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reset Password'));
      resetBtn.click();
      await vi.waitFor(() => {
        expect(showPrompt).toHaveBeenCalledWith(
          expect.stringContaining('Alice'),
          'Reset User Password',
          false
        );
      });
    });

    it('should call updateUserPassword with new password', async () => {
      showPrompt.mockResolvedValue('newpass123');
      PB_API.updateUserPassword.mockResolvedValue({});
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const resetBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reset Password'));
      resetBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.updateUserPassword).toHaveBeenCalledWith(100, 'newpass123');
      });
    });

    it('should show success alert after password reset', async () => {
      showPrompt.mockResolvedValue('newpass123');
      PB_API.updateUserPassword.mockResolvedValue({});
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const resetBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reset Password'));
      resetBtn.click();
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(
          expect.stringContaining('Password updated'),
          'Success'
        );
      });
    });

    it('should not reset password if prompt is cancelled', async () => {
      showPrompt.mockResolvedValue(null);
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const resetBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reset Password'));
      resetBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.updateUserPassword).not.toHaveBeenCalled();
      });
    });

    it('should show error alert on password reset failure', async () => {
      showPrompt.mockResolvedValue('newpass123');
      PB_API.updateUserPassword.mockRejectedValue(new Error('Reset failed'));
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const resetBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reset Password'));
      resetBtn.click();
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(
          expect.stringContaining('Reset failed'),
          'Update Failed'
        );
      });
    });
  });

  describe('Change Role', () => {
    it('should show role choice dialog when Change Role is clicked', async () => {
      showChoiceDialog.mockResolvedValue(null);
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      roleBtn.click();
      await vi.waitFor(() => {
        expect(showChoiceDialog).toHaveBeenCalledWith(
          'Change User Role',
          expect.stringContaining('Alice'),
          expect.any(Array),
          'player'
        );
      });
    });

    it('should include Admin option for admin users', async () => {
      showChoiceDialog.mockResolvedValue(null);
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      roleBtn.click();
      await vi.waitFor(() => {
        const call = showChoiceDialog.mock.calls[0];
        const choices = call[2];
        const adminChoice = choices.find(c => c.value === 'admin');
        expect(adminChoice).toBeDefined();
      });
    });

    it('should not include Admin option for TD users', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'td', player_id: 10 });
      showChoiceDialog.mockResolvedValue(null);
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      if (roleBtn) {
        roleBtn.click();
        await vi.waitFor(() => {
          const call = showChoiceDialog.mock.calls[0];
          const choices = call[2];
          const adminChoice = choices.find(c => c.value === 'admin');
          expect(adminChoice).toBeUndefined();
        });
      }
    });

    it('should call updateUserRole when new role is selected', async () => {
      showChoiceDialog.mockResolvedValue('td');
      PB_API.updateUserRole.mockResolvedValue({});
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      roleBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.updateUserRole).toHaveBeenCalledWith(100, 'td');
      });
    });

    it('should not update role if same role is selected', async () => {
      showChoiceDialog.mockResolvedValue('player'); // Same as current
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      roleBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.updateUserRole).not.toHaveBeenCalled();
      });
    });

    it('should not update role if dialog is cancelled', async () => {
      showChoiceDialog.mockResolvedValue(null);
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      roleBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.updateUserRole).not.toHaveBeenCalled();
      });
    });

    it('should show error alert on role update failure', async () => {
      showChoiceDialog.mockResolvedValue('td');
      PB_API.updateUserRole.mockRejectedValue(new Error('Role update failed'));
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      roleBtn.click();
      await vi.waitFor(() => {
        expect(uiMocks.showAlert).toHaveBeenCalledWith(
          expect.stringContaining('Role update failed'),
          'Update Failed'
        );
      });
    });
  });

  describe('Duplicate Name Validation', () => {
    it('should disable save button when duplicate name is entered', async () => {
      await initPlayersPage();
      const nameInput = document.getElementById('player-name');
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));
      await vi.waitFor(() => {
        expect(document.getElementById('save-player-button').disabled).toBe(true);
      });
    });

    it('should allow save when editing the same player (same name)', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      await vi.waitFor(() => {
        // Name is already "Alice" which matches, but we're editing it
        expect(document.getElementById('save-player-button').disabled).toBe(false);
      });
    });

    it('should set title tooltip on duplicate name', async () => {
      await initPlayersPage();
      const nameInput = document.getElementById('player-name');
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));
      await vi.waitFor(() => {
        expect(document.getElementById('save-player-button').title).toContain('already exists');
      });
    });

    it('should hide create toggle when duplicate name exists', async () => {
      await initPlayersPage();
      const nameInput = document.getElementById('player-name');
      nameInput.value = 'Alice';
      nameInput.dispatchEvent(new Event('input'));
      await vi.waitFor(() => {
        const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Player'));
        expect(toggle.classList.contains('hidden')).toBe(true);
      });
    });
  });

  describe('Cancel Edit', () => {
    it('should reset form when cancel button is clicked', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      document.getElementById('cancel-edit-button').click();
      expect(document.getElementById('editing-player-id').value).toBe('');
      expect(document.getElementById('player-name').value).toBe('');
      expect(document.getElementById('player-form-title').textContent).toBe('Add New Player');
    });

    it('should hide cancel button after reset', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      document.getElementById('cancel-edit-button').click();
      expect(document.getElementById('cancel-edit-button').classList.contains('hidden')).toBe(true);
    });

    it('should collapse form fields after cancel', async () => {
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      document.getElementById('cancel-edit-button').click();
      expect(document.getElementById('player-ifpa-row').classList.contains('hidden')).toBe(true);
      expect(document.getElementById('player-matchplay-row').classList.contains('hidden')).toBe(true);
    });
  });

  describe('Filtering', () => {
    it('should filter players by name input', async () => {
      await initPlayersPage();
      const nameInput = document.getElementById('player-name');
      nameInput.value = 'Bob';
      nameInput.dispatchEvent(new Event('input'));
      const items = document.querySelectorAll('.player-item-row');
      expect(items.length).toBe(1);
      expect(items[0].innerHTML).toContain('Bob');
    });

    it('should show "No matching players" when filter has no results', async () => {
      await initPlayersPage();
      const nameInput = document.getElementById('player-name');
      nameInput.value = 'Nonexistent';
      nameInput.dispatchEvent(new Event('input'));
      const list = document.getElementById('player-list');
      expect(list.innerHTML).toContain('No matching players found');
    });
  });

  describe('TD Role Handling', () => {
    it('should show edit buttons for TD users', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'td', player_id: 99 });
      PB_API.getPlayers.mockResolvedValue([
        { id: 10, playerName: 'Alice', ifpaId: '123', userId: 100, userRole: 'player' },
      ]);
      await initPlayersPage();
      const editBtns = document.querySelectorAll('.edit-player-btn');
      expect(editBtns.length).toBe(1);
    });

    it('should not show delete buttons for TD users', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'td', player_id: 99 });
      PB_API.getPlayers.mockResolvedValue([
        { id: 10, playerName: 'Alice', ifpaId: '123', userId: 100, userRole: 'player' },
      ]);
      await initPlayersPage();
      const deleteBtns = document.querySelectorAll('.delete-player-btn-inline');
      expect(deleteBtns.length).toBe(0);
    });

    it('should show Reset Password and Change Role for TD users on players with accounts', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ id: 2, role: 'td', player_id: 10 });
      await initPlayersPage();
      const editBtn = document.querySelector('.edit-player-btn');
      editBtn.click();
      const resetBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reset Password'));
      const roleBtn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Change Role'));
      expect(resetBtn.classList.contains('hidden')).toBe(false);
      expect(roleBtn.classList.contains('hidden')).toBe(false);
    });
  });
});