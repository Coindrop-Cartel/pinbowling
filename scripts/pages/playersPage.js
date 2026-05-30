import { PB_API } from '@services/api.js';
import { setupLiveFilter, showConfirm, showPrompt } from '@ui/uiComponents.js';
import { requireAdmin } from '@services/auth.js';

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
  const playerList = document.getElementById('player-list');

  let allPlayers = []; // Cache players for editing
  let filterInstance = null;

  const onFilterUpdate = (filtered, query) => {
    // Update alphabetical list
    playerList.innerHTML = '';
    if (filtered.length === 0) {
      playerList.innerHTML = `<li>${allPlayers.length === 0 ? 'No players registered yet.' : 'No matching players found.'}</li>`;
    } else {
      filtered.forEach(p => {
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
          <div style="display: flex; gap: 8px;">
            <button type="button" class="edit-player-btn secondary" data-player-id="${p.id}">Edit</button>
            <button type="button" class="delete-player-btn-inline" data-player-id="${p.id}">Delete</button>
          </div>
        `;
        playerList.appendChild(li);
      });
      if (playerList.lastElementChild) playerList.lastElementChild.style.borderBottom = 'none';

      // Attach row action listeners
      playerList.querySelectorAll('.edit-player-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editPlayer(Number(e.target.dataset.playerId)));
      });
      playerList.querySelectorAll('.delete-player-btn-inline').forEach(btn => {
        btn.addEventListener('click', (e) => deletePlayer(Number(e.target.dataset.playerId)));
      });
    }

    // Logic to prevent duplicate player names
    const exactMatch = allPlayers.find(p => p.player_name.trim().toLowerCase() === query);
    const isEditingThisPlayer = exactMatch && String(exactMatch.id) === String(editingPlayerIdInput.value);
    
    savePlayerButton.disabled = !query || (!!exactMatch && !isEditingThisPlayer);
    savePlayerButton.title = (exactMatch && !isEditingThisPlayer) ? "This player name already exists." : "";
  };

  filterInstance = setupLiveFilter(playerNameInput, allPlayers, {
    labelKey: 'player_name',
    onFilter: onFilterUpdate
  });

  async function refresh() {
    const data = await PB_API.getPlayers();
    // Update array in-place to keep the filter reference valid
    allPlayers.length = 0;
    allPlayers.push(...data);
    filterInstance.performFilter();
    resetForm();
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
    if (playerFormTitle) playerFormTitle.textContent = 'Add New Player';
    savePlayerButton.textContent = 'Save Player';
    cancelEditButton.classList.add('hidden');
    if (filterInstance) filterInstance.performFilter();
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
    if (playerFormTitle) playerFormTitle.textContent = `Edit Player: ${player.player_name}`;
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

    if (!name || !await requireAdmin(`Enter Admin Password to ${id ? 'update' : 'create'} player "${name}":`)) {
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

  async function deletePlayer(playerId) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    if (!await showConfirm(`Are you sure you want to delete player "${player.player_name}"? This action cannot be undone and will remove all their associated scores.`, 'Delete Player')) {
      return;
    }

    if (!await requireAdmin(`Enter Admin Password to confirm deletion of ${player.player_name}:`)) {
      return;
    }

    try {
      await PB_API.deletePlayer(playerId);
      await refresh();
    } catch (error) {
      alert(`Error deleting player: ${error.message}`);
    }
  }

  cancelEditButton.addEventListener('click', cancelEdit);

  await refresh();
}