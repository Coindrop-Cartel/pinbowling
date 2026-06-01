import { getAdminSessionPassword, setAdminSessionPassword, getLeaguePassword, setLeaguePassword } from '@services/state.js';
import { showPrompt, showAlert, showAuthDialog } from '@ui/uiComponents.js';
import { PB_API } from '@services/api.js';

/**
 * Verifies if the user has global admin access. 
 * Prompts for password if not already in session.
 */
export async function requireAdmin(message = 'Enter Admin Password to continue:') {
  if (window.PB_DEBUG_MODE) console.log('[Auth] requireAdmin called. Message:', message);

  if (!window.PB_ADMIN_PASSWORD) {
    if (window.PB_DEBUG_MODE) console.warn('[Auth] No admin password configured on server. Bypassing.');
    return true;
  }
  
  let pass = getAdminSessionPassword();
  if (pass === window.PB_ADMIN_PASSWORD) {
    if (window.PB_DEBUG_MODE) console.log('[Auth] Valid admin session found.');
    return true;
  }
  
  pass = await showPrompt(message);
  if (pass === null) return false;
  
  if (pass === window.PB_ADMIN_PASSWORD) {
    if (window.PB_DEBUG_MODE) console.log('[Auth] Admin password verified. Saving session.');
    setAdminSessionPassword(pass);
    return true;
  }
  
  showAlert('Invalid Admin Password.', 'Authentication Error');
  return false;
}

/**
 * Wraps an action that requires either a League Password or Admin Password.
 * Handles prompting and automatic session clearing if the API returns 401.
 */
export async function runAuthorizedLeagueAction(leagueId, actionCallback) {
  if (window.PB_DEBUG_MODE) console.log('[Auth] runAuthorizedLeagueAction triggered for league:', leagueId);

  // Check for an active session (Admin takes precedence as it overrides all leagues)
  let pass = getAdminSessionPassword() || getLeaguePassword(leagueId);
  
  if (!pass) {
    if (window.PB_DEBUG_MODE) console.log('[Auth] No session found. Prompting user.');
    const input = await showPrompt(`Enter League Password (or Admin Password) to continue:`, 'League Access');
    if (input === null) {
      if (window.PB_DEBUG_MODE) console.log('[Auth] Password prompt cancelled by user.');
      return false;
    }
    
    // If input matches the global admin password, satisfy the session locally
    if (window.PB_ADMIN_PASSWORD && input === window.PB_ADMIN_PASSWORD) {
      if (window.PB_DEBUG_MODE) console.log('[Auth] Input matches Admin Password. Upgrading to admin session.');
      setAdminSessionPassword(input);
    } else {
      // Otherwise, we treat it as a potential league password for the API to verify
      if (window.PB_DEBUG_MODE) console.log('[Auth] Input stored as potential league password.');
      setLeaguePassword(leagueId, input);
    }
  }

  try {
    if (window.PB_DEBUG_MODE) console.log('[Auth] Executing authorized callback...');
    await actionCallback();
    return true;
  } catch (err) {
    // If the API returns 401 (Unauthorized), the password was invalid for both roles
    if (err.message && err.message.includes('Unauthorized')) {
      if (window.PB_DEBUG_MODE) console.error('[Auth] API rejected credentials. Clearing local session.');
      setLeaguePassword(leagueId, null);
      setAdminSessionPassword(null);
      showAlert('The password provided was invalid for both this league and the global administrator.', 'Unauthorized');
    } else {
      throw err;
    }
    return false;
  }
}

/**
 * Initializes the authentication UI in the page header.
 */
export async function initAuthHeader() {
  const container = document.getElementById('auth-header-container');
  const adminNav = document.getElementById('admin-nav-item');
  if (!container) return;

  const render = (user) => {
    if (user) {
      if (user.role === 'admin' && adminNav) {
        adminNav.classList.remove('hidden');
      }

      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
          <span style="font-size: 0.85rem; font-weight: 500;">Hi, ${user.player_name || user.email}</span>
          <button id="header-logout-btn" style="padding: 8px 16px; background: #000; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Log Out</button>
        </div>
      `;
      container.querySelector('#header-logout-btn').onclick = async () => {
        await PB_API.logout();
        window.location.reload();
      };
    } else {
      container.innerHTML = `<button id="header-login-btn" style="padding: 8px 16px; background: #000; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Login</button>`;
      container.querySelector('#header-login-btn').onclick = async () => {
        const loggedIn = await showAuthDialog();
        if (loggedIn) window.location.reload();
      };
    }
  };

  const currentUser = await PB_API.getCurrentUser();
  render(currentUser);
}