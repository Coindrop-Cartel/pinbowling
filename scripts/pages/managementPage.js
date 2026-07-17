import { PB_API } from '@services/api.js';
import { can, PERMISSIONS } from '@services/auth.js';
import { showAlert, showAuthDialog, showConfirm, showPrompt } from '@ui/dialogs.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { loadPage, escapeHTML } from '@scripts/utils.js';
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
      PB_API.auth.me(),
      can(PERMISSIONS.RUN_CLEANUP) // Maintenance check
    ]);

    if (user && isAuthorized) {
      revealTools(user);
    } else if (user) {
      // Logged in but not an admin? Shoo!
      showAlert('Administrator access is required for system maintenance.', 'Access Denied');
      loadPage(ROUTE_PATHS.HOME());
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

    const actionSummary = document.getElementById('mgmt-action-summary');
    if (actionSummary) {
      renderActionSummary(actionSummary, `System Maintenance for ${escapeHTML(user.username)}`, []);
    }

    const cleanupBtn = document.getElementById('mgmt-run-cleanup-btn');
    if (cleanupBtn) {
      if (user.role === 'admin') {
        cleanupBtn.classList.remove('hidden');
      } else {
        cleanupBtn.classList.add('hidden');
      }
    }

    const diagSection = document.getElementById('mgmt-diagnostics-section');
    if (diagSection) {
      if (user.role === 'admin') {
        diagSection.classList.remove('hidden');
        // Automatically fetch diagnostics when the admin tools are revealed
        const loadDiagBtn = document.getElementById('mgmt-load-diag-btn');
        if (loadDiagBtn) {
          loadDiagBtn.click();
        }
      } else {
        diagSection.classList.add('hidden');
      }
    }
  };

  /**
   * Adds a subtle version indicator to the bottom of the management tools.
   */
  const renderVersionInfo = () => {
    const versionInfo = document.getElementById('mgmt-ui-version');
    if (!versionInfo || !toolsSection) return;

    versionInfo.classList.remove('hidden');
    const versionText = document.getElementById('mgmt-ui-version-text');
    if (versionText) versionText.textContent = `System UI Version: ${window['PB_UI_VERSION'] || '1.0.0'}`;

    const debugToggle = document.getElementById('mgmt-debug-toggle');
    if (debugToggle) {
      debugToggle.checked = Boolean(window['PB_DEBUG_MODE']); // Explicitly sync state from global variable
      debugToggle.onchange = () => {
        const isEnabled = debugToggle.checked;
        window['PB_DEBUG_MODE'] = isEnabled;
        setDebugEnabled(isEnabled);
      };
    }
  };

  const loadDiagBtn = document.getElementById('mgmt-load-diag-btn');
  const diagResults = document.getElementById('mgmt-diag-results');

  if (loadDiagBtn) {
    loadDiagBtn.addEventListener('click', async () => {
      loadDiagBtn.disabled = true;
      loadDiagBtn.textContent = 'Loading...';
      try {
        const diag = await PB_API.system.fetchDiagnostics();
        
        const statusEl = document.getElementById('diag-status');
        const tsRow = document.getElementById('diag-troubleshooting-row');
        const tsHints = document.getElementById('diag-troubleshooting-hints');

        if (statusEl) {
          if (diag.dbConnected) {
            statusEl.textContent = 'Connected';
            statusEl.style.color = 'green';
            tsRow?.classList.add('hidden');
          } else {
            statusEl.textContent = 'Failed';
            statusEl.style.color = 'red';
            
            // Build troubleshooting suggestions similar to db-test.php
            if (tsRow && tsHints) {
              const errStr = String(diag.dbError || '');
              let hints = [];
              if (errStr.includes('Access denied')) {
                hints.push('Check DB_USER and DB_PASS in your .env file. If using root, you may need to configure a dedicated user for web access.');
              }
              if (errStr.includes('Connection refused') || errStr.includes('nosuchfile')) {
                hints.push('If DB_HOST is localhost, try using 127.0.0.1. Also verify that the MySQL/MariaDB service is active and running.');
              }
              if (errStr.includes('Unknown database')) {
                hints.push(`The database "${diag.configuredDatabase}" does not exist. Verify the name or create it via terminal.`);
              }
              hints.push(`Error Detail: ${errStr}`);
              
              tsHints.innerHTML = hints.map(h => `• ${escapeHTML(h)}`).join('<br>');
              tsRow.classList.remove('hidden');
            }
          }
        }
        
        const phpEl = document.getElementById('diag-php-version');
        if (phpEl) phpEl.textContent = diag.phpVersion || 'unknown';
        
        const pdoEl = document.getElementById('diag-pdo-drivers');
        if (pdoEl) pdoEl.textContent = (diag.pdoDrivers || []).join(', ') || 'none';
        
        const connEl = document.getElementById('diag-connected-db');
        if (connEl) {
          if (diag.dbConnected) {
            connEl.textContent = `Host: ${diag.connectedHost} | Database: ${diag.connectedDatabase}`;
          } else {
            connEl.textContent = 'Disconnected';
          }
        }
        
        const configEl = document.getElementById('diag-configured-dsn');
        if (configEl) configEl.textContent = `Host: ${diag.configuredHost}:${diag.configuredPort} | Database: ${diag.configuredDatabase}`;
        
        const userEl = document.getElementById('diag-configured-user');
        if (userEl) userEl.textContent = diag.configuredUser || 'unknown';

        const envEl = document.getElementById('diag-env-status');
        if (envEl) envEl.textContent = diag.envFound ? 'Found' : 'Not Found';
        
        const tablesEl = document.getElementById('diag-tables-list');
        if (tablesEl) {
          if (diag.dbConnected) {
            tablesEl.textContent = (diag.tables || []).join(', ') || 'No tables found';
          } else {
            tablesEl.textContent = 'N/A (database offline)';
          }
        }
        
        diagResults?.classList.remove('hidden');
      } catch (err) {
        const statusEl = document.getElementById('diag-status');
        if (statusEl) {
          statusEl.textContent = 'Failed';
          statusEl.style.color = 'red';
        }
        const message = err instanceof Error ? err.message : String(err);
        showAlert('Failed to fetch system diagnostics: ' + message, 'Error');
      } finally {
        loadDiagBtn.disabled = false;
        loadDiagBtn.textContent = 'Fetch Diagnostics';
      }
    });
  }

  if (loginBtn) {
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

  const cleanupBtn = document.getElementById('mgmt-run-cleanup-btn');
  if (cleanupBtn) {
    cleanupBtn.addEventListener('click', handleCleanup);
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

    const daysInput = await showPrompt('Enter retention period in days (leagues older than this will be deleted):', 'Cleanup Configuration', false);
    if (daysInput === null) return; // User cancelled the prompt
    const days = parseInt(daysInput, 10) || 30;

    try {
      if (!await can(PERMISSIONS.RUN_CLEANUP)) {
        showAlert('Unauthorized: Administrator privileges are required for this action.', 'Access Denied');
        return;
      }
      const result = await PB_API.system.runCleanup(days);
      showAlert(`Cleanup successful! Removed ${result.leagues_cleaned || 0} session leagues older than ${days} days.`, 'Success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showAlert('Cleanup failed: ' + message, 'Error');
    }
  }
}