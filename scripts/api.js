/**
 * API Client and State Management
 */
const CURRENT_PLAYER_KEY = "pinbowling-current-player-id";
const API_SECRET = window.PB_API_SECRET || "";
export const ADMIN_PASSWORD = window.PB_ADMIN_PASSWORD || "";

export function getCurrentPlayerId() {
  return localStorage.getItem(CURRENT_PLAYER_KEY);
}

export function setCurrentPlayerId(playerId) {
  if (playerId) {
    localStorage.setItem(CURRENT_PLAYER_KEY, playerId);
  } else {
    localStorage.removeItem(CURRENT_PLAYER_KEY);
  }
}

// Calculate the base application path once to ensure relative API calls resolve correctly
// regardless of clean URL routing (e.g., /leagues vs /leagues.php)
// This prevents 404 errors when navigating sub-directories or using .htaccess rewrites.
const APP_BASE = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/')) || '';

/**
 * Wrapper for the Fetch API that automatically includes security headers 
 * and handles standardized JSON error responses.
 */
export async function fetchJSON(url, options = {}) {
  const finalHeaders = {
    'Content-Type': 'application/json',
    'X-PB-SECRET': API_SECRET,
    ...options.headers
  };

  // Construct a reliable absolute path for the API call
  const fullUrl = url.startsWith('http') ? url : `${APP_BASE}/${url}`;
  
  try {
    const response = await fetch(fullUrl, { ...options, headers: finalHeaders });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || response.statusText);
    }
    return response.json();
  } catch (err) {
    console.error(`fetchJSON Network Error [${fullUrl}]:`, err);
    throw err;
  }
}

export const PB_API = {
  getMachines: () => fetchJSON('api/machines'),
  getPlayers: () => fetchJSON('api/players'),
  getScores: (playerId, eventId, leagueId) => {
    if (!eventId && !leagueId) return [];
    let url = 'api/scores?';
    if (leagueId) url += `leagueId=${leagueId}`;
    else url += `eventId=${eventId}${playerId ? `&playerId=${playerId}` : ''}`;
    return fetchJSON(url);
  },
  saveScore: (score) => fetchJSON('api/scores', { method: 'POST', body: JSON.stringify(score) }), // score object should contain eventId
  deletePlayer: (id) => fetchJSON(`api/players?id=${id}`, { method: 'DELETE' }),
  createMachine: (machineName) => fetchJSON('api/machines', { method: 'POST', body: JSON.stringify({ machine_name: machineName }) }), // Create master machine
  updatePlayer: (id, player) => fetchJSON(`api/players?id=${id}`, { method: 'PUT', body: JSON.stringify(player) }),
  updateMachine: (id, machineName) => fetchJSON(`api/machines?id=${id}`, { method: 'PUT', body: JSON.stringify({ machine_name: machineName }) }), // Update master machine
  deleteMachine: (id) => fetchJSON(`api/machines?id=${id}`, { method: 'DELETE' }),
  createPlayer: (player) => fetchJSON('api/players', { method: 'POST', body: JSON.stringify(player) }),
  clearScores: (playerId) => fetchJSON(`api/scores?playerId=${playerId}`, { method: 'DELETE' }),

  // League and Event management
  getLeagues: () => fetchJSON('api/leagues'),
  getLeague: (id) => fetchJSON(`api/leagues?id=${id}`),
  createLeague: (league) => fetchJSON('api/leagues', { method: 'POST', body: JSON.stringify(league) }),
  updateLeague: (id, league) => fetchJSON(`api/leagues?id=${id}`, { method: 'PUT', body: JSON.stringify(league) }),
  deleteLeague: (id) => fetchJSON(`api/leagues?id=${id}`, { method: 'DELETE' }),
  getEvents: (leagueId) => fetchJSON(`api/leagues?action=event${leagueId ? `&leagueId=${leagueId}` : ''}`),
  createEvent: (event) => fetchJSON('api/leagues?action=event', { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id, event) => fetchJSON(`api/leagues?action=event&id=${id}`, { method: 'PUT', body: JSON.stringify(event) }),
  deleteEvent: (id) => fetchJSON(`api/leagues?action=event&id=${id}`, { method: 'DELETE' }),
  addLeaguePlayer: (leagueId, playerId) => fetchJSON('api/leagues?action=player', { method: 'POST', body: JSON.stringify({ league_id: leagueId, player_id: playerId }) }),
  removeLeaguePlayer: (leagueId, playerId) => fetchJSON(`api/leagues?action=player&leagueId=${leagueId}&playerId=${playerId}`, { method: 'DELETE' }),

  // Locations and Target Scores
  getLocations: () => fetchJSON('api/locations'),
  createLocation: (loc) => fetchJSON('api/locations', { method: 'POST', body: JSON.stringify(loc) }),
  updateLocation: (id, loc) => fetchJSON(`api/locations?id=${id}`, { method: 'PUT', body: JSON.stringify(loc) }),
  deleteLocation: (id) => fetchJSON(`api/locations?id=${id}`, { method: 'DELETE' }),
  getLocationMachines: (locationId) => fetchJSON(`api/locations?action=machines${locationId ? `&locationId=${locationId}` : ''}`),
  addLocationMachine: (locationId, machineId, extra = {}) => 
    fetchJSON('api/locations?action=machines', { method: 'POST', body: JSON.stringify({ location_id: locationId, machine_id: machineId, ...extra }) }),
  removeLocationMachine: (locationId, machineId) => fetchJSON(`api/locations?action=machines&locationId=${locationId}&machineId=${machineId}`, { method: 'DELETE' }),
  getTargetScores: (eventId, leagueId) => 
    fetchJSON(`api/machines?${leagueId ? `leagueId=${leagueId}` : `eventId=${eventId}`}`),
  bulkUpdateTargetOrder: (updates) => fetchJSON('api/machines?action=reorder', { method: 'POST', body: JSON.stringify(updates) }),
  saveTargetScore: (target) => {
    const url = `api/machines?action=target`;
    return fetchJSON(url, { method: 'POST', body: JSON.stringify(target) });
  },
  deleteTargetScore: (id) => fetchJSON(`api/machines?id=${id}&action=target`, { method: 'DELETE' })
};