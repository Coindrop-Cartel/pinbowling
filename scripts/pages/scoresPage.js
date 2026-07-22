import { PB_API } from '@services/api.js';
import { can, PERMISSIONS } from '@services/auth.js';
import { getSelectablePlayers, getAutoSelectedPlayerId, getSpectatorStatus } from '@services/playerSelector.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueIdSilent, setActiveEventIdSilent, formatNumber, setCurrentPlayerIdSilent, getCurrentPlayerId, escapeHTML, getActiveEventMatchupId, setActiveEventMatchupIdSilent, loadPage } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { createSearchableSelect, renderActionSummary, initTournamentSelector, createSkeletonLoader } from '@ui/selectors.js';
import { normalizeScores, normalizeTargets, groupScoresByPlayer, buildScoreMapFromDOM } from '@services/normalizer.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { printBlankScoreSheet, printScoreSheet } from '@ui/printing.js';
import { buildRoundRow } from '../renderers/roundRowRenderer.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';
import { renderStandardScoreboard, renderHead2HeadScoreboard } from '@scripts/renderers/scoreboardRenderer.js';
import { renderMatchupSchedule } from '@scripts/renderers/matchupScheduleRenderer.js';
import { ROUTE_PATHS } from '@scripts/routes.js';

/**
 * Logic for the Scores page: viewing and editing player scores across events.
 * @module pages/scores
 */

/**
 * Initializes the Scores page: loads score data, renders the score table, and binds editing controls.
 * @async
 * @returns {Promise<void>}
 */
