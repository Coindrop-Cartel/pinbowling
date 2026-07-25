import { PB_API } from '@services/api.js';
import { can, PERMISSIONS } from '@services/auth.js';
import { getSelectablePlayers, getSelectableTeams, getAutoSelectedPlayerId, getAutoSelectedTeamId, getSpectatorStatus } from '@services/playerSelector.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueIdSilent, setActiveEventIdSilent, formatNumber, setCurrentPlayerIdSilent, getCurrentPlayerId, escapeHTML, getActiveEventMatchupId, setActiveEventMatchupIdSilent, loadPage } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { createSearchableSelect, renderActionSummary, initTournamentSelector, createSkeletonLoader } from '@ui/selectors.js';
import { showDialog, showBattingOrderDialog, showPitcherAssignmentDialog } from '@ui/dialogs.js';
import { normalizeScores, normalizeTargets, groupScoresByPlayer, buildScoreMapFromDOM } from '@services/normalizer.js';
import { enrichTeamMatchupEntries } from '@services/matchupBuilder.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { printBlankScoreSheet, printScoreSheet } from '@ui/printing.js';
import { buildRoundRow } from '../renderers/roundRowRenderer.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';
import { renderStandardScoreboard, renderHead2HeadScoreboard } from '@scripts/renderers/scoreboardRenderer.js';
import { renderMatchupSchedule } from '@scripts/renderers/matchupScheduleRenderer.js';
import { getTargetScoreForDifficulty } from '@services/sessionGenerator.js';
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
  let lastCalcResult = null;
  let activeEvent = null;
  let summaryTitle = '';
  let battingOrdersByTeam = {};
  let pitcherAssignmentsByTeam = {};

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
      { text: 'Print Blank Score Sheet', onclick: async () => {
        const includeThresholds = await showDialog({
          title: 'Blank Score Sheet',
          message: 'Include threshold value reference?',
          confirmText: 'Yes',
          cancelText: 'No',
          cancelValue: false
        });
        printBlankScoreSheet(machines, activeLeague?.name, activeEvent?.eventName, activeFormat, includeThresholds === true);
      }, hidden: machines.length === 0 || !!getActiveEventMatchupId() }
    ]);
  }

  const handleTournamentChange = async () => {
    setActiveEventIdSilent('');
    setActiveEventMatchupIdSilent('');
    setCurrentPlayerIdSilent('');

    const scheduleContainer = document.getElementById('matchups-schedule-container');
    if (scheduleContainer) scheduleContainer.classList.add('hidden');

    tournamentSelectorUI.classList.remove('hidden');
    tournamentSummary.classList.add('hidden');
    playerSelectionCard.classList.add('hidden');
    playerSummary.classList.add('hidden');
    scoringCard.classList.add('hidden');
    resultsCard.classList.add('hidden');

    const playerSearch = document.getElementById('player-search');
    if (playerSearch) playerSearch.value = '';
    if (playerSelect) playerSelect.value = '';
    if (playerSearchInstance) {
      playerSearchInstance.updateOptions('');
    }

    const eventSelect = tournamentSelectorUI.querySelector('.event-select-shared');
    if (eventSelect) eventSelect.value = '';

    await refresh();
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

      const isTeamMode = activeLeague?.participationType === 'team';
      const currentPlayerId = getCurrentPlayerId();

      if (isTeamMode) {
        const selectableTeams = getSelectableTeams({
          activeMatchupId: getActiveEventMatchupId(),
          eventMatchups,
          allLeaguesCache,
          leagueId
        });
        selectablePlayers = selectableTeams.map(t => ({
          id: t.id,
          playerName: `Team: ${t.name}`,
          members: t.members || [],
          _team: t
        }));
      } else {
        selectablePlayers = getSelectablePlayers({
          allPlayers,
          leagueId,
          allLeaguesCache,
          activeMatchupId: getActiveEventMatchupId(),
          eventMatchups,
          currentUser,
          currentPlayerId
        });
      }

      if (!playerSearchInstance) {
        let searchInput = document.getElementById('player-search');

        if (searchInput && playerSelect) {
          const placeholderText = isTeamMode ? 'Select a team' : (selectablePlayers.length === 0 ? 'No players configured' : 'Select a player');
          playerSearchInstance = createSearchableSelect(searchInput, playerSelect, selectablePlayers, {
            valueKey: 'id',
            labelKey: 'playerName',
            placeholder: placeholderText,
            onSelect: async (val) => {
              if (!val) {
                setCurrentPlayerIdSilent('');
              } else {
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
        const item = selectablePlayers.find(p => String(p.id) === String(currentPlayerId)) || allPlayersCache.find(p => String(p.id) === String(currentPlayerId));
        if (item && playerSelect) {
          playerSelect.value = currentPlayerId;
          const searchInput = document.getElementById('player-search');
          if (searchInput) searchInput.value = item.playerName || item.name;
          return currentPlayerId;
        }
      } else {
        // If no player/team is active, ensure the UI is physically cleared
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
    const isTeamMode = player?.isTeam === true;
    const selectedId = Number(player?.id);
    const normalized = normalizeScores(scoreRows || []);

    const myScores = isTeamMode
      ? normalized.filter(s => Number(s.teamId ?? s.team_id ?? 0) === selectedId)
      : normalized.filter(s => Number(s.playerId ?? s.player_id ?? 0) === selectedId);

    const scoreMap = myScores.reduce((map, row) => {
      map[String(row.orderNumber ?? row.order_number)] = row;
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
          const isTeamMode = activeLeague?.participationType === 'team';
          // Use the per-half-inning eventMatchupId from the round entry,
          // NOT the URL-level activeEventMatchupId which always points to the first half-inning.
          const rowEventMatchupId = round.eventMatchupId || getActiveEventMatchupId();
          const totals = !isTeamMode && lastCalcResult
            ? { home: lastCalcResult.homeScore, away: lastCalcResult.awayScore }
            : null;

          if (isTeamMode) {
            const selectedTeamId = Number(getCurrentPlayerId());
            const teamTotals = lastCalcResult?.teamTotals || (lastCalcResult ? { home: lastCalcResult.homeScore, away: lastCalcResult.awayScore } : null);
            const teamP1Score = teamTotals?.home ?? null;
            const teamP2Score = teamTotals?.away ?? null;

            await PB_API.scores.save({
              teamId: selectedTeamId,
              orderNumber: scoreData.orderNumber,
              eventId: Number(getActiveEventId()),
              leagueId: Number(getActiveLeagueId()),
              machineId: scoreData.machineId,
              ball1: scoreData.ball1,
              ball2: scoreData.ball2,
              ball3: scoreData.ball3,
              ball1PlayerId: scoreData.ball1PlayerId ?? null,
              ball2PlayerId: scoreData.ball2PlayerId ?? null,
              ball3PlayerId: scoreData.ball3PlayerId ?? null,
              eventMatchupId: rowEventMatchupId ? Number(rowEventMatchupId) : null,
              player1Score: teamP1Score,
              player2Score: teamP2Score
            });

            if (scoreData.opponentScoreData) {
              const oppData = scoreData.opponentScoreData;
              const matchupW = eventMatchups?.[0] || {};
              const homeTeamId = Number(matchupW.player1Id ?? matchupW.player1_id ?? 0);
              const awayTeamId = Number(matchupW.player2Id ?? matchupW.player2_id ?? 0);
              const defendingTeamId = selectedTeamId === homeTeamId ? awayTeamId : homeTeamId;

              if (defendingTeamId) {
                await PB_API.scores.save({
                  teamId: defendingTeamId,
                  orderNumber: oppData.orderNumber,
                  eventId: Number(getActiveEventId()),
                  leagueId: Number(getActiveLeagueId()),
                  machineId: oppData.machineId,
                  ball1: oppData.ball1,
                  ball2: oppData.ball2,
                  ball3: oppData.ball3,
                  ball1PlayerId: oppData.ball1PlayerId ?? null,
                  ball2PlayerId: oppData.ball2PlayerId ?? null,
                  ball3PlayerId: oppData.ball3PlayerId ?? null,
                  eventMatchupId: rowEventMatchupId ? Number(rowEventMatchupId) : null,
                  player1Score: teamP1Score,
                  player2Score: teamP2Score
                });
              }
            }
          } else {
            await PB_API.scores.save({
              playerId: scoreData.playerId,
              orderNumber: scoreData.orderNumber,
              eventId: Number(getActiveEventId()),
              leagueId: Number(getActiveLeagueId()),
              machineId: scoreData.machineId,
              ball1: scoreData.ball1,
              ball2: scoreData.ball2,
              ball3: scoreData.ball3,
              eventMatchupId: rowEventMatchupId ? Number(rowEventMatchupId) : null,
              player1Score: totals?.home ?? null,
              player2Score: totals?.away ?? null
            });
          }
        },
        refreshCallback: async () => {
          const isTeamMode = activeLeague?.participationType === 'team';
          try {
            const activeEventMatchupId = getActiveEventMatchupId();
            if (activeEventMatchupId && !isTeamMode) {
              allEventScores = await PB_API.scores.get(null, null, null, Number(activeEventMatchupId));
            } else {
              allEventScores = await PB_API.scores.get(null, Number(getActiveEventId()));
            }
          } catch (e) {
            console.warn('[ScoresPage] Failed to refresh allEventScores after save:', e);
          }
          if (isTeamMode) {
            await refreshPlayerSelection({ skipSkeleton: true });
          } else {
            renderCurrentResults();
          }
          updateTournamentSummary();
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
  async function refreshPlayerSelection(options = {}) {
    const { skipSkeleton = false } = options;
    const activeEventMatchupId = getActiveEventMatchupId();
    const isTeamMode = activeLeague?.participationType === 'team';

    // ── TEAM MODE ──────────────────────────────────────────────────────────
    if (isTeamMode) {
      // Populate selectablePlayers before auto-select so team lookup works
      await renderPlayerSelect();

      let activeTeamId = getCurrentPlayerId();

      // Auto-select the team the current user belongs to
      const autoTeamId = getAutoSelectedTeamId({
        currentUser,
        selectableTeams: selectablePlayers,
        activeTeamId
      });

      if (autoTeamId && autoTeamId !== activeTeamId) {
        activeTeamId = autoTeamId;
        setCurrentPlayerIdSilent(activeTeamId);
        if (playerSelect) playerSelect.value = activeTeamId;
        const search = document.getElementById('player-search');
        const teamEntry = selectablePlayers.find(p => String(p.id) === activeTeamId);
        if (search && teamEntry) search.value = teamEntry.playerName;
      }

      if (!activeTeamId) {
        roundsInput.querySelectorAll('input').forEach(i => (i.disabled = true));
        scoringCard.classList.add('hidden');
        resultsCard.classList.add('hidden');
        playerSelectorUI?.classList.remove('hidden');
        playerSummary?.classList.add('hidden');
        updateTournamentSummary();
        return;
      }

      const selectedTeam = (activeLeague.teams || []).find(t => String(t.id) === String(activeTeamId));
      if (!selectedTeam) return;

      const loader = skipSkeleton ? null : createSkeletonLoader(roundsInput, { count: 5 });
      try {
        // Fetch all scores for this event (event-wide across all half-innings in Team mode)
        const scores = await PB_API.scores.get(null, Number(getActiveEventId()));
        allEventScores = scores;

        // Pass the team as a pseudo-player so loadScoresIntoForm can render rows
        const teamAsPlayer = { ...selectedTeam, isTeam: true };
        await loadScoresIntoForm(scores, teamAsPlayer);

        scoringCard.classList.remove('hidden');
        resultsCard.classList.remove('hidden');
        warning.classList.add('hidden');
        playerSelectorUI?.classList.add('hidden');
        playerSummary?.classList.remove('hidden');
        renderActionSummary(playerSummary, `Team: ${selectedTeam.name}`, [
          { text: 'Change', onclick: handlePlayerChange }
        ]);

        // Check if scores have already been entered for this team in this matchup
        const teamHasScores = (allEventScores || []).some(s =>
          Number(s.teamId ?? s.team_id ?? 0) === Number(selectedTeam.id) &&
          (Number(s.ball1 || 0) > 0 || Number(s.ball2 || 0) > 0 || Number(s.ball3 || 0) > 0)
        );

        // Team Setup bar: batting order + pitcher assignment
        let teamBar = scoringCard.querySelector('.team-actions-bar');
        if (!teamBar) {
          teamBar = document.createElement('div');
          teamBar.className = 'team-actions-bar flex-between align-center p-12 mb-15';
          teamBar.style.cssText = 'background: #e3f2fd; border: 1px solid #90caf9; border-radius: 6px;';
          scoringCard.insertBefore(teamBar, scoringCard.firstChild);
        }
        teamBar.innerHTML = `
          <div>
            <strong style="color: #1565c0;">Team Setup: ${escapeHTML(selectedTeam.name)}</strong>
            ${teamHasScores ? '<span class="ml-8" style="font-size: 0.85em; color: #c62828; font-weight: bold;">🔒 Locked (Scores Entered)</span>' : ''}
          </div>
          <div class="flex gap-8">
            <button type="button" id="btn-set-batting-order" class="btn-row secondary" ${teamHasScores ? 'disabled title="Batting order is locked because scores have been entered for this team."' : ''}>Set Batting Order</button>
            <button type="button" id="btn-assign-pitchers" class="btn-row secondary" ${teamHasScores ? 'disabled title="Pitcher assignments are locked because scores have been entered for this team."' : ''}>Assign Pitchers</button>
          </div>
        `;

        if (!teamHasScores) {
          teamBar.querySelector('#btn-set-batting-order')?.addEventListener('click', async () => {
            const teamIdStr = String(selectedTeam.id);
            const currentOrder = battingOrdersByTeam[teamIdStr] || selectedTeam.members || [];
            const res = await showBattingOrderDialog({
              team: selectedTeam,
              members: selectedTeam.members || [],
              currentOrder
            });
            if (res) { battingOrdersByTeam[teamIdStr] = res; await refreshPlayerSelection(); }
          });

          teamBar.querySelector('#btn-assign-pitchers')?.addEventListener('click', async () => {
            const teamIdStr = String(selectedTeam.id);
            const matchup = eventMatchups[0];
            const homeTeamId = String(matchup?.player1Id ?? matchup?.player1_id ?? '');
            const awayTeamId = String(matchup?.player2Id ?? matchup?.player2_id ?? '');
            const isHomeTeam = teamIdStr === homeTeamId;
            const pitchingRounds = machines.filter(m => isHomeTeam ? m.isTop : !m.isTop);
            const currentAssignments = pitcherAssignmentsByTeam[teamIdStr] || {};
            const res = await showPitcherAssignmentDialog({
              team: selectedTeam,
              members: selectedTeam.members || [],
              machines: pitchingRounds.map(m => ({ orderNumber: m.orderNumber, label: m.roundName || `Inning ${m.orderNumber}`, machineName: m.machineName })),
              currentAssignments
            });
            if (res) { pitcherAssignmentsByTeam[teamIdStr] = res; await refreshPlayerSelection(); }
          });
        }

        renderCurrentResults();
        updateTournamentSummary();
      } finally {
        if (loader) loader.remove();
      }
      return;
    }

    // ── INDIVIDUAL PLAYER MODE ─────────────────────────────────────────────
    let activePlayerId = await renderPlayerSelect();
    
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
        // Remove any leftover team bar (shouldn't exist in individual mode)
        scoringCard.querySelector('.team-actions-bar')?.remove();
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
    const isTeamMode = activeLeague?.participationType === 'team';
    const activeId = getCurrentPlayerId();
    const selectedTeam = isTeamMode ? (activeLeague?.teams || []).find(t => String(t.id) === String(activeId)) : null;
    const selectedTeamIdStr = selectedTeam ? String(selectedTeam.id) : null;

    const teamBattingOrder = selectedTeamIdStr && battingOrdersByTeam[selectedTeamIdStr]
      ? battingOrdersByTeam[selectedTeamIdStr]
      : (selectedTeam?.members || []);

    const teamPitcherAssignments = selectedTeamIdStr && pitcherAssignmentsByTeam[selectedTeamIdStr]
      ? pitcherAssignmentsByTeam[selectedTeamIdStr]
      : {};

    const isTDOrAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'td');

    return {
      allEventScores,
      eventMatchups,
      allPlayersCache,
      getCurrentPlayerId,
      normalizeScores,
      groupScoresByPlayer,
      escapeHTML,
      activeLeague,
      isTeamMode,
      enrichedEntries: machines,
      battingOrder: teamBattingOrder,
      pitcherAssignments: teamPitcherAssignments,
      battingOrdersByTeam,
      pitcherAssignmentsByTeam,
      activeTeamMembers: selectedTeam?.members || [],
      isTDOrAdmin
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
    const engineContext = getEngineContext();
    const isTeamMode = engineContext.isTeamMode;

    let calcResult;
    if (isTeamMode) {
      calcResult = Engine.calculateTeamTurnResults(machines, scoreMap, engineContext);
    } else {
      calcResult = Engine.calculateTurnResults(machines, scoreMap);
    }
    lastCalcResult = calcResult;

    if (activeFormat === ScoringFormats.BASEBALL) {
      renderHead2HeadScoreboard(calcResult, machines, engineContext, {
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

    // Fetch leagues, machine targets, and master machines in parallel. User is already fetched at init.
    const [leagues, eventTargets, allMasterMachines] = await Promise.all([
      PB_API.leagues.getAll(),
      PB_API.machines.getTargets(eventId),
      PB_API.machines?.getAll ? PB_API.machines.getAll().catch(() => []) : Promise.resolve([])
    ]);
    allLeaguesCache = leagues; // Update the cache with fresh data

    // Helper to resolve target values using 4-tier hierarchy
    const resolveTargetVal = (entry, orderNum) => {
      const tgt = eventTargets.find(t => t.orderNumber === orderNum);
      if (tgt && tgt.value1) return { value1: tgt.value1, value2: tgt.value2 || 1.5, values: tgt.values };

      const macId = entry.machineId || entry.id;
      const macObj = (allMasterMachines || []).find(m => String(m.id) === String(macId));
      if (macObj) {
        const val1 = getTargetScoreForDifficulty(macObj, activeFormat, 'medium');
        return { value1: val1, value2: 1.5, values: null };
      }
      return { value1: activeFormat === ScoringFormats.BASEBALL ? 5000000 : 50000000, value2: 1.5, values: null };
    };

    // Refresh the league list in the selector to catch any mid-session roster changes
    if (tournamentSelector) {
      tournamentSelector.setData(allLeaguesCache);
    }

    const league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
    const event = league?.events?.find(e => String(e.id) === String(eventId)) || league?.events?.[0];

    const format = ScoringFormats.resolve(event?.scoringFormat || league?.scoringFormat);
    activeFormat = format;
    Engine = getScoringEngine(format);

    // Ask the engine what additional data it needs for this event,
    // then fetch it generically — no format-specific branching required.
    const requiredData = Engine.getRequiredEventData(eventId, PB_API);
    if (activeEventMatchupId) {
      // Team mode: fetch ALL event_matchups for the event (multiple half-innings)
      // Individual mode: fetch only the specific matchup by ID
      const isTeamModeLeague = league?.participationType === 'team';
      if (isTeamModeLeague) {
        requiredData.eventMatchups = PB_API.matchups.get(eventId).catch(() => []);
        requiredData.allEventScores = PB_API.scores.get(null, Number(eventId)).catch(() => []);
      } else {
        requiredData.eventMatchups = PB_API.matchups.get(null, Number(activeEventMatchupId)).then(m => [m]);
        requiredData.allEventScores = PB_API.scores.get(null, null, null, Number(activeEventMatchupId));
      }
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
    const isTeamModeLeague = league?.participationType === 'team';

    if (isTeamModeLeague && eventMatchups.length > 0) {
      let currentId = getCurrentPlayerId();
      if (!currentId) {
        const selectableTeams = getSelectableTeams({
          activeMatchupId: getActiveEventMatchupId(),
          eventMatchups,
          allLeaguesCache,
          leagueId
        });
        const formattedSelectable = selectableTeams.map(t => ({
          id: t.id,
          playerName: `Team: ${t.name}`,
          members: t.members || [],
          _team: t
        }));
        const autoTeamId = getAutoSelectedTeamId({
          currentUser,
          selectableTeams: formattedSelectable,
          activeTeamId: currentId
        });
        if (autoTeamId) {
          currentId = autoTeamId;
          setCurrentPlayerIdSilent(currentId);
        }
      }

      const selectedIdStr = String(currentId || '');

      // Team mode: filter eventMatchups to ONLY those belonging to this specific matchup pairing
      const activeEM = eventMatchups.find(em => String(em.id) === String(activeEventMatchupId))
        || eventMatchups.find(em => String(em.player1Id ?? em.player1_id) === selectedIdStr || String(em.player2Id ?? em.player2_id) === selectedIdStr)
        || eventMatchups[0];

      const p1Id = String(activeEM.player1Id ?? activeEM.player1_id ?? '');
      const p2Id = String(activeEM.player2Id ?? activeEM.player2_id ?? '');

      const targetMatchups = eventMatchups.filter(em => {
        const emP1 = String(em.player1Id ?? em.player1_id ?? '');
        const emP2 = String(em.player2Id ?? em.player2_id ?? '');
        return (emP1 === p1Id && emP2 === p2Id) || (emP1 === p2Id && emP2 === p1Id);
      });

      // Flatten entries for this matchup pairing only
      const enrichedEntries = [];
      for (const em of targetMatchups) {
        const rawEntries = em.entries || [];
        const roundName = em.roundName ?? em.round_name ?? '';
        const awayTeam = league.teams?.find(t => String(t.id) === String(em.player2Id ?? em.player2_id));
        const homeTeam = league.teams?.find(t => String(t.id) === String(em.player1Id ?? em.player1_id));
        if (awayTeam && homeTeam) {
          const enriched = enrichTeamMatchupEntries(rawEntries, em, awayTeam.members || [], homeTeam.members || [], roundName);
          enrichedEntries.push(...enriched);
        } else {
          enrichedEntries.push(...rawEntries);
        }
      }
      machinesNormalized = enrichedEntries.map((entry, i) => {
        const sequentialOrderNumber = i + 1;
        const { value1, value2, values: rawValues } = resolveTargetVal(entry, sequentialOrderNumber);
        let values = rawValues;
        if ((!values || Object.values(values).every(v => Number(v) === 0)) && Engine?.buildRoundValues) {
          values = Engine.buildRoundValues(value1, value2);
        }
        return {
          id: entry.id,
          eventId: entry.eventId,
          eventMatchupId: entry.eventMatchupId ?? null,
          orderNumber: sequentialOrderNumber,
          machineId: entry.machineId,
          machineName: entry.machineName,
          value1,
          value2,
          values,
          playerId: entry.playerId,
          playerName: entry.playerName,
          teamId: entry.teamId,
          isTop: entry.isTop,
          roundName: entry.roundName || '',
          slotIndex: entry.slotIndex,
          playerOrder: entry.playerOrder,
          opponentPlayerId: entry.opponentPlayerId,
        };
      });
    } else if (activeEventMatchupId && eventMatchups.length > 0) {
        // Individual mode: use first matchup's entries
        const matchupDetails = eventMatchups[0];
        machinesNormalized = (matchupDetails.entries || []).map((entry, i) => {
          const sequentialOrderNumber = i + 1;
          const { value1, value2, values: rawValues } = resolveTargetVal(entry, sequentialOrderNumber);
          let values = rawValues;
          if ((!values || Object.values(values).every(v => Number(v) === 0)) && Engine?.buildRoundValues) {
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

    const isH2H = league?.competitionFormat === 'head2head';
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
