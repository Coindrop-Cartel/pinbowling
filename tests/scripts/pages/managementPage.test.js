/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initManagementPage } from '@pages/managementPage.js';
import { PB_API } from '@services/api.js';
import * as Auth from '@services/auth.js';
import * as State from '@services/state.js';

import { showAuthDialog } from '@ui/dialogs.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    runCleanup: vi.fn(),
    updateLeague: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(),
  initAuthHeader: vi.fn(() => Promise.resolve()),
  can: vi.fn(), // Add this
  PERMISSIONS: { RUN_CLEANUP: 'run_cleanup' }, // Add this, or mock specific permissions as needed
}));

vi.mock('@services/state.js', () => ({
  setAdminSessionPassword: vi.fn(),
}));

const uiMocks = vi.hoisted(() => ({
  showPrompt: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn(),
  initTournamentSelector: vi.fn(),
  showAuthDialog: vi.fn(),
  renderActionSummary: vi.fn((container, title, actions = []) => {
    if (container) container.innerHTML = title;
    if (container) container._actions = actions;
    if (container) container.classList.remove('hidden');
  }),
}));

vi.mock('@ui/dialogs.js', () => uiMocks);
vi.mock('@ui/selectors.js', () => uiMocks);

describe('Management Page (managementPage.js)', () => {
  let originalLocation;

  beforeEach(() => {
    // Correct way to mock location in JSDOM/Vitest to avoid "Not implemented" errors
    originalLocation = window.location;
    delete window.location;
    const mockLocation = new URL('http://localhost/management.php');
    mockLocation.assign = vi.fn();
    mockLocation.replace = vi.fn();
    mockLocation.reload = vi.fn();
    Object.defineProperty(mockLocation, 'href', { writable: true, value: mockLocation.href });
    window.location = mockLocation;

    document.body.innerHTML = `
      <div id="management-auth-notice"></div>
      <div id="management-tools" class="hidden">
        <select id="mgmt-league-select"></select>
        <button id="mgmt-reset-pass-btn">Reset</button>
        <button id="mgmt-run-cleanup-btn">Cleanup</button>
        <div id="mgmt-ui-version"></div>
      </div>
      <button id="admin-login-btn">Login</button>
    `;

    vi.clearAllMocks();
    window.PB_UI_VERSION = '1.2.3';
    PB_API.getLeagues.mockResolvedValue([]);
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  it('should reveal tools and render version info when authenticated', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    
    await initManagementPage();

    const tools = document.getElementById('management-tools');
    expect(tools.classList.contains('hidden')).toBe(false);
    
    const versionDisplay = document.getElementById('mgmt-ui-version');
    expect(versionDisplay.textContent).toContain('1.2.3');
  });

  it('should stay hidden if authentication fails', async () => {
    PB_API.getCurrentUser.mockResolvedValue(null);
    Auth.can.mockResolvedValue(false);
    
    await initManagementPage();

    const tools = document.getElementById('management-tools');
    expect(tools.classList.contains('hidden')).toBe(true);
  });

  it('should re-trigger auth check when login button is clicked', async () => {
    Auth.can.mockResolvedValue(false);
    await initManagementPage();
    
    vi.clearAllMocks();
    vi.mocked(showAuthDialog).mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    
    document.getElementById('admin-login-btn').click();
    await vi.waitFor(() => expect(Auth.can).toHaveBeenCalled());
  });
});