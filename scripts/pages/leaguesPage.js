import { PB_API } from '@services/api.js';
import { isManagementAuthorized, runAuthorizedLeagueAction } from '@services/auth.js';
import { getCookie, getActiveLeagueId, setActiveLeagueId, setActiveEventId, setActiveLeagueIdSilent, setActiveEventIdSilent, loadPage, escapeHTML } from '@scripts/utils.js';
import { SCORING_FORMATS } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { setupLiveFilter, createSkeletonLoader } from '@ui/selectors.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { showPlayerSelectionDialog, showConfirm, showDialog } from '@ui/dialogs.js';
import { renderLeagueList, renderRegistryTeams, renderRegistryPlayers } from '@ui/lists.js';
import { updateLeagueHeaderStats, renderEventsForLeague } from '@scripts/renderers/leagueRegistryRenderer.js';
import {
  startPlayoffsFlow as _startPlayoffsFlow,
  updateSeasonFlow as _updateSeasonFlow,
  printSeasonResultsFlow as _printSeasonResultsFlow,
  addPlayerToLeague as _addPlayerToLeague,
  addTeamToLeague as _addTeamToLeague,
  removePlayerFromLeague as _removePlayerFromLeague,
  removeTeamFromLeague as _removeTeamFromLeague
} from '@services/leagueFlows.js';

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

  // Guard: If we are no longer on the Leagues page, abort initialization
  if (!document.getElementById('leagues-list')) return;

  const leagueNameInput = document.getElementById('league-name');
  const leagueDateInput = document.getElementById('league-start-date');
  const createBtn = document.getElementById('create-league-btn');
  const leagueFormTitle = document.getElementById('league-form-title');
  let allPlayersCache = []; // Cache all players for selection dialogs

  let allLeagues = [];
  let filterInstance = null;
  let editingLeagueId = null;
  let skipScrollOnNextRender = false;

  // Setup "Create League" toggle behavior
  const dateRow = leagueDateInput ? leagueDateInput.closest('.form-row') : null;
  const formatRow = document.getElementById('league-format-row');
  const leagueFormatInput = document.getElementById('league-scoring-format');
  const leagueSeasonScoringInput = document.getElementById('league-season-scoring');
  const seasonScoringRow = document.getElementById('league-season-scoring-row');
  const leagueWeeklyPointsInput = document.getElementById('league-weekly-points');
  const weeklyPointsRow = document.getElementById('league-weekly-points-row');
  const leaguePointSpreadInput = document.getElementById('league-point-spread');
  const pointSpreadRow = document.getElementById('league-point-spread-row');
  const leagueParticipantsInput = document.getElementById('league-participants');
  const participantsRow = document.getElementById('league-participants-row');
  const leagueDropLowestInput = document.getElementById('league-drop-weeks');
  const dropLowestRow = document.getElementById('league-drop-weeks-row');
  const leagueWeeksInput = document.getElementById('league-weeks-in-season');
  const weeksRow = document.getElementById('league-weeks-in-season-row');
  const leagueInningsInput = document.getElementById('league-innings-per-game');
  const inningsRow = document.getElementById('league-innings-per-game-row');

  const getParticipantMeta = (league) => {
    if (league?.participants === 'team') return { mode: 'Team', countLabel: 'Teams', count: league.teams?.length || 0, listLabel: 'Teams', emptyLabel: 'teams' };
    if (league?.participants === 'head2head') return { mode: 'Head-to-head', countLabel: 'Players', count: league.players?.length || 0, listLabel: 'Roster', emptyLabel: 'players' };
    return { mode: 'Individual', countLabel: 'Players', count: league?.players?.length || 0, listLabel: 'Roster', emptyLabel: 'players' };
  };

  const handleSeasonScoringChange = () => {
    if (!leagueSeasonScoringInput) return;
    const isWeekly = leagueSeasonScoringInput.value === 'weekly';
    const isH2H = leagueParticipantsInput?.value === 'head2head';
    if (isWeekly && !isH2H && dateRow && !dateRow.classList.contains('hidden')) {
      weeklyPointsRow?.classList.remove('hidden');
      pointSpreadRow?.classList.remove('hidden');
    } else {
      weeklyPointsRow?.classList.add('hidden');
      pointSpreadRow?.classList.add('hidden');
    }
  };

  const handleParticipantsChange = () => {
    if (!leagueParticipantsInput) return;
    const isH2H = leagueParticipantsInput.value === 'head2head';
    if (isH2H) {
      if (leagueFormatInput) {
        leagueFormatInput.value = ScoringFormats.BASEBALL;
        leagueFormatInput.disabled = true;
      }
      seasonScoringRow?.classList.add('hidden');
      dropLowestRow?.classList.add('hidden');
      weeklyPointsRow?.classList.add('hidden');
      pointSpreadRow?.classList.add('hidden');
      weeksRow?.classList.remove('hidden');
      inningsRow?.classList.remove('hidden');
    } else {
      if (leagueFormatInput) {
        leagueFormatInput.disabled = false;
        if (!editingLeagueId) {
          leagueFormatInput.value = ScoringFormats.resolve(getCookie('pb_preferred_format'));
        }
      }
      if (dateRow && !dateRow.classList.contains('hidden')) {
        seasonScoringRow?.classList.remove('hidden');
        dropLowestRow?.classList.remove('hidden');
        handleSeasonScoringChange();
      }
      weeksRow?.classList.add('hidden');
      inningsRow?.classList.add('hidden');
    }
  };

  if (leagueParticipantsInput) {
    leagueParticipantsInput.addEventListener('change', handleParticipantsChange);
  }

  if (leagueFormatInput) {
    const preferredFormat = ScoringFormats.resolve(getCookie('pb_preferred_format'));
    leagueFormatInput.innerHTML = SCORING_FORMATS
      .map(f => 
        `<option value="${f.value}" ${f.value === preferredFormat ? 'selected' : ''}>${f.label}</option>`
      ).join('');
    leagueFormatInput.onchange = () => {
      applyPreferredTheme(leagueFormatInput.value);
    };
  }

  if (leagueSeasonScoringInput) {
    leagueSeasonScoringInput.innerHTML = `
      <option value="weekly" selected>Weekly Points</option>
      <option value="cumulative">Cumulative Total</option>
    `;
    leagueSeasonScoringInput.onchange = handleSeasonScoringChange;
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
  if (weeklyPointsRow) weeklyPointsRow.classList.add('hidden');
  if (pointSpreadRow) pointSpreadRow.classList.add('hidden');
  if (dropLowestRow) dropLowestRow.classList.add('hidden');
  if (weeksRow) weeksRow.classList.add('hidden');
  if (inningsRow) inningsRow.classList.add('hidden');
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
        handleParticipantsChange();
        handleSeasonScoringChange();
        actionsRow.classList.remove('hidden');
        createToggle.classList.replace('mt-10', 'mt-0');
        actionsRow.appendChild(createToggle);
        createToggle.textContent = 'Cancel';
        if (leagueFormatInput) applyPreferredTheme(leagueFormatInput.value);
        if (!leagueDateInput.value) leagueDateInput.value = new Date().toISOString().split('T')[0];
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
    if (weeklyPointsRow) weeklyPointsRow.classList.add('hidden');
    if (pointSpreadRow) pointSpreadRow.classList.add('hidden');
    if (dropLowestRow) dropLowestRow.classList.add('hidden');
    if (weeksRow) weeksRow.classList.add('hidden');
    if (inningsRow) inningsRow.classList.add('hidden');
    actionsRow.classList.add('hidden');

    if (leagueFormatInput) leagueFormatInput.disabled = false;
    if (leagueParticipantsInput) leagueParticipantsInput.disabled = false;

    if (createToggle) {
      createToggle.textContent = 'Create League';
      createToggle.classList.replace('mt-0', 'mt-10');
      leagueNameInput.after(createToggle);
    }
    applyPreferredTheme(ScoringFormats.resolve(getCookie('pb_preferred_format')));
  }

  function editLeague(league) {
    editingLeagueId = league.id;
    leagueNameInput.value = league.name;
    leagueDateInput.value = league.startDate || '';
    leagueFormatInput.value = ScoringFormats.resolve(league.scoringFormat);
    if (leagueParticipantsInput) leagueParticipantsInput.value = league.participants || 'individual';
    if (leagueSeasonScoringInput) leagueSeasonScoringInput.value = league.seasonScoring || 'weekly';
    if (leagueDropLowestInput) leagueDropLowestInput.value = league.dropLowestWeeks || 0;
    if (leagueWeeklyPointsInput) leagueWeeklyPointsInput.value = league.weeklyPoints !== null && league.weeklyPoints !== undefined ? league.weeklyPoints : '';
    if (leaguePointSpreadInput) leaguePointSpreadInput.value = league.pointSpread !== null && league.pointSpread !== undefined ? league.pointSpread : '';
    if (leagueWeeksInput) leagueWeeksInput.value = league.weeksInSeason || 8;
    if (leagueInningsInput) leagueInningsInput.value = league.inningsPerGame || 2;

    createBtn.textContent = 'Update League';
    if (leagueFormTitle) leagueFormTitle.textContent = `Edit League: ${league.name}`;

    dateRow.classList.remove('hidden');
    formatRow.classList.remove('hidden');
    if (participantsRow) participantsRow.classList.remove('hidden');
    
    handleParticipantsChange();
    actionsRow.classList.remove('hidden');
    
    if (createToggle) {
      createToggle.textContent = 'Cancel';
      createToggle.classList.replace('mt-10', 'mt-0');
      actionsRow.appendChild(createToggle);
    }
    
    if (leagueForm) {
      leagueForm.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    applyPreferredTheme(leagueFormatInput.value);

    // Disable scoring format and league type if the league has events
    const hasEvents = league.events && league.events.length > 0;
    if (leagueFormatInput) leagueFormatInput.disabled = hasEvents;
    if (leagueParticipantsInput) leagueParticipantsInput.disabled = hasEvents;

    // Refresh the update button enabled/disabled state
    if (filterInstance) filterInstance.performFilter();
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
        onAddTeam: addTeamToLeagueLocal,
        onSetupEvent: (eventId, leagueId) => {
          setActiveLeagueIdSilent(leagueId);
          setActiveEventIdSilent(eventId);
          loadPage(ROUTE_PATHS.LEAGUE_SETUP({ leagueId, eventId }));
        },
        onEditEvent: (leagueId, leagueName, ev) => {
          showEventForm(leagueId, leagueName, ev);
        },
        onDeleteEvent: (eventId, leagueId, leagueName) => {
          deleteEvent(eventId, leagueId, leagueName);
        },
        onRemoveTeam: (leagueId, teamId, teamName) => {
          removeTeamFromLeagueLocal(leagueId, teamId, teamName);
        },
        onRemovePlayer: (leagueId, playerId, playerName) => {
          removePlayerFromLeague(leagueId, playerId, playerName);
        },
        onStartPlayoffs: startPlayoffsFlow,
        onUpdateSeason: updateSeasonFlow,
        onPrintSeasonResults: printSeasonResultsFlow,
        getParticipantMeta,
        skipScroll: skipScrollOnNextRender
      });
      skipScrollOnNextRender = false;
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

  if (leagueFormatInput) leagueFormatInput.addEventListener('change', () => filterInstance.performFilter());
  if (leagueSeasonScoringInput) leagueSeasonScoringInput.addEventListener('change', () => filterInstance.performFilter());
  if (leagueParticipantsInput) leagueParticipantsInput.addEventListener('change', () => filterInstance.performFilter());
  if (leagueDropLowestInput) leagueDropLowestInput.addEventListener('input', () => filterInstance.performFilter());
  if (leagueWeeksInput) leagueWeeksInput.addEventListener('input', () => filterInstance.performFilter());
  if (leagueInningsInput) leagueInningsInput.addEventListener('input', () => filterInstance.performFilter());

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
    const isH2H = participants === 'head2head';
    const isWeekly = seasonScoring === 'weekly';
    const weeksInSeason = (isH2H && leagueWeeksInput) ? parseInt(leagueWeeksInput.value, 10) : null;
    const inningsPerGame = (isH2H && leagueInningsInput) ? parseInt(leagueInningsInput.value, 10) : null;
    const weeklyPoints = (!isH2H && isWeekly && leagueWeeklyPointsInput?.value) ? parseInt(leagueWeeklyPointsInput.value, 10) : null;
    const pointSpread = (!isH2H && isWeekly && leaguePointSpreadInput?.value) ? parseInt(leaguePointSpreadInput.value, 10) : null;

    if (!isAuthorized) return;

    createBtn.disabled = true;
    createBtn.textContent = 'Saving...';

    try {
      const payload = { 
        name, 
        startDate: date, 
        scoringFormat, 
        participants, 
        seasonScoring, 
        dropLowestWeeks,
        weeksInSeason,
        inningsPerGame,
        weeklyPoints,
        pointSpread
      };
      if (editingLeagueId) {
        await PB_API.leagues.update(editingLeagueId, payload);
      } else {
        await PB_API.leagues.create(payload);
      }
      skipScrollOnNextRender = true;
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

  function renderEventsForLeagueLocal(leagueId, leagueEvents, leagueName) {
    renderEventsForLeague(leagueId, leagueEvents, {
      isAuthorized,
      onSetupEvent: (eventId, lgId) => {
        setActiveLeagueIdSilent(lgId);
        setActiveEventIdSilent(eventId);
        loadPage(ROUTE_PATHS.LEAGUE_SETUP({ leagueId: lgId, eventId }));
      },
      onEditEvent: (ev) => showEventForm(leagueId, leagueName, ev),
      onDeleteEvent: (evId) => deleteEvent(evId, leagueId, leagueName)
    });
  }

  async function addTeamToLeagueLocal(leagueId, leagueName) {
    await _addTeamToLeague({
      leagueId, leagueName, allLeagues,
      onTeamAdded: (league, team) => {
        const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
        if (card) {
          renderRegistryTeams(card, league.teams, {
            isAuthorized,
            onRemoveTeam: (teamId, teamName) => removeTeamFromLeagueLocal(leagueId, teamId, teamName)
          });
        }
        updateLeagueHeaderStats(leagueId, league, getParticipantMeta);
      }
    });
  }

  async function removeTeamFromLeagueLocal(leagueId, teamId, teamName) {
    await _removeTeamFromLeague({
      leagueId, teamId, teamName, allLeagues,
      onTeamRemoved: (league) => {
        const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
        if (card) {
          renderRegistryTeams(card, league.teams, {
            isAuthorized,
            onRemoveTeam: (tId, tName) => removeTeamFromLeagueLocal(leagueId, tId, tName)
          });
        }
        updateLeagueHeaderStats(leagueId, league, getParticipantMeta);
      }
    });
  }

  // updateLeagueHeaderStats is now imported from leagueRegistryRenderer.js

  async function addPlayerToLeague(leagueId, leagueName) {
    await _addPlayerToLeague({
      leagueId, leagueName, allLeagues, allPlayersCache, isAuthorized,
      onPlayerAdded: (league, player) => {
        const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
        if (card) {
          renderRegistryPlayers(card, league.players, {
            isAuthorized,
            onRemovePlayer: (playerId, playerName) => removePlayerFromLeague(leagueId, playerId, playerName)
          });
        }
        updateLeagueHeaderStats(leagueId, league, getParticipantMeta);
      }
    });
  }

  async function startPlayoffsFlow(leagueId) {
    await _startPlayoffsFlow({ leagueId, allLeagues, loaderParent: leaguesList, onComplete: refresh });
  }

  async function updateSeasonFlow(leagueId) {
    await _updateSeasonFlow({ leagueId, allLeagues, loaderParent: leaguesList, onComplete: refresh });
  }

  async function printSeasonResultsFlow(leagueId) {
    await _printSeasonResultsFlow({ leagueId, allLeagues, loaderParent: leaguesList });
  }

  async function removePlayerFromLeague(leagueId, playerId, playerName) {
    await _removePlayerFromLeague({
      leagueId, playerId, playerName, allLeagues,
      onPlayerRemoved: (league) => {
        const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
        if (card) {
          renderRegistryPlayers(card, league.players, {
            isAuthorized,
            onRemovePlayer: (pId, pName) => removePlayerFromLeague(leagueId, pId, pName)
          });
        }
        updateLeagueHeaderStats(leagueId, league, getParticipantMeta);
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
                onAddTeam: addTeamToLeagueLocal,
                onSetupEvent: (evId, lgId) => {
                  setActiveLeagueIdSilent(lgId);
                  setActiveEventIdSilent(evId);
                  loadPage(ROUTE_PATHS.LEAGUE_SETUP({ leagueId: lgId, eventId: evId }));
                },
                onEditEvent: (lgId, lgName, ev) => showEventForm(lgId, lgName, ev),
                onDeleteEvent: (evId, lgId, lgName) => deleteEvent(evId, lgId, lgName),
                onRemoveTeam: (lgId, teamId, teamName) => removeTeamFromLeagueLocal(lgId, teamId, teamName),
                onRemovePlayer: (lgId, playerId, playerName) => removePlayerFromLeague(lgId, playerId, playerName),
                onStartPlayoffs: startPlayoffsFlow,
                onUpdateSeason: updateSeasonFlow,
                onPrintSeasonResults: printSeasonResultsFlow,
                getParticipantMeta,
                skipScroll: skipScrollOnNextRender
              });
              skipScrollOnNextRender = false;
          }
          updateLeagueHeaderStats(leagueId, league, getParticipantMeta);
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
    document.getElementById('event-date').value = event ? (event.eventDate || '') : new Date().toISOString().split('T')[0];

    // Populate and default the scoring format dropdown
    const formatSelect = document.getElementById('event-scoring-format');
    if (formatSelect) {
      formatSelect.innerHTML = SCORING_FORMATS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
      const format = ScoringFormats.resolve(event?.scoringFormat || getCookie('pb_preferred_format'));
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
    applyPreferredTheme(ScoringFormats.resolve(getCookie('pb_preferred_format')));
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
      scoringFormat: ScoringFormats.resolve(formatValue),
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
          renderEventsForLeagueLocal(Number(leagueId), league.events, league.name);
          updateLeagueHeaderStats(Number(leagueId), league, getParticipantMeta);
      }
      applyPreferredTheme(ScoringFormats.resolve(getCookie('pb_preferred_format')));
    } catch (err) {
      console.error('Event save failed:', err);
      alert(`Failed to save event: ${err.message}`);
    } 
  };

  await refresh(leaguesData);
}
