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

  // Setup "Create Player" toggle
  const ifpaRow = ifpaIdInput.closest('.form-row');
  const matchplayRow = matchplayIdInput.closest('.form-row');
  const actionsRow = savePlayerButton.closest('.form-actions');

  const createToggle = document.createElement('button');
  createToggle.type = 'button';
  createToggle.className = 'secondary';
  createToggle.textContent = 'Create New Player';
  createToggle.style.marginTop = '10px';
  playerNameInput.after(createToggle);

  createToggle.onclick = () => {
    const isHidden = ifpaRow.classList.contains('hidden');
    ifpaRow.classList.toggle('hidden', !isHidden);
    matchplayRow.classList.toggle('hidden', !isHidden);
    actionsRow.classList.toggle('hidden', !isHidden);
    if (isHidden) {
      createToggle.textContent = 'Cancel';
      createToggle.style.marginTop = '0';
      actionsRow.appendChild(createToggle);
    } else {
      createToggle.textContent = 'Create New Player';
      createToggle.style.marginTop = '10px';
      playerNameInput.after(createToggle);
    }
  };

  const onFilterUpdate = (filtered, query) => {
    // Update alphabetical list
    playerList.innerHTML = '';
    if (filtered.length === 0) {
      playerList.innerHTML = `<li>${allPlayers.length === 0 ? 'No players registered yet.' : 'No matching players found.'}</li>`;
    } else {
      filtered.forEach(p => {
        const li = document.createElement('li');
        li.style.padding = '6px 12px';
        li.style.marginBottom = '5px';
        li.style.background = '#f9f9f9';
        li.style.borderRadius = '4px';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.innerHTML = `
          <span>
            ${p.playerName} 
            ${p.ifpaId ? `<small>(IFPA: ${p.ifpaId})</small>` : ''}
            ${p.matchplayId ? `<small>(Matchplay: ${p.matchplayId})</small>` : ''}
          </span>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="edit-player-btn secondary" data-player-id="${p.id}" style="padding: 4px 10px; font-size: 0.85rem;">Edit</button>
            <button type="button" class="delete-player-btn-inline" data-player-id="${p.id}" style="padding: 4px 10px; font-size: 0.85rem;">Delete</button>
          </div>
        `;
        playerList.appendChild(li);
      });
      // Attach row action listeners
      playerList.querySelectorAll('.edit-player-btn').forEach(btn => {
        btn.addEventListener('click', (e) => editPlayer(Number(e.target.dataset.playerId)));
      });
      playerList.querySelectorAll('.delete-player-btn-inline').forEach(btn => {
        btn.addEventListener('click', (e) => deletePlayer(Number(e.target.dataset.playerId)));
      });
    }

    // Logic to prevent duplicate player names
    const exactMatch = allPlayers.find(p => p.playerName.trim().toLowerCase() === query);
    const isEditingThisPlayer = exactMatch && String(exactMatch.id) === String(editingPlayerIdInput.value);
    
    // Hide the "Create" toggle if an exact match exists, unless the creation 
    // form is already open (in which case the button serves as "Cancel").
    const isFormOpen = !ifpaRow.classList.contains('hidden');
    createToggle.classList.toggle('hidden', !!exactMatch && !isFormOpen);

    savePlayerButton.disabled = !query || (!!exactMatch && !isEditingThisPlayer);
    savePlayerButton.title = (exactMatch && !isEditingThisPlayer) ? "This player name already exists." : "";
  };

  filterInstance = setupLiveFilter(playerNameInput, allPlayers, {
    labelKey: 'playerName',
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

    // Collapse creation fields
    if (ifpaRow) ifpaRow.classList.add('hidden');
    if (matchplayRow) matchplayRow.classList.add('hidden');
    if (actionsRow) actionsRow.classList.add('hidden');
    createToggle.textContent = 'Create New Player';
    createToggle.style.marginTop = '10px';
    playerNameInput.after(createToggle);

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
    playerNameInput.value = player.playerName;
    ifpaIdInput.value = player.ifpaId || '';
    matchplayIdInput.value = player.matchplayId || '';
    if (playerFormTitle) playerFormTitle.textContent = `Edit Player: ${player.playerName}`;
    savePlayerButton.textContent = 'Update Player';
    cancelEditButton.classList.remove('hidden');

    // Expand fields for editing
    if (ifpaRow) ifpaRow.classList.remove('hidden');
    if (matchplayRow) matchplayRow.classList.remove('hidden');
    if (actionsRow) actionsRow.classList.remove('hidden');
    createToggle.textContent = 'Cancel';
    createToggle.style.marginTop = '0';
    actionsRow.appendChild(createToggle);

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

    const payload = { playerName: name, ifpaId: ifpaId, matchplayId: matchplayId };

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
    
    if (!await showConfirm(`Are you sure you want to delete player "${player.playerName}"? This action cannot be undone and will remove all their associated scores.`, 'Delete Player')) {
      return;
    }

    if (!await requireAdmin(`Enter Admin Password to confirm deletion of ${player.playerName}:`)) {
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