export async function initScoresPage() {
  const roundsInput = document.getElementById('rounds-input');
  const resultsPanel = document.getElementById('results-panel');
  const resultsBody = document.getElementById('results-body');
  const totalScore = document.getElementById('total-score');
  const resultsEmpty = document.getElementById('results-empty');
  const warning = document.getElementById('player-warning');
  const playerSelect = document.getElementById('player-select');
  const playerSelectionCard = document.getElementById('player-selection-card');
  const scoringCard = document.getElementById('scoring-card');
  const resultsCard = document.getElementById('results-card');
  const tournamentSelectorUI = document.getElementById('tournament-selector-ui');
  const tournamentSummary = document.getElementById('tournament-summary');
  const playerSelectorUI = document.getElementById('player-selector-ui');
  const playerSummary = document.getElementById('player-summary');
  
  let allLeaguesCache = []; // Module-level cache for leagues
  let tournamentSelector = null;
  // Fetch leagues and current user once at the start. 
  const [leaguesFromApi, userResult] = await Promise.all([
    PB_API.leagues.getAll().catch(err => {
      console.error("Failed to fetch leagues:", err);
      return [];
    }),
    // Allow getCurrentUser to fail gracefully if the user is not logged in.
    // The rest of the page logic can then handle the null user.
    PB_API.auth.me().catch(err => {
      return null;
    })
  ]);
  const user = userResult;

  // Guard: If we are no longer on the Scores page, abort initialization
  if (!document.getElementById('rounds-input')) return;

  allLeaguesCache = leaguesFromApi; // Update the module-level cache
  // Requirement: Unregistered users only see leagues that have at least one guest player.
  // The initialLeagues filtering logic here is now handled by initTournamentSelector.

  // If we land on the scores page with a session/non-standard league active, 
  // we clear it so the selector resets and refreshes to show standard leagues.
  // EXCEPTION: If we have both leagueId and eventId, we are deep-linking from "Let's Bowl".
  let initialLeagueId = getActiveLeagueId();
  let initialEventId = getActiveEventId();

  // The "summary" eventId is a virtual ID used for the Season Summary scoreboard.
  // Scores must be entered for specific events, so we clear it if it persists from navigation.
  // Silent: we are mid-initialization; dispatching pb:pageChanged would re-trigger initApp().
  if (initialEventId === 'summary') {
    setActiveEventIdSilent('');
    initialEventId = '';
  }

  if (initialLeagueId && !initialEventId) {
    const active = allLeaguesCache.find(l => String(l.id) === String(initialLeagueId)); // Use the full cache
    if (active && active.type !== 'standard') {
      setActiveLeagueIdSilent('');
      initialLeagueId = '';
      setActiveEventIdSilent('');
      initialEventId = '';
    }
  }
  let lastEventId = initialEventId;
  let lastLeagueId = initialLeagueId;

  let playerSearchInstance = null;
  let currentUser = user;
  let activeLeague = null;
  let allPlayersCache = [];
  let selectablePlayers = [];
  let machines = [];
  let activeFormat = ScoringFormats.DEFAULT;
  let eventMatchups = [];
  let allEventScores = [];
  let activeEvent = null;
  let summaryTitle = '';

  function updateTournamentSummary() {
    const activePlayerId = getCurrentPlayerId();
    const player = allPlayersCache.find(p => String(p.id) === String(activePlayerId));
    
    renderActionSummary(tournamentSummary, summaryTitle, [
      { text: 'Change', onclick: handleTournamentChange },
      {
        text: 'Print Score Sheet',
        onclick: () => {
          const scoreMap = getScoreMapFromInputs();
          printScoreSheet(machines, activeLeague?.name, activeEvent?.eventName, activeFormat, player, scoreMap, resultsPanel ? resultsPanel.innerHTML : '');
        },
        hidden: !player || machines.length === 0 || !!getActiveEventMatchupId()
      },
      { text: 'Print Blank Score Sheet', onclick: () => printBlankScoreSheet(machines, activeLeague?.name, activeEvent?.eventName, activeFormat), hidden: machines.length === 0 || !!getActiveEventMatchupId() }
    ]);
  }

  const handleTournamentChange = () => {
    setActiveEventMatchupIdSilent('');
    tournamentSelectorUI.classList.remove('hidden');
    tournamentSummary.classList.add('hidden');
    playerSelectionCard.classList.add('hidden');
    playerSummary.classList.add('hidden');
    scoringCard.classList.add('hidden');
    resultsCard.classList.add('hidden');
    setCurrentPlayerIdSilent('');
    
    const playerSearch = document.getElementById('player-search');
    if (playerSearch) playerSearch.value = '';
    if (playerSelect) playerSelect.value = '';

    const search = document.getElementById('league-search-global');
    if (search) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
    }

    if (playerSearchInstance) {
      playerSearchInstance.updateOptions('');
    }
  };

  const handlePlayerChange = () => {
    playerSelectorUI.classList.remove('hidden');
    playerSummary.classList.add('hidden');
    scoringCard.classList.add('hidden');
    resultsCard.classList.add('hidden');

    // Clear selection context when manually changing players.
    // Use the silent variant to avoid triggering pb:pageChanged, which would
    // cause main.js to re-run initApp() and re-initialize this page.
    setCurrentPlayerIdSilent('');
    const playerSearch = document.getElementById('player-search');
    if (playerSearch) playerSearch.value = '';
    if (playerSelect) playerSelect.value = '';

    if (playerSearchInstance) {
      playerSearchInstance.updateOptions('');
    }
  };

  // Default engine
  let Engine = getScoringEngine(ScoringFormats.DEFAULT);



  /**
   * Populates the player dropdown.
   * If a league is currently selected in the header, only players 
   * assigned to that league's roster are shown. Otherwise, the 
   * entire global player list is displayed.
   */
  async function renderPlayerSelect() {
    try {
      const leagueId = getActiveLeagueId();
      // Fetch all players to ensure we can resolve IDs from URLs even if the 
      // league-specific roster fetch doesn't include a newly added player yet.
      const allPlayers = await PB_API.players.getAll();
      allPlayersCache.length = 0;
      allPlayersCache.push(...allPlayers);

      const currentPlayerId = getCurrentPlayerId();
      selectablePlayers = getSelectablePlayers({
        allPlayers,
        leagueId,
        allLeaguesCache,
        activeMatchupId: getActiveEventMatchupId(),
        eventMatchups,
        currentUser,
        currentPlayerId
      });

      if (!playerSearchInstance) {
        let searchInput = document.getElementById('player-search');

        if (searchInput && playerSelect) {
          playerSearchInstance = createSearchableSelect(searchInput, playerSelect, selectablePlayers, {
            valueKey: 'id',
            labelKey: 'playerName',
            placeholder: selectablePlayers.length === 0 ? 'No players configured' : 'Select a player',
            onSelect: async (val) => {
              if (!val) {
                setCurrentPlayerIdSilent('');
              } else {
                // Silent: we explicitly call refreshPlayerSelection() below,
                // so avoid the full initApp() re-init from pb:pageChanged.
                setCurrentPlayerIdSilent(val);
              }
              await refreshPlayerSelection();
            }
          });
        }
      }

      if (playerSearchInstance) {
        playerSearchInstance.setData(selectablePlayers);
      }
      // Only enable selection once data is actually filtered and bound
      if (playerSelect) playerSelect.disabled = false;

      if (currentPlayerId) {
        const player = allPlayersCache.find(p => String(p.id) === String(currentPlayerId));
        if (player && playerSelect) {
          playerSelect.value = currentPlayerId;
          const searchInput = document.getElementById('player-search');
          if (searchInput) searchInput.value = player.playerName;
          return currentPlayerId;
        }
      } else {
        // If no player is active, ensure the UI is physically cleared
        const searchInput = document.getElementById('player-search');
        if (searchInput) searchInput.value = '';
        if (playerSelect) playerSelect.value = '';
      }
    } catch (err) {
      console.error('Failed to render player selection:', err);
    }
    return null;
  }

  /**
   * Populates the input fields with data retrieved from the API.
   * @param {Array<Object>} scoreRows Raw score data from the database.
   * @param {Object} player The player being scored.
   */
  async function loadScoresIntoForm(scoreRows, player) {
    const playerId = Number(player?.id);
    const normalized = normalizeScores(scoreRows || []).filter(s => Number(s.playerId) === playerId);
    const scoreMap = normalized.reduce((map, row) => {
      map[String(row.orderNumber)] = row;
      return map;
    }, {});

    // Enrich with opponent data for baseball head-to-head matchups
    const enriched = Engine.enrichScoreMap(scoreMap, getEngineContext());
    
    const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

    const fragment = document.createDocumentFragment();
    const pendingRows = [];

    machines.forEach((round, index) => {
      const isLastRound = round.orderNumber === maxOrder;



      pendingRows.push(buildRoundRow(round, enriched, isLastRound, player, index, {
        currentUser,
        activeLeague,
        machines,
        engine: Engine,
        engineContext: getEngineContext(),
        getCurrentPlayerId,
        saveScoreCallback: async (scoreData) => {
          const activeEventMatchupId = getActiveEventMatchupId();
          await PB_API.scores.save({
            playerId: scoreData.playerId,
            orderNumber: scoreData.orderNumber,
            eventId: Number(getActiveEventId()),
            leagueId: Number(getActiveLeagueId()),
            machineId: scoreData.machineId,
            ball1: scoreData.ball1,
            ball2: scoreData.ball2,
            ball3: scoreData.ball3,
            eventMatchupId: activeEventMatchupId ? Number(activeEventMatchupId) : null
          });
        },
        refreshCallback: async () => {
          if (Engine.getMatchupDescription?.(1)) {
            try {
              const activeEventMatchupId = getActiveEventMatchupId();
              if (activeEventMatchupId) {
                allEventScores = await PB_API.scores.get(null, null, null, Number(activeEventMatchupId));
              } else {
                allEventScores = await PB_API.scores.get(null, Number(getActiveEventId()));
              }
            } catch (e) {
              console.warn('[ScoresPage] Failed to refresh allEventScores after save:', e);
            }
          }
          renderCurrentResults();
        }
      }));
    });

    const rows = await Promise.all(pendingRows);
    rows.forEach((row, index) => {
      const isLastRound = (index === rows.length - 1);
      if (isLastRound) {
        const branding = FormatBranding.get(activeFormat);
        const lfHint = branding.lastFrameHint;
        if (lfHint) {
          const hintDiv = document.createElement('div');
          hintDiv.className = 'hint small';
          hintDiv.innerHTML = lfHint;
          fragment.appendChild(hintDiv);
        }
      }
      fragment.appendChild(row);
    });

    roundsInput.innerHTML = '';
    roundsInput.appendChild(fragment);
  }

  /**
   * Handles the state transitions when a new player is selected.
   * Fetches their existing scores and resets the calculation engine.
   */
  async function refreshPlayerSelection() {
    let activePlayerId = await renderPlayerSelect();
    const activeEventMatchupId = getActiveEventMatchupId();
    
    // Auto-select player if none selected yet
    const autoId = getAutoSelectedPlayerId({
      activePlayerId,
      currentUser,
      allPlayersCache,
      activeMatchupId: activeEventMatchupId,
      eventMatchups,
      selectablePlayers
    });

    if (autoId && autoId !== activePlayerId) {
      activePlayerId = autoId;
      setCurrentPlayerIdSilent(activePlayerId);
      if (playerSelect) playerSelect.value = activePlayerId;
      const search = document.getElementById('player-search');
      const pObj = allPlayersCache.find(p => String(p.id) === activePlayerId);
      if (search && pObj) search.value = pObj.playerName;
    }

    if (!activePlayerId) {
      roundsInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      
      if (playerSelectorUI) {
        playerSelectorUI.classList.remove('hidden');
        playerSummary.classList.add('hidden');
      }
      updateTournamentSummary();
      return;
    }

    const player = allPlayersCache.find(p => String(p.id) === String(activePlayerId));

    const loader = createSkeletonLoader(roundsInput, { count: 5 });
    try {
      const scores = activeEventMatchupId 
        ? await PB_API.scores.get(Number(activePlayerId), null, null, Number(activeEventMatchupId))
        : await PB_API.scores.get(Number(activePlayerId), Number(getActiveEventId()));
      await loadScoresIntoForm(scores, player);

      const isTD = await can(PERMISSIONS.UPDATE_ANY_SCORE);
      const { isSpectator, canEditSelected } = getSpectatorStatus({
        activePlayerId,
        activeMatchupId: activeEventMatchupId,
        eventMatchups,
        currentUser,
        allPlayersCache,
        isTD
      });

      scoringCard.classList.remove('hidden');
      resultsCard.classList.remove('hidden');

      if (isSpectator) {
        // Show the compact player summary with a "Change" button, just like
        // non-spectator mode. The selector dropdown stays hidden until "Change"
        // is clicked, which reveals it so the spectator can switch players.
        playerSelectorUI?.classList.add('hidden');
        playerSummary?.classList.remove('hidden');
        renderActionSummary(playerSummary, `Player: ${player?.playerName || 'Selected'}`, [
          { text: 'Change', onclick: handlePlayerChange }
        ]);
        
        const matchup = eventMatchups[0];
        const awayName = matchup?.player2Name || 'BYE';
        const homeName = matchup?.player1Name || 'Unknown';
        warning.innerHTML = `<strong>Spectator Mode:</strong> Viewing matchup in progress between ${escapeHTML(awayName)} and ${escapeHTML(homeName)}.`;
        warning.classList.remove('hidden');
        
        if (canEditSelected) {
          // Unregistered guest player — allow score entry
          warning.innerHTML += ' <span class="meta-muted">(You may enter scores for this unregistered player.)</span>';
          roundsInput.querySelectorAll('input').forEach((input) => {
            input.disabled = false;
            input.readOnly = false;
          });
          const saveBtns = roundsInput.querySelectorAll('.save-round-button');
          saveBtns.forEach(btn => btn.style.display = '');
        } else {
          // Registered player — view only
          roundsInput.querySelectorAll('input').forEach((input) => {
            input.disabled = true;
            input.readOnly = true;
          });
          const saveBtns = roundsInput.querySelectorAll('.save-round-button');
          saveBtns.forEach(btn => btn.style.display = 'none');
        }
      } else {
        warning.classList.add('hidden');
        playerSummary?.classList.remove('hidden');
        renderActionSummary(playerSummary, `Player: ${player?.playerName || 'Selected'}`, [
          { text: 'Change', onclick: handlePlayerChange }
        ]);
        roundsInput.querySelectorAll('input').forEach((input) => (input.disabled = false));
      }

      renderCurrentResults();
      updateTournamentSummary();
    } finally {
      loader.remove();
    }
  }

  /**
   * Builds the context object passed to engine methods (enrichScoreMap, renderResults, getRoundRowContext).
   * This allows format-specific engines to access the data they need without the UI
   * branching on activeFormat.
   */
  function getEngineContext() {
    return {
      allEventScores,
      eventMatchups,
      allPlayersCache,
      getCurrentPlayerId,
      normalizeScores,
      groupScoresByPlayer,
      escapeHTML
    };
  }

  /**
   * Aggregates current input values into a map for the scoring engine.
   * @returns {Object} Map of order_number to ball scores.
   */
  function getScoreMapFromInputs() {
    const scoreMap = buildScoreMapFromDOM(roundsInput);
    return Engine.enrichScoreMap(scoreMap, getEngineContext());
  }

  /**
   * Performs a real-time calculation of the bowling game based on the current 
   * form state and renders the summary table.
   */
  function renderCurrentResults() {
    const scoreMap = getScoreMapFromInputs();
    const calcResult = Engine.calculateTurnResults(machines, scoreMap);

    if (activeFormat === ScoringFormats.BASEBALL) {
      renderHead2HeadScoreboard(calcResult, machines, getEngineContext(), {
        resultsPanel,
        resultsBody,
        totalScore,
        resultsEmpty
      }, Engine);
    } else {
      renderStandardScoreboard(calcResult, {
        resultsPanel,
        resultsBody,
        totalScore,
        resultsEmpty
      });
    }
  }

  /**
   * Core refresh logic triggered when the active event changes.
   * Loads the machine lineup for the specific night.
   * @async
   */
  const refresh = async () => {
    let eventId = getActiveEventId();
    let leagueId = getActiveLeagueId();
    const activeEventMatchupId = getActiveEventMatchupId();

    if (activeEventMatchupId) {
      const matchup = await PB_API.matchups.get(null, Number(activeEventMatchupId));
      if (matchup) {
        eventId = String(matchup.eventId ?? matchup.event_id);
        leagueId = String(matchup.leagueId ?? matchup.league_id);
        // Use silent variants to avoid dispatching pb:pageChanged, which would
        // re-trigger initApp() -> initScoresPage() -> refresh() in an infinite loop.
        setActiveEventIdSilent(eventId);
        setActiveLeagueIdSilent(leagueId);
      }
    }

    if (!eventId) {
      if (getCurrentPlayerId()) {
        setCurrentPlayerIdSilent('');
      }
      const playerSearch = document.getElementById('player-search');
      if (playerSearch) playerSearch.value = '';
      if (playerSelect) playerSelect.value = '';

      roundsInput.innerHTML = '';
      tournamentSelectorUI.classList.remove('hidden');
      tournamentSummary.classList.add('hidden');
      playerSelectionCard.classList.add('hidden');
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      return;
    }
    
    // If the tournament context (league or event) has changed, reset the player 
    // selection to ensure the search box is cleared and we don't carry over 
    // a player context that may not exist in the new roster.
    if (eventId !== lastEventId || leagueId !== lastLeagueId) {
      if (getCurrentPlayerId()) {
        const playerSearch = document.getElementById('player-search');
        if (playerSearch) playerSearch.value = '';
        if (playerSelect) playerSelect.value = '';
        setCurrentPlayerIdSilent('');
      }
      lastEventId = eventId;
      lastLeagueId = leagueId;
    }

    // Fetch leagues and machine targets in parallel. User is already fetched at init.
    const [leagues, eventTargets] = await Promise.all([
      PB_API.leagues.getAll(),
      PB_API.machines.getTargets(eventId)
    ]);
    allLeaguesCache = leagues; // Update the cache with fresh data

    // Refresh the league list in the selector to catch any mid-session roster changes
    if (tournamentSelector) {
      tournamentSelector.setData(allLeaguesCache);
    }

    const league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
    const event = league?.events?.find(e => String(e.id) === String(eventId));

    const format = ScoringFormats.resolve(event?.scoringFormat || league?.scoringFormat);
    activeFormat = format;
    Engine = getScoringEngine(format);

    // Ask the engine what additional data it needs for this event,
    // then fetch it generically — no format-specific branching required.
    const requiredData = Engine.getRequiredEventData(eventId, PB_API);
    if (activeEventMatchupId) {
      requiredData.eventMatchups = PB_API.matchups.get(null, Number(activeEventMatchupId)).then(m => [m]);
      requiredData.allEventScores = PB_API.scores.get(null, null, null, Number(activeEventMatchupId));
    }
    const requiredKeys = Object.keys(requiredData);
    const requiredValues = await Promise.all(Object.values(requiredData));
    requiredKeys.forEach((key, i) => {
      if (key === 'eventMatchups') eventMatchups = requiredValues[i] || [];
      else if (key === 'allEventScores') allEventScores = requiredValues[i] || [];
    });
    // Clear any keys not declared by this engine
    if (!requiredKeys.includes('eventMatchups')) eventMatchups = [];
    if (!requiredKeys.includes('allEventScores')) allEventScores = [];

    // Customize the target machines list to be matchup-specific if deep-linked
    let machinesNormalized = normalizeTargets(eventTargets);
    // Recompute all-zero values maps (defensive: handles legacy data where
    // score1-score10 were never stored, e.g. league events created before the
    // refactor that added individual score columns)
    machinesNormalized = machinesNormalized.map(m => {
      if (m.values && Object.values(m.values).every(v => Number(v) === 0)) {
        m.values = Engine.buildRoundValues(m.value1, m.value2);
      }
      return m;
    });
    if (activeEventMatchupId && eventMatchups.length > 0) {
      const matchupDetails = eventMatchups[0];
      // IMPORTANT: Each entry's orderNumber is the round number (1, 2, …) and is
      // shared by BOTH matchups within the same round (e.g., top and bottom).
      // If we used it directly, both entries would get the same orderNumber,
      // causing score saves/lookups to collide. Instead we derive a strict
      // sequential position (1, 2, 3, 4, …) from the entry's index in the
      // entries array, which matches how event target scores are numbered.
      machinesNormalized = (matchupDetails.entries || []).map((entry, i) => {
        const sequentialOrderNumber = i + 1;
        const tgt = eventTargets.find(t => t.orderNumber === sequentialOrderNumber);
        const value1 = tgt ? tgt.value1 : 5000000;
        const value2 = tgt ? tgt.value2 : 1.5;
        let values = tgt ? tgt.values : null;
        if (!values || Object.values(values).every(v => Number(v) === 0)) {
          values = Engine.buildRoundValues(value1, value2);
        }
        return {
          id: entry.id,
          eventId: entry.eventId,
          orderNumber: sequentialOrderNumber,
          machineId: entry.machineId,
          machineName: entry.machineName,
          value1,
          value2,
          values
        };
      });
    }

    activeLeague = league;
    activeEvent = event;

    const isSession = league?.type === 'session';
    if (activeEventMatchupId && eventMatchups.length > 0) {
      const matchup = eventMatchups[0];
      summaryTitle = `
        <div class="meta-strong">League: ${escapeHTML(league?.name || 'Unknown')}</div>
        <div class="meta-muted">Week: ${escapeHTML(event?.eventName || 'Week')}</div>
        <div class="meta-muted">Matchup: ${escapeHTML(matchup?.player2Name || 'BYE')} vs ${escapeHTML(matchup?.player1Name)}</div>
      `;
    } else {
      const leagueTitle = isSession ? '' : `<div class="meta-strong">League: ${escapeHTML(league?.name || 'Unknown')}</div>`;
      const eventTitle = `<div class="meta-muted">Event: ${escapeHTML(event?.eventName || 'Event')}</div>`;
      summaryTitle = `${leagueTitle}${eventTitle}`;
    }

    tournamentSelectorUI.classList.add('hidden');
    updateTournamentSummary();

    applyPreferredTheme(format);
    const branding = FormatBranding.get(format);

    // Update the scoring section title using the Engine's specific terminology (Frame vs Hole)
    const scoringHeader = scoringCard.querySelector('h2');
    if (scoringHeader) {
      scoringHeader.textContent = `Enter ${branding.roundLabel} Scores`;
    }

    // Update the general hint text based on the active engine
    const scoringHint = document.getElementById('scoring-hint');
    if (scoringHint) {
      scoringHint.textContent = branding.scoringHint;
    }

    machines = machinesNormalized;

    const isH2H = league?.participants === 'head2head';
    const scheduleContainer = document.getElementById('matchups-schedule-container');
    
    if (isH2H && !activeEventMatchupId) {
      playerSelectionCard.classList.add('hidden');
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      warning.classList.add('hidden');
      
      if (scheduleContainer) {
        scheduleContainer.classList.remove('hidden');
        const matchupsList = scheduleContainer.querySelector('.week-matchups-list');
        renderMatchupSchedule(matchupsList, event, {
          onPlayMatchup: (matchupId, evId) => {
            setActiveLeagueIdSilent(league.id);
            setActiveEventIdSilent(evId);
            loadPage(ROUTE_PATHS.SCORES({ eventId: evId, leagueId: league.id, eventMatchupId: matchupId }));
          }
        });
      }
      return;
    }
    
    if (scheduleContainer) {
      scheduleContainer.classList.add('hidden');
    }

    if (machines.length === 0) {
      warning.innerHTML = 'This event has not been setup.';
      warning.classList.remove('hidden');
      roundsInput.innerHTML = '';

      return;
    }

    // Only reveal the player card once we know we have machines to score
    playerSelectionCard.classList.remove('hidden');
    await refreshPlayerSelection();

    // Update the results table header to use the engine's round label
    const resultsTableHeader = resultsPanel.querySelector('table.data-table thead tr');
    if (resultsTableHeader) {
      const roundHeader = resultsTableHeader.querySelector('th:first-child');
      if (roundHeader) {
        roundHeader.textContent = branding.roundLabel;
      }
    }
  };

  tournamentSelector = await initTournamentSelector('.tournament-selector-container', { 
    onRefresh: refresh, 
    existingLeagues: allLeaguesCache, // Pass the full list of leagues
    currentUser: currentUser // Pass the current user for filtering
  });
}
