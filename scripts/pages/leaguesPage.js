import { PB_API } from '@services/api.js';
import { isManagementAuthorized, runAuthorizedLeagueAction } from '@services/auth.js';
import { getCookie, getActiveLeagueId, setActiveLeagueId, setActiveEventId, loadPage, escapeHTML } from '@scripts/utils.js';
import { SCORING_FORMATS } from '@core/engine.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { setupLiveFilter } from '@ui/selectors.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { showPlayerSelectionDialog, showConfirm } from '@ui/dialogs.js';
import { renderLeagueList, renderRegistryTeams, renderRegistryPlayers } from '@ui/lists.js';

/**
 * Logic for managing Leagues and Events.
 * @module pages/leagues
 */

/**
 * Initializes the Leagues page: loads leagues, binds CRUD controls, and renders the league list.
 * @async
 * @returns {Promise<void>}
 */
export async function initLeaguesPage() {
  const leagueForm = document.getElementById('league-form');
  const createToggle = document.getElementById('create-league-toggle');
  const leaguesList = document.getElementById('leagues-list');
  const emptyNotice = document.getElementById('leagues-list-empty');
  const eventFormCard = document.getElementById('event-form-card');

  let isAuthorized = false;
  let leaguesData = [];
  try {
    [isAuthorized, leaguesData] = await Promise.all([
      isManagementAuthorized(),
      PB_API.leagues.getAll({ type: 'standard' })
    ]);
  } catch (err) { console.error('Initialization failed:', err); }

  const leagueNameInput = document.getElementById('league-name');
  const leagueDateInput = document.getElementById('league-start-date');
  const createBtn = document.getElementById('create-league-btn');
  const leagueFormTitle = document.getElementById('league-form-title');
  let allPlayersCache = []; // Cache all players for selection dialogs

  let allLeagues = [];
  let filterInstance = null;
  let editingLeagueId = null;

  // Setup "Create League" toggle behavior
  const dateRow = leagueDateInput.closest('.form-row');
  const formatRow = document.getElementById('league-format-row');
  const leagueFormatInput = document.getElementById('league-scoring-format');
  const leagueSeasonScoringInput = document.getElementById('league-season-scoring');
  const seasonScoringRow = document.getElementById('league-season-scoring-row');
  const leagueParticipantsInput = document.getElementById('league-participants');
  const participantsRow = document.getElementById('league-participants-row');
  const leagueDropLowestInput = document.getElementById('league-drop-weeks');
  const dropLowestRow = document.getElementById('league-drop-weeks-row');

  const getParticipantMeta = (league) => {
    if (league?.participants === 'team') return { mode: 'Team', countLabel: 'Teams', count: league.teams?.length || 0, listLabel: 'Teams', emptyLabel: 'teams' };
    if (league?.participants === 'head2head') return { mode: 'Head-to-head', countLabel: 'Players', count: league.players?.length || 0, listLabel: 'Roster', emptyLabel: 'players' };
    return { mode: 'Individual', countLabel: 'Players', count: league?.players?.length || 0, listLabel: 'Roster', emptyLabel: 'players' };
  };

  const syncParticipantDefault = () => {
    if (!leagueParticipantsInput || editingLeagueId) return;
    if (leagueFormatInput?.value === 'baseball') leagueParticipantsInput.value = 'head2head';
  };

  if (leagueFormatInput) {
    const preferredFormat = getCookie('pb_preferred_format') || 'bowling';
    leagueFormatInput.innerHTML = SCORING_FORMATS
      .filter(f => f.value !== 'baseball') // Exclude baseball for leagues
      .map(f => 
        `<option value="${f.value}" ${f.value === preferredFormat ? 'selected' : ''}>${f.label}</option>`
      ).join('');
    leagueFormatInput.onchange = () => {
      syncParticipantDefault();
      applyPreferredTheme(leagueFormatInput.value);
    };
  }

  if (leagueSeasonScoringInput) {
    leagueSeasonScoringInput.innerHTML = `
      <option value="weekly" selected>Weekly Points</option>
      <option value="cumulative">Cumulative Total</option>
    `;
  }

  const eventFormatInput = document.getElementById('event-scoring-format');
  if (eventFormatInput) {
    eventFormatInput.onchange = () => applyPreferredTheme(eventFormatInput.value);
  }

  const actionsRow = createBtn?.closest('.form-actions');
  
  // Initially hide the creation fields
  if (dateRow) dateRow.classList.add('hidden');
  if (formatRow) formatRow.classList.add('hidden');
  if (participantsRow) participantsRow.classList.add('hidden');
  if (seasonScoringRow) seasonScoringRow.classList.add('hidden');
  if (dropLowestRow) dropLowestRow.classList.add('hidden');
  if (actionsRow) actionsRow.classList.add('hidden');

  // REVEAL-ONLY: Only show the management card if authorized.
  // Standard: Card should be hidden in PHP via class="card hidden".
  if (isAuthorized && leagueForm) {
    leagueForm.closest('.card').classList.remove('hidden');
  }

  if (createToggle && isAuthorized) {
    createToggle.onclick = () => {
      const isHidden = dateRow.classList.contains('hidden');
      if (!isHidden || editingLeagueId) {
        resetForm();
      } else {
        dateRow.classList.remove('hidden');
        formatRow.classList.remove('hidden');
        if (participantsRow) participantsRow.classList.remove('hidden');
        if (seasonScoringRow) seasonScoringRow.classList.remove('hidden');
        if (dropLowestRow) dropLowestRow.classList.remove('hidden');
        actionsRow.classList.remove('hidden');
        createToggle.classList.replace('mt-10', 'mt-0');
        actionsRow.appendChild(createToggle);
        createToggle.textContent = 'Cancel';
        if (leagueFormatInput) applyPreferredTheme(leagueFormatInput.value);
      }
    };
    // Only reveal toggle after logic is bound
    createToggle.classList.remove('hidden');
  }

  function resetForm() {
    editingLeagueId = null;
    leagueForm.reset();
    if (leagueFormTitle) leagueFormTitle.textContent = 'Create League';
    createBtn.textContent = 'Save League';

    dateRow.classList.add('hidden');
    formatRow.classList.add('hidden');
    if (participantsRow) participantsRow.classList.add('hidden');
    if (seasonScoringRow) seasonScoringRow.classList.add('hidden');
    if (dropLowestRow) dropLowestRow.classList.add('hidden');
    actionsRow.classList.add('hidden');

    if (createToggle) {
      createToggle.textContent = 'Create League';
      createToggle.classList.replace('mt-0', 'mt-10');
      leagueNameInput.after(createToggle);
    }
    applyPreferredTheme(getCookie('pb_preferred_format') || 'bowling');
  }

  function editLeague(league) {
    editingLeagueId = league.id;
    leagueNameInput.value = league.name;
    leagueDateInput.value = league.startDate || '';
    leagueFormatInput.value = league.scoringFormat || 'bowling';
    if (leagueParticipantsInput) leagueParticipantsInput.value = league.participants || 'individual';
    if (leagueSeasonScoringInput) leagueSeasonScoringInput.value = league.seasonScoring || 'weekly';
    if (leagueDropLowestInput) leagueDropLowestInput.value = league.dropLowestWeeks || 0;

    createBtn.textContent = 'Update League';
    if (leagueFormTitle) leagueFormTitle.textContent = `Edit League: ${league.name}`;

    dateRow.classList.remove('hidden');
    formatRow.classList.remove('hidden');
    if (participantsRow) participantsRow.classList.remove('hidden');
    if (seasonScoringRow) seasonScoringRow.classList.remove('hidden');
    if (dropLowestRow) dropLowestRow.classList.remove('hidden');
    actionsRow.classList.remove('hidden');
    
    if (createToggle) {
      createToggle.textContent = 'Cancel';
      createToggle.classList.replace('mt-10', 'mt-0');
      actionsRow.appendChild(createToggle);
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
    applyPreferredTheme(leagueFormatInput.value);
  }

  /**
   * Renders the league list based on filtering.
   * Handles the "X matches found" logic and duplicate prevention.
   */
  const onFilterUpdate = (filtered, query) => {
    const activeLeagueId = getActiveLeagueId();

    if (filtered.length === 0) {
      leaguesList.innerHTML = '';
      emptyNotice.classList.remove('hidden');
      emptyNotice.textContent = allLeagues.length === 0 ? 'No leagues created yet.' : 'No matching leagues found.';
    } else {
      emptyNotice.classList.add('hidden');
      renderLeagueList(leaguesList, filtered, {
        isAuthorized,
        activeLeagueId,
        onHeaderClick: (league) => {
          const currentActive = getActiveLeagueId();
          setActiveLeagueId(String(currentActive) === String(league.id) ? null : league.id);
          onFilterUpdate(filtered, query);
        },
        onEditLeague: editLeague,
        onAddEvent: showEventForm,
        onDeleteLeague: deleteLeague,
        onAddPlayer: addPlayerToLeague,
        onAddTeam: addTeamToLeague,
        onSetupEvent: (eventId, leagueId) => {
          setActiveLeagueId(leagueId);
          setActiveEventId(eventId);
          loadPage(ROUTE_PATHS.LEAGUE_SETUP({ leagueId, eventId }));
        },
        onEditEvent: (leagueId, leagueName, ev) => {
          showEventForm(leagueId, leagueName, ev);
        },
        onDeleteEvent: (eventId, leagueId, leagueName) => {
          deleteEvent(eventId, leagueId, leagueName);
        },
        onRemoveTeam: (leagueId, teamId, teamName) => {
          removeTeamFromLeague(leagueId, teamId, teamName);
        },
        onRemovePlayer: (leagueId, playerId, playerName) => {
          removePlayerFromLeague(leagueId, playerId, playerName);
        },
        getParticipantMeta
      });
    }

    // Duplicate Name Prevention
    const exactMatch = allLeagues.find(l => l.name.trim().toLowerCase() === query);
    const isEditingThis = exactMatch && String(exactMatch.id) === String(editingLeagueId);

    // Hide the "Create" toggle if an exact match exists, unless the creation 
    // form is already open (in which case the button serves as "Cancel").
    const isFormOpen = !dateRow.classList.contains('hidden');
    // Only show the toggle if authorized and there isn't a duplicate name conflict
    const shouldHide = !isAuthorized || (!!exactMatch && !isFormOpen && !isEditingThis);
    if (createToggle) createToggle.classList.toggle('hidden', shouldHide);

    const dateVal = leagueDateInput.value;
    createBtn.disabled = !query || !dateVal || (!!exactMatch && !isEditingThis);
    
    if (exactMatch && !isEditingThis) {
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

  leagueDateInput.oninput = () => filterInstance.performFilter();

  const refresh = async (data = null) => {
    try {
      // Fetch standard leagues only for management (one-off sessions are handled by cleanup)
      const rawData = Array.isArray(data) ? data : await PB_API.leagues.getAll({ type: 'standard' });
      const safeData = Array.isArray(rawData) ? rawData : [];

      allLeagues.length = 0;
      allLeagues.push(...safeData);

      // Also refresh the global player cache for selection dialogs
      allPlayersCache = await PB_API.players.getAll();
      
      filterInstance.setData(allLeagues);
      filterInstance.performFilter();
    } catch (err) {
      console.error('Failed to load leagues:', err);
    }
  };

  leagueForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = leagueNameInput.value.trim();
    const date = leagueDateInput.value;
    const scoringFormat = leagueFormatInput.value;
    const participants = leagueParticipantsInput?.value || 'individual';
    const seasonScoring = leagueSeasonScoringInput?.value || 'weekly';
    const dropLowestWeeks = parseInt(leagueDropLowestInput?.value || '0', 10);

    if (!isAuthorized) return;

    createBtn.disabled = true;
    createBtn.textContent = 'Saving...';

    try {
      const payload = { name, startDate: date, scoringFormat, participants, seasonScoring, dropLowestWeeks };
      if (editingLeagueId) {
        await PB_API.leagues.update(editingLeagueId, payload);
      } else {
        await PB_API.leagues.create(payload);
      }
      resetForm();
      await refresh();
    } catch (err) {
      console.error('League creation failed:', err);
      alert(`Failed to create league: ${err.message}`);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = editingLeagueId ? 'Update League' : 'Save League';
    }
  };

  function renderEventsForLeague(leagueId, leagueEvents, leagueName) {
    const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
    if (!card) return;

    const eventsListEl = card.querySelector('.league-events-list');

    eventsListEl.innerHTML = (leagueEvents || []).map(e => `
      <li class="list-item-row">
        <span>${escapeHTML(e.eventName)} <small>(${escapeHTML(e.eventDate) || 'No Date'})</small></span>
        <div class="small-action-buttons">
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
        loadPage(ROUTE_PATHS.LEAGUE_SETUP({ leagueId, eventId }));
      };
    });
    eventsListEl.querySelectorAll('.edit-event-btn').forEach(btn => {
      btn.onclick = () => showEventForm(leagueId, leagueName, leagueEvents.find(ev => ev.id === Number(btn.dataset.id)));
    });
    eventsListEl.querySelectorAll('.delete-event-btn').forEach(btn => {
      btn.onclick = (e) => deleteEvent(Number(e.target.dataset.id), leagueId, leagueName);
    });
  }

  async function addTeamToLeague(leagueId, leagueName) {
    const league = allLeagues.find(l => l.id === leagueId);
    if (!league) return;
    
    const teamsInLeague = new Set((league.teams || []).map(t => t.id));
    const allTeams = await PB_API.teams.getAll();
    const availableTeams = allTeams.filter(t => !teamsInLeague.has(t.id));

    if (availableTeams.length === 0) {
        alert('All available teams are already in this league.');
        return;
    }

    const teamOptions = availableTeams.map(t => ({ value: t.id, label: `${t.name} (${t.city || 'No City'})` }));
    const selectedTeamId = await showPlayerSelectionDialog(
        `Add Team to ${leagueName}`,
        'Select a team to add:',
        teamOptions,
        'Add Team'
    );

    if (selectedTeamId) {
        await PB_API.teams.addToLeague(leagueId, Number(selectedTeamId));
        const team = allTeams.find(t => t.id === Number(selectedTeamId));
        if (team) {
            if (!league.teams) league.teams = [];
            league.teams.push(team);
            const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
            if (card) {
                renderRegistryTeams(card, league.teams, {
                    isAuthorized,
                    onRemoveTeam: (teamId, teamName) => removeTeamFromLeague(leagueId, teamId, teamName)
                });
            }
            updateLeagueHeaderStats(leagueId, league);
        }
    }
  }

  async function removeTeamFromLeague(leagueId, teamId, teamName) {
    if (!await showConfirm(`Remove "${teamName}" from this league?`, 'Remove Team')) return;
    await runAuthorizedLeagueAction(leagueId, async () => {
      await PB_API.teams.removeFromLeague(leagueId, teamId);
      const league = allLeagues.find(l => l.id === leagueId);
      if (league && league.teams) {
          league.teams = league.teams.filter(t => t.id !== teamId);
          const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
          if (card) {
              renderRegistryTeams(card, league.teams, {
                  isAuthorized,
                  onRemoveTeam: (tId, tName) => removeTeamFromLeague(leagueId, tId, tName)
              });
          }
          updateLeagueHeaderStats(leagueId, league);
      }
    });
  }

  function updateLeagueHeaderStats(leagueId, league) {
    const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
    if (!card) return;

    const statsEl = card.querySelector('.league-header small');
    if (statsEl) {
      const participantMeta = getParticipantMeta(league);

      statsEl.textContent = `Started: ${league.startDate || 'N/A'} | ${participantMeta.mode} | Events: ${league.events?.length || 0} | ${participantMeta.countLabel}: ${participantMeta.count} | Scoring: ${league.seasonScoring === 'weekly' ? 'Weekly' : 'Cumulative'}${league.dropLowestWeeks > 0 ? ` | Drop: ${league.dropLowestWeeks}` : ''}`;
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
        playerOptions,
        'Add Player'
    );

    if (selectedPlayerId) {
        await PB_API.leagues.addPlayer(leagueId, Number(selectedPlayerId));

        // Update local data and UI without a full refresh
        const player = allPlayersCache.find(p => p.id === Number(selectedPlayerId));
        if (player) {
            if (!league.players) league.players = [];
            league.players.push(player);
            league.players.sort((a, b) => a.playerName.localeCompare(b.playerName));
            const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
            if (card) {
                renderRegistryPlayers(card, league.players, {
                    isAuthorized,
                    onRemovePlayer: (playerId, playerName) => removePlayerFromLeague(leagueId, playerId, playerName)
                });
            }
            updateLeagueHeaderStats(leagueId, league);
        }
    }
  }

  async function removePlayerFromLeague(leagueId, playerId, playerName) {
    if (!await showConfirm(`Remove ${playerName} from this league? Their scores will remain, but they will no longer be associated with this league's roster.`, 'Remove Player')) return;

    await runAuthorizedLeagueAction(leagueId, async () => {
      await PB_API.leagues.removePlayer(leagueId, playerId);

      // Update local data and UI without a full refresh
      const league = allLeagues.find(l => l.id === leagueId);
      if (league && league.players) {
          league.players = league.players.filter(p => p.id !== playerId);
          const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
          if (card) {
              renderRegistryPlayers(card, league.players, {
                  isAuthorized,
                  onRemovePlayer: (pId, pName) => removePlayerFromLeague(leagueId, pId, pName)
              });
          }
          updateLeagueHeaderStats(leagueId, league);
      }
    });
  }

  async function deleteLeague(id, name) {
    if (!await showConfirm(`Are you sure you want to delete the entire league "${name}"? This will delete all associated events and target scores.`, 'Delete League')) return;

    await runAuthorizedLeagueAction(id, async () => {
      await PB_API.leagues.delete(id);
      await refresh();
    });
  }

  async function deleteEvent(id, leagueId, leagueName) {
    if (!await showConfirm(`Delete this event from ${leagueName}?`, 'Delete Event')) return;
    
    await runAuthorizedLeagueAction(leagueId, async () => {
      await PB_API.events.delete(id, leagueId);

      // Update local data and UI without a full refresh
      const league = allLeagues.find(l => l.id === leagueId);
      if (league && league.events) {
          league.events = league.events.filter(e => e.id !== id);
          const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
          if (card) {
              renderLeagueList(leaguesList, allLeagues, {
                isAuthorized,
                activeLeagueId: getActiveLeagueId(),
                onHeaderClick: (lg) => {
                  const currentActive = getActiveLeagueId();
                  setActiveLeagueId(String(currentActive) === String(lg.id) ? null : lg.id);
                  onFilterUpdate(allLeagues, filterInstance.getQuery());
                },
                onEditLeague: editLeague,
                onAddEvent: showEventForm,
                onDeleteLeague: deleteLeague,
                onAddPlayer: addPlayerToLeague,
                onAddTeam: addTeamToLeague,
                onSetupEvent: (evId, lgId) => {
                  setActiveLeagueId(lgId);
                  setActiveEventId(evId);
                  loadPage(ROUTE_PATHS.LEAGUE_SETUP({ leagueId: lgId, eventId: evId }));
                },
                onEditEvent: (lgId, lgName, ev) => showEventForm(lgId, lgName, ev),
                onDeleteEvent: (evId, lgId, lgName) => deleteEvent(evId, lgId, lgName),
                onRemoveTeam: (lgId, teamId, teamName) => removeTeamFromLeague(lgId, teamId, teamName),
                onRemovePlayer: (lgId, playerId, playerName) => removePlayerFromLeague(lgId, playerId, playerName),
                getParticipantMeta
              });
          }
          updateLeagueHeaderStats(leagueId, league);
      }
    });
  }

  async function showEventForm(leagueId, leagueName, event = null) {
    eventFormCard.classList.remove('hidden');
    const titleEl = document.getElementById('event-form-title');
    titleEl.innerHTML = event ? `Edit Event: ${escapeHTML(event.eventName)}` : `Add Event to League: <span id="event-form-league-name">${escapeHTML(leagueName)}</span>`;
    
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
    const locations = await PB_API.locations.getAll();
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
        result = await PB_API.events.update(eventId, payload);
      } else {
        result = await PB_API.events.create(payload);
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

  await refresh(leaguesData);
}
