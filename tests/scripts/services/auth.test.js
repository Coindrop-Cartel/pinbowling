/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireAdmin, runAuthorizedLeagueAction } from '@scripts/services/auth.js';
import * as State from '@services/state.js';
import * as UI from '@ui/uiComponents.js';

vi.mock('@services/state.js', () => ({
  getAdminSessionPassword: vi.fn(),
  setAdminSessionPassword: vi.fn(),
  getLeaguePassword: vi.fn(),
  setLeaguePassword: vi.fn(),
}));

vi.mock('@ui/uiComponents.js', () => ({
  showPrompt: vi.fn(),
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
      expect(window.alert).toHaveBeenCalledWith('Incorrect Admin Password.');
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
      await runAuthorizedLeagueAction(1, action);
      expect(action).toHaveBeenCalled();
    });

    it('should prompt for password if none found', async () => {
      State.getAdminSessionPassword.mockReturnValue(null);
      State.getLeaguePassword.mockReturnValue(null);
      UI.showPrompt.mockResolvedValue('league-pass');
      
      const action = vi.fn();
      await runAuthorizedLeagueAction(5, action);
      
      expect(UI.showPrompt).toHaveBeenCalled();
      expect(State.setLeaguePassword).toHaveBeenCalledWith(5, 'league-pass');
      expect(action).toHaveBeenCalled();
    });

    it('should allow admin password in the league prompt', async () => {
        State.getAdminSessionPassword.mockReturnValue(null);
        UI.showPrompt.mockResolvedValue('admin-secret');
        
        await runAuthorizedLeagueAction(5, vi.fn());
        expect(State.setAdminSessionPassword).toHaveBeenCalledWith('admin-secret');
    });

    it('should clear passwords and alert if action returns 401 Unauthorized', async () => {
      State.getLeaguePassword.mockReturnValue('stored-pass');
      const action = vi.fn().mockRejectedValue(new Error('Unauthorized access'));
      
      await runAuthorizedLeagueAction(1, action);
      
      expect(State.setLeaguePassword).toHaveBeenCalledWith(1, null);
      expect(State.setAdminSessionPassword).toHaveBeenCalledWith(null);
      expect(window.alert).toHaveBeenCalledWith('Invalid Password.');
    });

    it('should re-throw non-authorization errors', async () => {
      State.getAdminSessionPassword.mockReturnValue('admin-secret');
      const action = vi.fn().mockRejectedValue(new Error('Database error'));
      
      await expect(runAuthorizedLeagueAction(1, action)).rejects.toThrow('Database error');
    });
  });
});