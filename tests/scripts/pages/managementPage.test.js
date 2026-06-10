/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initManagementPage } from '@pages/managementPage.js';
import { PB_API } from '@services/api.js';
import * as Auth from '@services/auth.js';
import * as State from '@services/state.js';

import { showAuthDialog, showConfirm, showPrompt, showAlert } from '@ui/dialogs.js'; // Import dialogs
import { renderActionSummary } from '@ui/selectors.js'; // Import renderActionSummary
import { requireAdmin } from '@services/auth.js'; // Import requireAdmin

vi.mock('@services/state.js', async (importOriginal) => { // Modified to mock setDebugEnabled
  const actual = await importOriginal();
  return { ...actual, setAdminSessionPassword: vi.fn(), setDebugEnabled: vi.fn() };
});

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

  it('should re-trigger auth check when login button is clicked', async () => {
    Auth.can.mockResolvedValue(false);
    await initManagementPage();
    vi.clearAllMocks();
    vi.mocked(showAuthDialog).mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    document.getElementById('admin-login-btn').click();
    await vi.waitFor(() => expect(Auth.can).toHaveBeenCalled());
  });
  it('should show access denied alert and redirect for non-admin users', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'player' });
    Auth.can.mockResolvedValue(false);
    await initManagementPage();
    const tools = document.getElementById('management-tools');
    expect(tools.classList.contains('hidden')).toBe(true);
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
  it('should render debug toggle checkbox synced with PB_DEBUG_MODE', async () => {
    window.PB_DEBUG_MODE = true;
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    await initManagementPage();
    const debugToggle = document.getElementById('mgmt-debug-toggle');
    expect(debugToggle).not.toBeNull();
    expect(debugToggle.checked).toBe(true);
    debugToggle.checked = false;
    debugToggle.dispatchEvent(new Event('change'));
    expect(window.PB_DEBUG_MODE).toBe(false);
    const { setDebugEnabled } = await import('@services/state.js');
    expect(setDebugEnabled).toHaveBeenCalledWith(false);
    window.PB_DEBUG_MODE = false;
  });
  it('should not render version info twice on re-initialize', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    await initManagementPage();
    const countBefore = document.querySelectorAll('#mgmt-ui-version').length;
    // Simulate re-init via login
    vi.mocked(showAuthDialog).mockResolvedValue({ role: 'admin' });
    document.getElementById('admin-login-btn').click();
    await vi.waitFor(() => expect(Auth.can).toHaveBeenCalled());
    const countAfter = document.querySelectorAll('#mgmt-ui-version').length;
    expect(countAfter).toBe(countBefore);
  });
  it('should run cleanup when confirmed with days input', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    PB_API.runCleanup.mockResolvedValue({ leagues_cleaned: 3 });
    vi.mocked(requireAdmin).mockResolvedValue(true);
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue('60');
    await initManagementPage();
    // Find the cleanup action button from renderActionSummary
    const calls = vi.mocked(renderActionSummary).mock.calls;
    const summaryCall = calls.find(c => c[1] === 'System Maintenance');
    const cleanupAction = summaryCall[2].find(a => a.text === 'Run Database Cleanup');
    await cleanupAction.onclick();
    expect(PB_API.runCleanup).toHaveBeenCalledWith(60);
    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('3'), 'Success');
  });
  it('should cancel cleanup when prompt is dismissed', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue(null);
    await initManagementPage();
    const calls = vi.mocked(renderActionSummary).mock.calls;
    const summaryCall = calls.find(c => c[1] === 'System Maintenance');
    const cleanupAction = summaryCall[2].find(a => a.text === 'Run Database Cleanup');
    await cleanupAction.onclick();
    expect(PB_API.runCleanup).not.toHaveBeenCalled();
  });
  it('should cancel cleanup when confirmation is denied', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    showConfirm.mockResolvedValue(false);
    await initManagementPage();
    const calls = vi.mocked(renderActionSummary).mock.calls;
    const summaryCall = calls.find(c => c[1] === 'System Maintenance');
    const cleanupAction = summaryCall[2].find(a => a.text === 'Run Database Cleanup');
    await cleanupAction.onclick();
    expect(PB_API.runCleanup).not.toHaveBeenCalled();
  });
  it('should handle cleanup API error gracefully', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    PB_API.runCleanup.mockRejectedValue(new Error('DB locked'));
    vi.mocked(requireAdmin).mockResolvedValue(true); // requireAdmin is imported now
    showConfirm.mockResolvedValue(true);
    showPrompt.mockResolvedValue('30');
    await initManagementPage();
    const calls = vi.mocked(renderActionSummary).mock.calls;
    const summaryCall = calls.find(c => c[1] === 'System Maintenance');
    const cleanupAction = summaryCall[2].find(a => a.text === 'Run Database Cleanup');
    await cleanupAction.onclick();
    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('DB locked'), 'Error');
  });
  it('should hide cleanup button for non-admin users', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'td' });
    Auth.can.mockResolvedValue(true);
    await initManagementPage();
    const calls = vi.mocked(renderActionSummary).mock.calls;
    const summaryCall = calls.find(c => c[1] === 'System Maintenance');
    const cleanupAction = summaryCall[2].find(a => a.text === 'Run Database Cleanup');
    expect(cleanupAction.hidden).toBe(true);
  });
  it('should dispatch pb:pageChanged event after login', async () => {
    Auth.can.mockResolvedValue(false);
    await initManagementPage();
    const pageChangedSpy = vi.spyOn(document, 'dispatchEvent');
    vi.mocked(showAuthDialog).mockResolvedValue({ role: 'admin' });
    Auth.can.mockResolvedValue(true);
    document.getElementById('admin-login-btn').click();
    await vi.waitFor(() => expect(pageChangedSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'pb:pageChanged' })));
  });
});