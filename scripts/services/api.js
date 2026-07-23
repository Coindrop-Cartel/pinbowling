/**
 * API Client and State Management
 */

import { getDebugEnabled } from '@services/state.js';

// Calculate the base application path once to ensure relative API calls resolve correctly
// regardless of clean URL routing (e.g., /leagues vs /leagues.php)
// This prevents 404 errors when navigating sub-directories or using .htaccess rewrites.
const base = window.APP_BASE || window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) || '';
const APP_BASE = base.endsWith('/') ? base.slice(0, -1) : base;

/**
 * Wrapper for the Fetch API that automatically includes security headers 
 * and handles standardized JSON error responses.
 */
export async function fetchJSON(url, options = {}) {
  let finalUrl = url;

  // Determine the HTTP method (defaulting to GET)
  let method = (options.method || 'GET').toUpperCase();

  // Automatically append query parameters for GET requests if provided in options
  if (method === 'GET' && typeof options.params === 'object' && options.params !== null) {
    const cleanParams = Object.fromEntries(
      Object.entries(options.params).filter(([_, v]) => v != null)
    );
    const queryString = new URLSearchParams(cleanParams).toString();
    if (queryString) {
      finalUrl += (finalUrl.includes('?') ? '&' : '?') + queryString;
    }
  }

  if (getDebugEnabled()) console.log(`[API] Constructing ${method} request to: ${url}`, { params: options.params, finalUrl });

  const headers = { ...options.headers };
  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

  // Include CSRF token for all state-changing requests if available in the environment.
  // This protects against CSRF attacks now that we use session cookies.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && window.PB_CSRF_TOKEN) {
    finalHeaders['X-CSRF-TOKEN'] = window.PB_CSRF_TOKEN;
  }

  // Construct a robust absolute URL including origin to prevent NetworkErrors
  // in specific browser environments (like Firefox on private IPs).
  // We trim leading slashes from finalUrl to ensure clean joining with APP_BASE
  const sanitizedPath = finalUrl.startsWith('http') ? finalUrl : finalUrl.replace(/^\//, '');
  const fullUrl = sanitizedPath.startsWith('http') ? sanitizedPath : `${window.location.origin}${APP_BASE}/${sanitizedPath}`;
  
  if (getDebugEnabled()) console.log(`[API] Final Request URL: ${fullUrl}`);
  
  // Prepare fetch options, ensuring a body is sent for POST requests (even if tunneled)
  // to prevent server-side resets for bodyless POSTs.
  const fetchOptions = { 
    ...options,
    method,
    headers: finalHeaders
  };

  // CRITICAL: The fetch spec prohibits 'body' on GET/HEAD requests.
  // We must only attach the body if the method is intended to carry one.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    fetchOptions.body = options.body || JSON.stringify({});
  }

  try {
    const response = await fetch(fullUrl, fetchOptions);
    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch (e) { /* Not a JSON response */ }
      throw new Error(errorMessage);
    }
    return response.json();
  } catch (err) {
    console.error(`fetchJSON Network Error [${fullUrl}]:`, err);
    throw err;
  }
}

/**
 * API client object providing typed methods for all backend service endpoints.
 */
