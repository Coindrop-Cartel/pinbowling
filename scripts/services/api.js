/**
 * API Client and State Management
 */

const API_SECRET = window.PB_API_SECRET || "";

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

  if (window.PB_DEBUG_MODE) console.log(`[API] Constructing ${method} request to: ${url}`, { params: options.params, finalUrl });

  const urlObj = new URL(finalUrl.startsWith('http') ? finalUrl : `http://localhost/${finalUrl}`);
  const leagueId = urlObj.searchParams.get('leagueId') || (options.body ? JSON.parse(options.body).leagueId : null);

  // Tunnel DELETE and PUT via POST to bypass potential server-level method blocking.
  // This ensures the project setup is synchronized and robust across different hosts.
  const headers = { ...options.headers };

  if (method === 'DELETE' || method === 'PUT') {
    headers['X-HTTP-Method-Override'] = method;
    method = 'POST';
  }

  const finalHeaders = {
    'Content-Type': 'application/json',
    'X-PB-SECRET': API_SECRET,
    ...headers
  };

  // Construct a robust absolute URL including origin to prevent NetworkErrors
  // in specific browser environments (like Firefox on private IPs).
  // We trim leading slashes from finalUrl to ensure clean joining with APP_BASE
  const sanitizedPath = finalUrl.startsWith('http') ? finalUrl : finalUrl.replace(/^\//, '');
  const fullUrl = sanitizedPath.startsWith('http') ? sanitizedPath : `${window.location.origin}${APP_BASE}/${sanitizedPath}`;
  
  if (window.PB_DEBUG_MODE) console.log(`[API] Final Request URL: ${fullUrl}`);
  
  // Prepare fetch options, ensuring a body is sent for POST requests (even if tunneled)
  // to prevent server-side resets for bodyless POSTs.
  const fetchOptions = { 
    ...options,
    method,
    headers: finalHeaders
  };

  // CRITICAL: The fetch spec prohibits 'body' on GET/HEAD requests.
  // We must only attach the body if the method is intended to carry one.
  if (method === 'POST') {
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

export const PB_API = {
  // Auth
  login: (username, password) => fetchJSON('service/authService.php?task=login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => fetchJSON('service/authService.php?task=logout', { method: 'POST' }),
  register: (data) => fetchJSON('service/authService.php?task=register', { method: 'POST', body: JSON.stringify(data) }),
  getCurrentUser: () => fetchJSON('service/authService.php?task=me'),

  getMachines: (params) => fetchJSON('service/machineService.php', { params }),
  getPlayers: (params) => fetchJSON('service/playerService.php', { params }),
  getScores: (playerId, eventId, leagueId) => {
    if (!eventId && !leagueId) return [];
    let url = 'service/scoreService.php?';
    if (leagueId) url += `leagueId=${leagueId}`;
    else url += `eventId=${eventId}${playerId ? `&playerId=${playerId}` : ''}`;
    return fetchJSON(url);
  },
  saveScore: (score) => fetchJSON('service/scoreService.php', { method: 'POST', body: JSON.stringify(score) }), // score object should contain eventId
  deletePlayer: (id) => fetchJSON(`service/playerService.php?id=${id}`, { method: 'DELETE' }),
  createMachine: (machine) => fetchJSON('service/machineService.php', { method: 'POST', body: JSON.stringify(machine) }), // Create master machine
  updatePlayer: (id, player) => fetchJSON(`service/playerService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(player) }),
  updateUserPassword: (userId, password) => fetchJSON(`service/authService.php?task=reset&id=${userId}`, { method: 'POST', body: JSON.stringify({ password }) }),
  updateUserRole: (userId, role) => fetchJSON(`service/playerService.php?task=role&id=${userId}`, { method: 'PUT', body: JSON.stringify({ role }) }),
  updateMachine: (id, machine) => fetchJSON(`service/machineService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(machine) }), // Update master machine
  deleteMachine: (id) => fetchJSON(`service/machineService.php?id=${id}`, { method: 'DELETE' }),
  createPlayer: (player) => fetchJSON('service/playerService.php', { method: 'POST', body: JSON.stringify(player) }),
  clearScores: (playerId) => fetchJSON(`service/scoreService.php?playerId=${playerId}`, { method: 'DELETE' }),

  // League and Event management
  getLeagues: (params) => fetchJSON('service/leagueService.php', { params }),
  getLeague: (id) => fetchJSON(`service/leagueService.php?id=${id}`),
  createLeague: (league) => fetchJSON('service/leagueService.php', { method: 'POST', body: JSON.stringify(league) }),
  updateLeague: (id, league) => fetchJSON(`service/leagueService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(league) }),
  deleteLeague: (id) => fetchJSON(`service/leagueService.php?id=${id}`, { method: 'DELETE' }),
  getEvents: (leagueId, params) => fetchJSON(`service/leagueService.php?task=fixture${leagueId ? `&leagueId=${leagueId}` : ''}`, { params }),
  createEvent: (event) => fetchJSON('service/leagueService.php?task=fixture', { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id, event) => fetchJSON(`service/leagueService.php?task=fixture&id=${id}`, { method: 'PUT', body: JSON.stringify(event) }),
  deleteEvent: (id, leagueId) => fetchJSON(`service/leagueService.php?task=fixture&id=${id}${leagueId ? `&leagueId=${leagueId}` : ''}`, { method: 'DELETE' }),
  addLeaguePlayer: (leagueId, playerId) => fetchJSON('service/leagueService.php?task=member', { method: 'POST', body: JSON.stringify({ leagueId, playerId }) }),
  removeLeaguePlayer: (leagueId, playerId) => fetchJSON(`service/leagueService.php?task=member&leagueId=${leagueId}&playerId=${playerId}`, { method: 'DELETE' }),

  // Locations and Target Scores
  getLocations: (params) => fetchJSON('service/locationService.php', { params }),
  createLocation: (loc) => fetchJSON('service/locationService.php', { method: 'POST', body: JSON.stringify(loc) }),
  updateLocation: (id, loc) => fetchJSON(`service/locationService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(loc) }),
  deleteLocation: (id) => fetchJSON(`service/locationService.php?id=${id}`, { method: 'DELETE' }),
  getLocationMachines: (locationId, params) => fetchJSON(`service/locationService.php?task=units${locationId ? `&locationId=${locationId}` : ''}`, { params }),
  addLocationMachine: (locationId, machineId, extra = {}) => 
    fetchJSON('service/locationService.php?task=units', { method: 'POST', body: JSON.stringify({ locationId, machineId, ...extra }) }),
  removeLocationMachine: (locationId, machineId) => fetchJSON(`service/locationService.php?task=units&locationId=${locationId}&machineId=${machineId}`, { method: 'DELETE' }),
  getTargetScores: (eventId, leagueId, params) => 
    fetchJSON(`service/machineService.php?${leagueId ? `leagueId=${leagueId}` : `eventId=${eventId}`}`, { params }),
  bulkUpdateTargetOrder: (updates) => fetchJSON('service/machineService.php?task=sort', { method: 'POST', body: JSON.stringify(updates) }),
  runCleanup: () => fetchJSON('service/cleanupService.php'),
  saveTargetScore: (target) => {
    const url = `service/machineService.php?task=threshold`;
    return fetchJSON(url, { method: 'POST', body: JSON.stringify(target) });
  },
  deleteTargetScore: (id) => fetchJSON(`service/machineService.php?id=${id}&task=threshold`, { method: 'DELETE' })
};