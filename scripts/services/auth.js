import { showAlert, showAuthDialog } from '@ui/dialogs.js';
import { PB_API } from '@services/api.js';

let _cachedUser = null;
let _userFetchPromise = null;
let _isInitialized = false;

/**
 * Centralized Permission Registry
 */
export const PERMISSIONS = {
  // Play / Let's Bowl
  CREATE_SESSION: 'CREATE_SESSION',
  JOIN_SESSION: 'JOIN_SESSION', // Players/Guests can always join

  // Scoring
  ADD_ANY_SCORE: 'ADD_ANY_SCORE',   // New scores
  UPDATE_ANY_SCORE: 'UPDATE_ANY_SCORE', // Existing scores
  
  // Management (TD level)
  MANAGE_LEAGUES: 'MANAGE_LEAGUES',
  MANAGE_TEAMS: 'MANAGE_TEAMS',
  MANAGE_MACHINES: 'MANAGE_MACHINES',
  MANAGE_PLAYERS: 'MANAGE_PLAYERS',

  // Specific Admin/Player overlaps
  ADD_LOCATION_MACHINE: 'ADD_LOCATION_MACHINE',
  UPDATE_SELF: 'UPDATE_SELF',
  
  // System
  RUN_CLEANUP: 'RUN_CLEANUP'
};

const ROLE_PERMISSIONS = {
  'admin': ['*'],
  'td': [PERMISSIONS.CREATE_SESSION, PERMISSIONS.JOIN_SESSION, PERMISSIONS.ADD_ANY_SCORE, PERMISSIONS.UPDATE_ANY_SCORE, PERMISSIONS.MANAGE_LEAGUES, PERMISSIONS.MANAGE_TEAMS, PERMISSIONS.MANAGE_MACHINES, PERMISSIONS.MANAGE_PLAYERS, PERMISSIONS.ADD_LOCATION_MACHINE],
  'player': [PERMISSIONS.CREATE_SESSION, PERMISSIONS.JOIN_SESSION, PERMISSIONS.ADD_LOCATION_MACHINE, PERMISSIONS.UPDATE_SELF],
  'unregistered': [PERMISSIONS.JOIN_SESSION]
};

/**
 * Mapping of navigation element selectors to the permissions required to see them.
 */
const NAV_PERMISSIONS = {
  '#nav-leagues': PERMISSIONS.MANAGE_LEAGUES,
  '#nav-machines': PERMISSIONS.MANAGE_MACHINES,
  '#nav-locations': PERMISSIONS.JOIN_SESSION, // Visible to any registered user
  '#nav-players': PERMISSIONS.JOIN_SESSION,   // Visible to any registered user
  '#nav-teams': PERMISSIONS.MANAGE_TEAMS,
  '#nav-maintenance': PERMISSIONS.RUN_CLEANUP
};

/**
 * Resets the internal authentication cache.
 * Primarily used for testing isolation and during logout.
 */
export function resetAuthCache() {
  _cachedUser = null;
  _userFetchPromise = null;
  _isInitialized = false;
}

/**
 * Internal helper to retrieve the user profile. 
 * Uses a promise cache to ensure multiple simultaneous calls only trigger one network request,
 * and a result cache to prevent redundant requests during SPA navigation.
 */
async function getAuthenticatedUser() {
  if (_isInitialized) return _cachedUser;
  if (_userFetchPromise) return _userFetchPromise;

  _userFetchPromise = PB_API.getCurrentUser()
    .then(user => {
      _cachedUser = user;
      _isInitialized = true;
      _userFetchPromise = null;
      return user;
    })
    .catch(err => {
      _userFetchPromise = null;
      throw err;
    });

  return _userFetchPromise;
}

/**
 * Verifies if the user has global admin access. 
 * Prompts for password if not already in session.
 */
export async function requireAdmin() {
  if (window.PB_DEBUG_MODE) console.log('[Auth] requireAdmin called.');

  const user = await getAuthenticatedUser();
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
 * Checks if the current user (or guest) has a specific permission.
 * @param {string} permission 
 * @returns {Promise<boolean>}
 */
export async function can(permission) {
  const user = await getAuthenticatedUser();
  const role = user ? user.role : 'unregistered';
  
  const perms = ROLE_PERMISSIONS[role] || [];
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;

  return false;
}

/**
 * Updates the UI elements based on the provided user state.
 * This handles the header buttons and the global Admin/TD navigation visibility.
 */
function updateAuthUI(user) {
  const container = document.getElementById('auth-header-container');
  const adminNav = document.getElementById('admin-nav-item');
  const role = user?.role || 'unregistered';

  // Handle global restricted navigation items
  if (adminNav) {
    let visibleChildren = 0;

    // Declaratively toggle visibility based on defined permissions
    Object.entries(NAV_PERMISSIONS).forEach(([selector, permission]) => {
      const el = adminNav.querySelector(selector);
      if (el) {
        const perms = ROLE_PERMISSIONS[role] || [];
        const hasAccess = perms.includes('*') || perms.includes(permission);
        el.classList.toggle('hidden', !hasAccess);
        if (hasAccess) visibleChildren++;
      }
    });

    // Hide the entire "Admin" dropdown if the user has no accessible sub-items
    adminNav.classList.toggle('hidden', visibleChildren === 0 || !user);
  }

  if (!container) return;

  if (user) {
    container.innerHTML = `
      <div class="auth-header-wrapper">
        <span class="auth-user-greeting">Hi, ${user.player_name || user.username}</span>
        <button id="header-logout-btn">Log Out</button>
      </div>
    `;
    container.querySelector('#header-logout-btn').onclick = async () => {
      try {
        await PB_API.logout();
        resetAuthCache();
        // Refresh the entire page on logout to clear session data and reset permissions
        window.location.reload();
      } catch (err) {
        console.error('[Auth] Logout failed:', err);
      }
    };
  } else {
    container.innerHTML = `<button id="header-login-btn">Login</button>`;
    container.querySelector('#header-login-btn').onclick = async () => {
      const success = await showAuthDialog();
      if (success) {
        // Refresh the entire page to ensure all permission-gated elements re-render correctly
        window.location.reload();
      }
    };
  }
}

/**
 * Initializes the authentication UI in the page header.
 * Optimized to avoid redundant network requests during SPA-style navigation.
 */
export async function initAuthHeader() {
  // If we've already fetched the user in this session, use the cached state 
  // to update the UI immediately without waiting for a network request.
  if (_isInitialized) {
    updateAuthUI(_cachedUser);
    return;
  }

  // First-time load requires fetching the user profile
  const user = await getAuthenticatedUser();
  updateAuthUI(user);
}

/**
 * Checks if the current user has either a 'td' or 'admin' role.
 * Use this to conditionally disable or hide management UI elements.
 */
export async function isManagementAuthorized() {
  const user = await getAuthenticatedUser();
  if (!user) return false;
  return user.role === 'admin' || user.role === 'td';
}