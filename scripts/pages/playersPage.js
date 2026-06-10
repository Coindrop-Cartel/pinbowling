import { PB_API } from '@services/api.js';
import { setupLiveFilter, createExpandableRow } from '@ui/selectors.js';
import { showConfirm, showPrompt, showChoiceDialog, showAlert } from '@ui/dialogs.js';
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

  const playerList = document.getElementById('player-list');

  let allPlayers = []; // Cache players for editing
  let filterInstance = null;

  // Setup "Create Player" toggle
  const ifpaRow = document.getElementById('player-ifpa-row');
  const matchplayRow = document.getElementById('player-matchplay-row');
  const actionsRow = document.getElementById('player-form-actions');

  // Create management buttons for the form (only visible during edit)
  const resetPassBtn = document.createElement('button');
  resetPassBtn.type = 'button';
  resetPassBtn.className = 'secondary btn-mgmt hidden';
  resetPassBtn.textContent = 'Reset Password';

  const changeRoleBtn = document.createElement('button');
  changeRoleBtn.type = 'button';
  changeRoleBtn.className = 'secondary btn-mgmt hidden';
  changeRoleBtn.textContent = 'Change Role';

  if (actionsRow) {
    actionsRow.prepend(changeRoleBtn);
    actionsRow.prepend(resetPassBtn);
  }

  const createToggle = document.createElement('button');
  createToggle.type = 'button';
  createToggle.className = 'secondary btn-mgmt mt-10';
  createToggle.textContent = 'Create New Player';
  playerNameInput.after(createToggle);

  if (savePlayerButton) savePlayerButton.classList.add('btn-mgmt');

  if (!hasElevatedPrivileges) {
    createToggle.classList.add('hidden');
    playerForm.closest('.card').classList.add('hidden');
  }

  createToggle.onclick = () => {
    if (editingPlayerIdInput.value) return resetForm();
    const isHidden = !ifpaRow || ifpaRow.classList.contains('hidden');
    ifpaRow.classList.toggle('hidden', !isHidden);
    matchplayRow.classList.toggle('hidden', !isHidden);
    actionsRow.classList.toggle('hidden', !isHidden);
    if (isHidden) {
      createToggle.textContent = 'Cancel';
      createToggle.classList.replace('mt-10', 'mt-0');
      actionsRow.appendChild(createToggle);
    } else {
      createToggle.textContent = 'Create New Player';
      createToggle.classList.replace('mt-0', 'mt-10');
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

        const headerHtml = `
          <div class="header-bar">
            <div class="name-with-badge">
              <strong>${p.playerName}</strong>
              ${p.userRole ? `<span class="badge">${p.userRole}</span>` : ''}
            </div>
            <div class="action-buttons">
              ${canEdit ? `<button type="button" class="edit-player-btn secondary btn-row">Edit</button>` : ''}
              ${isAdmin ? `<button type="button" class="delete-player-btn-inline btn-row">Delete</button>` : ''}
            </div>
          </div>
        `;

        const contentHtml = `
          <div class="content-muted-col">
            ${p.ifpaId ? `<div><strong>IFPA ID:</strong> ${p.ifpaId}</div>` : ''}
            ${p.matchplayId ? `<div><strong>MatchPlay ID:</strong> ${p.matchplayId}</div>` : ''}
            ${!p.ifpaId && !p.matchplayId ? '<div class="muted-italic">No external IDs linked.</div>' : ''}
          </div>
        `;

        const row = createExpandableRow(playerList, {
          id: p.id,
          tag: 'li',
          className: 'player-item-row',
          headerHtml,
          contentHtml,
          isExpanded: false
        });

        const editBtn = row.querySelector('.edit-player-btn');
        if (editBtn) editBtn.onclick = (e) => { e.stopPropagation(); editPlayer(Number(p.id)); };

        const delBtn = row.querySelector('.delete-player-btn-inline');
        if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); deletePlayer(Number(p.id)); };
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
    if (playerFormTitle) playerFormTitle.textContent = 'Add New Player';
    savePlayerButton.textContent = 'Save Player';
    
    resetPassBtn.classList.add('hidden');
    changeRoleBtn.classList.add('hidden');
    if (cancelEditButton) cancelEditButton.classList.add('hidden');

    // Collapse creation fields
    if (ifpaRow) ifpaRow.classList.add('hidden');
    if (matchplayRow) matchplayRow.classList.add('hidden');
    if (actionsRow) actionsRow.classList.add('hidden');
    createToggle.textContent = 'Create New Player';
    createToggle.classList.replace('mt-0', 'mt-10');
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
    
    // Lock name for non-privileged users UNLESS it is their own profile
    playerNameInput.disabled = !hasElevatedPrivileges && !isSelf;
    
    ifpaIdInput.value = player.ifpaId || '';
    matchplayIdInput.value = player.matchplayId || '';
    if (playerFormTitle) playerFormTitle.textContent = `Edit Player: ${player.playerName}`;
    savePlayerButton.textContent = 'Update Player';

    // Expand fields for editing
    if (ifpaRow) ifpaRow.classList.remove('hidden');
    if (matchplayRow) matchplayRow.classList.remove('hidden');
    if (actionsRow) actionsRow.classList.remove('hidden');
    createToggle.textContent = 'Cancel';
    createToggle.classList.replace('mt-0', 'mt-10');
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
      matchplayId: matchplayId
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