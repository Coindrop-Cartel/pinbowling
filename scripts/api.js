/**
 * API Client and State Management
 */
const CURRENT_PLAYER_KEY = "pinbowling-current-player-id";
const API_SECRET = window.PB_API_SECRET || "";
const ADMIN_PASSWORD = window.PB_ADMIN_PASSWORD || "";

function getCurrentPlayerId() {
  return localStorage.getItem(CURRENT_PLAYER_KEY);
}

function setCurrentPlayerId(playerId) {
  if (playerId) {
    localStorage.setItem(CURRENT_PLAYER_KEY, playerId);
  } else {
    localStorage.removeItem(CURRENT_PLAYER_KEY);
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
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
}

const PB_API = {
  getMachines: () => fetchJSON('api/machines.php'),
  getPlayers: () => fetchJSON('api/players.php'),
  getScores: (playerId) => playerId ? fetchJSON(`api/scores.php?playerId=${playerId}`) : [],
  saveScore: (score) => fetchJSON('api/scores.php', { method: 'POST', body: JSON.stringify(score) }),
  deletePlayer: (id) => fetchJSON(`api/players.php?id=${id}`, { method: 'DELETE' }),
  createMachine: (machine) => fetchJSON('api/machines.php', { method: 'POST', body: JSON.stringify(machine) }),
  updateMachine: (id, machine) => fetchJSON(`api/machines.php?id=${id}`, { method: 'PUT', body: JSON.stringify(machine) }),
  deleteMachine: (id) => fetchJSON(`api/machines.php?id=${id}`, { method: 'DELETE' }),
  createPlayer: (player_name) => fetchJSON('api/players.php', { method: 'POST', body: JSON.stringify({ player_name }) }),
  clearScores: (playerId) => fetchJSON(`api/scores.php?playerId=${playerId}`, { method: 'DELETE' })
};