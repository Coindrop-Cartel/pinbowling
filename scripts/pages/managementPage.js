import { PB_API } from '@services/api.js';
import { can, PERMISSIONS, requireAdmin } from '@services/auth.js';
import { showAlert, showAuthDialog, showConfirm, showPrompt } from '@ui/dialogs.js';
import { ROUTES } from '@scripts/routes.js';
import { navigateTo } from '@scripts/utils.js';
import { renderActionSummary } from '@ui/selectors.js';
import { setDebugEnabled } from '@services/state.js';

/**
 * Logic for the Management admin panel (password-protected tools and settings).
 * @module pages/management
 */

/**
 * Initializes the Management page: authenticates the admin user and reveals admin tools.
 * @async
 * @returns {Promise<void>}
 */
export async function initManagementPage() {
  const authNotice = document.getElementById('management-auth-notice');
  const toolsSection = document.getElementById('management-tools');
  const loginBtn = document.getElementById('admin-login-btn');

  /**
   * Verifies admin credentials before displaying management tools.
   */
  const initialize = async () => {
    const [user, isAuthorized] = await Promise.all([
      PB_API.getCurrentUser(),
      can(PERMISSIONS.RUN_CLEANUP) // Maintenance check
    ]);

    if (user && isAuthorized) {
      revealTools(user);
    } else if (user) {
      // Logged in but not an admin? Shoo!
      showAlert('Administrator access is required for system maintenance.', 'Access Denied');
      // Casting ROUTES to any to allow property access on the array type
      const routes = /** @type {any} */ (ROUTES);
      navigateTo(routes.HOME());
      return;
    }
    renderVersionInfo();
  };

  /**
   * @param {import('@scripts/types.js').User} user
   */
  const revealTools = (user) => {
    authNotice?.classList.add('hidden');
    toolsSection?.classList.remove('hidden');

    renderActionSummary(toolsSection, 'System Maintenance', [
      { text: 'Run Database Cleanup', onclick: handleCleanup, hidden: user.role !== 'admin' }
    ]);
  };

  /**
   * Adds a subtle version indicator to the bottom of the management tools.
   */
  const renderVersionInfo = () => {
    if (document.getElementById('mgmt-ui-version') || !toolsSection) return;

    const versionInfo = document.createElement('div');
    versionInfo.id = 'mgmt-ui-version';
    versionInfo.className = 'version-footer';

    // Debug Mode Toggle
    const debugLabel = document.createElement('label');
    debugLabel.className = 'debug-toggle-label';
    debugLabel.innerHTML = `
      <input type="checkbox" id="mgmt-debug-toggle" class="mb-0">
      <span>Debug Logs</span>
    `;
    
    const debugToggle = debugLabel.querySelector('input');
    if (debugToggle) {
      debugToggle.checked = Boolean(window['PB_DEBUG_MODE']); // Explicitly sync state from global variable

      debugToggle.onchange = () => {
        const isEnabled = debugToggle.checked;
        window['PB_DEBUG_MODE'] = isEnabled;
        setDebugEnabled(isEnabled);
      };
    }

    const versionText = document.createElement('span');
    versionText.textContent = `System UI Version: ${window['PB_UI_VERSION'] || '1.0.0'}`;

    versionInfo.appendChild(debugLabel);
    versionInfo.appendChild(versionText);
    if (toolsSection) (toolsSection.parentElement || document.body).appendChild(versionInfo);
  };

  if (loginBtn) {
    loginBtn.classList.add('btn-mgmt');
    // Use addEventListener for better reliability and wrap the call 
    // to ensure the MouseEvent isn't passed as the prompt message.
    loginBtn.addEventListener('click', async () => {
      const user = await showAuthDialog();
      if (user) {
        await initialize();
        // Notify the app that auth state changed to refresh the global header/nav
        document.dispatchEvent(new CustomEvent('pb:pageChanged'));
      }
    });
  }

  // Perform an initial check on load. If no password is set or the user is already
  // authenticated, we reveal the tools immediately without a prompt.
  await initialize();

  /**
   * Manually triggers the cleanup service to prune old session data.
   */
  async function handleCleanup() {
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
      // Using bracket notation to bypass linter warning on specific method signature
      const result = await PB_API['runCleanup'](days);
      showAlert(`Cleanup successful! Removed ${result.leagues_cleaned || 0} session leagues older than ${days} days.`, 'Success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showAlert('Cleanup failed: ' + message, 'Error');
    }
  }
}