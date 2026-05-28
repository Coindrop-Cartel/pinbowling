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
  // Construct a reliable absolute path for the API call
  const fullUrl = url.startsWith('http') ? url : `${APP_BASE}/${url}`;
  
  try {
    const response = await fetch(fullUrl, {
      headers: { 
        'Content-Type': 'application/json',
        'X-PB-SECRET': API_SECRET 
      },
      ...options,
    });
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
  getMachines: () => fetchJSON('api/machines.php'),
  getPlayers: () => fetchJSON('api/players.php'),
  getScores: (playerId, eventId, leagueId) => {
    if (!eventId && !leagueId) return [];
    let url = 'api/scores.php?';
    if (leagueId) url += `leagueId=${leagueId}`;
    else url += `eventId=${eventId}${playerId ? `&playerId=${playerId}` : ''}`;
    return fetchJSON(url);
  },
  saveScore: (score) => fetchJSON('api/scores.php', { method: 'POST', body: JSON.stringify(score) }), // score object should contain eventId
  deletePlayer: (id) => fetchJSON(`api/players.php?id=${id}`, { method: 'DELETE' }),
  createMachine: (machineName) => fetchJSON('api/machines.php', { method: 'POST', body: JSON.stringify({ machine_name: machineName }) }), // Create master machine
  updatePlayer: (id, player) => fetchJSON(`api/players.php?id=${id}`, { method: 'PUT', body: JSON.stringify(player) }),
  updateMachine: (id, machineName) => fetchJSON(`api/machines.php?id=${id}`, { method: 'PUT', body: JSON.stringify({ machine_name: machineName }) }), // Update master machine
  deleteMachine: (id) => fetchJSON(`api/machines.php?id=${id}`, { method: 'DELETE' }),
  createPlayer: (player) => fetchJSON('api/players.php', { method: 'POST', body: JSON.stringify(player) }),
  clearScores: (playerId) => fetchJSON(`api/scores.php?playerId=${playerId}`, { method: 'DELETE' }),

  // League and Event management
  getLeagues: () => fetchJSON('api/leagues.php'),
  getLeague: (id) => fetchJSON(`api/leagues.php?id=${id}`),
  createLeague: (league) => fetchJSON('api/leagues.php', { method: 'POST', body: JSON.stringify(league) }),
  updateLeague: (id, league) => fetchJSON(`api/leagues.php?id=${id}`, { method: 'PUT', body: JSON.stringify(league) }),
  deleteLeague: (id) => fetchJSON(`api/leagues.php?id=${id}`, { method: 'DELETE' }),
  getEvents: (leagueId) => fetchJSON(`api/leagues.php?action=event${leagueId ? `&leagueId=${leagueId}` : ''}`),
  createEvent: (event) => fetchJSON('api/leagues.php?action=event', { method: 'POST', body: JSON.stringify(event) }),
  updateEvent: (id, event) => fetchJSON(`api/leagues.php?action=event&id=${id}`, { method: 'PUT', body: JSON.stringify(event) }),
  deleteEvent: (id) => fetchJSON(`api/leagues.php?action=event&id=${id}`, { method: 'DELETE' }),
  addLeaguePlayer: (leagueId, playerId) => fetchJSON('api/leagues.php?action=player', { method: 'POST', body: JSON.stringify({ league_id: leagueId, player_id: playerId }) }),
  removeLeaguePlayer: (leagueId, playerId) => fetchJSON(`api/leagues.php?action=player&leagueId=${leagueId}&playerId=${playerId}`, { method: 'DELETE' }),

  // Locations and Target Scores
  getLocations: () => fetchJSON('api/locations.php'),
  createLocation: (loc) => fetchJSON('api/locations.php', { method: 'POST', body: JSON.stringify(loc) }),
  updateLocation: (id, loc) => fetchJSON(`api/locations.php?id=${id}`, { method: 'PUT', body: JSON.stringify(loc) }),
  deleteLocation: (id) => fetchJSON(`api/locations.php?id=${id}`, { method: 'DELETE' }),
  getLocationMachines: (locationId) => fetchJSON(`api/locations.php?action=machines${locationId ? `&locationId=${locationId}` : ''}`),
  addLocationMachine: (locationId, machineId, values = {}) => 
    fetchJSON('api/locations.php?action=machines', { method: 'POST', body: JSON.stringify({ location_id: locationId, machine_id: machineId, values }) }),
  getTargetScores: (eventId, leagueId) => 
    fetchJSON(`api/machines.php?${leagueId ? `leagueId=${leagueId}` : `eventId=${eventId}`}`),
  saveTargetScore: (target) => fetchJSON('api/machines.php?action=target', { method: 'POST', body: JSON.stringify(target) }),
  deleteTargetScore: (id) => fetchJSON(`api/machines.php?id=${id}&action=target`, { method: 'DELETE' })
};