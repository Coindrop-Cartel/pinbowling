/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getCurrentUser: vi.fn(),
    runCleanup: vi.fn()
  }
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(),
  can: vi.fn(() => Promise.resolve(true)),
  PERMISSIONS: {
    RUN_CLEANUP: 'RUN_CLEANUP'
  }
}));

vi.mock('@services/state.js', () => ({
  setDebugEnabled: vi.fn()
}));

vi.mock('@ui/uiComponents.js', () => ({
  showPrompt: vi.fn(),
  showConfirm: vi.fn(),
  showAlert: vi.fn()
}));

import { initManagementPage } from '@scripts/pages/managementPage.js';
import { PB_API } from '@services/api.js';
import { requireAdmin } from '@services/auth.js';
import { showConfirm, showPrompt, showAlert } from '@ui/uiComponents.js';
import { setDebugEnabled } from '@services/state.js';
import { can } from '@services/auth.js';

describe('Management Page (managementPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="management-auth-notice">Notice</div>
      <div id="management-tools" class="hidden">
        <button id="mgmt-run-cleanup-btn" class="hidden">Cleanup</button>
      </div>
      <button id="admin-login-btn">Login</button>
    `;
    vi.clearAllMocks();
    can.mockResolvedValue(true);
    window.PB_DEBUG_MODE = false;
    window.PB_UI_VERSION = '1.2.3';
  });

  it('should reveal tools and cleanup button for admin users', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });

    await initManagementPage();

    expect(document.getElementById('management-auth-notice').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('management-tools').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('mgmt-run-cleanup-btn').classList.contains('hidden')).toBe(false);
    expect(document.body.innerHTML).toContain('System UI Version: 1.2.3');
  });

  it('should reveal tools but hide cleanup for TD users', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'td' });
    can.mockResolvedValue(true); // Authorized for page but maybe not cleanup

    await initManagementPage();

    expect(document.getElementById('management-tools').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('mgmt-run-cleanup-btn').classList.contains('hidden')).toBe(true);
  });

  it('should toggle debug mode and update global state', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    await initManagementPage();

    const debugToggle = document.getElementById('mgmt-debug-toggle');
    debugToggle.checked = true;
    debugToggle.dispatchEvent(new Event('change'));

    expect(window.PB_DEBUG_MODE).toBe(true);
    expect(setDebugEnabled).toHaveBeenCalledWith(true);
  });

  it('should execute cleanup when confirmed and authorized', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    showConfirm.mockResolvedValue(true);
    requireAdmin.mockResolvedValue(true);
    showPrompt.mockResolvedValue('60'); // 60 days
    PB_API.runCleanup.mockResolvedValue({ leagues_cleaned: 5 });

    await initManagementPage();
    const cleanupBtn = document.getElementById('mgmt-run-cleanup-btn');
    await cleanupBtn.onclick();

    expect(PB_API.runCleanup).toHaveBeenCalledWith(60);
    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Removed 5 session leagues'), 'Success');
  });

  it('should abort cleanup if user cancels the prompt', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    showConfirm.mockResolvedValue(true);
    requireAdmin.mockResolvedValue(true);
    showPrompt.mockResolvedValue(null); // Cancelled

    await initManagementPage();
    const cleanupBtn = document.getElementById('mgmt-run-cleanup-btn');
    await cleanupBtn.onclick();

    expect(PB_API.runCleanup).not.toHaveBeenCalled();
  });
});