export const PB_API = {
  auth: {
    login: (username, password) => fetchJSON('api/auth.php?task=login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => fetchJSON('api/auth.php?task=logout', { method: 'POST' }),
    register: (data) => fetchJSON('api/auth.php?task=register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => fetchJSON('api/auth.php?task=me'),
    forgotPassword: (email) => fetchJSON('api/auth.php?task=forgot', { method: 'POST', body: JSON.stringify({ email }) }),
    resetWithToken: (token, password) => fetchJSON('api/auth.php?task=reset_with_token', { method: 'POST', body: JSON.stringify({ token, password }) }),
  },

  players: {
    getAll: async (params) => {
      const res = await fetchJSON('api/player.php', { params });
      return Array.isArray(res) ? res : (res ? [res] : []);
    },
    create: (player) => fetchJSON('api/player.php', { method: 'POST', body: JSON.stringify(player) }),
    update: (id, player) => fetchJSON(`api/player.php?id=${id}`, { method: 'PUT', body: JSON.stringify(player) }),
    delete: (id) => fetchJSON(`api/player.php?id=${id}`, { method: 'DELETE' }),
    updatePassword: (userId, password) => fetchJSON(`api/auth.php?task=reset&id=${userId}`, { method: 'POST', body: JSON.stringify({ password }) }),
    updateRole: (userId, role) => fetchJSON(`api/player.php?task=role&id=${userId}`, { method: 'PUT', body: JSON.stringify({ role }) }),
    merge: (playerAId, playerBId) => fetchJSON('api/player.php?task=merge', { method: 'POST', body: JSON.stringify({ playerAId, playerBId }) }),
  },

  machines: {
    getAll: (params) => fetchJSON('api/machine.php', { params }),
    create: (machine) => fetchJSON('api/machine.php', { method: 'POST', body: JSON.stringify(machine) }),
    update: (id, machine) => fetchJSON(`api/machine.php?id=${id}`, { method: 'PUT', body: JSON.stringify(machine) }),
    delete: (id) => fetchJSON(`api/machine.php?id=${id}`, { method: 'DELETE' }),
    getTargets: (eventId, leagueId, params) => 
      fetchJSON(`api/machine.php?${leagueId ? `leagueId=${leagueId}` : `eventId=${eventId}`}`, { params }),
    saveTarget: (target) => {
      const eventId = Array.isArray(target) ? target[0]?.eventId : target?.eventId;
      const url = eventId ? `api/machine.php?eventId=${eventId}` : 'api/machine.php';
      return fetchJSON(url, { method: 'POST', body: JSON.stringify(target) });
    },
    deleteTarget: (id) => fetchJSON(`api/machine.php?id=${id}&task=threshold`, { method: 'DELETE' }),
    bulkUpdateSort: (updates) => fetchJSON('api/machine.php?task=sort', { method: 'POST', body: JSON.stringify(updates) }),
  },

  scores: {
    get: (playerId, eventId, leagueId, eventMatchupId) => {
      if (!eventId && !leagueId && !eventMatchupId) return [];
      let url = 'api/score.php?';
      if (eventMatchupId) url += `eventMatchupId=${eventMatchupId}`;
      else if (leagueId) url += `leagueId=${leagueId}`;
      else url += `eventId=${eventId}${playerId ? `&playerId=${playerId}` : ''}`;
      return fetchJSON(url);
    },
    save: (score) => fetchJSON('api/score.php', { method: 'POST', body: JSON.stringify(score) }),
    clear: (playerId) => fetchJSON(`api/score.php?playerId=${playerId}`, { method: 'DELETE' }),
  },

  matchups: {
    get: (eventId, eventMatchupId) => {
      if (eventMatchupId) return fetchJSON(`api/matchup.php?eventMatchupId=${eventMatchupId}`);
      return fetchJSON(`api/matchup.php?eventId=${eventId}`);
    },
    save: (matchups) => fetchJSON('api/matchup.php', { method: 'POST', body: JSON.stringify(matchups) }),
    clear: (eventId) => fetchJSON(`api/matchup.php?eventId=${eventId}`, { method: 'DELETE' }),
  },

  leagues: {
    getAll: (params) => fetchJSON('api/league.php', { params }),
    get: (id) => fetchJSON(`api/league.php?id=${id}`),
    create: (league) => fetchJSON('api/league.php', { method: 'POST', body: JSON.stringify(league) }),
    update: (id, league) => fetchJSON(`api/league.php?id=${id}`, { method: 'PUT', body: JSON.stringify(league) }),
    delete: (id) => fetchJSON(`api/league.php?id=${id}`, { method: 'DELETE' }),
    addPlayer: (leagueId, playerId) => fetchJSON('api/league.php?task=member', { method: 'POST', body: JSON.stringify({ leagueId, playerId }) }),
    removePlayer: (leagueId, playerId) => fetchJSON(`api/league.php?task=member&leagueId=${leagueId}&playerId=${playerId}`, { method: 'DELETE' }),
    startSeason: (leagueId) => fetchJSON('api/league.php?task=start_season', { method: 'POST', body: JSON.stringify({ leagueId }) }),
    updateSeason: (leagueId) => fetchJSON('api/league.php?task=update_season', { method: 'POST', body: JSON.stringify({ leagueId }) }),
    startPlayoffs: (leagueId, seeds, seriesLength) => fetchJSON('api/league.php?task=start_playoffs', { method: 'POST', body: JSON.stringify({ leagueId, seeds, seriesLength }) }),
    updateStatus: (id, status) => fetchJSON(`api/league.php?id=${id}&task=updateStatus`, { method: 'PUT', body: JSON.stringify({ status }) }),
  },

  events: {
    getAll: (leagueId, params) => fetchJSON(`api/league.php?task=fixture${leagueId ? `&leagueId=${leagueId}` : ''}`, { params }),
    create: (event) => fetchJSON('api/league.php?task=fixture', { method: 'POST', body: JSON.stringify(event) }),
    update: (id, event) => fetchJSON(`api/league.php?task=fixture&id=${id}`, { method: 'PUT', body: JSON.stringify(event) }),
    delete: (id, leagueId) => fetchJSON(`api/league.php?task=fixture&id=${id}${leagueId ? `&leagueId=${leagueId}` : ''}`, { method: 'DELETE' }),
  },

  teams: {
    getAll: () => fetchJSON('api/team.php'),
    create: (data) => fetchJSON('api/team.php', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchJSON(`api/team.php?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchJSON(`api/team.php?id=${id}`, { method: 'DELETE' }),
    addMember: (teamId, playerId) => fetchJSON('api/team.php?task=member', { method: 'POST', body: JSON.stringify({ teamId, playerId }) }),
    removeMember: (teamId, playerId) => fetchJSON(`api/team.php?task=member&teamId=${teamId}&playerId=${playerId}`, { method: 'DELETE' }),
    addToLeague: (leagueId, teamId) => fetchJSON('api/team.php?task=league', { method: 'POST', body: JSON.stringify({ leagueId, teamId }) }),
    removeFromLeague: (leagueId, teamId) => fetchJSON(`api/team.php?task=league&leagueId=${leagueId}&teamId=${teamId}`, { method: 'DELETE' }),
  },

  locations: {
    getAll: (params) => fetchJSON('api/location.php', { params }),
    create: (loc) => fetchJSON('api/location.php', { method: 'POST', body: JSON.stringify(loc) }),
    update: (id, loc) => fetchJSON(`api/location.php?id=${id}`, { method: 'PUT', body: JSON.stringify(loc) }),
    delete: (id) => fetchJSON(`api/location.php?id=${id}`, { method: 'DELETE' }),
    getMachines: (locationId, params) => fetchJSON(`api/location.php?task=units${locationId ? `&locationId=${locationId}` : ''}`, { params }),
    addMachine: (locationId, machineId, extra = {}) => 
      fetchJSON('api/location.php?task=units', { method: 'POST', body: JSON.stringify({ locationId, machineId, ...extra }) }),
    updateMachine: (locationId, machineId, data) =>
      fetchJSON('api/location.php?task=units', { method: 'PUT', body: JSON.stringify({ locationId, machineId, ...data }) }),
    removeMachine: (locationId, machineId) => fetchJSON(`api/location.php?task=units&locationId=${locationId}&machineId=${machineId}`, { method: 'DELETE' }),
  },

  system: {
    // Cleanup is a destructive, state-changing operation; the backend only
    // accepts POST (session league cleanup) or PUT (abandoned players).
    runCleanup: (days) => fetchJSON('api/cleanup.php' + (days ? `?days=${days}` : ''), { method: 'POST' }),
    fetchDiagnostics: () => fetchJSON('api/cleanup.php'),
  }
};
