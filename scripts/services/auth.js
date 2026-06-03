import { showAlert, showAuthDialog } from '@ui/uiComponents.js';
import { PB_API } from '@services/api.js';

/**
 * Verifies if the user has global admin access. 
 * Prompts for password if not already in session.
 */
export async function requireAdmin() {
  if (window.PB_DEBUG_MODE) console.log('[Auth] requireAdmin called.');

  const user = await PB_API.getCurrentUser();
  if (user && user.role === 'admin') {
    if (window.PB_DEBUG_MODE) console.log('[Auth] Admin role verified via session.');
    return true;
  }
  
  showAlert('Unauthorized: Administrator privileges are required for this action.', 'Access Denied');
  return false;
}

/**
 * Wraps an action that requires either a League Password or Admin Password.
 * Handles prompting and automatic session clearing if the API returns 401.
 */
export async function runAuthorizedLeagueAction(leagueId, actionCallback) {
  const isAuth = await isManagementAuthorized();
  if (!isAuth) {
    showAlert('You do not have permission to perform management actions for this league.', 'Unauthorized');
    return false;
  }

  try {
    if (window.PB_DEBUG_MODE) console.log('[Auth] Executing authorized callback...');
    await actionCallback();
    return true;
  } catch (err) {
    throw err;
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
      const isTD = user.role === 'td';
      const isAdmin = user.role === 'admin';

      if ((isAdmin || isTD) && adminNav) {
        adminNav.classList.remove('hidden');
        const maintenanceLink = adminNav.querySelector('#nav-maintenance');
        if (maintenanceLink) maintenanceLink.classList.toggle('hidden', !isAdmin);

        // Enhance dropdown for mobile: Use click to toggle instead of relying on hover
        const dropBtn = adminNav.querySelector('.dropbtn');
        if (dropBtn) {
          dropBtn.onclick = (e) => {
            if (window.innerWidth <= 768) {
              e.stopPropagation();
              const isOpen = adminNav.classList.toggle('is-open');
              
              // Prevent the scrolling nav container from clipping the vertical dropdown
              const navLinks = adminNav.closest('.nav-links');
              if (navLinks) {
                navLinks.classList.toggle('dropdown-active', isOpen);
              }
            }
          };
        }
      }

      container.innerHTML = `
        <div class="auth-header-wrapper">
          <span class="auth-user-greeting">Hi, ${user.player_name || user.username}</span>
          <button id="header-logout-btn">Log Out</button>
        </div>
      `;
      container.querySelector('#header-logout-btn').onclick = async () => {
        await PB_API.logout();
        window.location.reload();
      };
    } else {
      container.innerHTML = `<button id="header-login-btn">Login</button>`;
      container.querySelector('#header-login-btn').onclick = async () => {
        const loggedIn = await showAuthDialog();
        if (loggedIn) window.location.reload();
      };
    }
  };

  const currentUser = await PB_API.getCurrentUser();
  render(currentUser);
}

/**
 * Checks if the current user has either a 'td' or 'admin' role.
 * Use this to conditionally disable or hide management UI elements.
 */
export async function isManagementAuthorized() {
  const user = await PB_API.getCurrentUser();
  if (!user) return false;
  return user.role === 'admin' || user.role === 'td';
}