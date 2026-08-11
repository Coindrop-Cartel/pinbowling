import { PB_API } from '@services/api.js';
import { isManagementAuthorized, runAuthorizedLeagueAction } from '@services/auth.js';
import { getCookie, getActiveLeagueId, setActiveLeagueId, setActiveEventId, setActiveLeagueIdSilent, setActiveEventIdSilent, loadPage, escapeHTML } from '@scripts/utils.js';
import { ScoringFormats, isHead2Head } from '@services/scoringFormat.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { setupLiveFilter, createSkeletonLoader } from '@ui/selectors.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { showPlayerSelectionDialog, showConfirm, showDialog } from '@ui/dialogs.js';
import { renderLeagueList, renderRegistryTeams, renderRegistryPlayers } from '@ui/lists.js';
import { updateLeagueHeaderStats, renderEventsForLeague } from '@scripts/renderers/leagueRegistryRenderer.js';
import { createLeagueFormController } from '@ui/leagueFormController.js';
import { createEventFormController } from '@ui/eventFormController.js';
import {
  startPlayoffsFlow as _startPlayoffsFlow,
  advancePlayoffsFlow as _advancePlayoffsFlow,
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
      PB_API.leagues.getAll()
    ]);
  } catch (err) { console.error('Initialization failed:', err); }

  // Guard: If we are no longer on the Leagues page, abort initialization
  if (!document.getElementById('leagues-list')) return;

  const leagueNameInput = document.getElementById('league-name');
  const leagueDateInput = document.getElementById('league-start-date');
  const createBtn = document.getElementById('create-league-btn');
  const leagueFormTitle = document.getElementById('league-form-title');
  let allPlayersCache = []; // Cache all players for selection dialogs
  let allLocationsCache = []; // Cache all locations for location name lookup

  let allLeagues = [];
  let filterInstance = null;
  let editingLeagueId = null;
  let skipScrollOnNextRender = false;
  const showArchivedCheckbox = document.getElementById('show-archived-leagues');
  let showArchived = false;

  // Setup "Create League" toggle behavior
  const leagueFormatInput = document.getElementById('league-scoring-format');
  const leagueSeasonScoringInput = document.getElementById('league-season-scoring');
  const leagueWeeklyPointsInput = document.getElementById('league-weekly-points');
  const leaguePointSpreadInput = document.getElementById('league-point-spread');
  const leagueCompetitionInput = document.getElementById('league-competition');
  const leagueParticipantsInput = document.getElementById('league-participants');
  const leagueDropLowestInput = document.getElementById('league-drop-weeks');
  const leagueWeeksInput = document.getElementById('league-weeks-in-season');
  const leagueInningsInput = document.getElementById('league-rounds-per-game');

  const getParticipantMeta = (league) => {
    if (league?.participationType === 'team') return { mode: 'Team', countLabel: 'Teams', count: league.teams?.length || 0, listLabel: 'Teams', emptyLabel: 'teams' };
    if (isHead2Head(league?.competitionFormat)) return { mode: 'Head-to-head', countLabel: 'Players', count: league.players?.length || 0, listLabel: 'Roster', emptyLabel: 'players' };
    return { mode: 'Individual', countLabel: 'Players', count: league?.players?.length || 0, listLabel: 'Roster', emptyLabel: 'players' };
  };

  const getLocationName = (id) => {
    const loc = allLocationsCache.find(l => String(l.id) === String(id));
    return loc ? loc.name : id;
  };

  const leagueFormController = createLeagueFormController({
    leagueForm,
    createToggle,
    leagueNameInput,
    leagueDateInput,
    createBtn,
    leagueFormTitle,
    leagueFormatInput,
    leagueSeasonScoringInput,
    leagueWeeklyPointsInput,
    leaguePointSpreadInput,
    leagueCompetitionInput,
    leagueParticipantsInput,
    leagueDropLowestInput,
    leagueWeeksInput,
    leagueInningsInput
  }, {
    isAuthorized: () => isAuthorized,
    applyPreferredTheme,
    PB_API,
    onSaveSuccess: async () => {
      skipScrollOnNextRender = true;
      await refresh();
    },
    onEditTriggered: () => {
      skipScrollOnNextRender = true;
      if (filterInstance) filterInstance.performFilter();
      skipScrollOnNextRender = false;
    }
  });

  const eventFormController = createEventFormController({
    eventFormCard,
    eventForm: document.getElementById('event-form')
  }, {
    isAuthorized: () => isAuthorized,
    PB_API,
    applyPreferredTheme,
    escapeHTML,
    getLeagueLocationIds: (leagueId) => {
      const league = allLeagues.find(l => String(l.id) === String(leagueId));
      return (league?.locationIds || []).map(String);
    },
    getLeagueScoringFormat: (leagueId) => {
      const league = allLeagues.find(l => String(l.id) === String(leagueId));
      return league?.scoringFormat;
    },
    onSaveSuccess: async (leagueId, eventId, payload) => {
      const league = allLeagues.find(l => String(l.id) === String(leagueId));
      if (league) {
        if (!league.events) league.events = [];
        const existingIdx = league.events.findIndex(ev => String(ev.id) === String(eventId));
        if (existingIdx !== -1) {
          league.events[existingIdx] = { ...league.events[existingIdx], ...payload, id: Number(eventId) };
        } else {
          league.events.push({ ...payload, id: Number(eventId) });
        }
        renderEventsForLeagueLocal(Number(leagueId), league.events, league.name);
        updateLeagueHeaderStats(Number(leagueId), league, getParticipantMeta, getLocationName);
      }
      applyPreferredTheme(ScoringFormats.resolve(getCookie('pb_preferred_format')));
    }
  });

  /**
   * Renders the league list based on filtering.
   * Handles the "X matches found" logic and duplicate prevention.
   */
  const buildListCallbacks = (filtered = allLeagues, query = '') => ({
    isAuthorized,
    activeLeagueId: getActiveLeagueId(),
    onHeaderClick: (league) => {
      const currentActive = getActiveLeagueId();
      setActiveLeagueId(String(currentActive) === String(league.id) ? null : league.id);
      onFilterUpdate(filtered, query);
    },
    onEditLeague: (l) => leagueFormController.editLeague(l),
    onAddEvent: (leagueId, leagueName) => eventFormController.showEventForm(leagueId, leagueName),
    onDeleteLeague: deleteLeague,
    onArchiveLeague: archiveLeague,
    onAddPlayer: addPlayerToLeague,
    onAddTeam: addTeamToLeagueLocal,
    onSetupEvent: (eventId, leagueId) => {
      setActiveLeagueIdSilent(leagueId);
      setActiveEventIdSilent(eventId);
      loadPage(ROUTE_PATHS.LEAGUE_SETUP({ leagueId, eventId }));
    },
    onEditEvent: (leagueId, leagueName, ev) => eventFormController.showEventForm(leagueId, leagueName, ev),
    onDeleteEvent: (eventId, leagueId, leagueName) => deleteEvent(eventId, leagueId, leagueName),
    onRemoveTeam: (leagueId, teamId, teamName) => removeTeamFromLeagueLocal(leagueId, teamId, teamName),
    onRemovePlayer: (leagueId, playerId, playerName) => removePlayerFromLeague(leagueId, playerId, playerName),
    onStartPlayoffs: startPlayoffsFlow,
    onAdvancePlayoffs: advancePlayoffsFlow,
    onUpdateSeason: updateSeasonFlow,
    onPrintSeasonResults: printSeasonResultsFlow,
    getParticipantMeta,
    getLocationName,
    skipScroll: skipScrollOnNextRender
  });

  const onFilterUpdate = (filtered, query) => {
    const activeLeagueId = getActiveLeagueId();

    const displayLeagues = showArchived ? filtered : filtered.filter(l => l.status !== 'archived');

    if (displayLeagues.length === 0) {
      leaguesList.innerHTML = '';
      emptyNotice.classList.remove('hidden');
      emptyNotice.textContent = allLeagues.length === 0 ? 'No leagues created yet.' : 'No matching leagues found.';
    } else {
      emptyNotice.classList.add('hidden');
      renderLeagueList(leaguesList, displayLeagues, buildListCallbacks(displayLeagues, query));
    }

    // Duplicate Name Prevention
    const exactMatch = allLeagues.find(l => l.name.trim().toLowerCase() === query);
    const editingLeagueId = leagueFormController.getEditingLeagueId();
    const dateRow = leagueFormController.getDateRow();
    const isEditingThis = exactMatch && String(exactMatch.id) === String(editingLeagueId);

    // Hide the "Create" toggle if an exact match exists, unless the creation 
    // form is already open (in which case the button serves as "Cancel").
    const isFormOpen = dateRow && !dateRow.classList.contains('hidden');
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

  if (showArchivedCheckbox) {
    showArchivedCheckbox.addEventListener('change', () => {
      showArchived = showArchivedCheckbox.checked;
      filterInstance.performFilter();
    });
  }

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

      // Refresh the global locations cache for location name resolution
      const locationsRaw = await PB_API.locations.getAll();
      allLocationsCache = Array.isArray(locationsRaw) ? locationsRaw : [];

      filterInstance.setData(allLeagues);
      filterInstance.performFilter();
    } catch (err) {
      console.error('Failed to load leagues:', err);
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
      onEditEvent: (ev) => eventFormController.showEventForm(leagueId, leagueName, ev),
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
        updateLeagueHeaderStats(leagueId, league, getParticipantMeta, getLocationName);
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
        updateLeagueHeaderStats(leagueId, league, getParticipantMeta, getLocationName);
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
        updateLeagueHeaderStats(leagueId, league, getParticipantMeta, getLocationName);
      }
    });
  }

  async function startPlayoffsFlow(leagueId) {
    await _startPlayoffsFlow({ leagueId, allLeagues, loaderParent: leaguesList, onComplete: refresh });
  }

  async function advancePlayoffsFlow(leagueId, nextRoundName) {
    await _advancePlayoffsFlow({ leagueId, nextRoundName, loaderParent: leaguesList, onComplete: refresh });
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
        updateLeagueHeaderStats(leagueId, league, getParticipantMeta, getLocationName);
      }
    });
  }

  async function archiveLeague(league) {
    const newStatus = league.status === 'archived' ? 'active' : 'archived';
    const actionLabel = newStatus === 'archived' ? 'archive' : 'unarchive';
    if (!await showConfirm(`Are you sure you want to ${actionLabel} "${league.name}"?`, actionLabel === 'archive' ? 'Archive League' : 'Unarchive League')) return;

    await runAuthorizedLeagueAction(league.id, async () => {
      league.status = newStatus;
      await PB_API.leagues.updateStatus(league.id, newStatus);
      await refresh();
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
              renderLeagueList(leaguesList, allLeagues, buildListCallbacks(allLeagues, leagueNameInput.value.trim().toLowerCase()));
              skipScrollOnNextRender = false;
          }
          updateLeagueHeaderStats(leagueId, league, getParticipantMeta, getLocationName);
      }
    });
  }

  const archivedLabel = document.getElementById('show-archived-label');
  if (archivedLabel) archivedLabel.classList.toggle('hidden', !isAuthorized);

  await refresh(leaguesData);
}
