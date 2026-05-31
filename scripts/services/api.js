/**
 * API Client and State Management
 */
import { getLeaguePassword } from './state.js';

const API_SECRET = window.PB_API_SECRET || "";
export const ADMIN_PASSWORD = window.PB_ADMIN_PASSWORD || "";

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
  const urlObj = new URL(url.startsWith('http') ? url : `http://localhost/${url}`);
  const leagueId = urlObj.searchParams.get('leagueId') || (options.body ? JSON.parse(options.body).leagueId : null);
  const leaguePass = leagueId ? getLeaguePassword(leagueId) : null;

  // Tunnel DELETE and PUT via POST to bypass potential server-level method blocking.
  // This ensures the project setup is synchronized and robust across different hosts.
  let method = options.method || 'GET';
  const headers = { ...options.headers };

  if (method === 'DELETE' || method === 'PUT') {
    headers['X-HTTP-Method-Override'] = method;
    method = 'POST';
  }

  const finalHeaders = {
    'Content-Type': 'application/json',
    'X-PB-SECRET': API_SECRET,
    ...(leaguePass && { 'X-LEAGUE-PASSWORD': leaguePass }),
    ...headers
  };

  // Construct a robust absolute URL including origin to prevent NetworkErrors
  // in specific browser environments (like Firefox on private IPs).
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${APP_BASE}/${url}`;
  
  // Prepare fetch options, ensuring a body is sent for POST requests (even if tunneled)
  // to prevent server-side resets for bodyless POSTs.
  const fetchOptions = {
    ...options,
    method,
    headers: finalHeaders,
    body: options.body || (method === 'POST' ? JSON.stringify({}) : undefined)
  };

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
  getMachines: () => fetchJSON('service/machineService.php'),
  getPlayers: () => fetchJSON('service/playerService.php'),
  getScores: (playerId, eventId, leagueId) => {
    if (!eventId && !leagueId) return [];
    let url = 'service/scoreService.php?';
    if (leagueId) url += `leagueId=${leagueId}`;
    else url += `eventId=${eventId}${playerId ? `&playerId=${playerId}` : ''}`;
    return fetchJSON(url);
  },
  saveScore: (score) => fetchJSON('service/scoreService.php', { method: 'POST', body: JSON.stringify(score) }), // score object should contain eventId
  deletePlayer: (id) => fetchJSON(`service/playerService.php?id=${id}`, { method: 'DELETE' }),
  createMachine: (machineName) => fetchJSON('service/machineService.php', { method: 'POST', body: JSON.stringify({ machineName }) }), // Create master machine
  updatePlayer: (id, player) => fetchJSON(`service/playerService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(player) }),
  updateMachine: (id, machineName) => fetchJSON(`service/machineService.php?id=${id}`, { method: 'PUT', body: JSON.stringify({ machineName }) }), // Update master machine
  deleteMachine: (id) => fetchJSON(`service/machineService.php?id=${id}`, { method: 'DELETE' }),
  createPlayer: (player) => fetchJSON('service/playerService.php', { method: 'POST', body: JSON.stringify(player) }),
  clearScores: (playerId) => fetchJSON(`service/scoreService.php?playerId=${playerId}`, { method: 'DELETE' }),

  // League and Event management
  getLeagues: () => fetchJSON('service/leagueService.php'),
  getLeague: (id) => fetchJSON(`service/leagueService.php?id=${id}`),
  createLeague: (league) => fetchJSON('service/leagueService.php', { method: 'POST', body: JSON.stringify(league) }),
  updateLeague: (id, league) => fetchJSON(`service/leagueService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(league) }),
  deleteLeague: (id) => fetchJSON(`service/leagueService.php?id=${id}`, { method: 'DELETE' }),
  getEvents: (leagueId) => fetchJSON(`service/leagueService.php?task=fixture${leagueId ? `&leagueId=${leagueId}` : ''}`),
  createEvent: (event) => fetchJSON('service/leagueService.php?task=fixture', { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id, event) => fetchJSON(`service/leagueService.php?task=fixture&id=${id}`, { method: 'PUT', body: JSON.stringify(event) }),
  deleteEvent: (id, leagueId) => fetchJSON(`service/leagueService.php?task=fixture&id=${id}${leagueId ? `&leagueId=${leagueId}` : ''}`, { method: 'DELETE' }),
  addLeaguePlayer: (leagueId, playerId) => fetchJSON('service/leagueService.php?task=member', { method: 'POST', body: JSON.stringify({ leagueId, playerId }) }),
  removeLeaguePlayer: (leagueId, playerId) => fetchJSON(`service/leagueService.php?task=member&leagueId=${leagueId}&playerId=${playerId}`, { method: 'DELETE' }),

  // Locations and Target Scores
  getLocations: () => fetchJSON('service/locationService.php'),
  createLocation: (loc) => fetchJSON('service/locationService.php', { method: 'POST', body: JSON.stringify(loc) }),
  updateLocation: (id, loc) => fetchJSON(`service/locationService.php?id=${id}`, { method: 'PUT', body: JSON.stringify(loc) }),
  deleteLocation: (id) => fetchJSON(`service/locationService.php?id=${id}`, { method: 'DELETE' }),
  getLocationMachines: (locationId) => fetchJSON(`service/locationService.php?task=units${locationId ? `&locationId=${locationId}` : ''}`),
  addLocationMachine: (locationId, machineId, extra = {}) => 
    fetchJSON('service/locationService.php?task=units', { method: 'POST', body: JSON.stringify({ locationId, machineId, ...extra }) }),
  removeLocationMachine: (locationId, machineId) => fetchJSON(`service/locationService.php?task=units&locationId=${locationId}&machineId=${machineId}`, { method: 'DELETE' }),
  getTargetScores: (eventId, leagueId) => 
    fetchJSON(`service/machineService.php?${leagueId ? `leagueId=${leagueId}` : `eventId=${eventId}`}`),
  bulkUpdateTargetOrder: (updates) => fetchJSON('service/machineService.php?task=sort', { method: 'POST', body: JSON.stringify(updates) }),
  saveTargetScore: (target) => {
    const url = `service/machineService.php?task=threshold`;
    return fetchJSON(url, { method: 'POST', body: JSON.stringify(target) });
  },
  deleteTargetScore: (id) => fetchJSON(`service/machineService.php?id=${id}&task=threshold`, { method: 'DELETE' })
};