import { showAlert, showAuthDialog } from '@ui/dialogs.js';
import { PB_API } from '@services/api.js';
import { getDebugEnabled } from '@services/state.js';

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
  '#nav-leagues': null, // Visible to all; internal actions restricted by role
  '#nav-wppr': null,    // Visible to all users
  '#nav-machines': PERMISSIONS.CREATE_SESSION,
  '#nav-locations': PERMISSIONS.JOIN_SESSION, // Visible to any registered user
  '#nav-players': PERMISSIONS.JOIN_SESSION,   // Visible to any registered user
  '#nav-teams': PERMISSIONS.CREATE_SESSION,
  '#nav-maintenance': PERMISSIONS.RUN_CLEANUP
};

/**
 * Resets the internal auth cache (user profile and initialization state).
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

  _userFetchPromise = PB_API.auth.me()
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
 * Note: Resolved Roadmap Issue 11 - Side effects removed. Callers handle UI feedback.
 *
 * @returns {Promise<boolean>} `true` if the user is an admin, `false` otherwise.
 */
export async function requireAdmin() {
  const user = await getAuthenticatedUser();
  return user?.role === 'admin';
}

/**
 * Wraps an action that requires either a League Password or Admin Password.
 * Handles prompting and automatic session clearing if the API returns 401.
 *
 * @param {string|number} leagueId - The league ID the action is scoped to.
 * @param {Function} actionCallback - Async callback to execute once authorized.
 * @returns {Promise<boolean>} `true` if the action was executed, `false` if unauthorized.
 */
export async function runAuthorizedLeagueAction(leagueId, actionCallback) {
  const isAuth = await isManagementAuthorized();
  if (!isAuth) {
    showAlert('You do not have permission to perform management actions for this league.', 'Unauthorized');
    return false;
  }

  try {
    if (getDebugEnabled()) console.log('[Auth] Executing authorized callback...');
    await actionCallback();
    return true;
  } catch (err) {
    const message = err?.message || String(err);
    if (message.includes('Unauthorized')) {
      showAlert(message, 'Access Denied');
      return false;
    }
    throw err;
  }
}

/**
 * Checks if the current user (or guest) has a specific permission.
 * @param {string} permission - Permission constant from the PERMISSIONS registry.
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
 * Attaches delegated event listeners to the auth container.
 * This ensures PHP-rendered buttons work immediately without re-rendering the DOM.
 */
function attachAuthListeners() {
  const container = document.getElementById('auth-header-container');
  if (!container || container.dataset.listenersBound) return;

  container.addEventListener('click', async (e) => {
    const logoutBtn = e.target.closest('#header-logout-btn');
    const loginBtn = e.target.closest('#header-login-btn');

    if (logoutBtn) {
      try {
        await PB_API.auth.logout();
        resetAuthCache();
        // Refresh the entire page on logout to clear session data and reset permissions
        window.location.reload();
      } catch (err) {
        console.error('[Auth] Logout failed:', err);
      }
    }

    if (loginBtn) {
      const success = await showAuthDialog();
      if (success) {
        // Refresh the entire page to ensure all permission-gated elements re-render correctly
        window.location.reload();
      }
    }
  });

  container.dataset.listenersBound = 'true';
}

/**
 * Updates the UI elements based on the provided user state.
 * This handles the header buttons and the global Admin/TD navigation visibility.
 */
function updateAuthUI(user) {
  const container = document.getElementById('auth-header-container');
  const adminNav = document.getElementById('admin-nav-item');
  const role = user?.role || 'unregistered';
  // Stable ID for state-checking; ensures guests and users are uniquely identified
  const userId = user ? `user-${user.id || 'auth'}` : 'guest';

  // Handle global restricted navigation items
  // Note: This runs regardless of the state guard to ensure sub-item visibility 
  // (e.g. Maintenance) is correctly synced even if the parent menu was visible in PHP.
  if (adminNav) {
    let visibleChildren = 0;

    // Declaratively toggle visibility of all registered navigation items
    Object.entries(NAV_PERMISSIONS).forEach(([selector, permission]) => {
      const el = document.querySelector(selector);
      if (el) {
        const perms = ROLE_PERMISSIONS[role] || [];
        const hasAccess = !permission || perms.includes('*') || perms.includes(permission);
        el.classList.toggle('hidden', !hasAccess);
        // Count visible items specifically within the Admin dropdown for its visibility toggle
        if (hasAccess && adminNav.contains(el)) visibleChildren++;
      }
    });

    // Hide the entire "Admin" dropdown if the user has no accessible sub-items or is not management (admin/td/player)
    adminNav.classList.toggle('hidden', visibleChildren === 0 || !user || (role !== 'admin' && role !== 'td' && role !== 'player'));
  }

  // State-Keyed Rendering Guard:
  // Only re-render the auth container if the identity has actually changed.
  const currentState = container?.getAttribute('data-auth-state');
  if (!container || (currentState === userId && container.innerHTML.trim() !== '')) return;

  // Identity has changed; update the state-key and proceed with DOM updates
  container.setAttribute('data-auth-state', userId);

  if (user) {
    container.innerHTML = `
      <div class="auth-header-wrapper">
        <span class="auth-user-greeting">Hi, ${user.player_name || user.username}</span>
        <button id="header-logout-btn">Log Out</button>
      </div>
    `;
  } else {
    container.innerHTML = `<button id="header-login-btn">Login</button>`;
  }
}

