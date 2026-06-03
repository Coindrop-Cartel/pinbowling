/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireAdmin, runAuthorizedLeagueAction } from '@scripts/services/auth.js';
import * as State from '@services/state.js';
import * as UI from '@ui/uiComponents.js';

vi.mock('@services/state.js', () => ({
  getAdminSessionPassword: vi.fn(),
  setAdminSessionPassword: vi.fn(),
}));

vi.mock('@ui/uiComponents.js', () => ({
  showPrompt: vi.fn(),
  showAlert: vi.fn(), // Add showAlert to the mock
}));

describe('Authorization Helpers (auth.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.PB_ADMIN_PASSWORD = 'admin-secret';
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requireAdmin', () => {
    it('should return true immediately if global admin password is not set', async () => {
      window.PB_ADMIN_PASSWORD = "";
      const result = await requireAdmin();
      expect(result).toBe(true);
    });

    it('should return true if password is already in session', async () => {
      State.getAdminSessionPassword.mockReturnValue('admin-secret');
      const result = await requireAdmin();
      expect(result).toBe(true);
      expect(UI.showPrompt).not.toHaveBeenCalled();
    });

    it('should prompt user if password is not in session', async () => {
      State.getAdminSessionPassword.mockReturnValue(null);
      UI.showPrompt.mockResolvedValue('admin-secret');
      
      const result = await requireAdmin('Msg');
      expect(result).toBe(true);
      expect(State.setAdminSessionPassword).toHaveBeenCalledWith('admin-secret');
    });

    it('should return false and alert on incorrect password', async () => {
      State.getAdminSessionPassword.mockReturnValue(null);
      UI.showPrompt.mockResolvedValue('wrong');
      
      const result = await requireAdmin();
      expect(result).toBe(false);
      expect(UI.showAlert).toHaveBeenCalledWith('Invalid Admin Password.', 'Authentication Error');
    });

    it('should return false if prompt is cancelled', async () => {
      UI.showPrompt.mockResolvedValue(null);
      expect(await requireAdmin()).toBe(false);
    });
  });

  describe('runAuthorizedLeagueAction', () => {
    it('should execute action if admin password is in session', async () => {
      State.getAdminSessionPassword.mockReturnValue('admin-secret');
      const action = vi.fn();
      const result = await runAuthorizedLeagueAction(1, action);
      expect(result).toBe(true);
      expect(action).toHaveBeenCalled();
    });

    it('should re-throw non-authorization errors', async () => {
      State.getAdminSessionPassword.mockReturnValue('admin-secret');
      const action = vi.fn().mockRejectedValue(new Error('Database error'));
      
      await expect(runAuthorizedLeagueAction(1, action)).rejects.toThrow('Database error');
    });
  });
});