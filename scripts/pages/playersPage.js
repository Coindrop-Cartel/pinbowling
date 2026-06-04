import { PB_API } from '@services/api.js';
import { SCORING_FORMATS } from '@core/engine.js';
import { getCookie } from '@scripts/utils.js';
import { setupLiveFilter, showConfirm, showPrompt, showChoiceDialog, showAlert } from '@ui/uiComponents.js';
import { requireAdmin } from '@services/auth.js';

/**
 * Initializes the Player Management page.
 */
export async function initPlayersPage() {
  // Batch initial user check and data fetch
  const [currentUser, playersData] = await Promise.all([
    PB_API.getCurrentUser(),
    PB_API.getPlayers()
  ]);

  const isAdmin = currentUser && currentUser.role === 'admin';
  const isTD = currentUser && currentUser.role === 'td';
  const hasElevatedPrivileges = isAdmin || isTD;

  const playerFormTitle = document.getElementById('player-form-title');
  const playerForm = document.getElementById('player-form');
  const editingPlayerIdInput = document.getElementById('editing-player-id');
  const playerNameInput = document.getElementById('player-name');
  const ifpaIdInput = document.getElementById('ifpa-id');
  const matchplayIdInput = document.getElementById('matchplay-id');
  const savePlayerButton = document.getElementById('save-player-button');
  const cancelEditButton = document.getElementById('cancel-edit-button');
  const scoringFormatInput = document.getElementById('player-scoring-format');

  // Populate format dropdown from centralized list
  if (scoringFormatInput) {
    scoringFormatInput.innerHTML = SCORING_FORMATS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
    scoringFormatInput.value = getCookie('pb_preferred_format') || 'bowling';
  }

  const playerList = document.getElementById('player-list');

  let allPlayers = []; // Cache players for editing
  let filterInstance = null;

  // Setup "Create Player" toggle
  const ifpaRow = document.getElementById('player-ifpa-row');
  const matchplayRow = document.getElementById('player-matchplay-row');
  const formatRow = document.getElementById('player-format-row');
  const actionsRow = document.getElementById('player-form-actions');

  // Create management buttons for the form (only visible during edit)
  const resetPassBtn = document.createElement('button');
  resetPassBtn.type = 'button';
  resetPassBtn.className = 'secondary hidden';
  resetPassBtn.textContent = 'Reset Password';
  resetPassBtn.style.fontSize = '0.75rem';
  resetPassBtn.style.padding = '8px 12px';

  const changeRoleBtn = document.createElement('button');
  changeRoleBtn.type = 'button';
  changeRoleBtn.className = 'secondary hidden';
  changeRoleBtn.textContent = 'Change Role';
  changeRoleBtn.style.fontSize = '0.75rem';
  changeRoleBtn.style.padding = '8px 12px';

  if (actionsRow) {
    actionsRow.prepend(changeRoleBtn);
    actionsRow.prepend(resetPassBtn);
  }

  const createToggle = document.createElement('button');
  createToggle.type = 'button';
  createToggle.className = 'secondary';
  createToggle.textContent = 'Create New Player';
  createToggle.style.marginTop = '10px';
  playerNameInput.after(createToggle);

  if (!hasElevatedPrivileges) {
    createToggle.classList.add('hidden');
    playerForm.closest('.card').classList.add('hidden');
  }

  createToggle.onclick = () => {
    if (editingPlayerIdInput.value) return resetForm();
    const isHidden = !ifpaRow || ifpaRow.classList.contains('hidden');
    ifpaRow.classList.toggle('hidden', !isHidden);
    matchplayRow.classList.toggle('hidden', !isHidden);
    if (formatRow) formatRow.classList.toggle('hidden', !isHidden);
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
        const isSelf = currentUser && String(p.id) === String(currentUser.player_id);
        const canEdit = hasElevatedPrivileges || isSelf;

        const li = document.createElement('li');
        li.style.padding = '6px 12px';
        li.style.marginBottom = '5px';
        li.style.background = '#f9f9f9';
        li.style.borderRadius = '4px';
        li.innerHTML = `
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <strong>${p.playerName}</strong> 
              ${p.userRole ? `<span class="badge" style="background:var(--pb-primary); color:#fff; font-size:0.7rem; padding:2px 6px; border-radius:10px; font-weight: bold; text-transform: uppercase;">${p.userRole}</span>` : ''}
            </div>
            <div style="font-size: 0.75rem; color: #666; margin-top: 2px;">
              ${p.ifpaId ? `<span>IFPA: ${p.ifpaId}</span>` : ''}
              ${p.ifpaId && p.matchplayId ? ' | ' : ''}
              ${p.matchplayId ? `<span>MatchPlay: ${p.matchplayId}</span>` : ''}
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              ${canEdit ? `<button type="button" class="edit-player-btn secondary" data-player-id="${p.id}" style="padding: 4px 10px; font-size: 0.75rem;">Edit</button>` : ''}
              ${isAdmin ? `<button type="button" class="delete-player-btn-inline" data-player-id="${p.id}" style="padding: 4px 10px; font-size: 0.75rem;">Delete</button>` : ''}
            </div>
          </div>
        `;
        playerList.appendChild(li);
      });
      
      playerList.querySelectorAll('.edit-player-btn').forEach(btn => {
        btn.onclick = () => editPlayer(Number(btn.dataset.playerId));
      });
      playerList.querySelectorAll('.delete-player-btn-inline').forEach(btn => {
        btn.onclick = () => deletePlayer(Number(btn.dataset.playerId));
      });
    }

    // Logic to prevent duplicate player names
    const exactMatch = allPlayers.find(p => p.playerName.trim().toLowerCase() === query);
    const isEditingThisPlayer = exactMatch && String(exactMatch.id) === String(editingPlayerIdInput.value);
    
    // Hide the "Create" toggle if an exact match exists, unless the creation 
    // form is already open (in which case the button serves as "Cancel").
    const isFormOpen = ifpaRow && !ifpaRow.classList.contains('hidden');
    createToggle.classList.toggle('hidden', !!exactMatch && !isFormOpen);

    savePlayerButton.disabled = !query || (!!exactMatch && !isEditingThisPlayer);
    savePlayerButton.title = (exactMatch && !isEditingThisPlayer) ? "This player name already exists." : "";
  };

  filterInstance = setupLiveFilter(playerNameInput, allPlayers, {
    labelKey: 'playerName',
    onFilter: onFilterUpdate
  });

  // Ensure validation and button states are updated when metadata fields change
  ifpaIdInput.addEventListener('input', () => filterInstance.performFilter());
  matchplayIdInput.addEventListener('input', () => filterInstance.performFilter());

  async function refresh(data = null) {
    const players = data || await PB_API.getPlayers();
    // Update array in-place to keep the filter reference valid
    allPlayers.length = 0;
    allPlayers.push(...players);
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
    if (scoringFormatInput) scoringFormatInput.value = getCookie('pb_preferred_format') || 'bowling';
    if (playerFormTitle) playerFormTitle.textContent = 'Add New Player';
    savePlayerButton.textContent = 'Save Player';
    
    resetPassBtn.classList.add('hidden');
    changeRoleBtn.classList.add('hidden');
    if (cancelEditButton) cancelEditButton.classList.add('hidden');

    // Collapse creation fields
    if (ifpaRow) ifpaRow.classList.add('hidden');
    if (matchplayRow) matchplayRow.classList.add('hidden');
    if (formatRow) formatRow.classList.add('hidden');
    if (actionsRow) actionsRow.classList.add('hidden');
    createToggle.textContent = 'Create New Player';
    createToggle.style.marginTop = '10px';
    playerNameInput.after(createToggle);
    
    playerNameInput.disabled = false;
    if (!hasElevatedPrivileges) {
      playerForm.closest('.card').classList.add('hidden');
    }

    if (filterInstance) filterInstance.performFilter();
  }

  /**
   * populates the form with existing player data to enter 'Edit' mode.
   * @param {number} playerId 
   */
  async function editPlayer(playerId) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    const isSelf = currentUser && String(player.id) === String(currentUser.player_id);
    if (!hasElevatedPrivileges && !isSelf) return;

    playerForm.closest('.card').classList.remove('hidden');

    editingPlayerIdInput.value = player.id;
    playerNameInput.value = player.playerName;
    
    // Lock name for non-privileged users
    playerNameInput.disabled = !hasElevatedPrivileges;
    
    ifpaIdInput.value = player.ifpaId || '';
    matchplayIdInput.value = player.matchplayId || '';
    if (scoringFormatInput) scoringFormatInput.value = player.preferredFormat || 'bowling';
    if (playerFormTitle) playerFormTitle.textContent = `Edit Player: ${player.playerName}`;
    savePlayerButton.textContent = 'Update Player';

    // Expand fields for editing
    if (ifpaRow) ifpaRow.classList.remove('hidden');
    if (matchplayRow) matchplayRow.classList.remove('hidden');
    if (formatRow) formatRow.classList.remove('hidden');
    if (actionsRow) actionsRow.classList.remove('hidden');
    createToggle.textContent = 'Cancel';
    createToggle.style.marginTop = '0';
    actionsRow.appendChild(createToggle);

    // Show management tools if the player has an account
    const hasAccount = !!player.userId;
    resetPassBtn.classList.toggle('hidden', !hasAccount || !hasElevatedPrivileges);
    changeRoleBtn.classList.toggle('hidden', !hasAccount || !hasElevatedPrivileges);

    if (hasAccount) {
      resetPassBtn.onclick = async () => {
        const newPass = await showPrompt(`Enter a new temporary password for ${player.playerName}:`, 'Reset User Password', false);
        if (newPass) {
           try {
             await PB_API.updateUserPassword(player.userId, newPass);
             showAlert(`Password updated successfully for ${player.playerName}.`, 'Success');
           } catch (err) {
             showAlert(err.message, 'Update Failed');
           }
        }
      };

      changeRoleBtn.onclick = async () => {
        const choices = [
          { value: 'player', label: 'Player' },
          { value: 'td', label: 'TD' }
        ];
        if (isAdmin) choices.push({ value: 'admin', label: 'Admin' });

        const newRole = await showChoiceDialog('Change User Role', `Assign a new role for ${player.playerName}:`, choices, player.userRole);
        if (newRole && newRole !== player.userRole) {
          try {
            await PB_API.updateUserRole(player.userId, newRole);
            await refresh();
            // Refresh the current player object from the cache to sync the edit form state
            const updated = allPlayers.find(p => p.id === playerId);
            if (updated) editPlayer(updated.id);
          } catch (err) {
            showAlert(err.message, 'Update Failed');
          }
        }
      };
    }

    window.scrollTo(0, 0); // Scroll to the form
  }

  // Centralize cancel logic to the resetForm helper
  if (cancelEditButton) cancelEditButton.addEventListener('click', resetForm);

  playerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editingPlayerIdInput.value ? Number(editingPlayerIdInput.value) : null;
    const name = playerNameInput.value.trim();
    const ifpaId = ifpaIdInput.value.trim() || null;
    const matchplayId = matchplayIdInput.value.trim() || null;
    const preferredFormat = scoringFormatInput ? scoringFormatInput.value : 'bowling';

    if (!name) return;

    const isSelfUpdate = id && currentUser && String(id) === String(currentUser.player_id);
    const playerBeingEdited = id ? allPlayers.find(p => p.id === id) : null;
    const nameChanged = playerBeingEdited && name !== playerBeingEdited.playerName;
    const implicitlyAuthorized = hasElevatedPrivileges || (isSelfUpdate && !nameChanged);

    if (!implicitlyAuthorized && !await requireAdmin(`Enter Admin Password to ${id ? 'update' : 'create'} player "${name}":`)) {
      return;
    }

    const payload = { 
      playerName: name, 
      ifpaId: ifpaId, 
      matchplayId: matchplayId,
      preferredFormat
    };

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

  // Initial render with batched data
  refresh(playersData);
}