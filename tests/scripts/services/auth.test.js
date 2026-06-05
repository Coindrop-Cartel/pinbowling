/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getCurrentUser: vi.fn(),
    logout: vi.fn(() => Promise.resolve())
  }
}));

vi.mock('@ui/dialogs.js', () => ({
  showAlert: vi.fn(),
  showAuthDialog: vi.fn(() => Promise.resolve(true))
}));

import { requireAdmin, runAuthorizedLeagueAction, initAuthHeader, isManagementAuthorized, resetAuthCache } from '@scripts/services/auth.js';
import { PB_API } from '@services/api.js';
import { showAlert, showAuthDialog } from '@ui/dialogs.js';

describe('Auth Service (auth.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthCache();
    // Setup DOM for auth header tests
    document.body.innerHTML = `
      <div id="auth-header-container"></div>
      <div id="admin-nav-item" class="hidden">
        <a id="nav-leagues" class="hidden">Leagues</a>
        <a id="nav-maintenance" class="hidden">Maintenance</a>
      </div>
    `;
    window.PB_DEBUG_MODE = false;
  });

  describe('requireAdmin', () => {
    it('should return true if user is admin', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
      const result = await requireAdmin();
      expect(result).toBe(true);
      expect(showAlert).not.toHaveBeenCalled();
    });

    it('should show alert and return false if user is not admin', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'player' });
      const result = await requireAdmin();
      expect(result).toBe(false);
      expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Administrator privileges'), 'Access Denied');
    });

    it('should return false if no user session is found', async () => {
      PB_API.getCurrentUser.mockResolvedValue(null);
      const result = await requireAdmin();
      expect(result).toBe(false);
      expect(showAlert).toHaveBeenCalled();
    });
  });

  describe('isManagementAuthorized', () => {
    it('should return true for admin role', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
      expect(await isManagementAuthorized()).toBe(true);
    });

    it('should return true for td role', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'td' });
      expect(await isManagementAuthorized()).toBe(true);
    });

    it('should return false for player role', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'player' });
      expect(await isManagementAuthorized()).toBe(false);
    });
  });

  describe('runAuthorizedLeagueAction', () => {
    it('should execute the callback if authorized', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'td' });
      const callback = vi.fn();
      const result = await runAuthorizedLeagueAction(1, callback);
      expect(result).toBe(true);
      expect(callback).toHaveBeenCalled();
    });

    it('should skip callback and alert user if unauthorized', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'player' });
      const callback = vi.fn();
      const result = await runAuthorizedLeagueAction(1, callback);
      expect(result).toBe(false);
      expect(callback).not.toHaveBeenCalled();
      expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('permission'), 'Unauthorized');
    });
  });

  describe('initAuthHeader', () => {
    it('should display hi message and logout button for authenticated users', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'player', player_name: 'Kyle' });
      await initAuthHeader();
      const container = document.getElementById('auth-header-container');
      expect(container.innerHTML).toContain('Hi, Kyle');
      expect(document.getElementById('header-logout-btn')).not.toBeNull();
    });

    it('should reveal admin navigation and maintenance tools for admins', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
      await initAuthHeader();
      const adminNav = document.getElementById('admin-nav-item');
      expect(adminNav.classList.contains('hidden')).toBe(false);
      expect(document.getElementById('nav-maintenance').classList.contains('hidden')).toBe(false);
    });

    it('should reveal admin navigation but hide maintenance for TDs', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'td', player_name: 'TD User' });
      await initAuthHeader();
      const adminNav = document.getElementById('admin-nav-item');
      expect(adminNav.classList.contains('hidden')).toBe(false);
      expect(document.getElementById('nav-maintenance').classList.contains('hidden')).toBe(true);
    });

    it('should display a login button when no user is logged in', async () => {
      PB_API.getCurrentUser.mockResolvedValue(null);
      await initAuthHeader();
      expect(document.getElementById('header-login-btn')).not.toBeNull();
    });

    it('should trigger logout API and refresh state on click', async () => {
      PB_API.getCurrentUser.mockResolvedValue({ role: 'player' });
      const reloadSpy = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload: reloadSpy });

      await initAuthHeader();
      document.getElementById('header-logout-btn').click();
      
      await vi.waitFor(() => {
        expect(PB_API.logout).toHaveBeenCalled();
        expect(reloadSpy).toHaveBeenCalled();
      });
    });

    it('should trigger login dialog and refresh state on successful login', async () => {
      PB_API.getCurrentUser.mockResolvedValue(null);
      showAuthDialog.mockResolvedValue(true);
      const reloadSpy = vi.fn();
      vi.stubGlobal('location', { ...window.location, reload: reloadSpy });

      await initAuthHeader();
      document.getElementById('header-login-btn').click();
      
      await vi.waitFor(() => {
        expect(showAuthDialog).toHaveBeenCalled();
        expect(reloadSpy).toHaveBeenCalled();
      });
    });
  });
});