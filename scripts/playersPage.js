import { PB_API, ADMIN_PASSWORD } from './api.js';

/**
 * Initializes the Player Management page.
 */
export async function initPlayersPage() {
  const playerFormTitle = document.getElementById('player-form-title');
  const playerForm = document.getElementById('player-form');
  const editingPlayerIdInput = document.getElementById('editing-player-id');
  const playerNameInput = document.getElementById('player-name');
  const ifpaIdInput = document.getElementById('ifpa-id');
  const matchplayIdInput = document.getElementById('matchplay-id');
  const savePlayerButton = document.getElementById('save-player-button');
  const cancelEditButton = document.getElementById('cancel-edit-button');

  const playerSelect = document.getElementById('player-select');
  const deletePlayerButton = document.getElementById('delete-player-button');
  const playerList = document.getElementById('player-list');

  let allPlayers = []; // Cache players for editing

  async function refresh() {
    allPlayers = await PB_API.getPlayers();
    
    // Update delete dropdown
    playerSelect.innerHTML = '';
    playerSelect.appendChild(Object.assign(document.createElement('option'), {
      value: '',
      textContent: allPlayers.length === 0 ? 'No players registered' : 'Select player to delete'
    }));

    allPlayers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.player_name;
      playerSelect.appendChild(opt);
    });

    // Update alphabetical list
    playerList.innerHTML = '';
    if (allPlayers.length === 0) {
      playerList.innerHTML = '<li>No players registered yet.</li>';
    } else {
      allPlayers.forEach(p => {
        const li = document.createElement('li');
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid #000';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.innerHTML = `
          <span>
            ${p.player_name} 
            ${p.ifpa_id ? `<small>(IFPA: ${p.ifpa_id})</small>` : ''}
            ${p.matchplay_id ? `<small>(Matchplay: ${p.matchplay_id})</small>` : ''}
          </span>
          <button type="button" class="edit-player-btn secondary" data-player-id="${p.id}">Edit</button>
        `;
        playerList.appendChild(li);
      });
      if (playerList.lastElementChild) playerList.lastElementChild.style.borderBottom = 'none';

      // Attach edit listeners
      playerList.querySelectorAll('.edit-player-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editPlayer(Number(e.target.dataset.playerId)));
      });
    }
    
    deletePlayerButton.disabled = allPlayers.length === 0;
    resetForm(); // Ensure form is reset after refresh
  }

  /**
   * Resets the form state to 'Add' mode.
   * Clears hidden IDs and restores original labels.
   */
  function resetForm() {
    editingPlayerIdInput.value = '';
    playerNameInput.value = '';
    ifpaIdInput.value = '';
    matchplayIdInput.value = '';
    playerFormTitle.textContent = 'Add New Player';
    savePlayerButton.textContent = 'Save Player';
    cancelEditButton.classList.add('hidden');
  }

  /**
   * populates the form with existing player data to enter 'Edit' mode.
   * @param {number} playerId 
   */
  async function editPlayer(playerId) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;

    editingPlayerIdInput.value = player.id;
    playerNameInput.value = player.player_name;
    ifpaIdInput.value = player.ifpa_id || '';
    matchplayIdInput.value = player.matchplay_id || '';
    playerFormTitle.textContent = `Edit Player: ${player.player_name}`;
    savePlayerButton.textContent = 'Update Player';
    cancelEditButton.classList.remove('hidden');
    window.scrollTo(0, 0); // Scroll to the form
  }

  function cancelEdit() {
    resetForm();
  }

  playerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editingPlayerIdInput.value ? Number(editingPlayerIdInput.value) : null;
    const name = playerNameInput.value.trim();
    const ifpaId = ifpaIdInput.value.trim() || null;
    const matchplayId = matchplayIdInput.value.trim() || null;

    if (!name) return;

    const confirmation = prompt(`Enter Admin Password to ${id ? 'update' : 'create'} player "${name}":`);
    if (confirmation === null) { // User cancelled
      alert('Admin action cancelled.');
      return;
    } else if (confirmation !== ADMIN_PASSWORD) { // Incorrect password
      alert('Incorrect Admin Password.');
      return;
    }

    const payload = { player_name: name, ifpa_id: ifpaId, matchplay_id: matchplayId };

    try {
      if (id) {
        await PB_API.updatePlayer(id, payload);
      } else {
        await PB_API.createPlayer(payload);
      }
      await refresh();
      resetForm();
    } catch (error) {
      alert(`Error saving player: ${error.message}`);
    }
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
    
    const confirmation = prompt(`Enter Admin Password to confirm deletion of ${player.player_name} (and all their scores):`);
    if (confirmation === null) { // User cancelled
      alert('Admin action cancelled.');
      return;
    } else if (confirmation !== ADMIN_PASSWORD) { // Incorrect password
      alert('Incorrect Admin Password.');
      return;
    }

    try {
      await PB_API.deletePlayer(selectedId);
      await refresh();
    } catch (error) {
      alert(`Error deleting player: ${error.message}`);
    }
  });

  cancelEditButton.addEventListener('click', cancelEdit);

  await refresh();
}