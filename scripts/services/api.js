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

/**
 * API client object providing typed methods for all backend service endpoints.
 * Each method delegates to `fetchJSON` with the appropriate URL, HTTP method, and body.
 *
 * @namespace PB_API
 * @property {Function} login - Authenticate a user. Params: (username, password).
 * @property {Function} logout - End the current session.
 * @property {Function} register - Register a new user. Params: (data).
 * @property {Function} getCurrentUser - Fetch the currently authenticated user profile.
 * @property {Function} getMachines - Fetch machines. Params: (params).
 * @property {Function} getPlayers - Fetch players. Params: (params).
 * @property {Function} getScores - Fetch scores. Params: (playerId, eventId, leagueId).
 * @property {Function} saveScore - Save a score entry. Params: (score).
 * @property {Function} deletePlayer - Delete a player by ID. Params: (id).
 * @property {Function} createMachine - Create a master machine. Params: (machine).
 * @property {Function} updatePlayer - Update a player. Params: (id, player).
 * @property {Function} updateUserPassword - Reset a user's password. Params: (userId, password).
 * @property {Function} updateUserRole - Change a user's role. Params: (userId, role).
 * @property {Function} updateMachine - Update a master machine. Params: (id, machine).
 * @property {Function} deleteMachine - Delete a machine by ID. Params: (id).
 * @property {Function} createPlayer - Create a new player. Params: (player).
 * @property {Function} clearScores - Clear all scores for a player. Params: (playerId).
 * @property {Function} getLeagues - Fetch leagues. Params: (params).
 * @property {Function} getLeague - Fetch a single league. Params: (id).
 * @property {Function} createLeague - Create a league. Params: (league).
 * @property {Function} updateLeague - Update a league. Params: (id, league).
 * @property {Function} deleteLeague - Delete a league. Params: (id).
 * @property {Function} getEvents - Fetch events for a league. Params: (leagueId, params).
 * @property {Function} createEvent - Create an event. Params: (event).
 * @property {Function} updateEvent - Update an event. Params: (id, event).
 * @property {Function} deleteEvent - Delete an event. Params: (id, leagueId).
 * @property {Function} addLeaguePlayer - Add a player to a league. Params: (leagueId, playerId).
 * @property {Function} removeLeaguePlayer - Remove a player from a league. Params: (leagueId, playerId).
 * @property {Function} getTeams - Fetch all teams.
 * @property {Function} createTeam - Create a team. Params: (data).
 * @property {Function} updateTeam - Update a team. Params: (id, data).
 * @property {Function} deleteTeam - Delete a team. Params: (id).
 * @property {Function} addTeamMember - Add a member to a team. Params: (teamId, playerId).
 * @property {Function} removeTeamMember - Remove a member from a team. Params: (teamId, playerId).
 * @property {Function} addLeagueTeam - Add a team to a league. Params: (leagueId, teamId).
 * @property {Function} removeLeagueTeam - Remove a team from a league. Params: (leagueId, teamId).
 * @property {Function} getLocations - Fetch locations. Params: (params).
 * @property {Function} createLocation - Create a location. Params: (loc).
 * @property {Function} updateLocation - Update a location. Params: (id, loc).
 * @property {Function} deleteLocation - Delete a location. Params: (id).
 * @property {Function} getLocationMachines - Fetch machines at a location. Params: (locationId, params).
 * @property {Function} addLocationMachine - Add a machine to a location. Params: (locationId, machineId, extra).
 * @property {Function} removeLocationMachine - Remove a machine from a location. Params: (locationId, machineId).
 * @property {Function} getTargetScores - Fetch target scores. Params: (eventId, leagueId, params).
 * @property {Function} bulkUpdateTargetOrder - Bulk-update target sort order. Params: (updates).
 * @property {Function} runCleanup - Run the database cleanup routine.
 * @property {Function} saveTargetScore - Save a target score entry. Params: (target).
 * @property {Function} deleteTargetScore - Delete a target score. Params: (id).
 */
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

  // Teams
  getTeams: () => fetchJSON('service/teamService.php'),
  createTeam: (data) => fetchJSON('service/teamService.php', { method: 'POST', body: JSON.stringify(data) }),
  updateTeam: (id, data) => fetchJSON(`service/teamService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTeam: (id) => fetchJSON(`service/teamService.php?id=${id}`, { method: 'DELETE' }),
  addTeamMember: (teamId, playerId) => fetchJSON('service/teamService.php?task=member', { method: 'POST', body: JSON.stringify({ teamId, playerId }) }),
  removeTeamMember: (teamId, playerId) => fetchJSON(`service/teamService.php?task=member&teamId=${teamId}&playerId=${playerId}`, { method: 'DELETE' }),
  addLeagueTeam: (leagueId, teamId) => fetchJSON('service/teamService.php?task=league', { method: 'POST', body: JSON.stringify({ leagueId, teamId }) }),
  removeLeagueTeam: (leagueId, teamId) => fetchJSON(`service/teamService.php?task=league&leagueId=${leagueId}&teamId=${teamId}`, { method: 'DELETE' }),

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