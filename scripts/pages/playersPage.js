import { PB_API } from '@services/api.js';
import { requireAdmin, can, PERMISSIONS } from '@services/auth.js';
import { showAlert, showPrompt, showChoiceDialog, showConfirm, showPlayerSelectionDialog } from '@ui/dialogs.js';
import { createExpandableRow, setupLiveFilter, createSkeletonLoader } from '@ui/selectors.js';
import { escapeHTML } from '@scripts/utils.js';

/**
 * Initializes the Player Management page.
 * @module pages/players
 */

/**
 * Initializes the Players page: loads players, binds CRUD controls, and renders the player list.
 * @async
 * @returns {Promise<void>}
 */
export async function initPlayersPage() {
  let currentUser;
  let playersData;
  const loader = createSkeletonLoader(document.getElementById('player-list'), { count: 5 });
  try {
    // Batch initial user check and data fetch
    [currentUser, playersData] = await Promise.all([
      PB_API.auth.me(),
      PB_API.players.getAll()
    ]);
  } catch (error) {
    console.error('Error initializing Players page:', error);
    return; // Stop initialization if initial data fetch fails
  } finally {
    loader.remove();
  }

  // Guard: If we are no longer on the Players page, abort initialization
  if (!document.getElementById('player-list')) return;

  const isAdmin = currentUser && currentUser.role === 'admin';
  const isTD = currentUser && currentUser.role === 'td';
  const hasElevatedPrivileges = isAdmin || isTD;

  const playerFormTitle = document.getElementById('player-form-title');
  const playerForm = document.getElementById('player-form');
  const playerFormCard = document.getElementById('player-form-card');
  const editingPlayerIdInput = document.getElementById('editing-player-id');
  const playerNameInput = document.getElementById('player-name');
  const ifpaIdInput = document.getElementById('ifpa-id');
  const ifpaRatingInput = document.getElementById('ifpa-rating');
  const matchplayIdInput = document.getElementById('matchplay-id');
  const ifpaRankingInput = document.getElementById('ifpa-ranking');
  const usernameRow = document.getElementById('player-username-row');
  const usernameInput = document.getElementById('player-username');
  const emailRow = document.getElementById('player-email-row');
  const emailInput = document.getElementById('player-email');
  const savePlayerButton = document.getElementById('save-player-button');

  const playerList = document.getElementById('player-list');

  let allPlayers = []; // Cache players for editing
  let filterInstance = null;
  let expandedPlayerId = null;

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
  createToggle.className = 'secondary btn-mgmt mt-10 hidden';
  createToggle.textContent = 'Create New Player';
  playerNameInput.after(createToggle);

  if (!currentUser) {
    if (createToggle) createToggle.classList.add('hidden');
    if (playerFormCard) playerFormCard.classList.add('hidden');
  }

  // Standardize the primary form action button
  if (savePlayerButton) {
    savePlayerButton.classList.add('secondary', 'btn-mgmt');
  }

  // REVEAL-ONLY: Management tools should be hidden in PHP/CSS by default.
  if (hasElevatedPrivileges) {
    createToggle.classList.remove('hidden');
    playerFormCard?.classList.remove('hidden');
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
        // Robust role detection: check userRole (standardized), role (fallback), or infer from userId presence
        const displayRole = p.userRole || p.role || (p.userId ? 'player' : '');

        const headerHtml = `
          <div class="header-bar">
            <div class="name-with-badge">
              <strong>${escapeHTML(p.playerName)}</strong>
              ${displayRole ? `<span class="badge">${escapeHTML(displayRole)}</span>` : ''}
            </div>
          </div>
        `;

        const contentHtml = `
          <div class="content-muted-col">
            ${p.username ? `<div><strong>Username:</strong> ${escapeHTML(p.username)}</div>` : ''}
            ${p.email ? `<div><strong>Email:</strong> ${escapeHTML(p.email)}</div>` : ''}
            ${p.ifpaId ? `<div><strong>IFPA ID:</strong> ${escapeHTML(p.ifpaId)}</div>` : ''}
            ${p.ifpaRanking ? `<div><strong>IFPA Ranking:</strong> #${parseInt(p.ifpaRanking, 10)}</div>` : ''}
            ${p.matchplayId ? `<div><strong>MatchPlay ID:</strong> ${escapeHTML(p.matchplayId)}</div>` : ''}
            ${p.ifpaRating ? `<div><strong>Match Play Rating:</strong> ${parseFloat(p.ifpaRating).toFixed(2)}</div>` : ''}
            ${!p.ifpaId && !p.matchplayId && !p.ifpaRating && !p.ifpaRanking ? '<div class="muted-italic">No external IDs or ratings linked.</div>' : ''}
            <div class="small-action-buttons mt-10">
              ${canEdit ? `<button type="button" class="edit-player-btn secondary btn-row">Edit</button>` : ''}
              ${isAdmin ? `<button type="button" class="merge-player-btn secondary btn-row">Merge</button>` : ''}
              ${isAdmin ? `<button type="button" class="delete-player-btn-inline btn-row">Delete</button>` : ''}
            </div>
          </div>
        `;

        const isExpanded = String(p.id) === String(expandedPlayerId);

        const row = createExpandableRow(playerList, {
          id: p.id,
          tag: 'li',
          className: 'player-item-row',
          headerHtml,
          contentHtml,
          isExpanded,
          onHeaderClick: () => {
            expandedPlayerId = (expandedPlayerId === p.id) ? null : p.id;
            filterInstance.performFilter();
          }
        });

        const editBtn = row.querySelector('.edit-player-btn');
        if (editBtn) editBtn.onclick = (e) => { e.stopPropagation(); editPlayer(Number(p.id)); };

        const mergeBtn = row.querySelector('.merge-player-btn');
        if (mergeBtn) mergeBtn.onclick = (e) => { e.stopPropagation(); mergePlayer(Number(p.id)); };

        const delBtn = row.querySelector('.delete-player-btn-inline');
        if (delBtn) delBtn.onclick = (e) => { e.stopPropagation(); deletePlayer(Number(p.id)); };
      });
    }

    // Logic to prevent duplicate player names
    const exactMatch = allPlayers.find(p => p.playerName.trim().toLowerCase() === query);
    const isEditingThisPlayer = exactMatch && String(exactMatch.id) === String(editingPlayerIdInput.value);
    
    // Hide the "Create" toggle if an exact match exists, unless the creation 
    // form is already open (in which case the button serves as "Cancel").
    if (hasElevatedPrivileges) { // Only apply this logic if the user can actually create/edit
      const isFormOpen = ifpaRow && !ifpaRow.classList.contains('hidden');
      createToggle.classList.toggle('hidden', !!exactMatch && !isFormOpen);
    }
    savePlayerButton.disabled = !query || (!!exactMatch && !isEditingThisPlayer);
    savePlayerButton.title = (exactMatch && !isEditingThisPlayer) ? "This player name already exists." : "";
  };

  filterInstance = setupLiveFilter(playerNameInput, allPlayers, {
    labelKey: 'playerName',
    onFilter: onFilterUpdate
  });

  // Ensure validation and button states are updated when metadata fields change
  ifpaIdInput.addEventListener('input', () => filterInstance.performFilter());
  if (ifpaRatingInput) ifpaRatingInput.addEventListener('input', () => filterInstance.performFilter());
  matchplayIdInput.addEventListener('input', () => filterInstance.performFilter());
  if (ifpaRankingInput) ifpaRankingInput.addEventListener('input', () => filterInstance.performFilter());

  async function refresh(data = null) {
    const players = Array.isArray(data) ? data : await PB_API.players.getAll();
    const safePlayers = Array.isArray(players) ? players : [];

    // Update array in-place to keep the filter reference valid
    allPlayers.length = 0;
    allPlayers.push(...safePlayers);
    
    if (filterInstance) {
      filterInstance.setData(allPlayers);
      filterInstance.performFilter();
    }
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
    if (ifpaRatingInput) ifpaRatingInput.value = '';
    matchplayIdInput.value = '';
    if (ifpaRankingInput) ifpaRankingInput.value = '';
    if (usernameRow) usernameRow.classList.add('hidden');
    if (usernameInput) {
      usernameInput.value = '';
      usernameInput.disabled = false;
    }
    if (emailRow) emailRow.classList.add('hidden');
    if (emailInput) {
      emailInput.value = '';
      emailInput.disabled = false;
    }
    if (playerFormTitle) playerFormTitle.textContent = 'Add New Player';
    savePlayerButton.textContent = 'Save Player';
    
    resetPassBtn.classList.add('hidden');
    changeRoleBtn.classList.add('hidden');

    // Collapse creation fields
    if (ifpaRow) ifpaRow.classList.add('hidden');
    if (matchplayRow) matchplayRow.classList.add('hidden');
    if (actionsRow) actionsRow.classList.add('hidden');
    createToggle.textContent = 'Create New Player';
    createToggle.classList.replace('mt-0', 'mt-10');
    playerNameInput.after(createToggle);
    
    playerNameInput.disabled = false;
    // Ensure card is hidden for non-privileged users if we aren't editing self
    playerFormCard?.classList.toggle('hidden', !hasElevatedPrivileges);

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

    playerFormCard?.classList.remove('hidden');

    editingPlayerIdInput.value = player.id;
    playerNameInput.value = player.playerName;
    
    // If not elevated, name is always disabled. Admins/TDs can edit names.
    playerNameInput.disabled = !hasElevatedPrivileges;
    
    ifpaIdInput.value = player.ifpaId || '';
    if (ifpaRatingInput) ifpaRatingInput.value = player.ifpaRating || '';
    matchplayIdInput.value = player.matchplayId || '';
    if (ifpaRankingInput) ifpaRankingInput.value = player.ifpaRanking || '';
    
    const hasAccount = !!player.userId;
    if (hasAccount) {
      if (usernameRow) usernameRow.classList.remove('hidden');
      if (usernameInput) {
        usernameInput.value = player.username || '';
        usernameInput.disabled = !hasElevatedPrivileges && !isSelf;
      }
      if (emailRow) emailRow.classList.remove('hidden');
      if (emailInput) {
        emailInput.value = player.email || '';
        emailInput.disabled = !hasElevatedPrivileges && !isSelf;
      }
    } else {
      if (usernameRow) usernameRow.classList.add('hidden');
      if (usernameInput) usernameInput.value = '';
      if (emailRow) emailRow.classList.add('hidden');
      if (emailInput) emailInput.value = '';
    }

    if (playerFormTitle) playerFormTitle.textContent = `Edit Player: ${player.playerName}`;
    savePlayerButton.textContent = 'Update Player';
    if (ifpaRow) ifpaRow.classList.remove('hidden');
    if (matchplayRow) matchplayRow.classList.remove('hidden');
    if (actionsRow) actionsRow.classList.remove('hidden');
    createToggle.textContent = 'Cancel';
    createToggle.classList.replace('mt-10', 'mt-0');
    actionsRow.appendChild(createToggle);

    resetPassBtn.classList.toggle('hidden', !hasAccount || !hasElevatedPrivileges);
    changeRoleBtn.classList.toggle('hidden', !hasAccount || !hasElevatedPrivileges);

    if (hasAccount) {
      resetPassBtn.onclick = async () => {
        const newPass = await showPrompt(`Enter a new temporary password for ${player.playerName}:`, 'Reset User Password', false);
        if (newPass) {
           try {
             await PB_API.players.updatePassword(player.userId, newPass);
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

        const currentRole = player.userRole || player.role;
        // Ensure the current role is passed to highlight the correct button in the dialog
        const newRole = await showChoiceDialog('Change User Role', `Assign a new role for ${player.playerName}:`, choices, currentRole);
        if (newRole && newRole !== currentRole) {
          try {
            await PB_API.players.updateRole(player.userId, newRole);
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
    // Ensure validation runs with the updated form state, deferring slightly
    // to allow DOM updates to fully propagate in some environments (e.g., JSDOM).
    // This is a common workaround for synchronous DOM reads in test environments.
    setTimeout(() => filterInstance.performFilter(), 0);
  }

  playerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editingPlayerIdInput.value ? Number(editingPlayerIdInput.value) : null;
    const name = playerNameInput.value.trim();
    const ifpaId = ifpaIdInput.value.trim() || null;
    const ifpaRating = ifpaRatingInput && ifpaRatingInput.value ? parseFloat(ifpaRatingInput.value) : null;
    const matchplayId = matchplayIdInput.value.trim() || null;
    const ifpaRanking = ifpaRankingInput && ifpaRankingInput.value ? parseInt(ifpaRankingInput.value, 10) : null;
    const username = usernameInput ? usernameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';

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
      ifpaRating: ifpaRating,
      matchplayId: matchplayId,
      ifpaRanking: ifpaRanking,
      username: username || null,
      email: email || null
    };

    savePlayerButton.disabled = true;
    savePlayerButton.textContent = 'Saving...';

    try {
      if (id) {
        await PB_API.players.update(id, payload);
      } else {
        await PB_API.players.create(payload);
      }
      await refresh();
      resetForm();
    } catch (error) {
      showAlert(`Error saving player: ${error.message}`);
    } finally {
      savePlayerButton.disabled = false;
      savePlayerButton.textContent = id ? 'Update Player' : 'Save Player';
    }
  });

  async function deletePlayer(playerId) {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;
    
    if (!await showConfirm(`Are you sure you want to delete player "${escapeHTML(player.playerName)}"? This action cannot be undone and will remove all their associated scores.`, 'Delete Player')) {
      return;
    }

    if (!await requireAdmin(`Enter Admin Password to confirm deletion of ${player.playerName}:`)) {
      return;
    }

    try {
      await PB_API.players.delete(playerId);
      await refresh();
    } catch (error) {
      showAlert(`Error deleting player: ${error.message}`);
    }
  }

  async function mergePlayer(keepPlayerId) {
    const keepPlayer = allPlayers.find(p => p.id === keepPlayerId);
    if (!keepPlayer) return;

    const options = allPlayers
      .filter(p => p.id !== keepPlayerId)
      .map(p => ({ value: p.id, label: p.playerName }));

    const mergePlayerId = await showPlayerSelectionDialog(
      'Merge Player Accounts',
      `Select the duplicate player account that should be merged INTO <strong>${escapeHTML(keepPlayer.playerName)}</strong>.`,
      options,
      'Merge Accounts'
    );

    if (!mergePlayerId) return;

    const mergePlayerObj = allPlayers.find(p => p.id === Number(mergePlayerId));
    if (!mergePlayerObj) return;

    if (!await showConfirm(
      `WARNING: You are about to merge player "${escapeHTML(mergePlayerObj.playerName)}" INTO "${escapeHTML(keepPlayer.playerName)}".<br><br>` +
      `This will permanently delete the account for "${escapeHTML(mergePlayerObj.playerName)}" and transfer all of their scores, matchups, league memberships, and team memberships to "${escapeHTML(keepPlayer.playerName)}".<br><br>` +
      `This action cannot be undone. Are you sure you want to proceed?`,
      'Confirm Merge Accounts'
    )) {
      return;
    }

    try {
      await PB_API.players.merge(keepPlayerId, Number(mergePlayerId));
      await refresh();
      showAlert(`Successfully merged "${escapeHTML(mergePlayerObj.playerName)}" into "${escapeHTML(keepPlayer.playerName)}".`, 'Merge Complete');
    } catch (error) {
      showAlert(`Error merging players: ${error.message}`);
    }
  }

  // Initial render with batched data
  await refresh(playersData);
}