/**
 * Initializes the authentication UI in the page header.
 * Optimized to avoid redundant network requests during SPA-style navigation.
 *
 * @returns {Promise<void>}
 */
export async function initAuthHeader() {
  attachAuthListeners();

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
 *
 * @returns {Promise<boolean>} `true` if the user is a TD or admin, `false` otherwise.
 */
export async function isManagementAuthorized() {
  // Standardized via Issue 10: Call can() with management permission
  return await can(PERMISSIONS.MANAGE_LEAGUES);
}

/**
 * Determines the access level for scoring a specific player's round.
 * Centralizes authorization logic so pages don't duplicate permission checks.
 *
 * Returns both a round-level access decision and per-ball lock status.
 * Balls that already have saved values are individually locked for non-management users.
 * The round-level `access` is 'denied' only when ALL balls have values and the user
 * lacks update permission — this controls the "Score locked" message display.
 *
 * @param {Object|null} currentUser - The currently authenticated user (from PB_API.getCurrentUser()).
 * @param {Object|null} targetPlayer - The player whose score is being entered.
 * @param {Object|null} turnValues - Existing score values for the round (ball1, ball2, ball3).
 * @param {boolean} [isSession=false] - Whether this is a session (quick play) event.
 * @returns {Promise<{access: 'allowed'|'denied', reason?: string, lockedBalls: Object<string, boolean>}>}
 */
export async function getScoreAccessLevel(currentUser, targetPlayer, turnValues, isSession = false, isTargetInRoster = true) {
  if (!isTargetInRoster) {
    return { access: 'denied', reason: 'Player is not registered in this league.', lockedBalls: {} };
  }

  const canUpdateAny = await can(PERMISSIONS.UPDATE_ANY_SCORE);
  const canUpdateSelf = await can(PERMISSIONS.UPDATE_SELF);
  const canAddAny = await can(PERMISSIONS.ADD_ANY_SCORE);
  const isSelf = currentUser && String(targetPlayer?.id) === String(currentUser.player_id);
  const isTargetUnregistered = !targetPlayer?.userId;

  // Determine which balls already have saved values
  const hasBall1 = !!(turnValues?.ball1);
  const hasBall2 = !!(turnValues?.ball2);
  const hasBall3 = !!(turnValues?.ball3);
  const allBallsFilled = hasBall1 && hasBall2 && hasBall3;
  const anyBallFilled = hasBall1 || hasBall2 || hasBall3;

  // 1. Management Override: TD/Admin can always score/update anything.
  if (canUpdateAny) return { access: 'allowed', lockedBalls: {} };

  // Standard League Logic
  if (!isSession) {
    const lockedBalls = {};
    const reasonForDenial = 'Score locked. Contact TD to correct errors.';
    const isCurrentUserRegistered = !!currentUser; // Determine registration status once

    // Determine individual ball lock status:
    // Any ball with an existing value is locked for non-TD/Admins.
    if (hasBall1) lockedBalls.ball1 = true;
    if (hasBall2) lockedBalls.ball2 = true;
    if (hasBall3) lockedBalls.ball3 = true;

    // If all balls are filled, the entire round is denied for non-TD/Admins.
    if (allBallsFilled) {
      return { access: 'denied', reason: reasonForDenial, lockedBalls };
    }

    // A user can add a score if the target is an unregistered guest,
    // or if they are scoring themselves and have the 'UPDATE_SELF' permission.
    // This collapses the registration check as 'isSelf' is only true for registered users.
    const canUserAddScore = isTargetUnregistered || (isSelf && canUpdateSelf);

    if (!canUserAddScore) {
      // If the user cannot add any scores at all (e.g., registered user trying to score another *registered* player).
      const specificReason = isCurrentUserRegistered && !isSelf && !isTargetUnregistered
          ? 'You do not have permission to score this registered player.'
          : reasonForDenial; // Generic denial if user can't add, but not specifically another registered player.
      return { access: 'denied', reason: specificReason, lockedBalls };
    }

    // If we reach here, it means:
    // 1. Not all balls are filled.
    // 2. The user has permission to add scores to empty balls.
    // 3. Some individual balls might be locked, but the round itself is not fully denied.
    return { access: 'allowed', lockedBalls };
  }

  // 3. Session League Logic (Remaining logic is for session leagues)
  //    In session leagues, if a player can enter scores, they can also update them.
  //    Only TD/Admin (canUpdateAny) restrictions apply to modifying already-saved values
  //    in standard leagues. Sessions are more permissive — self-scoring and guest-scoring
  //    users may freely update their own existing ball values.
  let canUpdateSession = canUpdateAny;
  let canAddSessionScore = false;
  if (currentUser) {
    canAddSessionScore = isSelf && canUpdateSelf;
  } else {
    canAddSessionScore = isTargetUnregistered;
  }

  // In session leagues, any user who can add scores can also update existing scores.
  // This is the key difference from standard leagues — sessions allow self-correction.
  if (canAddSessionScore) {
    canUpdateSession = true;
  }

  // Build per-ball lock status for session leagues
  // Only locked if the user lacks both canUpdateAny and canAddSessionScore.
  const lockedBallsSession = {};
  if (!canUpdateSession) {
    if (hasBall1) lockedBallsSession.ball1 = true;
    if (hasBall2) lockedBallsSession.ball2 = true;
    if (hasBall3) lockedBallsSession.ball3 = true;
  }

  // 4. If all balls are filled and user can't update, deny the entire round
  //    (this shows the "Score locked" message and hides the Save button)
  if (allBallsFilled && !canUpdateSession) {
    const reason = currentUser
        ? 'Score locked. Contact TD to correct errors.'
        : 'Login required to update registered players.';
    return { access: 'denied', reason, lockedBalls: lockedBallsSession };
  }

  // 5. If some balls are filled but not all, check if user can at least add new scores
  if (anyBallFilled && !canUpdateSession) {
    // User can't update existing values, but might be able to fill empty balls.
    // Check if they have permission to score this player at all.
    if (!currentUser) {
      if (isTargetUnregistered) return { access: 'allowed', lockedBalls: lockedBallsSession };
      return { access: 'denied', reason: 'Login required to score registered players.', lockedBalls: lockedBallsSession };
    }
    if (canAddSessionScore) return { access: 'allowed', lockedBalls: lockedBallsSession };
    if (isTargetUnregistered) return { access: 'allowed', lockedBalls: lockedBallsSession };
    if (canAddAny) return { access: 'allowed', lockedBalls: lockedBallsSession };
    return { access: 'denied', reason: 'You do not have permission to score this player.', lockedBalls: lockedBallsSession };
  }

  // 6. Handle New Scores (no existing values)
  if (!currentUser) {
    if (isTargetUnregistered) return { access: 'allowed', lockedBalls: lockedBallsSession };
    return { access: 'denied', reason: 'Login required to score registered players.', lockedBalls: lockedBallsSession };
  }

  // Registered user adding score: Allow self (with permission) or unregistered players.
  if (canAddSessionScore) return { access: 'allowed', lockedBalls: lockedBallsSession };
  if (isTargetUnregistered) return { access: 'allowed', lockedBalls: lockedBallsSession };
  
  // If user has 'ADD_ANY_SCORE' (assigned to TD/Admin), they can score others.
  if (canAddAny) return { access: 'allowed', lockedBalls: lockedBallsSession };

  return { access: 'denied', reason: 'You do not have permission to score this player.', lockedBalls: lockedBallsSession };
}
/**
 * Filters leagues to only those visible to the given user.
 * Unregistered (null) users can only see leagues that have at least one guest player.
 * Authenticated users see all leagues.
 *
 * @param {Array} leagues - Array of league objects, each with a `players` array.
 * @param {Object|null} user - The currently authenticated user, or null for guests.
 * @returns {Array} Filtered leagues visible to the user.
 */
export function filterLeaguesForUser(leagues, user) {
  if (user) return leagues;
  return leagues.filter(l => (l.players || []).some(p => !p.userId));
}

/**
 * Filters players to only those selectable by the given user.
 * Unregistered (null) users can only select unregistered guest players.
 * Authenticated users can select all players.
 *
 * @param {Array} players - Array of player objects, each with a `userId` property.
 * @param {Object|null} user - The currently authenticated user, or null for guests.
 * @returns {Array} Filtered players selectable by the user.
 */
export function filterPlayersForUser(players, user) {
  if (user) return players;
  return players.filter(p => !p.userId);
}