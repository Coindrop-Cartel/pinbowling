import { PB_API } from '@services/api.js';
import { requireAdmin } from '@services/auth.js';
import { showPrompt, showConfirm, showAlert } from '@ui/uiComponents.js';

/**
 * Logic for the System Management page.
 * Provides tools for password resets and database maintenance.
 */
export async function initManagementPage() {
  const authNotice = document.getElementById('management-auth-notice');
  const toolsSection = document.getElementById('management-tools');
  const loginBtn = document.getElementById('admin-login-btn');
  const cleanupBtn = document.getElementById('mgmt-run-cleanup-btn');

  /**
   * Verifies admin credentials before displaying management tools.
   */
  const initialize = async () => {
    const [user] = await Promise.all([
      PB_API.getCurrentUser()
    ]);

    const isAuthorized = user && (user.role === 'admin' || user.role === 'td');
    if (isAuthorized) {
      revealTools(user);
    }
    renderVersionInfo();
  };

  const revealTools = (user) => {
    authNotice.classList.add('hidden');
    toolsSection.classList.remove('hidden');
    if (cleanupBtn) {
      cleanupBtn.classList.toggle('hidden', user.role !== 'admin');
    }
  };

  /**
   * Adds a subtle version indicator to the bottom of the management tools.
   */
  const renderVersionInfo = () => {
    if (document.getElementById('mgmt-ui-version')) return;
    if (window.PB_DEBUG_MODE) console.log('[Management] Rendering version footer. current state:', window.PB_DEBUG_MODE);

    const versionInfo = document.createElement('div');
    versionInfo.id = 'mgmt-ui-version';
    versionInfo.style = "margin-top: 3rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; opacity: 0.5;";

    // Debug Mode Toggle
    const debugLabel = document.createElement('label');
    debugLabel.style = "display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;";
    debugLabel.innerHTML = `
      <input type="checkbox" id="mgmt-debug-toggle" style="margin:0;">
      <span>Debug Logs</span>
    `;
    
    const debugToggle = debugLabel.querySelector('input');
    if (window.PB_DEBUG_MODE) console.log('[Management] Syncing checkbox UI with window.PB_DEBUG_MODE:', window.PB_DEBUG_MODE);
    debugToggle.checked = Boolean(window.PB_DEBUG_MODE); // Explicitly sync state from global variable

    debugToggle.onchange = () => {
      const isEnabled = debugToggle.checked;
      if (window.PB_DEBUG_MODE || isEnabled) console.log('[Management] Debug toggle changed. New state:', isEnabled);
      window.PB_DEBUG_MODE = isEnabled;
      localStorage.setItem('pb_debug_enabled', isEnabled);
    };

    const versionText = document.createElement('span');
    versionText.textContent = `System UI Version: ${window.PB_UI_VERSION || '1.0.0'}`;

    versionInfo.appendChild(debugLabel);
    versionInfo.appendChild(versionText);
    (toolsSection.parentElement || document.body).appendChild(versionInfo);
  };

  if (loginBtn) {
    // Use addEventListener for better reliability and wrap the call 
    // to ensure the MouseEvent isn't passed as the prompt message.
    loginBtn.addEventListener('click', () => initialize());
  }

  // Perform an initial check on load. If no password is set or the user is already
  // authenticated, we reveal the tools immediately without a prompt.
  initialize();

  /**
   * Manually triggers the cleanup service to prune old session data.
   */
  cleanupBtn.onclick = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to run the database cleanup? This will permanently delete session-type leagues and their associated data based on the retention period.',
      'Confirm Cleanup'
    );
    
    if (!confirmed) return;

    if (!await requireAdmin()) return;

    const daysInput = await showPrompt('Enter retention period in days (leagues older than this will be deleted):', 'Cleanup Configuration', false);
    if (daysInput === null) return; // User cancelled the prompt
    const days = parseInt(daysInput, 10) || 30;

    try {
      cleanupBtn.disabled = true;
      cleanupBtn.textContent = 'Running Cleanup...';
      
      const result = await PB_API.runCleanup(days);
      showAlert(`Cleanup successful! Removed ${result.leagues_cleaned || 0} session leagues older than ${days} days.`, 'Success');
    } catch (err) {
      showAlert('Cleanup failed: ' + err.message, 'Error');
    } finally {
      cleanupBtn.disabled = false;
      cleanupBtn.textContent = 'Run Cleanup Script';
    }
  };
}