import { PB_API } from '@services/api.js';
import { filterPlayersForUser, can, PERMISSIONS } from '@services/auth.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueIdSilent, setActiveEventIdSilent, formatNumber, setCurrentPlayerIdSilent, getCurrentPlayerId, escapeHTML, getActiveMatchupId, setActiveMatchupIdSilent, loadPage } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { createSearchableSelect, renderActionSummary, initTournamentSelector, createSkeletonLoader } from '@ui/selectors.js';
import { normalizeScores, normalizeTargets, groupScoresByPlayer, buildBaseballScoreMapForPlayer, buildScoreMapFromDOM } from '@services/normalizer.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { printBlankScoreSheet } from '@ui/printing.js';
import { buildRoundRow } from '@ui/roundRow.js';
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
  let activeFormat = 'bowling';
  let eventMatchups = [];
  let allEventScores = [];

  const handleTournamentChange = () => {
    setActiveMatchupIdSilent('');
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
  let Engine = getScoringEngine('bowling');



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

      selectablePlayers = [];

      const activeMatchupId = getActiveMatchupId();
      const isMatchupContext = !!activeMatchupId;
      if (isMatchupContext) {
        const matchup = eventMatchups[0];
        selectablePlayers = [];
        if (matchup) {
          // Matchup players are always selectable — they're the ones being scored.
          // Do NOT filter them by registration status; unregistered users need to
          // be able to select unregistered players to enter scores, and spectators
          // need to be able to select either player to view their scores.
          if (matchup.awayPlayerId) {
            const awayPlayer = allPlayers.find(p => String(p.id) === String(matchup.awayPlayerId));
            selectablePlayers.push(awayPlayer || { id: matchup.awayPlayerId, playerName: matchup.awayPlayerName });
          }
          if (matchup.homePlayerId) {
            const homePlayer = allPlayers.find(p => String(p.id) === String(matchup.homePlayerId));
            selectablePlayers.push(homePlayer || { id: matchup.homePlayerId, playerName: matchup.homePlayerName });
          }
        }
      } else if (leagueId) {
        // Use the cached leagues to find the specific league and its roster
        const league = allLeaguesCache.find(l => String(l.id) === String(leagueId));
        
        if (league?.participants === 'team') {
          // In a team league, the selectable players are the members of the assigned teams
          const memberMap = new Map();
          (league.teams || []).forEach(team => {
            (team.members || []).forEach(m => memberMap.set(String(m.id), m));
          });
          selectablePlayers = Array.from(memberMap.values());
        } else {
          selectablePlayers = league?.players || [];
        }
      } else {
        selectablePlayers = allPlayers;
      }

      // Requirement: Unregistered users can only select players that are unregistered guests.
      // EXCEPTION: In a matchup context, both players are always selectable so that
      // unregistered players can be selected for score entry and spectators can view scores.
      if (!isMatchupContext) {
        selectablePlayers = filterPlayersForUser(selectablePlayers, currentUser);
      }

      // If a playerId is in the URL, ensure they are at least in the selectable list 
      // for the current session, even if the roster fetch hasn't updated yet.
      const currentPlayerId = getCurrentPlayerId();
      if (currentPlayerId && !selectablePlayers.some(p => String(p.id) === String(currentPlayerId))) {
          const p = allPlayers.find(p => String(p.id) === String(currentPlayerId));
          if (p) selectablePlayers.unshift(p);
      }

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
    const normalized = normalizeScores(scoreRows || []);
    const scoreMap = normalized.reduce((map, row) => {
      map[String(row.orderNumber)] = row;
      return map;
    }, {});

    // Enrich with opponent data for baseball head-to-head matchups
    const enriched = Engine.enrichScoreMap(scoreMap, getEngineContext());
    const opponentScores = enriched.opponent || {};
    
    const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

    const fragment = document.createDocumentFragment();
    const pendingRows = [];

    machines.forEach((round, index) => {
      const isLastRound = round.orderNumber === maxOrder;
      const turnValues = scoreMap[String(round.orderNumber)];
      const oppTurnValues = opponentScores[String(round.orderNumber)] || null;

      // Inject last-frame specific hint if defined for this format
      if (isLastRound) {
        const lfHint = Engine.getLastFrameHint?.();
        if (lfHint) {
          const hintDiv = document.createElement('div');
          hintDiv.className = 'hint small';
          hintDiv.innerHTML = lfHint;
          fragment.appendChild(hintDiv);
        }
      }

      pendingRows.push(buildRoundRow(round, turnValues, isLastRound, player, oppTurnValues, index, {
        currentUser,
        activeLeague,
        machines,
        engine: Engine,
        engineContext: getEngineContext(),
        getCurrentPlayerId,
        saveScoreCallback: async (scoreData) => {
          const activeMatchupId = getActiveMatchupId();
          await PB_API.scores.save({
            playerId: scoreData.playerId,
            orderNumber: scoreData.orderNumber,
            eventId: Number(getActiveEventId()),
            leagueId: Number(getActiveLeagueId()),
            machineId: scoreData.machineId,
            ball1: scoreData.ball1,
            ball2: scoreData.ball2,
            ball3: scoreData.ball3,
            eventMatchupId: activeMatchupId ? Number(activeMatchupId) : null
          });
        },
        refreshCallback: async () => {
          if (Engine.getMatchupDescription?.(1)) {
            try {
              const activeMatchupId = getActiveMatchupId();
              if (activeMatchupId) {
                allEventScores = await PB_API.scores.get(null, null, null, Number(activeMatchupId));
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
    rows.forEach(row => fragment.appendChild(row));

    roundsInput.innerHTML = '';
    roundsInput.appendChild(fragment);
  }

  /**
   * Handles the state transitions when a new player is selected.
   * Fetches their existing scores and resets the calculation engine.
   */
  async function refreshPlayerSelection() {
    let activePlayerId = await renderPlayerSelect();
    const activeMatchupId = getActiveMatchupId();
    
    // Auto-select logged in user if they are in the roster and no one is selected yet
    if (!activePlayerId && currentUser?.player_id) {
        const isInRoster = allPlayersCache.some(p => String(p.id) === String(currentUser.player_id));
        if (isInRoster) {
            activePlayerId = String(currentUser.player_id);
            // Silent: avoid pb:pageChanged loop during auto-selection within refresh()
            setCurrentPlayerIdSilent(activePlayerId);
            if (playerSelect) playerSelect.value = activePlayerId;
            // Update search input text if exists
            const search = document.getElementById('player-search');
            const pObj = allPlayersCache.find(p => String(p.id) === activePlayerId);
            if (search && pObj) search.value = pObj.playerName;
        }
    }

    // Default to first matchup player if none selected
    if (!activePlayerId && activeMatchupId && selectablePlayers && selectablePlayers.length > 0) {
      activePlayerId = String(selectablePlayers[0].id);
      // Silent: avoid pb:pageChanged loop during auto-selection within refresh()
      setCurrentPlayerIdSilent(activePlayerId);
      if (playerSelect) playerSelect.value = activePlayerId;
      const search = document.getElementById('player-search');
      if (search) search.value = selectablePlayers[0].playerName;
    }

    if (!activePlayerId) {
      roundsInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      
      if (playerSelectorUI) {
        playerSelectorUI.classList.remove('hidden');
        playerSummary.classList.add('hidden');
      }
      return;
    }

    const player = allPlayersCache.find(p => String(p.id) === String(activePlayerId));
    playerSelectorUI?.classList.add('hidden');

    const loader = createSkeletonLoader(roundsInput, { count: 5 });
    try {
      const scores = activeMatchupId 
        ? await PB_API.scores.get(Number(activePlayerId), null, null, Number(activeMatchupId))
        : await PB_API.scores.get(Number(activePlayerId), Number(getActiveEventId()));
      await loadScoresIntoForm(scores, player);

      const matchup = eventMatchups[0];
      const isParticipant = matchup && currentUser && (
        String(matchup.homePlayerId) === String(currentUser.player_id) ||
        String(matchup.awayPlayerId) === String(currentUser.player_id)
      );
      const isTD = await can(PERMISSIONS.UPDATE_ANY_SCORE);
      const isSpectator = activeMatchupId && !isParticipant && !isTD;

      scoringCard.classList.remove('hidden');
      resultsCard.classList.remove('hidden');

      if (isSpectator) {
        // Keep the player selection card visible so spectators can switch between
        // the two matchup players to view their scores. Hide the per-player summary
        // (with "Change" button) since the selection card already provides switching.
        playerSummary?.classList.add('hidden');
        
        const awayName = matchup?.awayPlayerName || 'BYE';
        const homeName = matchup?.homePlayerName || 'Unknown';
        warning.innerHTML = `<strong>Spectator Mode:</strong> Viewing matchup in progress between ${escapeHTML(awayName)} and ${escapeHTML(homeName)}.`;
        warning.classList.remove('hidden');
        
        // Determine if the currently selected player is editable by this spectator.
        // Unregistered users can only enter scores for unregistered (guest) players.
        // Registered players' scores are view-only for spectators.
        const selectedPlayerObj = allPlayersCache.find(p => String(p.id) === String(activePlayerId));
        const isSelectedPlayerUnregistered = !selectedPlayerObj?.userId;
        const canEditSelected = isSelectedPlayerUnregistered;

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
      buildBaseballScoreMapForPlayer,
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

    Engine.renderResults(calcResult, machines, scoreMap, getEngineContext(), {
      resultsPanel,
      resultsBody,
      totalScore,
      resultsEmpty,
      escapeHTML
    });
  }

  /**
   * Core refresh logic triggered when the active event changes.
   * Loads the machine lineup for the specific night.
   * @async
   */
  const refresh = async () => {
    let eventId = getActiveEventId();
    let leagueId = getActiveLeagueId();
    const activeMatchupId = getActiveMatchupId();

    if (activeMatchupId) {
      const matchup = await PB_API.matchups.get(null, Number(activeMatchupId));
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

    const format = event?.scoringFormat || league?.scoringFormat || 'bowling';
    activeFormat = format;
    Engine = getScoringEngine(format);

    // Ask the engine what additional data it needs for this event,
    // then fetch it generically — no format-specific branching required.
    const requiredData = Engine.getRequiredEventData(eventId, PB_API);
    if (activeMatchupId) {
      requiredData.eventMatchups = PB_API.matchups.get(null, Number(activeMatchupId)).then(m => [m]);
      requiredData.allEventScores = PB_API.scores.get(null, null, null, Number(activeMatchupId));
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
    if (activeMatchupId && eventMatchups.length > 0) {
      const matchupDetails = eventMatchups[0];
      machinesNormalized = (matchupDetails.innings || []).map(inningSlot => {
        const tgt = eventTargets.find(t => t.orderNumber === inningSlot.orderNumber);
        return {
          id: inningSlot.id,
          eventId: inningSlot.eventId,
          orderNumber: inningSlot.orderNumber,
          machineId: inningSlot.machineId,
          machineName: inningSlot.machineName,
          value1: tgt ? tgt.value1 : 5000000,
          value2: tgt ? tgt.value2 : 1.5
        };
      });
    }

    const isSession = league?.type === 'session';
    let summaryTitle = '';
    if (activeMatchupId && eventMatchups.length > 0) {
      const matchup = eventMatchups[0];
      summaryTitle = `
        <div class="meta-strong">League: ${escapeHTML(league?.name || 'Unknown')}</div>
        <div class="meta-muted">Week: ${escapeHTML(event?.eventName || 'Week')}</div>
        <div class="meta-muted">Matchup: ${escapeHTML(matchup?.awayPlayerName || 'BYE')} vs ${escapeHTML(matchup?.homePlayerName)}</div>
      `;
    } else {
      const leagueTitle = isSession ? '' : `<div class="meta-strong">League: ${escapeHTML(league?.name || 'Unknown')}</div>`;
      const eventTitle = `<div class="meta-muted">Event: ${escapeHTML(event?.eventName || 'Event')}</div>`;
      summaryTitle = `${leagueTitle}${eventTitle}`;
    }

    tournamentSelectorUI.classList.add('hidden');
    renderActionSummary(tournamentSummary, summaryTitle, [
      { text: 'Change', onclick: handleTournamentChange },
      { text: 'Print Blank Score Sheet', onclick: () => printBlankScoreSheet(machines, league?.name, event?.eventName, format), hidden: eventTargets.length === 0 || !!activeMatchupId }
    ]);

    activeLeague = league;
    applyPreferredTheme(format);

    // Update the scoring section title using the Engine's specific terminology (Frame vs Hole)
    const scoringHeader = scoringCard.querySelector('h2');
    if (scoringHeader) {
      scoringHeader.textContent = `Enter ${Engine.getRoundLabel()} Scores`;
    }

    // Update the general hint text based on the active engine
    const scoringHint = document.getElementById('scoring-hint');
    if (scoringHint) {
      scoringHint.textContent = Engine.getScoringHint();
    }

    machines = machinesNormalized;

    const isH2H = league?.participants === 'head2head';
    const scheduleContainer = document.getElementById('matchups-schedule-container');
    
    if (isH2H && !activeMatchupId) {
      playerSelectionCard.classList.add('hidden');
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      warning.classList.add('hidden');
      
      if (scheduleContainer) {
        scheduleContainer.classList.remove('hidden');
        const matchupsList = scheduleContainer.querySelector('.week-matchups-list');
        const matchups = event?.matchups || [];
        if (matchups.length === 0) {
          matchupsList.innerHTML = '<li class="list-item-row" style="padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">No matchups scheduled for this week.</li>';
        } else {
          const isPlayoffs = event?.eventName && event.eventName.startsWith('Playoffs:');
          if (isPlayoffs) {
            const seriesMap = {};
            matchups.forEach(m => {
              const sId = m.seriesId || 1;
              seriesMap[sId] = seriesMap[sId] || [];
              seriesMap[sId].push(m);
            });
            
            matchupsList.innerHTML = Object.entries(seriesMap).map(([sId, games]) => {
              games.sort((a, b) => a.gameNumber - b.gameNumber);
              const firstGame = games[0];
              const homeName = escapeHTML(firstGame.homePlayerName);
              const awayName = escapeHTML(firstGame.awayPlayerName);
              
              let homeWins = 0;
              let awayWins = 0;
              games.forEach(g => {
                if (g.status === 'completed') {
                  if (g.winnerId === g.homePlayerId) homeWins++;
                  else if (g.winnerId === g.awayPlayerId) awayWins++;
                }
              });
              
              const gamesHtml = games.map(g => {
                const winnerHome = g.status === 'completed' && g.winnerId === g.homePlayerId;
                const winnerAway = g.status === 'completed' && g.winnerId === g.awayPlayerId;
                
                return `
                  <div class="playoff-game-row" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; margin-top: 6px; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #2196f3;">
                    <span class="meta-strong" style="font-size: 0.9em;">Game ${g.gameNumber}</span>
                    <div class="game-score" style="font-size: 0.9em;">
                      ${g.status === 'completed' ? `
                        <span class="${winnerAway ? 'font-bold' : ''}">${g.awayRuns}</span> - <span class="${winnerHome ? 'font-bold' : ''}">${g.homeRuns}</span>
                      ` : `
                        <span class="badge pending" style="background: #fff3e0; color: #e65100; padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">Pending</span>
                      `}
                    </div>
                    <div class="game-actions" style="display: flex; gap: 6px;">
                      <button class="play-matchup-btn primary btn-row btn-small" data-matchup-id="${g.id}" data-event-id="${g.eventId}" style="padding: 2px 8px; font-size: 0.85em;">
                        ${g.status === 'completed' ? 'View/Edit' : 'Play'}
                      </button>
                    </div>
                  </div>
                `;
              }).join('');
              
              return `
                <li class="list-item-row playoff-series-card" style="display: block; padding: 15px; margin-bottom: 12px; border: 1px solid #2196f3; border-radius: 6px; background: #fff;">
                  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #ddd; padding-bottom: 8px; margin-bottom: 8px;">
                    <span class="meta-strong" style="color: #1976d2; font-size: 1.05em;">Series ${sId} - ${escapeHTML(event.eventName.replace('Playoffs: ', ''))}</span>
                    <span class="badge completed font-bold" style="background: #e3f2fd; color: #0d47a1; padding: 4px 8px; border-radius: 4px; font-size: 0.9em;">
                      ${awayName} (${awayWins}) vs ${homeName} (${homeWins})
                    </span>
                  </div>
                  <div class="series-games-list">
                    ${gamesHtml}
                  </div>
                </li>
              `;
            }).join('');
          } else {
            matchupsList.innerHTML = matchups.map(m => {
              const isBye = m.awayPlayerId === null;
              const winnerHome = m.status === 'completed' && m.winnerId === m.homePlayerId;
              const winnerAway = m.status === 'completed' && m.winnerId === m.awayPlayerId;
              
              return `
                <li class="list-item-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff;">
                  <div class="matchup-players" style="font-weight: 500;">
                    <span class="${winnerAway ? 'font-bold' : ''}" style="${winnerAway ? 'color: #2e7d32;' : ''}">${escapeHTML(m.awayPlayerName || 'BYE')}</span> 
                    <span class="meta-muted" style="margin: 0 8px;">(Away) vs</span> 
                    <span class="${winnerHome ? 'font-bold' : ''}" style="${winnerHome ? 'color: #2e7d32;' : ''}">${escapeHTML(m.homePlayerName)}</span>
                    <span class="meta-muted" style="margin-left: 8px;">(Home)</span>
                  </div>
                  <div class="matchup-score-badge" style="display: flex; align-items: center; gap: 12px;">
                    ${m.status === 'completed' ? `
                      <span class="badge completed font-bold" style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px;">
                        ${m.awayRuns} - ${m.homeRuns}
                      </span>
                    ` : `
                      <span class="badge pending" style="background: #fff3e0; color: #e65100; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">
                        Pending
                      </span>
                    `}
                    
                    <div class="matchup-actions" style="display: flex; gap: 8px;">
                      ${!isBye ? `
                        <button class="play-matchup-btn primary btn-row btn-small" data-matchup-id="${m.id}" data-event-id="${m.eventId}">
                          ${m.status === 'completed' ? 'View/Edit' : 'Play'}
                        </button>
                      ` : ''}
                    </div>
                  </div>
                </li>
              `;
            }).join('');
          }
          
          matchupsList.querySelectorAll('.play-matchup-btn').forEach(btn => {
            btn.onclick = () => {
              const matchupId = Number(btn.dataset.matchupId);
              const evId = Number(btn.dataset.eventId);
              // loadPage() updates the URL and dispatches pb:pageChanged, so use
              // silent variants here to avoid a redundant mid-navigation re-init.
              setActiveLeagueIdSilent(league.id);
              setActiveEventIdSilent(evId);
              loadPage(ROUTE_PATHS.SCORES({ eventId: evId, leagueId: league.id, matchupId }));
            };
          });
        }
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
        roundHeader.textContent = Engine.getRoundLabel();
      }
    }
  };

  tournamentSelector = await initTournamentSelector('.tournament-selector-container', { 
    onRefresh: refresh, 
    existingLeagues: allLeaguesCache, // Pass the full list of leagues
    currentUser: currentUser // Pass the current user for filtering
  });
}
