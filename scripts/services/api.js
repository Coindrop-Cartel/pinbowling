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
    login: (username, password) => fetchJSON('service/authService.php?task=login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => fetchJSON('service/authService.php?task=logout', { method: 'POST' }),
    register: (data) => fetchJSON('service/authService.php?task=register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => fetchJSON('service/authService.php?task=me'),
  },

  players: {
    getAll: (params) => fetchJSON('service/playerService.php', { params }),
    create: (player) => fetchJSON('service/playerService.php', { method: 'POST', body: JSON.stringify(player) }),
    update: (id, player) => fetchJSON(`service/playerService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(player) }),
    delete: (id) => fetchJSON(`service/playerService.php?id=${id}`, { method: 'DELETE' }),
    updatePassword: (userId, password) => fetchJSON(`service/authService.php?task=reset&id=${userId}`, { method: 'POST', body: JSON.stringify({ password }) }),
    updateRole: (userId, role) => fetchJSON(`service/playerService.php?task=role&id=${userId}`, { method: 'PUT', body: JSON.stringify({ role }) }),
  },

  machines: {
    getAll: (params) => fetchJSON('service/machineService.php', { params }),
    create: (machine) => fetchJSON('service/machineService.php', { method: 'POST', body: JSON.stringify(machine) }),
    update: (id, machine) => fetchJSON(`service/machineService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(machine) }),
    delete: (id) => fetchJSON(`service/machineService.php?id=${id}`, { method: 'DELETE' }),
    getTargets: (eventId, leagueId, params) => 
      fetchJSON(`service/machineService.php?${leagueId ? `leagueId=${leagueId}` : `eventId=${eventId}`}`, { params }),
    saveTarget: (target) => fetchJSON(`service/machineService.php?task=threshold`, { method: 'POST', body: JSON.stringify(target) }),
    deleteTarget: (id) => fetchJSON(`service/machineService.php?id=${id}&task=threshold`, { method: 'DELETE' }),
    bulkUpdateSort: (updates) => fetchJSON('service/machineService.php?task=sort', { method: 'POST', body: JSON.stringify(updates) }),
  },

  scores: {
    get: (playerId, eventId, leagueId) => {
      if (!eventId && !leagueId) return [];
      let url = 'service/scoreService.php?';
      if (leagueId) url += `leagueId=${leagueId}`;
      else url += `eventId=${eventId}${playerId ? `&playerId=${playerId}` : ''}`;
      return fetchJSON(url);
    },
    save: (score) => fetchJSON('service/scoreService.php', { method: 'POST', body: JSON.stringify(score) }),
    clear: (playerId) => fetchJSON(`service/scoreService.php?playerId=${playerId}`, { method: 'DELETE' }),
  },

  leagues: {
    getAll: (params) => fetchJSON('service/leagueService.php', { params }),
    get: (id) => fetchJSON(`service/leagueService.php?id=${id}`),
    create: (league) => fetchJSON('service/leagueService.php', { method: 'POST', body: JSON.stringify(league) }),
    update: (id, league) => fetchJSON(`service/leagueService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(league) }),
    delete: (id) => fetchJSON(`service/leagueService.php?id=${id}`, { method: 'DELETE' }),
    addPlayer: (leagueId, playerId) => fetchJSON('service/leagueService.php?task=member', { method: 'POST', body: JSON.stringify({ leagueId, playerId }) }),
    removePlayer: (leagueId, playerId) => fetchJSON(`service/leagueService.php?task=member&leagueId=${leagueId}&playerId=${playerId}`, { method: 'DELETE' }),
  },

  events: {
    getAll: (leagueId, params) => fetchJSON(`service/leagueService.php?task=fixture${leagueId ? `&leagueId=${leagueId}` : ''}`, { params }),
    create: (event) => fetchJSON('service/leagueService.php?task=fixture', { method: 'POST', body: JSON.stringify(event) }),
    update: (id, event) => fetchJSON(`service/leagueService.php?task=fixture&id=${id}`, { method: 'PUT', body: JSON.stringify(event) }),
    delete: (id, leagueId) => fetchJSON(`service/leagueService.php?task=fixture&id=${id}${leagueId ? `&leagueId=${leagueId}` : ''}`, { method: 'DELETE' }),
  },

  teams: {
    getAll: () => fetchJSON('service/teamService.php'),
    create: (data) => fetchJSON('service/teamService.php', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => fetchJSON(`service/teamService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => fetchJSON(`service/teamService.php?id=${id}`, { method: 'DELETE' }),
    addMember: (teamId, playerId) => fetchJSON('service/teamService.php?task=member', { method: 'POST', body: JSON.stringify({ teamId, playerId }) }),
    removeMember: (teamId, playerId) => fetchJSON(`service/teamService.php?task=member&teamId=${teamId}&playerId=${playerId}`, { method: 'DELETE' }),
    addToLeague: (leagueId, teamId) => fetchJSON('service/teamService.php?task=league', { method: 'POST', body: JSON.stringify({ leagueId, teamId }) }),
    removeFromLeague: (leagueId, teamId) => fetchJSON(`service/teamService.php?task=league&leagueId=${leagueId}&teamId=${teamId}`, { method: 'DELETE' }),
  },

  locations: {
    getAll: (params) => fetchJSON('service/locationService.php', { params }),
    create: (loc) => fetchJSON('service/locationService.php', { method: 'POST', body: JSON.stringify(loc) }),
    update: (id, loc) => fetchJSON(`service/locationService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(loc) }),
    delete: (id) => fetchJSON(`service/locationService.php?id=${id}`, { method: 'DELETE' }),
    getMachines: (locationId, params) => fetchJSON(`service/locationService.php?task=units${locationId ? `&locationId=${locationId}` : ''}`, { params }),
    addMachine: (locationId, machineId, extra = {}) => 
      fetchJSON('service/locationService.php?task=units', { method: 'POST', body: JSON.stringify({ locationId, machineId, ...extra }) }),
    removeMachine: (locationId, machineId) => fetchJSON(`service/locationService.php?task=units&locationId=${locationId}&machineId=${machineId}`, { method: 'DELETE' }),
  },

  system: {
    runCleanup: (days) => fetchJSON('service/cleanupService.php' + (days ? `?days=${days}` : '')),
  }
};