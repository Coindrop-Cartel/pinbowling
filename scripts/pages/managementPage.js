import { PB_API, ADMIN_PASSWORD } from '@services/api.js';
import { requireAdmin } from '@services/auth.js';
import { showPrompt, showConfirm, showAlert } from '@ui/uiComponents.js';

/**
 * Logic for the System Management page.
 * Provides tools for password resets and database maintenance.
 */
export async function initManagementPage() {
  console.log('initManagementPage initialized');

  const authNotice = document.getElementById('management-auth-notice');
  const toolsSection = document.getElementById('management-tools');
  const loginBtn = document.getElementById('admin-login-btn');
  const leagueSelect = document.getElementById('mgmt-league-select');
  const resetPassBtn = document.getElementById('mgmt-reset-pass-btn');
  const cleanupBtn = document.getElementById('mgmt-run-cleanup-btn');

  /**
   * Verifies admin credentials before displaying management tools.
   */
  const checkAuth = async () => {
    const verified = await requireAdmin('Enter Admin Password to access management tools:');
    if (verified) {
      revealTools();
    }
  };

  const revealTools = () => {
    authNotice.classList.add('hidden');
    toolsSection.classList.remove('hidden');
    loadLeagues();
    renderVersionInfo();
  };

  /**
   * Adds a subtle version indicator to the bottom of the management tools.
   */
  const renderVersionInfo = () => {
    if (document.getElementById('mgmt-ui-version')) return;
    const versionInfo = document.createElement('div');
    versionInfo.id = 'mgmt-ui-version';
    versionInfo.style = "margin-top: 3rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: right; font-size: 0.8rem; opacity: 0.5;";
    versionInfo.textContent = `System UI Version: ${window.UI_VERSION || '1.0.0'}`;
    toolsSection.appendChild(versionInfo);
  };

  if (loginBtn) {
    // Use addEventListener for better reliability and wrap the call 
    // to ensure the MouseEvent isn't passed as the prompt message.
    loginBtn.addEventListener('click', () => checkAuth());
  }

  // Perform an initial check on load. If no password is set or the user is already
  // authenticated, we reveal the tools immediately without a prompt.
  console.log('Performing initial Management auth check...');
  checkAuth();

  /**
   * Populates the league selection dropdown.
   */
  async function loadLeagues() {
    try {
      const leagues = await PB_API.getLeagues();
      leagueSelect.innerHTML = '<option value="">-- Select League --</option>';
      // Include all leagues for management purposes
      leagues.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = `${l.name} (${l.type === 'session' ? 'Session' : 'Standard'})`;
        leagueSelect.appendChild(opt);
      });
    } catch (err) {
      console.error('Failed to load leagues for management:', err);
      showAlert('Failed to load leagues for management: ' + err.message, 'Fetch Error');
    }
  }

  /**
   * Resets the password for the selected league.
   */
  resetPassBtn.onclick = async () => {
    const id = leagueSelect.value;
    if (!id) return showAlert('Please select a league first.', 'Selection Required');

    const newPass = await showPrompt('Enter a new league password (leave blank to clear the password entirely):', 'Reset Password', false);
    if (newPass === null) return; // User cancelled the prompt

    try {
      // We call updateLeague with the resetPassword flag which is handled by leagueService.php
      await PB_API.updateLeague(id, { resetPassword: true, password: newPass });
      showAlert('League password updated successfully.', 'Success');
    } catch (err) {
      showAlert('Failed to reset password: ' + err.message, 'Error');
    }
  };

  /**
   * Manually triggers the cleanup service to prune old session data.
   */
  cleanupBtn.onclick = async () => {
    const confirmed = await showConfirm(
      'Are you sure you want to run the database cleanup? This will permanently delete session-type leagues and their associated data based on the retention period.',
      'Confirm Cleanup'
    );
    
    if (!confirmed) return;

    const adminVerified = await requireAdmin('Enter Admin Password to perform database cleanup:');
    if (!adminVerified) return;

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