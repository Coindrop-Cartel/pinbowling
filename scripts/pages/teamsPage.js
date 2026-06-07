import { PB_API } from '@services/api.js';
import { setupLiveFilter, createExpandableRow } from '@ui/selectors.js';
import { showConfirm, showPlayerSelectionDialog } from '@ui/dialogs.js';
import { isManagementAuthorized } from '@services/auth.js';

/**
 * Logic for managing Teams and their Roster.
 */
export async function initTeamsPage() {
  const isAuthorized = await isManagementAuthorized();
  const teamForm = document.getElementById('team-form');
  const teamFormTitle = document.getElementById('team-form-title');
  const teamIdInput = document.getElementById('team-id');
  const teamNameInput = document.getElementById('team-name');
  const teamCityInput = document.getElementById('team-city');
  const teamStateInput = document.getElementById('team-state');
  const saveBtn = document.getElementById('save-team-btn');
  const cancelBtn = document.getElementById('cancel-team-btn');
  const teamsList = document.getElementById('teams-list');
  const emptyNotice = document.getElementById('teams-list-empty');

  let allTeams = [];
  let allPlayersCache = [];
  let filterInstance = null;
  let editingTeamId = null;
  let expandedTeamId = null;

  if (!isAuthorized) {
    const formCard = document.getElementById('team-form-card');
    if (formCard) formCard.classList.add('hidden');
  }

  const refresh = async () => {
    try {
      const [teams, players] = await Promise.all([
        PB_API.getTeams(),
        PB_API.getPlayers()
      ]);
      allTeams.length = 0;
      allTeams.push(...teams);
      allPlayersCache = players;
      if (filterInstance) {
        filterInstance.performFilter();
      }
    } catch (err) {
      console.error('Failed to refresh teams:', err);
    }
  };

  const onFilterUpdate = (filtered, query) => {
    teamsList.innerHTML = '';
    const hasTeams = filtered.length > 0;
    emptyNotice.classList.toggle('hidden', hasTeams);

    filtered.forEach(team => {
      const isExpanded = String(team.id) === String(expandedTeamId);

      const headerHtml = `
        <div style="flex: 1;">
          <h3 style="margin: 0; font-size: 1.05rem;">${team.name}</h3>
          <small>${team.city || 'No City'}, ${team.state || 'No State'} | Members: ${team.members?.length || 0}</small>
        </div>
      `;

      const contentHtml = `
        <div class="team-roster-section" style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0;">Roster</h4>
            ${isAuthorized ? `<button class="add-member-btn secondary btn-row" data-team-id="${team.id}">Add Player</button>` : ''}
          </div>
          <ul class="team-members-list" style="list-style: none; padding: 0;"></ul>
          <div class="notice team-members-empty hidden">No players assigned to this team.</div>
        </div>
        <div style="display: flex; gap: 8px;">
          ${isAuthorized ? '<button class="edit-team-btn secondary btn-row">Edit Team</button>' : ''}
          ${isAuthorized ? '<button class="delete-team-btn btn-row">Delete Team</button>' : ''}
        </div>
      `;

      const row = createExpandableRow(teamsList, {
        id: team.id,
        className: 'team-registry-item',
        headerHtml,
        contentHtml,
        isExpanded,
        onHeaderClick: () => {
          expandedTeamId = (expandedTeamId === team.id) ? null : team.id;
          onFilterUpdate(filtered, query);
        }
      });

      // Render members
      const membersListEl = row.querySelector('.team-members-list');
      const membersEmptyEl = row.querySelector('.team-members-empty');
      
      if (team.members && team.members.length > 0) {
        membersEmptyEl.classList.add('hidden');
        team.members.forEach(member => {
          const li = document.createElement('li');
          li.style = "display: flex; justify-content: space-between; margin-bottom: 5px; background: #f9f9f9; padding: 5px 10px; border-radius: 4px;";
          li.innerHTML = `
            <span>${member.playerName}</span>
            ${isAuthorized ? `<button class="remove-member-btn btn-row" data-team-id="${team.id}" data-player-id="${member.id}" data-player-name="${member.playerName}">Remove</button>` : ''}
          `;
          membersListEl.appendChild(li);
        });
      } else {
        membersEmptyEl.classList.remove('hidden');
      }

      // Button listeners
      if (isAuthorized) {
        row.querySelector('.edit-team-btn').onclick = () => editTeam(team);
        row.querySelector('.delete-team-btn').onclick = () => deleteTeam(team);
        row.querySelector('.add-member-btn').onclick = () => addMemberToTeam(team);
        row.querySelectorAll('.remove-member-btn').forEach(btn => {
          btn.onclick = () => removeMemberFromTeam(btn.dataset.teamId, btn.dataset.playerId, btn.dataset.playerName);
        });
      }
    });

    // Duplicate check and button state
    const exactMatch = allTeams.find(t => 
      t.name.trim().toLowerCase() === query && 
      (!editingTeamId || String(t.id) !== String(editingTeamId))
    );
    saveBtn.disabled = !query || !!exactMatch;
    if (exactMatch) saveBtn.title = "A team with this name already exists.";
    else saveBtn.title = "";
  };

  filterInstance = setupLiveFilter(teamNameInput, allTeams, {
    labelKey: 'name',
    onFilter: onFilterUpdate
  });

  const resetForm = () => {
    editingTeamId = null;
    teamForm.reset();
    teamIdInput.value = '';
    teamFormTitle.textContent = 'Add New Team';
    saveBtn.textContent = 'Save Team';
    cancelBtn.classList.add('hidden');
    filterInstance.performFilter();
  };

  const editTeam = (team) => {
    editingTeamId = team.id;
    expandedTeamId = team.id; // Auto-expand roster when editing
    teamIdInput.value = team.id;
    teamNameInput.value = team.name;
    teamCityInput.value = team.city || '';
    teamStateInput.value = team.state || '';
    teamFormTitle.textContent = `Edit Team: ${team.name}`;
    saveBtn.textContent = 'Update Team';
    cancelBtn.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    filterInstance.performFilter();
  };

  if (cancelBtn) cancelBtn.onclick = resetForm;

  teamForm.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: teamNameInput.value.trim(),
      city: teamCityInput.value.trim(),
      state: teamStateInput.value.trim()
    };

    try {
      if (editingTeamId) {
        await PB_API.updateTeam(editingTeamId, payload);
      } else {
        await PB_API.createTeam(payload);
      }
      resetForm();
      await refresh();
    } catch (err) {
      alert(`Failed to save team: ${err.message}`);
    }
  };

  const deleteTeam = async (team) => {
    if (!await showConfirm(`Delete team "${team.name}"? This will remove all roster associations.`, 'Delete Team')) return;
    try {
      await PB_API.deleteTeam(team.id);
      await refresh();
    } catch (err) {
      alert(`Failed to delete team: ${err.message}`);
    }
  };

  const addMemberToTeam = async (team) => {
    const memberIds = new Set(team.members.map(m => m.id));
    const available = allPlayersCache.filter(p => !memberIds.has(p.id));

    if (available.length === 0) {
      alert('All players are already assigned to this team.');
      return;
    }

    const options = available.map(p => ({ value: p.id, label: p.playerName }));
    const selectedId = await showPlayerSelectionDialog(`Add to ${team.name}`, 'Select a player:', options);

    if (selectedId) {
      try {
        await PB_API.addTeamMember(team.id, selectedId);
        await refresh();
      } catch (err) {
        alert(`Failed to add member: ${err.message}`);
      }
    }
  };

  const removeMemberFromTeam = async (teamId, playerId, playerName) => {
    if (!await showConfirm(`Remove ${playerName} from this team?`, 'Remove Member')) return;
    try {
      await PB_API.removeTeamMember(teamId, playerId);
      await refresh();
    } catch (err) {
      alert(`Failed to remove member: ${err.message}`);
    }
  };

  await refresh();
}