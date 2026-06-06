import { PB_API } from '@services/api.js';
import { SCORING_FORMATS } from '@core/engine.js';
import { setupLiveFilter, createExpandableRow } from '@ui/selectors.js';
import { showConfirm, showPrompt, showPlayerSelectionDialog } from '@ui/dialogs.js';
import { runAuthorizedLeagueAction, isManagementAuthorized } from '@services/auth.js';
import { navigateTo, getActiveLeagueId, setActiveLeagueId, setActiveEventId, getCookie } from '@scripts/utils.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { ROUTES } from '@scripts/routes.js';

/**
 * Logic for managing Leagues and Events.
 */
export async function initLeaguesPage() {
  const isAuthorized = await isManagementAuthorized();
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
  const formatRow = document.getElementById('league-format-row');
  const leagueFormatInput = document.getElementById('league-scoring-format');

  if (leagueFormatInput) {
    const preferredFormat = getCookie('pb_preferred_format') || 'bowling';
    leagueFormatInput.innerHTML = SCORING_FORMATS.map(f => 
      `<option value="${f.value}" ${f.value === preferredFormat ? 'selected' : ''}>${f.label}</option>`
    ).join('');
    leagueFormatInput.addEventListener('change', () => applyPreferredTheme(leagueFormatInput.value));
  }

  const eventFormatInput = document.getElementById('event-scoring-format');
  if (eventFormatInput) {
    eventFormatInput.addEventListener('change', () => applyPreferredTheme(eventFormatInput.value));
  }

  const actionsRow = createBtn.closest('.form-actions');
  
  // Initially hide the creation fields
  if (dateRow) dateRow.classList.add('hidden');
  if (actionsRow) actionsRow.classList.add('hidden');

  let createToggle = null;
  if (isAuthorized) {
    createToggle = document.createElement('button');
    createToggle.type = 'button';
    createToggle.className = 'secondary btn-mgmt';
    createToggle.textContent = 'Create New League';
    createToggle.style.marginTop = '10px';
    if (leagueNameInput) leagueNameInput.after(createToggle);

    createToggle.onclick = () => {
      const isHidden = dateRow.classList.contains('hidden');
      dateRow.classList.toggle('hidden', !isHidden);
      formatRow.classList.toggle('hidden', !isHidden);
      actionsRow.classList.toggle('hidden', !isHidden);
      if (isHidden) {
        createToggle.textContent = 'Cancel';
        createToggle.style.marginTop = '0';
        actionsRow.appendChild(createToggle);
        if (leagueFormatInput) applyPreferredTheme(leagueFormatInput.value);
      } else {
        createToggle.textContent = 'Create New League';
        createToggle.style.marginTop = '10px';
        leagueNameInput.after(createToggle);
        applyPreferredTheme(getCookie('pb_preferred_format') || 'bowling');
      }
    };
  }

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

        const headerHtml = `
          <div>
            <h3 style="margin: 0; font-size: 1.05rem;">${league.name}</h3>
            <small>Started: ${league.startDate || 'N/A'} | Events: ${league.events?.length || 0} | Players: ${league.players?.length || 0}</small>
          </div>
          <div style="display: flex; gap: 8px;">
            ${isAuthorized ? '<button class="delete-league-btn btn-row">Delete</button>' : ''}
          </div>
        `;

        const contentHtml = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4 style="margin: 0;">Events</h4>
            ${isAuthorized ? `<button class="add-event-btn secondary btn-row" data-league-id="${league.id}" data-league-name="${league.name}">Add Event</button>` : ''}
          </div>
          <ul class="league-events-list" style="list-style: none; padding: 0;"></ul>

          <div class="league-players-section" style="margin-top: 20px; border-top: 1px solid #ccc; padding-top: 15px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <h4 style="margin: 0;">Roster</h4>
              ${isAuthorized ? `<button class="add-player-btn secondary btn-row" data-league-id="${league.id}" data-league-name="${league.name}">Add Player</button>` : ''}
            </div>
            <ul class="league-players-list" style="list-style: none; padding: 0;"></ul>
            <div class="notice league-players-empty hidden">No players assigned to this league.</div>
          </div>
        `;

        const row = createExpandableRow(leaguesList, {
          id: league.id,
          className: 'league-registry-item',
          headerHtml,
          contentHtml,
          isExpanded: shouldExpand,
          onHeaderClick: (e) => {
            if (e.target.closest('button')) return;
            const currentActive = getActiveLeagueId();
            setActiveLeagueId(String(currentActive) === String(league.id) ? null : league.id);
            onFilterUpdate(filtered, query);
          }
        });

        // Ensure compatibility with existing component renderers
        row.dataset.leagueId = league.id;

        // Action listeners
        if (isAuthorized) {
          row.querySelector('.add-event-btn').onclick = () => showEventForm(league.id, league.name);
          row.querySelector('.delete-league-btn').onclick = () => deleteLeague(league.id, league.name);
          row.querySelector('.add-player-btn').onclick = () => addPlayerToLeague(league.id, league.name);
        }

        renderEventsForLeague(league.id, league.events, league.name);
        if (shouldExpand) renderPlayersForLeague(league.id, league.players, allPlayersCache);

        // Smooth scroll to the expanded league if we just came from setup
        if (shouldExpand && !query) {
          setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
        }
      });
    }

    // Duplicate Name Prevention
    const exactMatch = allLeagues.find(l => l.name.trim().toLowerCase() === query);

    // Hide the "Create" toggle if an exact match exists, unless the creation 
    // form is already open (in which case the button serves as "Cancel").
    const isFormOpen = !dateRow.classList.contains('hidden');
    if (createToggle) createToggle.classList.toggle('hidden', !!exactMatch && !isFormOpen);

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
      // Fetch standard leagues only for management (one-off sessions are handled by cleanup)
      const data = await PB_API.getLeagues({ type: 'standard' });
      allLeagues.length = 0;
      allLeagues.push(...data);
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
    const scoringFormat = leagueFormatInput.value;

    if (!isAuthorized) return;

    try {
      await PB_API.createLeague({ name, startDate: date, scoringFormat });
      leagueNameInput.value = '';
      leagueDateInput.value = '';
      // Collapse creation form back down
      dateRow.classList.add('hidden');
      formatRow.classList.add('hidden');
      actionsRow.classList.add('hidden');
      createToggle.textContent = 'Create New League';
      createToggle.style.marginTop = '10px';
      leagueNameInput.after(createToggle);
      applyPreferredTheme(getCookie('pb_preferred_format') || 'bowling');
      await refresh();
    } catch (err) {
      console.error('League creation failed:', err);
      alert(`Failed to create league: ${err.message}`);
    }
  });

  function renderEventsForLeague(leagueId, leagueEvents, leagueName) {
    const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
    if (!card) return;

    const eventsListEl = card.querySelector('.league-events-list');

    eventsListEl.innerHTML = (leagueEvents || []).map(e => `
      <li style="display: flex; justify-content: space-between; margin-bottom: 5px; background: #f9f9f9; padding: 5px 10px; border-radius: 4px;">
        <span>${e.eventName} <small>(${e.eventDate || 'No Date'})</small></span>
        <div style="display: flex; gap: 4px;">
          ${isAuthorized ? `<button class="setup-event-btn secondary btn-row" data-league-id="${leagueId}" data-event-id="${e.id}">Setup</button>` : ''}
          ${isAuthorized ? `<button class="edit-event-btn secondary btn-row" data-id="${e.id}">Edit</button>` : ''}
          ${isAuthorized ? `<button class="delete-event-btn btn-row" data-id="${e.id}">Delete</button>` : ''}
        </div>
      </li>
    `).join('') || '<li>No events scheduled.</li>';

    // Attach listeners
    eventsListEl.querySelectorAll('.setup-event-btn').forEach(btn => {
      btn.onclick = () => {
        const eventId = Number(btn.dataset.eventId);
        setActiveLeagueId(leagueId);
        setActiveEventId(eventId);
        navigateTo(ROUTES.LEAGUE_SETUP({ leagueId, eventId }));
      };
    });
    eventsListEl.querySelectorAll('.edit-event-btn').forEach(btn => {
      btn.onclick = () => showEventForm(leagueId, leagueName, leagueEvents.find(ev => ev.id === Number(btn.dataset.id)));
    });
    eventsListEl.querySelectorAll('.delete-event-btn').forEach(btn => {
      btn.onclick = (e) => deleteEvent(Number(e.target.dataset.id), leagueId, leagueName);
    });
  }

  async function renderPlayersForLeague(leagueId, leaguePlayers, allPlayers) {
    // Find the roster list specifically for this league card
    const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
    if (!card) return;

    const section = card.querySelector('.league-players-section');
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
                    <span>${lp.playerName}</span>
                    ${isAuthorized ? `<button class="remove-player-btn btn-row" data-league-id="${leagueId}" data-player-id="${lp.id}" data-player-name="${lp.playerName}">Delete</button>` : ''}
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

  function updateLeagueHeaderStats(leagueId, league) {
    const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
    if (!card) return;

    const statsEl = card.querySelector('.league-header small');
    if (statsEl) {
      statsEl.textContent = `Started: ${league.startDate || 'N/A'} | Events: ${league.events?.length || 0} | Players: ${league.players?.length || 0}`;
    }
  }

  async function addPlayerToLeague(leagueId, leagueName) {
    const league = allLeagues.find(l => l.id === leagueId);
    if (!league) return;
    
    const playersInLeague = new Set((league.players || []).map(p => p.id));
    const availablePlayers = allPlayersCache.filter(p => !playersInLeague.has(p.id));

    if (availablePlayers.length === 0) {
        alert('All available players are already in this league.');
        return;
    }

    const playerOptions = availablePlayers.map(p => ({ value: p.id, label: p.playerName }));
    const selectedPlayerId = await showPlayerSelectionDialog(
        `Add Player to ${leagueName}`,
        'Select a player to add:',
        playerOptions
    );

    if (selectedPlayerId) {
        await PB_API.addLeaguePlayer(leagueId, Number(selectedPlayerId));

        // Update local data and UI without a full refresh
        const player = allPlayersCache.find(p => p.id === Number(selectedPlayerId));
        if (player) {
            if (!league.players) league.players = [];
            league.players.push(player);
            league.players.sort((a, b) => a.playerName.localeCompare(b.playerName));
            renderPlayersForLeague(leagueId, league.players, allPlayersCache);
            updateLeagueHeaderStats(leagueId, league);
        }
    }
  }

  async function removePlayerFromLeague(leagueId, playerId, playerName) {
    if (!await showConfirm(`Remove ${playerName} from this league? Their scores will remain, but they will no longer be associated with this league's roster.`, 'Remove Player')) return;

    await runAuthorizedLeagueAction(leagueId, async () => {
      await PB_API.removeLeaguePlayer(leagueId, playerId);

      // Update local data and UI without a full refresh
      const league = allLeagues.find(l => l.id === leagueId);
      if (league && league.players) {
          league.players = league.players.filter(p => p.id !== playerId);
          renderPlayersForLeague(leagueId, league.players, allPlayersCache);
          updateLeagueHeaderStats(leagueId, league);
      }
    });
  }

  async function deleteLeague(id, name) {
    if (!await showConfirm(`Are you sure you want to delete the entire league "${name}"? This will delete all associated events and target scores.`, 'Delete League')) return;

    await runAuthorizedLeagueAction(id, async () => {
      await PB_API.deleteLeague(id);
      await refresh();
    });
  }

  async function deleteEvent(id, leagueId, leagueName) {
    if (!await showConfirm(`Delete this event from ${leagueName}?`, 'Delete Event')) return;
    
    await runAuthorizedLeagueAction(leagueId, async () => {
      await PB_API.deleteEvent(id, leagueId);

      // Update local data and UI without a full refresh
      const league = allLeagues.find(l => l.id === leagueId);
      if (league && league.events) {
          league.events = league.events.filter(e => e.id !== id);
          renderEventsForLeague(leagueId, league.events, league.name);
          updateLeagueHeaderStats(leagueId, league);
      }
    });
  }

  async function showEventForm(leagueId, leagueName, event = null) {
    eventFormCard.classList.remove('hidden');
    const titleEl = document.getElementById('event-form-title');
    titleEl.innerHTML = event ? `Edit Event: ${event.eventName}` : `Add Event to League: <span id="event-form-league-name">${leagueName}</span>`;
    
    document.getElementById('event-league-id').value = leagueId;
    document.getElementById('event-id').value = event ? event.id : '';
    document.getElementById('event-name').value = event ? event.eventName : '';
    document.getElementById('event-date').value = event ? (event.eventDate || '') : '';

    // Populate and default the scoring format dropdown
    const formatSelect = document.getElementById('event-scoring-format');
    if (formatSelect) {
      formatSelect.innerHTML = SCORING_FORMATS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
      const format = event?.scoringFormat || getCookie('pb_preferred_format') || 'bowling';
      formatSelect.value = format;
      applyPreferredTheme(format);
    }

    // Populate location dropdown
    const locationSelect = document.getElementById('event-location');
    const locations = await PB_API.getLocations();
    locationSelect.innerHTML = '<option value="">Select Location (Optional)</option>';
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = loc.name;
      if (event && event.locationId == loc.id) opt.selected = true;
      locationSelect.appendChild(opt);
    });

    eventFormCard.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('cancel-event-edit').onclick = () => {
    eventFormCard.classList.add('hidden');
    applyPreferredTheme(getCookie('pb_preferred_format') || 'bowling');
  };

  document.getElementById('event-form').onsubmit = async (e) => {
    e.preventDefault();
    const leagueId = document.getElementById('event-league-id').value;
    const eventId = document.getElementById('event-id').value;
    const name = document.getElementById('event-name').value.trim();
    const date = document.getElementById('event-date').value;
    const locationValue = document.getElementById('event-location').value;
    const formatValue = document.getElementById('event-scoring-format')?.value;

    if (!isAuthorized) return;

    const payload = { 
      leagueId: leagueId, 
      eventName: name, 
      eventDate: date,
      scoringFormat: formatValue || 'bowling',
      locationId: locationValue ? Number(locationValue) : null
    };

    try {
      let result;
      if (eventId) {
        result = await PB_API.updateEvent(eventId, payload);
      } else {
        result = await PB_API.createEvent(payload);
      }

      eventFormCard.classList.add('hidden');
      e.target.reset();

      // Update local data and UI without a full refresh
      const league = allLeagues.find(l => String(l.id) === String(leagueId));
      if (league) {
          if (!league.events) league.events = [];
          if (eventId) {
              const idx = league.events.findIndex(ev => String(ev.id) === String(eventId));
              if (idx !== -1) league.events[idx] = { ...league.events[idx], ...payload, id: Number(eventId) };
          } else if (result && result.id) {
              league.events.push({ ...payload, id: result.id });
          }
          // Note: Sorting by date is omitted here to keep the list consistent with creation order
          renderEventsForLeague(Number(leagueId), league.events, league.name);
          updateLeagueHeaderStats(Number(leagueId), league);
      }
      applyPreferredTheme(getCookie('pb_preferred_format') || 'bowling');
    } catch (err) {
      console.error('Event save failed:', err);
      alert(`Failed to save event: ${err.message}`);
    }
  };

  await refresh();
}