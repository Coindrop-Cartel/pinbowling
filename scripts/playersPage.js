import { PB_API, ADMIN_PASSWORD } from './api.js';

/**
 * Initializes the Player Management page.
 */
export async function initPlayersPage() {
  const playerSelect = document.getElementById('player-select');
  const addPlayerButton = document.getElementById('add-player-button');
  const deletePlayerButton = document.getElementById('delete-player-button');
  const newPlayerName = document.getElementById('new-player-name');
  const playerList = document.getElementById('player-list');

  async function refresh() {
    const players = await PB_API.getPlayers();
    
    // Update delete dropdown
    playerSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = players.length === 0 ? 'No players registered' : 'Select player to delete';
    playerSelect.appendChild(placeholder);

    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.player_name;
      playerSelect.appendChild(opt);
    });

    // Update alphabetical list
    playerList.innerHTML = '';
    if (players.length === 0) {
      playerList.innerHTML = '<li>No players registered yet.</li>';
    } else {
      players.forEach(p => {
        const li = document.createElement('li');
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid #000';
        li.textContent = p.player_name;
        playerList.appendChild(li);
      });
      if (playerList.lastElementChild) playerList.lastElementChild.style.borderBottom = 'none';
    }
    
    deletePlayerButton.disabled = players.length === 0;
  }

  addPlayerButton.addEventListener('click', async () => {
    const name = newPlayerName.value.trim();
    if (!name) return;
    await PB_API.createPlayer(name);
    newPlayerName.value = '';
    await refresh();
  });

  deletePlayerButton.addEventListener('click', async () => {
    const selectedId = playerSelect.value;
    if (!selectedId) {
      alert('Select a player to delete.');
      return;
    }
    const players = await PB_API.getPlayers();
    const player = players.find(p => String(p.id) === selectedId);
    if (!player) return;
    
    const confirmation = prompt(`Enter Admin Password to confirm deletion of ${player.player_name}:`);
    if (confirmation !== ADMIN_PASSWORD) {
      if (confirmation !== null) alert('Incorrect Admin Password.');
      return;
    }

    await PB_API.deletePlayer(selectedId);
    await refresh();
  });

  await refresh();
}