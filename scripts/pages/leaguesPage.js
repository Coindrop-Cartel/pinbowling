import { PB_API } from '@services/api.js';
import { setupLiveFilter, showConfirm, showPrompt, showPlayerSelectionDialog, showDialog } from '@ui/uiComponents.js';
import { setActiveLeagueId, setActiveEventId, getActiveLeagueId } from '@scripts/utils.js';
import { setLeaguePassword, getLeaguePassword, getAdminSessionPassword, setAdminSessionPassword } from '@services/state.js';
import { requireAdmin, runAuthorizedLeagueAction } from '@services/auth.js';
import { navigateTo } from '@scripts/utils.js';
import { ROUTES } from '@scripts/routes.js';

/**
 * Logic for managing Leagues and Events.
 */
export async function initLeaguesPage() {
  const leagueForm = document.getElementById('league-form');
  const leagueNameInput = document.getElementById('league-name');
  const leagueDateInput = document.getElementById('league-start-date');
  const createBtn = document.getElementById('create-league-btn');
  const leaguesList = document.getElementById('leagues-list');
  const emptyNotice = document.getElementById('leagues-list-empty');
  const eventFormCard = document.getElementById('event-form-card');
  let allPlayersCache = []; // Cache all players for selection dialogs

  let allLeagues = [];
  let filterInstance = null;

  // Setup "Create League" toggle behavior
  const dateRow = leagueDateInput.closest('.form-row');
  const actionsRow = createBtn.closest('.form-actions');
  
  // Initially hide the creation fields
  if (dateRow) dateRow.classList.add('hidden');
  if (actionsRow) actionsRow.classList.add('hidden');

  const createToggle = document.createElement('button');
  createToggle.type = 'button';
  createToggle.className = 'secondary';
  createToggle.textContent = 'Create New League';
  createToggle.style.marginTop = '10px';
  leagueNameInput.after(createToggle);

  createToggle.onclick = () => {
    const isHidden = dateRow.classList.contains('hidden');
    dateRow.classList.toggle('hidden', !isHidden);
    actionsRow.classList.toggle('hidden', !isHidden);
    if (isHidden) {
      createToggle.textContent = 'Cancel';
      createToggle.style.marginTop = '0';
      actionsRow.appendChild(createToggle);
    } else {
      createToggle.textContent = 'Create New League';
      createToggle.style.marginTop = '10px';
      leagueNameInput.after(createToggle);
    }
  };

  /**
   * Renders the league list based on filtering.
   * Handles the "X matches found" logic and duplicate prevention.
   */
  const onFilterUpdate = (filtered, query) => {
    const activeLeagueId = getActiveLeagueId();
    leaguesList.innerHTML = '';

    if (filtered.length === 0) {
      emptyNotice.classList.remove('hidden');
      emptyNotice.textContent = allLeagues.length === 0 ? 'No leagues created yet.' : 'No matching leagues found.';
    } else {
      emptyNotice.classList.add('hidden');
      filtered.forEach(league => {
        const shouldExpand = activeLeagueId && String(league.id) === String(activeLeagueId);

        const card = document.createElement('div');
        card.className = 'league-registry-item';
        card.style.marginBottom = '5px';
        card.style.border = '1px solid #ddd';
        card.style.borderRadius = '4px';
        card.style.overflow = 'hidden';

        card.innerHTML = `
          <div class="league-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 6px 12px; background: #f9f9f9;">
            <div>
              <h3 style="margin: 0; font-size: 1.05rem;">${league.name}</h3>
              <small>Started: ${league.start_date || 'N/A'} | Events: ${league.events?.length || 0} | Players: ${league.players?.length || 0}</small>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="delete-league-btn" style="padding: 4px 10px; font-size: 0.85rem;">Delete</button>
            </div>
          </div>
          <div class="league-details ${shouldExpand ? '' : 'hidden'}" style="padding: 12px 15px; border-top: 1px solid #ddd; background: #fff;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h4 style="margin: 0;">Events</h4>
              <button class="add-event-btn secondary" style="padding: 4px 12px; font-size: 0.85rem;">Add Event</button>
            </div>
            <ul style="list-style: none; padding: 0;">
              ${(league.events || []).map(e => `
                <li style="display: flex; justify-content: space-between; margin-bottom: 5px; background: #f9f9f9; padding: 5px 10px; border-radius: 4px;">
                  <span>${e.event_name} <small>(${e.event_date || 'No Date'})</small></span>
                  <div style="display: flex; gap: 4px;">
                    <button class="setup-event-btn secondary" data-league-id="${league.id}" data-event-id="${e.id}" style="padding: 2px 8px; font-size: 0.8rem;">Setup</button>
                    <button class="edit-event-btn secondary" data-id="${e.id}" style="padding: 2px 8px; font-size: 0.8rem;">Edit</button>
                    <button class="delete-event-btn" data-id="${e.id}" style="padding: 2px 8px; font-size: 0.8rem;">Delete</button>
                  </div>
                </li>
              `).join('') || '<li>No events scheduled.</li>'}
            </ul>

            <div class="league-players-section" style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 15px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="margin: 0;">Roster</h4>
                <button class="add-player-btn secondary" data-league-id="${league.id}" data-league-name="${league.name}" style="padding: 4px 12px; font-size: 0.85rem;">Add Player</button>
              </div>
              <ul class="league-players-list" style="list-style: none; padding: 0;">
                <!-- Players will be rendered here -->
              </ul>
              <div class="notice league-players-empty hidden">No players assigned to this league.</div>
            </div>

            <div style="margin-top: 30px; border-top: 2px solid #000; padding-top: 15px; display: flex; justify-content: flex-end; gap: 10px;">
              <button class="edit-league-btn secondary">Edit League</button>
              <button class="delete-league-btn">Delete League</button>
            </div>
          </div>
        `;

        // Toggle expansion
        card.querySelector('.league-header').onclick = (e) => {
          if (e.target.closest('button')) return;
          const details = card.querySelector('.league-details');
          const wasHidden = details.classList.contains('hidden');

          // Accordion behavior: Collapse all other league cards first
          leaguesList.querySelectorAll('.league-details').forEach(d => d.classList.add('hidden'));

          if (wasHidden) {
            details.classList.remove('hidden');
            renderPlayersForLeague(league.id, league.players, allPlayersCache);
          }
        };

        // Action listeners
        card.querySelector('.add-event-btn').onclick = () => showEventForm(league.id, league.name);
        card.querySelector('.edit-league-btn').onclick = () => editLeague(league.id, league.name);
        card.querySelector('.delete-league-btn').onclick = () => runAuthorizedLeagueAction(league.id, () => deleteLeague(league.id, league.name));
        card.querySelector('.add-player-btn').onclick = () => addPlayerToLeague(league.id, league.name);
        
        card.querySelectorAll('.setup-event-btn').forEach(btn => {
          btn.onclick = () => {
            const leagueId = Number(btn.dataset.leagueId);
            const eventId = Number(btn.dataset.eventId);
            setActiveLeagueId(leagueId);
            setActiveEventId(eventId);
            navigateTo(ROUTES.LEAGUE_SETUP({ leagueId, eventId }));
          };
        });
        card.querySelectorAll('.edit-event-btn').forEach(btn => {
          btn.onclick = () => {
            const eventObj = league.events.find(ev => ev.id === Number(btn.dataset.id));
            showEventForm(league.id, league.name, eventObj);
          };
        });

        card.querySelectorAll('.delete-event-btn').forEach(btn => {
          btn.onclick = (e) => runAuthorizedLeagueAction(league.id, () => deleteEvent(Number(e.target.dataset.id), league.id, league.name));
        });

        leaguesList.appendChild(card);

        // Initial render of players if details are not hidden (e.g., after refresh)
        const details = card.querySelector('.league-details');
        if (!details.classList.contains('hidden')) renderPlayersForLeague(league.id, league.players, allPlayersCache);

        // Smooth scroll to the expanded league if we just came from setup
        if (shouldExpand && !query) {
          setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
      });
    }

    // Duplicate Name Prevention
    const exactMatch = allLeagues.find(l => l.name.trim().toLowerCase() === query);

    // Hide the "Create" toggle if an exact match exists, unless the creation 
    // form is already open (in which case the button serves as "Cancel").
    const isFormOpen = !dateRow.classList.contains('hidden');
    createToggle.classList.toggle('hidden', !!exactMatch && !isFormOpen);

    const dateVal = leagueDateInput.value;
    createBtn.disabled = !query || !dateVal || !!exactMatch;
    
    if (exactMatch) {
      createBtn.title = "A league with this name already exists.";
    } else if (query && !dateVal) {
      createBtn.title = "Start date is required.";
    } else {
      createBtn.title = "";
    }
  };

  filterInstance = setupLiveFilter(leagueNameInput, allLeagues, {
    labelKey: 'name',
    onFilter: onFilterUpdate
  });

  leagueDateInput.addEventListener('input', () => filterInstance.performFilter());

  const refresh = async () => {
    try {
      const data = await PB_API.getLeagues();
      // Filter out the internal 'Quick Play Sessions' league from management view
      allLeagues.length = 0;
      allLeagues.push(...data.filter(l => l.name !== 'Quick Play Sessions'));
      // Also refresh the global player cache for selection dialogs
      allPlayersCache = await PB_API.getPlayers();
      filterInstance.performFilter();
    } catch (err) {
      console.error('Failed to load leagues:', err);
    }
  };

  leagueForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = leagueNameInput.value.trim();
    const date = leagueDateInput.value;

    if (!await requireAdmin(`Enter Admin Password to create league "${name}":`)) {
      return;
    }

    const leaguePass = await showPrompt(`Set a League Password for "${name}". This will be required for scoring and setup by non-admins. (Optional)`, 'League Password', false);

    try {
      await PB_API.createLeague({ name, start_date: date, password: leaguePass });
      leagueNameInput.value = '';
      leagueDateInput.value = '';
      // Collapse creation form back down
      dateRow.classList.add('hidden');
      actionsRow.classList.add('hidden');
      createToggle.textContent = 'Create New League';
      createToggle.style.marginTop = '10px';
      leagueNameInput.after(createToggle);
      await refresh();
    } catch (err) {
      console.error('League creation failed:', err);
      alert(`Failed to create league: ${err.message}`);
    }
  });

  async function editLeague(leagueId, currentName) {
    if (!await requireAdmin(`Reset password for "${currentName}"? Enter Global Admin Password:`)) {
      return;
    }
    const newLeaguePass = await showPrompt(`Enter new League Password (or leave blank to clear):`, 'Reset League Password', false);
    
    try {
      await PB_API.updateLeague(leagueId, { reset_password: true, password: newLeaguePass });
      alert('League password updated successfully.');
      await refresh();
    } catch (err) {
      alert(`Update failed: ${err.message}`);
    }
  }

  async function renderPlayersForLeague(leagueId, leaguePlayers, allPlayers) {
    // Find the roster list specifically for this league card
    const addBtn = document.querySelector(`.league-item .add-player-btn[data-league-id="${leagueId}"]`);
    if (!addBtn) return;

    const section = addBtn.closest('.league-players-section');
    const playersListEl = section.querySelector('.league-players-list');
    const emptyNoticeEl = section.querySelector('.league-players-empty');

    playersListEl.innerHTML = '';
    if (leaguePlayers && leaguePlayers.length > 0) {
        emptyNoticeEl.classList.add('hidden');
        leaguePlayers.forEach(lp => {
            if (lp && lp.id) {
                const li = document.createElement('li');
                li.style = "display: flex; justify-content: space-between; margin-bottom: 5px; background: #f9f9f9; padding: 5px 10px; border-radius: 4px;";
                li.innerHTML = `
                    <span>${lp.player_name}</span>
                    <button class="remove-player-btn" data-league-id="${leagueId}" data-player-id="${lp.id}" data-player-name="${lp.player_name}" style="padding: 2px 8px; font-size: 0.8rem;">Delete</button>
                `;
                playersListEl.appendChild(li);
            }
        });
    } else {
        emptyNoticeEl.classList.remove('hidden');
    }

    // Attach event listeners for remove buttons
    playersListEl.querySelectorAll('.remove-player-btn').forEach(btn => {
        btn.onclick = (e) => removePlayerFromLeague(
            Number(e.target.dataset.leagueId),
            Number(e.target.dataset.playerId),
            e.target.dataset.playerName
        );
    });
  }

  async function addPlayerToLeague(leagueId, leagueName) {
    await runAuthorizedLeagueAction(leagueId, async () => {
      const league = allLeagues.find(l => l.id === leagueId);
      if (!league) return;
      
      const playersInLeague = new Set((league.players || []).map(p => p.id));
      const availablePlayers = allPlayersCache.filter(p => !playersInLeague.has(p.id));

      if (availablePlayers.length === 0) {
          alert('All available players are already in this league.');
          return;
      }

      const playerOptions = availablePlayers.map(p => ({ value: p.id, label: p.player_name }));
      const selectedPlayerId = await showPlayerSelectionDialog(
          `Add Player to ${leagueName}`,
          'Select a player to add:',
          playerOptions
      );

      if (selectedPlayerId) {
          await PB_API.addLeaguePlayer(leagueId, Number(selectedPlayerId));
          await refresh();
      }
    });
  }

  async function removePlayerFromLeague(leagueId, playerId, playerName) {
    if (!await showConfirm(`Remove ${playerName} from this league? Their scores will remain, but they will no longer be associated with this league's roster.`, 'Remove Player')) return;

    if (!await requireAdmin(`Enter Admin Password to remove ${playerName} from league:`)) {
      return;
    }

    await PB_API.removeLeaguePlayer(leagueId, playerId);
    await refresh();
  }

  async function deleteLeague(id, name) {
    if (!await showConfirm(`Are you sure you want to delete the entire league "${name}"? This will delete all associated events and target scores.`, 'Delete League')) return;
    await PB_API.deleteLeague(id);
    await refresh();
  }

  async function deleteEvent(id, leagueId, leagueName) {
    if (!await showConfirm(`Delete this event from ${leagueName}?`, 'Delete Event')) return;
    await PB_API.deleteEvent(id, leagueId);
    await refresh();
  }

  async function showEventForm(leagueId, leagueName, event = null) {
    eventFormCard.classList.remove('hidden');
    const titleEl = document.getElementById('event-form-title');
    titleEl.innerHTML = event ? `Edit Event: ${event.event_name}` : `Add Event to League: <span id="event-form-league-name">${leagueName}</span>`;
    
    document.getElementById('event-league-id').value = leagueId;
    document.getElementById('event-id').value = event ? event.id : '';
    document.getElementById('event-name').value = event ? event.event_name : '';
    document.getElementById('event-date').value = event ? (event.event_date || '') : '';

    // Populate location dropdown
    const locationSelect = document.getElementById('event-location');
    const locations = await PB_API.getLocations();
    locationSelect.innerHTML = '<option value="">Select Location (Optional)</option>';
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = loc.name;
      if (event && event.location_id == loc.id) opt.selected = true;
      locationSelect.appendChild(opt);
    });

    eventFormCard.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('cancel-event-edit').onclick = () => eventFormCard.classList.add('hidden');

  document.getElementById('event-form').onsubmit = async (e) => {
    e.preventDefault();
    const leagueId = document.getElementById('event-league-id').value;
    const eventId = document.getElementById('event-id').value;
    const name = document.getElementById('event-name').value.trim();
    const date = document.getElementById('event-date').value;
    const locationValue = document.getElementById('event-location').value;

    const payload = { 
      league_id: leagueId, 
      event_name: name, 
      event_date: date, 
      location_id: locationValue ? Number(locationValue) : null 
    };

    try {
      if (eventId) {
        await PB_API.updateEvent(eventId, payload);
      } else {
        await PB_API.createEvent(payload);
      }

      eventFormCard.classList.add('hidden');
      e.target.reset();
      await refresh();
    } catch (err) {
      console.error('Event save failed:', err);
      alert(`Failed to save event: ${err.message}`);
    }
  };

  await refresh();
}