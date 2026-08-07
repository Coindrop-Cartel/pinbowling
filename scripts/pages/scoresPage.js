import { PB_API } from '@services/api.js';
import { can, PERMISSIONS } from '@services/auth.js';
import { getSelectablePlayers, getSelectableTeams, getAutoSelectedPlayerId, getAutoSelectedTeamId, getSpectatorStatus } from '@services/playerSelector.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueIdSilent, setActiveEventIdSilent, formatNumber, setCurrentPlayerIdSilent, getCurrentPlayerId, getActiveTeamId, setActiveTeamIdSilent, escapeHTML, getActiveEventMatchupId, getActiveTeamEventMatchupId, setActiveEventMatchupIdSilent, loadPage, getUrlParam } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats, isHead2Head } from '@services/scoringFormat.js';
import { createSearchableSelect, renderActionSummary, initTournamentSelector, createSkeletonLoader } from '@ui/selectors.js';
import { showDialog, showRosterOrderDialog, showRoleAssignmentDialog } from '@ui/dialogs.js';
import { normalizeScores, normalizeTargets, groupScoresByPlayer, buildScoreMapFromDOM } from '@services/normalizer.js';
import { enrichTeamMatchupEntries } from '@services/matchupBuilder.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { printBlankScoreSheet, printScoreSheet } from '@ui/printing.js';
import { buildRoundRow } from '../renderers/roundRowRenderer.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';
import { renderStandardScoreboard, renderHead2HeadScoreboard } from '@scripts/renderers/scoreboardRenderer.js';
import { renderMatchupSchedule } from '@scripts/renderers/matchupScheduleRenderer.js';
import { getTargetScoreForDifficulty } from '@services/sessionGenerator.js';
import { openMatchupEditor } from '@ui/matchupEditor.js';
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

  let initialSessionId = getUrlParam('sessionId');
  let initialLeagueId = getActiveLeagueId();
  let initialEventId = getActiveEventId();

  // The "summary" eventId is a virtual ID used for the Season Summary scoreboard.
  // Scores must be entered for specific events, so we clear it if it persists from navigation.
  // Silent: we are mid-initialization; dispatching pb:pageChanged would re-trigger initApp().
  if (initialEventId === 'summary') {
    setActiveEventIdSilent('');
    initialEventId = '';
  }

  let lastEventId = initialEventId;
  let lastLeagueId = initialLeagueId;
  let lastSessionId = initialSessionId;

  let playerSearchInstance = null;
  let currentUser = user;
  let activeLeague = null;
  let activeSession = null;
  const isSessionMode = () => !!activeSession;
  const getSessionName = () => activeSession?.name || '';
  const getSessionPlayers = () => activeSession?.players || [];
  let allPlayersCache = [];
  let selectablePlayers = [];
  let machines = [];
  let activeFormat = ScoringFormats.DEFAULT;
  let eventMatchups = [];
  let allEventScores = [];

  let activeEvent = null;
  let summaryTitle = '';
  let rosterOrdersByTeam = {};
  let roleAssignmentsByTeam = {};

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

      const isTeamMode = (isSessionMode() ? activeSession?.participationType : activeLeague?.participationType) === 'team';
      const currentPlayerId = getCurrentPlayerId();

      const headingEl = playerSelectorUI?.querySelector('h2');
      if (headingEl) {
        headingEl.textContent = isTeamMode ? 'Team Selection' : 'Player Selection';
      }

      if (isTeamMode) {
        const selectableTeams = getSelectableTeams({
          activeMatchupId: getActiveTeamEventMatchupId() || getActiveEventMatchupId(),
          eventMatchups,
          allLeaguesCache,
          leagueId,
          sessionTeams: isSessionMode() ? activeSession?.teams : undefined
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
          currentPlayerId,
          sessionPlayers: isSessionMode() ? getSessionPlayers() : undefined
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
              if (isTeamMode) {
                setActiveTeamIdSilent(val || '');
                setCurrentPlayerIdSilent('');
              } else {
                setCurrentPlayerIdSilent(val || '');
                setActiveTeamIdSilent('');
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
      ? normalized.filter(s => Number(s.teamId ?? 0) === selectedId)
      : normalized.filter(s => Number(s.playerId ?? 0) === selectedId);

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
          const isTeamMode = (isSessionMode() ? activeSession?.participationType : activeLeague?.participationType) === 'team';
          // Use the per-half-inning eventMatchupId from the round entry,
          // NOT the URL-level activeEventMatchupId which always points to the first half-inning.
          const rowEventMatchupId = round.eventMatchupId || getActiveEventMatchupId();
          // Compute fresh totals from current DOM values instead of stale lastCalcResult
          let totals = null;
          if (!isTeamMode) {
            const freshResult = Engine.calculateTurnResults(machines, getScoreMapFromInputs());
            totals = { home: freshResult.homeScore, away: freshResult.awayScore };
          }

          if (isTeamMode) {
            const selectedTeamId = Number(getActiveTeamId() || getCurrentPlayerId());
            const activeTemId = getActiveTeamEventMatchupId();
            const gameTemId = activeTemId
              ? Number(activeTemId)
              : (round.teamEventMatchupId ? Number(round.teamEventMatchupId) : (eventMatchups?.[0]?.id ? Number(eventMatchups[0].id) : null));

            if (window.PB_DEBUG_MODE) {
              console.log('[ScoresPage] Team save:', {
                teamId: selectedTeamId,
                orderNumber: scoreData.orderNumber,
                machineId: scoreData.machineId,
                ball1: scoreData.ball1,
                ball2: scoreData.ball2,
                ball3: scoreData.ball3,
                gameTemId
              });
            }

            await PB_API.teamScores.save({
              teamId: selectedTeamId,
              orderNumber: scoreData.orderNumber,
              eventId: Number(getActiveEventId()),
              machineId: scoreData.machineId,
              ball1: scoreData.ball1,
              ball2: scoreData.ball2,
              ball3: scoreData.ball3,
              ball1PlayerId: scoreData.ball1PlayerId ?? null,
              ball2PlayerId: scoreData.ball2PlayerId ?? null,
              ball3PlayerId: scoreData.ball3PlayerId ?? null,
              teamEventMatchupId: gameTemId,
            });
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
          const isTeamMode = (isSessionMode() ? activeSession?.participationType : activeLeague?.participationType) === 'team';
          try {
            if (isTeamMode) {
              const activeMatchupId = getActiveTeamEventMatchupId();
              allEventScores = activeMatchupId
                ? await PB_API.teamScores.get({ teamEventMatchupId: Number(activeMatchupId) })
                : await PB_API.teamScores.get({ eventId: Number(getActiveEventId()) });
            } else if (getActiveEventMatchupId()) {
              allEventScores = await PB_API.scores.get({ eventMatchupId: Number(getActiveEventMatchupId()) });
            } else {
              allEventScores = await PB_API.scores.get({ eventId: Number(getActiveEventId()) });
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
        const branding = Engine?.getBranding ? Engine.getBranding() : FormatBranding.get(activeFormat);
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
    const isTeamMode = (isSessionMode() ? activeSession?.participationType : activeLeague?.participationType) === 'team';

    // ── TEAM MODE ──────────────────────────────────────────────────────────
    if (isTeamMode) {
      // Populate selectablePlayers before auto-select so team lookup works
      await renderPlayerSelect();

      let activeTeamId = getActiveTeamId() || getCurrentPlayerId();

      // Auto-select the team the current user belongs to
      const autoTeamId = getAutoSelectedTeamId({
        currentUser,
        selectableTeams: selectablePlayers,
        activeTeamId
      });

      if (autoTeamId && autoTeamId !== activeTeamId) {
        activeTeamId = autoTeamId;
        setActiveTeamIdSilent(activeTeamId);
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

      const teamsPool = isSessionMode() ? (activeSession?.teams || []) : (activeLeague?.teams || []);
      const selectedTeam = teamsPool.find(t => String(t.id) === String(activeTeamId));
      if (!selectedTeam) return;

      const loader = skipSkeleton ? null : createSkeletonLoader(roundsInput, { count: 5 });
      try {
        // Fetch scores for this specific matchup (or event if no matchup) in Team mode
        const activeMatchupId = getActiveTeamEventMatchupId();
        const scores = activeMatchupId
          ? await PB_API.teamScores.get({ teamEventMatchupId: Number(activeMatchupId) })
          : await PB_API.teamScores.get({ eventId: Number(getActiveEventId()) });
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
          Number(s.teamId ?? 0) === Number(selectedTeam.id) &&
          (Number(s.ball1 || 0) > 0 || Number(s.ball2 || 0) > 0 || Number(s.ball3 || 0) > 0)
        );

        // Team Setup bar
        let teamBar = scoringCard.querySelector('.team-actions-bar');
        if (!teamBar) {
          teamBar = document.createElement('div');
          teamBar.className = 'team-actions-bar flex-between align-center p-12 mb-15';
          teamBar.style.cssText = 'background: #e3f2fd; border: 1px solid #90caf9; border-radius: 6px;';
          scoringCard.insertBefore(teamBar, scoringCard.firstChild);
        }
        // Check Team Setup permission: TD/Admin, active team member, or logged-in user when team has unregistered members
        const isLoggedIn = !!currentUser;
        const isTDOrAdmin = isLoggedIn && (currentUser?.role === 'admin' || currentUser?.role === 'td');
        const teamMembers = selectedTeam.members || [];
        const isTeamMember = isLoggedIn && teamMembers.some(m => String(m.id) === String(currentUser?.player_id));
        const hasUnregisteredMembers = isLoggedIn && teamMembers.some(m => !m.userId);
        const canManageTeamSetup = isTDOrAdmin || isTeamMember || hasUnregisteredMembers;

        let lockReason = '';
        if (teamHasScores) {
          lockReason = '🔒 Locked (Scores Entered)';
        } else if (!isLoggedIn) {
          lockReason = '🔒 Locked (Login Required)';
        } else if (!canManageTeamSetup) {
          lockReason = '🔒 Locked (Spectator Mode)';
        }

        const isSetupDisabled = teamHasScores || !canManageTeamSetup;

        const setupActions = Engine?.getTeamSetupActions ? Engine.getTeamSetupActions() : [];
        const actionsHtml = setupActions.map(act => {
          let disabledReason = '';
          if (teamHasScores) disabledReason = `${act.label} is locked because scores have been entered for this team.`;
          else if (!isLoggedIn) disabledReason = `Login required to configure ${act.label}.`;
          else if (!canManageTeamSetup) disabledReason = `Only team members or TDs can configure ${act.label}.`;

          return `<button type="button" id="btn-${act.id}" class="btn-row secondary" ${isSetupDisabled ? 'disabled title="' + escapeHTML(disabledReason) + '"' : ''}>${escapeHTML(act.label)}</button>`;
        }).join('');

        teamBar.innerHTML = `
          <div>
            <strong style="color: #1565c0;">Team Setup: ${escapeHTML(selectedTeam.name)}</strong>
            ${lockReason ? `<span class="ml-8" style="font-size: 0.85em; color: #c62828; font-weight: bold;">${lockReason}</span>` : ''}
          </div>
          <div class="flex gap-8">
            ${actionsHtml}
          </div>
        `;

        if (!isSetupDisabled) {
          setupActions.forEach(act => {
            const btn = teamBar.querySelector(`#btn-${act.id}`);
            if (!btn) return;
            btn.addEventListener('click', async () => {
              const teamIdStr = String(selectedTeam.id);
              if (act.action === 'rosterOrder') {
                const currentOrder = rosterOrdersByTeam[teamIdStr] || selectedTeam.members || [];
                const res = await showRosterOrderDialog({
                  team: selectedTeam,
                  members: selectedTeam.members || [],
                  currentOrder,
                  title: act.title
                });
                if (res) { rosterOrdersByTeam[teamIdStr] = res; await refreshPlayerSelection(); }
              } else if (act.action === 'roleAssignments') {
                const firstPlayerRounds = Engine.getFirstPlayerRounds(machines, getEngineContext());
                const currentAssignments = roleAssignmentsByTeam[teamIdStr] || {};
                const res = await showRoleAssignmentDialog({
                  team: selectedTeam,
                  members: selectedTeam.members || [],
                  machines: firstPlayerRounds.map(m => {
                    const orderNum = Number(m.orderNumber ?? 1);
                    const isTop = orderNum % 2 === 1;
                    const inning = Math.floor((orderNum - 1) / 2) + 1;
                    return { orderNumber: orderNum, label: `${isTop ? 'Top' : 'Bottom'} ${inning}`, machineName: m.machineName };
                  }),
                  currentAssignments,
                  roleName: act.roleName || 'Role',
                  actionLabel: act.actionLabel || 'assigned'
                });
                if (res) { roleAssignmentsByTeam[teamIdStr] = res; await refreshPlayerSelection(); }
              }
            });
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
      const activeMatchupId = activeEventMatchupId || getActiveEventMatchupId();
      const scores = activeMatchupId 
        ? await PB_API.scores.get({ playerId: Number(activePlayerId), eventMatchupId: Number(activeMatchupId) })
        : await PB_API.scores.get({ playerId: Number(activePlayerId), eventId: Number(getActiveEventId()) });
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
        
        const activeMatchupIdVal = activeEventMatchupId || getActiveTeamEventMatchupId() || getActiveEventMatchupId();
        const matchup = eventMatchups.find(m => String(m.id) === String(activeMatchupIdVal)) || eventMatchups[0];
        const isTeamMode = activeLeague?.participationType === 'team';
        const awayName = isTeamMode ? (matchup?.team2Name || 'BYE') : (matchup?.player2Name || 'BYE');
        const homeName = isTeamMode ? (matchup?.team1Name || 'Unknown') : (matchup?.player1Name || 'Unknown');
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
        playerSelectorUI?.classList.add('hidden');
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
    const isTeamMode = (isSessionMode() ? activeSession?.participationType : activeLeague?.participationType) === 'team';
    const activeParticipantId = isTeamMode ? (getActiveTeamId() || getCurrentPlayerId()) : getCurrentPlayerId();
    const teamsPool = isSessionMode() ? (activeSession?.teams || []) : (activeLeague?.teams || []);
    const selectedTeam = isTeamMode ? teamsPool.find(t => String(t.id) === String(activeParticipantId)) : null;
    const selectedTeamIdStr = selectedTeam ? String(selectedTeam.id) : null;

    const teamRosterOrder = selectedTeamIdStr && rosterOrdersByTeam[selectedTeamIdStr]
      ? rosterOrdersByTeam[selectedTeamIdStr]
      : (selectedTeam?.members || []);

    const teamRoleAssignments = selectedTeamIdStr && roleAssignmentsByTeam[selectedTeamIdStr]
      ? roleAssignmentsByTeam[selectedTeamIdStr]
      : {};

    const isTDOrAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'td');

    return {
      activeParticipantId,
      allEventScores,
      eventMatchups,
      allPlayersCache,
      getCurrentPlayerId,
      getActiveTeamId,
      normalizeScores,
      groupScoresByPlayer,
      escapeHTML,
      activeLeague,
      activeSession,
      isTeamMode,
      enrichedEntries: machines,
      rosterOrder: teamRosterOrder,
      roleAssignments: teamRoleAssignments,
      rosterOrdersByTeam,
      roleAssignmentsByTeam,
      // For backwards compatibility with existing engine/test references
      battingOrder: teamRosterOrder,
      pitcherAssignments: teamRoleAssignments,
      battingOrdersByTeam: rosterOrdersByTeam,
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

    if (Engine?.hasHead2HeadScoring?.()) {
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
    let sessionId = getUrlParam('sessionId');
    const activeEventMatchupId = getActiveEventMatchupId();
    const activeTeamEventMatchupId = getActiveTeamEventMatchupId();

    if (activeEventMatchupId && (!eventId || !leagueId)) {
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

    if (activeTeamEventMatchupId && (!eventId || !leagueId)) {
      const teamMatchup = await PB_API.teamMatchups.get(null, Number(activeTeamEventMatchupId)).catch(() => null);
      if (teamMatchup) {
        eventId = String(teamMatchup.eventId);
        if (teamMatchup.leagueId) {
          leagueId = String(teamMatchup.leagueId);
          setActiveLeagueIdSilent(leagueId);
        }
        setActiveEventIdSilent(eventId);
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
    // For H2H matchups, scope the target scores to the specific matchup (not the whole event)
    const matchupRefId = activeTeamEventMatchupId || activeEventMatchupId || 0;
    const [leagues, eventTargets, allMasterMachines] = await Promise.all([
      PB_API.leagues.getAll(),
      PB_API.machines.getTargets(eventId, null, null, matchupRefId ? Number(matchupRefId) : 0),
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
      return Engine?.getDefaultFallbackTargetValues?.() || { value1: 50000000, value2: 1, values: null };
    };

    // Refresh the league list in the selector to catch any mid-session roster changes
    if (tournamentSelector) {
      tournamentSelector.setData(allLeaguesCache);
    }

    let league = null;
    let event = null;

    if (sessionId) {
      const session = await PB_API.sessions.get(sessionId);
      if (session) {
        activeSession = session;
        event = session.events?.find(e => String(e.id) === String(eventId)) || session.events?.[0];
        if (event && !eventId) {
          setActiveEventIdSilent(String(event.id));
          eventId = String(event.id);
        }
      } else {
        activeSession = null;
      }
    } else {
      activeSession = null;
    }

    if (!isSessionMode()) {
      const lid = getActiveLeagueId();
      if (lid && typeof PB_API.leagues?.get === 'function') {
        league = await PB_API.leagues.get(lid).catch(() => leagues.find(l => String(l.id) === String(lid)));
      } else {
        league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
      }
      event = league?.events?.find(e => String(e.id) === String(eventId)) || league?.events?.[0];
      if (league) activeLeague = league;
      if (event) activeEvent = event;
    }

    const format = ScoringFormats.resolve(event?.scoringFormat || league?.scoringFormat);
    activeFormat = format;
    Engine = getScoringEngine(format);

    // Ask the engine what additional data it needs for this event,
    // then fetch it generically — no format-specific branching required.
    const requiredData = Engine.getRequiredEventData(eventId, PB_API) || {};
    const isTeamMode = (isSessionMode() ? activeSession?.participationType : league?.participationType) === 'team';
    if (activeEventMatchupId || activeTeamEventMatchupId || isTeamMode) {
      const matchupId = activeTeamEventMatchupId || getActiveTeamEventMatchupId();
      if (isTeamMode) {
        if (matchupId) {
          requiredData.eventMatchups = PB_API.teamMatchups.get(null, Number(matchupId)).then(m => Array.isArray(m) ? m : (m ? [m] : [])).catch(() => []);
          requiredData.allEventScores = PB_API.teamScores.get(null, Number(matchupId)).catch(() => []);
        } else {
          requiredData.eventMatchups = PB_API.teamMatchups.get(eventId).catch(() => []);
          requiredData.allEventScores = PB_API.teamScores.get(eventId).catch(() => []);
        }
      } else if (activeEventMatchupId) {
        requiredData.eventMatchups = PB_API.matchups.get(null, Number(activeEventMatchupId)).then(m => Array.isArray(m) ? m : (m ? [m] : []));
        requiredData.allEventScores = PB_API.scores.get(null, null, null, Number(activeEventMatchupId));
      }
    }
    const requiredKeys = Object.keys(requiredData);
    const requiredValues = await Promise.all(Object.values(requiredData));
    requiredKeys.forEach((key, i) => {
      if (key === 'eventMatchups') eventMatchups = requiredValues[i] || [];
      else if (key === 'allEventScores' || key === 'scores') allEventScores = requiredValues[i] || [];
    });

    if (window.PB_DEBUG_MODE) {
      console.log('[ScoresPage] Data loaded — eventMatchups:', JSON.stringify(eventMatchups?.slice(0, 10)), 'allEventScores count:', allEventScores?.length);
    }
    // Clear any keys not declared by this engine
    if (!requiredKeys.includes('eventMatchups')) eventMatchups = [];
    if (!requiredKeys.includes('allEventScores') && !requiredKeys.includes('scores')) allEventScores = [];

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
    if (isTeamMode && eventMatchups.length > 0) {
      let currentId = getCurrentPlayerId();
      if (!currentId) {
        const selectableTeams = getSelectableTeams({
          activeMatchupId: getActiveTeamEventMatchupId() || getActiveEventMatchupId(),
          eventMatchups,
          allLeaguesCache,
          leagueId,
          sessionTeams: isSessionMode() ? activeSession?.teams : undefined
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
          setActiveTeamIdSilent(currentId);
        }
      }

      // Single temId per game — use matching matchup's entries directly
      const activeEM = eventMatchups.find(em => String(em.id) === String(getActiveTeamEventMatchupId() || getActiveEventMatchupId()))
        || eventMatchups[0];

      if (activeEM) {
        const rawEntries = activeEM.entries || [];
        const teamsSource = isSessionMode() ? (activeSession?.teams || []) : (league?.teams || []);
        const awayTeam = teamsSource.find(t => String(t.id) === String(activeEM.team2Id));
        const homeTeam = teamsSource.find(t => String(t.id) === String(activeEM.team1Id));
        let enrichedEntries = [];
        if (awayTeam && homeTeam) {
          enrichedEntries = enrichTeamMatchupEntries(rawEntries, activeEM, awayTeam.members || [], homeTeam.members || []);
        } else {
          enrichedEntries = rawEntries;
        }
        machinesNormalized = enrichedEntries.map((entry, i) => {
          const orderNum = Number(entry.orderNumber ?? entry.order_number ?? (i + 1));
          const { value1, value2, values: rawValues } = resolveTargetVal(entry, orderNum);
          let values = rawValues;
          if ((!values || Object.values(values).every(v => Number(v) === 0)) && Engine?.buildRoundValues) {
            values = Engine.buildRoundValues(value1, value2);
          }
          return {
            ...entry,
            id: entry.id,
            eventId: entry.eventId,
            teamEventMatchupId: activeEM.id ?? null,
            orderNumber: orderNum,
            machineId: entry.machineId,
            machineName: entry.machineName,
            value1,
            value2,
            values,
            playerId: entry.playerId,
            playerName: entry.playerName,
            teamId: entry.teamId,
            team1Id: entry.team1Id,
            team2Id: entry.team2Id,
            slotIndex: entry.slotIndex,
            playerOrder: entry.playerOrder,
            opponentPlayerId: entry.opponentPlayerId,
          };
        });
      }
    } else if (activeEventMatchupId && eventMatchups.length > 0) {
        // Individual mode: find matching active matchup
        const activeMatchupIdVal = activeEventMatchupId || getActiveEventMatchupId();
        const matchupDetails = eventMatchups.find(m => String(m.id) === String(activeMatchupIdVal)) || eventMatchups[0];
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

    if ((activeEventMatchupId || activeTeamEventMatchupId) && eventMatchups.length > 0) {
      const activeMatchupIdVal = activeTeamEventMatchupId || activeEventMatchupId || getActiveTeamEventMatchupId() || getActiveEventMatchupId();
      const matchup = eventMatchups.find(m => String(m.id) === String(activeMatchupIdVal)) || eventMatchups[0];
      const sessionLabel = isSessionMode() ? '' : `<div class="meta-strong">League: ${escapeHTML(league?.name || 'Unknown')}</div>`;
      summaryTitle = `
        ${sessionLabel}
        <div class="meta-muted">Week: ${escapeHTML(event?.eventName || 'Week')}</div>
        <div class="meta-muted">Matchup: ${escapeHTML(isTeamMode ? (matchup?.team2Name || 'BYE') : (matchup?.player2Name || 'BYE'))} vs ${escapeHTML(isTeamMode ? matchup?.team1Name : matchup?.player1Name)}</div>
      `;
    } else {
      const sessionTitle = isSessionMode() ? `<div class="meta-strong">Session: ${escapeHTML(getSessionName())}</div>` : `<div class="meta-strong">League: ${escapeHTML(league?.name || 'Unknown')}</div>`;
      const eventTitle = `<div class="meta-muted">Event: ${escapeHTML(event?.eventName || 'Event')}</div>`;
      summaryTitle = `${sessionTitle}${eventTitle}`;
    }

    tournamentSelectorUI.classList.add('hidden');
    updateTournamentSummary();

    applyPreferredTheme(format);
    const branding = Engine?.getBranding ? Engine.getBranding() : FormatBranding.get(format);

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

    const isH2H = !isSessionMode() && isHead2Head(league?.competitionFormat);
    const scheduleContainer = document.getElementById('matchups-schedule-container');
    
    if (isH2H && !activeEventMatchupId && !activeTeamEventMatchupId) {
      playerSelectionCard.classList.add('hidden');
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      warning.classList.add('hidden');
      
      if (scheduleContainer) {
        scheduleContainer.classList.remove('hidden');
        const matchupsList = scheduleContainer.querySelector('.week-matchups-list');
        const isAdmin = await can(PERMISSIONS.MANAGE_LEAGUES);
        const isTeamMode = league?.participationType === 'team';
        renderMatchupSchedule(matchupsList, event, {
          onPlayMatchup: (matchupId, evId) => {
            setActiveLeagueIdSilent(league.id);
            setActiveEventIdSilent(evId);
            const isTeamMode = league?.participationType === 'team';
            const navParams = isTeamMode
              ? { eventId: evId, teamEventMatchupId: matchupId, leagueId: league.id }
              : { eventId: evId, eventMatchupId: matchupId, leagueId: league.id };
            loadPage(ROUTE_PATHS.SCORES(navParams));
          },
          isAdmin,
          onSetupMatchup: isAdmin ? (matchupId, evId) => {
            openMatchupEditor({
              matchupId,
              eventId: evId,
              isTeam: isTeamMode,
              format,
              onSaved: () => {
                const navParams = isTeamMode
                  ? { leagueId: league.id, eventId: evId, teamEventMatchupId: matchupId }
                  : { leagueId: league.id, eventId: evId, eventMatchupId: matchupId };
                loadPage(ROUTE_PATHS.SCORES(navParams));
              }
            });
          } : undefined
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
