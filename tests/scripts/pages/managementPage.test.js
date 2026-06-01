/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initManagementPage } from '@pages/managementPage.js';
import { PB_API } from '@services/api.js';
import * as Auth from '@services/auth.js';
import * as State from '@services/state.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    runCleanup: vi.fn(),
    updateLeague: vi.fn(),
  },
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@services/state.js', () => ({
  setAdminSessionPassword: vi.fn(),
}));

vi.mock('@ui/uiComponents.js', () => ({
  showPrompt: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn(),
  initTournamentSelector: vi.fn(),
}));

describe('Management Page (managementPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="management-auth-notice"></div>
      <div id="management-tools" class="hidden">
        <select id="mgmt-league-select"></select>
        <button id="mgmt-reset-pass-btn">Reset</button>
        <button id="mgmt-run-cleanup-btn">Cleanup</button>
      </div>
      <button id="admin-login-btn">Login</button>
    `;

    vi.clearAllMocks();
    window.PB_UI_VERSION = '1.2.3';
    PB_API.getLeagues.mockResolvedValue([]);
  });

  it('should reveal tools and render version info when authenticated', async () => {
    Auth.requireAdmin.mockResolvedValue(true);
    
    await initManagementPage();

    const tools = document.getElementById('management-tools');
    expect(tools.classList.contains('hidden')).toBe(false);
    
    const versionDisplay = document.getElementById('mgmt-ui-version');
    expect(versionDisplay.textContent).toContain('1.2.3');
  });

  it('should stay hidden if authentication fails', async () => {
    Auth.requireAdmin.mockResolvedValue(false);
    
    await initManagementPage();

    const tools = document.getElementById('management-tools');
    expect(tools.classList.contains('hidden')).toBe(true);
  });

  it('should clear session and hide tools when logout is clicked', async () => {
    Auth.requireAdmin.mockResolvedValue(true);
    await initManagementPage();

    const logoutBtn = document.getElementById('mgmt-logout-btn');
    expect(logoutBtn).not.toBeNull();

    logoutBtn.click();

    expect(State.setAdminSessionPassword).toHaveBeenCalledWith(null);
    const tools = document.getElementById('management-tools');
    expect(tools.classList.contains('hidden')).toBe(true);
  });

  it('should re-trigger auth check when login button is clicked', async () => {
    Auth.requireAdmin.mockResolvedValue(false);
    await initManagementPage();
    
    vi.clearAllMocks();
    Auth.requireAdmin.mockResolvedValue(true);
    
    document.getElementById('admin-login-btn').click();
    
    expect(Auth.requireAdmin).toHaveBeenCalled();
  });
});