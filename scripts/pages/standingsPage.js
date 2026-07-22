import { PB_API } from '@services/api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId, escapeHTML } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { applyPreferredTheme, fitTVModeToScreen } from '@ui/branding.js';
import { showDialog } from '@ui/dialogs.js';
import { renderActionSummary, initTournamentSelector, createSkeletonLoader } from '@ui/selectors.js';
import { filterLeaguesForUser } from '@services/auth.js';
import { normalizeTargets, normalizeScores, groupScoresByPlayer } from '@services/normalizer.js';
import { calculateSeasonSummary, calculateHead2HeadRecords, fetchSeasonData } from '@services/seasonCalculator.js';
import { TvModeManager } from '@ui/tvMode.js';
import { renderStandingsTable } from '@scripts/renderers/standingsTableRenderer.js';

/**
 * Logic for the Standings/Scoreboard page showing player rankings and season summaries.
 * @module pages/standings
 */

/**
 * Initializes the Standings page: loads ranking data and renders the standings table.
 * @async
 * @returns {Promise<void>}
 */
export async function initStandingsPage() {
  const standingsHeader = document.getElementById('standings-header');
  const standingsBody = document.getElementById('standings-body');
  const standingsEmpty = document.getElementById('standings-empty');
  const standingsWrapper = document.getElementById('standings-wrapper');
  const tvBtn = document.getElementById('tv-mode-btn');
  const tvTitle = document.getElementById('tv-title');
  const playerFilterContainer = document.getElementById('player-filter-container');

  // Detect if we are on the dedicated /tv route to apply remote-friendly UI
  const isTvRoute = window.location.pathname.includes('/tv');
  if (isTvRoute) {
    document.body.classList.add('tv-ui-large');
  }

  let tournamentSelector = null;
  const tvModeManager = new TvModeManager({
    refreshCallback: refresh,
    fitScreenCallback: fitTVModeToScreen,
    tvBtn,
    isTvRoute
  });

  let selectedPlayerIds = []; // Not preserved in localStorage per request
  let lastScoreState = new Map(); // Tracks playerId-orderNumber -> ballString for change detection

  let Engine = getScoringEngine(ScoringFormats.DEFAULT);

  const allLeagues = await PB_API.leagues.getAll(); // Use a more descriptive name
  const currentUser = await PB_API.auth.me(); // Fetch current user for filtering

  // Guard: If we are no longer on the Standings page, abort initialization
  if (!document.getElementById('standings-body')) return;

  // If we arrive at standings without an eventId (Standard Nav entry), 
  // we must ensure we aren't "leaking" a session league into the standard scoreboard.
  const initialLeagueId = getActiveLeagueId();
  const initialEventId = getActiveEventId();

  if (initialLeagueId && !initialEventId) {
    const active = allLeagues.find(l => String(l.id) === String(initialLeagueId)); // Use the full list
    // If the active league is a session, clear it to reset the selector to standard leagues
    if (active && active.type !== 'standard') {
      setActiveLeagueId('');
      setActiveEventId('');
    }
  }
  let lastEventId = initialEventId;

  if (tvBtn) {
    tvBtn.addEventListener('click', () => {
      if (!getActiveEventId()) return;
      tvModeManager.toggle();
    });
  }

  // SPA router fires pb:pageChanged when leaving the current context
  document.addEventListener('pb:pageChanged', () => tvModeManager.cleanup(), { once: true });

  /**
   * Shows a multi-select dialog to filter which players are visible.
   */
  async function openPlayerFilterDialog(players) {
    const container = document.createElement('div');

    // Inline controls for Select/Clear All (Doesn't close the modal)
    const controls = document.createElement('div');
    controls.className = 'modal-controls-inline';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.className = 'btn-standard secondary';
    selectAllBtn.type = 'button';
    selectAllBtn.onclick = () => {
      container.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = true);
    };

    const clearAllBtn = document.createElement('button');
    clearAllBtn.textContent = 'Clear All';
    clearAllBtn.className = 'btn-standard secondary';
    clearAllBtn.type = 'button';
    clearAllBtn.onclick = () => {
      container.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = false);
    };

    controls.append(selectAllBtn, clearAllBtn);
    container.appendChild(controls);

    const grid = document.createElement('div');
    grid.className = 'player-filter-grid';
    
    players.sort((a,b) => a.playerName.localeCompare(b.playerName)).forEach(p => {
        const label = document.createElement('label');
      label.className = 'player-filter-label';
      // Default to unselected. If no filter is active, we start with a clean slate 
      // for the user to pick just the players they want.
      const isChecked = selectedPlayerIds.includes(String(p.id));
      label.innerHTML = `<input type="checkbox" value="${p.id}" ${isChecked ? 'checked' : ''} class="checkbox-lg">
        <span class="ellipsis flex-1">${p.playerName}</span>`;
      grid.appendChild(label);
      });
    container.appendChild(grid);

    const result = await showDialog({
      title: 'Select Players to Show',
      message: 'Choose players for your scoreboard view. Applying with none selected will show everyone.',
      confirmText: 'Apply Filter',
      cancelText: 'Cancel',
      customElement: container
    });

    if (result !== true) return; // Escape or Cancel

    const checked = Array.from(container.querySelectorAll('input:checked')).map(i => i.value);
    // Optimization: If everyone is checked, or if nothing is checked, we treat it as "Show Everyone"
    selectedPlayerIds = checked.length === players.length ? [] : checked;
    refresh();
  }

  function renderFilterUI(players) {
    if (!playerFilterContainer || tvModeManager.isTvMode) return;
    playerFilterContainer.innerHTML = '';

    const filterText = selectedPlayerIds.length > 0 
      ? `Viewing ${selectedPlayerIds.length} Player(s)` 
      : 'Showing Everyone';

    renderActionSummary(playerFilterContainer, filterText, [
      { text: 'Select Players / Groups', onclick: () => openPlayerFilterDialog(players) }
    ]);
  }

  /**
   * Logic for the 'Season Summary' view.
   * Calculates total points for every player across every event in the league.
   * 
   * Uses bulk-fetching for all scores and target definitions to ensure fast rendering.
   */
  const renderLeagueSummary = async (leagueId) => {
    // Fetch leagues and teams in parallel to support team-based grouping
    const [leagues, allTeamsData] = await Promise.all([
      PB_API.leagues.getAll(),
      PB_API.teams.getAll()
    ]);
    const league = leagues.find(l => String(l.id) === String(leagueId));
    const format = ScoringFormats.resolve(league?.scoringFormat);
    const engine = getScoringEngine(format);
    const isTeamLeague = league?.participants === 'team';

    applyPreferredTheme(format);
    const loader = createSkeletonLoader(standingsBody, { type: 'table', count: 10 });
    
    let players = league?.players || [];
    if (league?.participants === 'team') {
      const memberMap = new Map();
      (league.teams || []).forEach(t => {
        (t.members || []).forEach(m => memberMap.set(String(m.id), { ...m, id: Number(m.id) }));
      });
      players = Array.from(memberMap.values());
    }

    const events = league?.events || [];

    const { targetsByEvent, scoresByEventAndPlayer, matchupsByEvent } = await fetchSeasonData(leagueId, events, PB_API, engine);
    
    try {
      const result = calculateSeasonSummary({ league, players, events, targetsByEvent, scoresByEventAndPlayer, matchupsByEvent, engine, selectedPlayerIds });
      const rows = result.rows;

      if (!isTeamLeague) renderFilterUI(players);

      if (tvTitle) {
        const league = leagues.find(l => String(l.id) === String(leagueId));
        tvTitle.textContent = `${league?.name || 'League'} - Season Summary`;
      }

      renderStandingsTable({
        headerEl: standingsHeader,
        bodyEl: standingsBody,
        isSummary: true,
        league,
        event: null,
        isTeamLeague,
        rows,
        columns: events,
        engine,
        supportsMatchups: !!engine.getMatchupDescription(1),
        tvModeManager
      });

      if (standingsEmpty) standingsEmpty.classList.add('hidden');
      if (standingsWrapper) standingsWrapper.classList.remove('hidden');
    } finally {
      loader.remove();
    }
  };

  // Selection UI Toggles (matching the scores page behavior)
  let tournamentSummary, tournamentSummaryText, tournamentSelectorUI;

  async function refresh() {
    const eventId = getActiveEventId();
    const leagueId = getActiveLeagueId();

    if (!eventId) {
      if (standingsWrapper) standingsWrapper.classList.add('hidden');
      if (standingsEmpty) standingsEmpty.classList.remove('hidden');
      if (tournamentSelectorUI) tournamentSelectorUI.classList.remove('hidden');
      if (tournamentSummary) tournamentSummary.classList.add('hidden');
      if (playerFilterContainer) playerFilterContainer.classList.add('hidden');
      if (tvBtn) tvBtn.classList.add('hidden');
      return;
    }

    if (tvBtn) {
      // Hide the manual toggle on the /tv route as it auto-activates upon selection
      tvBtn.classList.toggle('hidden', isTvRoute);
      if (isTvRoute && !tvModeManager.isTvMode) tvModeManager.toggle(true);
    }
    if (standingsEmpty) standingsEmpty.classList.add('hidden');

    // If the event changed, reset player filters to ensure the full scoreboard 
    // is shown for the new context.
    if (eventId !== lastEventId) {
      selectedPlayerIds = [];
      lastEventId = eventId;
    }

    // Fetch all leagues to support both standard tournaments and one-off sessions
    const leagues = await PB_API.leagues.getAll();

    if (tournamentSelector) {
      tournamentSelector.setData(leagues);
    }
    const league = leagues.find(l => String(l.id) === String(leagueId));
    const event = eventId === 'summary' ? { eventName: 'Season Summary' } : league?.events.find(e => String(e.id) === String(eventId));
    
    // Priority: Event Format > League Format > Default
    const format = ScoringFormats.resolve(event?.scoringFormat || league?.scoringFormat);
    Engine = getScoringEngine(format);
    applyPreferredTheme(format);

    // Set up selector UI references if they don't exist
    if (!tournamentSelectorUI) {
      const selectorContainer = document.querySelector('.tournament-selector-container');
      tournamentSelectorUI = selectorContainer?.closest('.tournament-selector') || selectorContainer;
      tournamentSummary = document.getElementById('tournament-summary');
    }

    if (tournamentSelectorUI && tournamentSummary) {
      const title = league?.type === 'session' 
        ? (escapeHTML(event?.eventName) || 'Session Scoreboard')
        : `${escapeHTML(league?.name || 'League')} - ${escapeHTML(event?.eventName || 'Event')}`;

      tournamentSelectorUI.classList.add('hidden');
      
      renderActionSummary(tournamentSummary, title, [
        { text: 'Change Tournament', onclick: () => {
          tournamentSelectorUI.classList.remove('hidden');
          tournamentSummary.classList.add('hidden');
          if (standingsWrapper) standingsWrapper.classList.add('hidden');
          if (playerFilterContainer) playerFilterContainer.classList.add('hidden');
          if (tvBtn) tvBtn.classList.add('hidden');

          const search = document.getElementById('league-search-global');
          if (search) {
            search.value = '';
            search.dispatchEvent(new Event('input'));
          }
        }}
      ]);
    }

    if (eventId === 'summary') return renderLeagueSummary(leagueId);

    let players = league?.players || [];
    if (league?.participants === 'team') {
      const memberMap = new Map();
      (league.teams || []).forEach(t => {
        (t.members || []).forEach(m => memberMap.set(String(m.id), { ...m, id: Number(m.id) }));
      });
      players = Array.from(memberMap.values());
    }

    const rawMachines = await PB_API.machines.getTargets(eventId);
    const [rawScores, allTeamsData, eventMatchups] = await Promise.all([
      PB_API.scores.get(null, Number(eventId)),
      PB_API.teams.getAll(),
      Engine.getMatchupDescription(1) ? PB_API.matchups.get(eventId).catch(() => []) : Promise.resolve([])
    ]);
    
    const allEventScores = normalizeScores(rawScores);
    const machines = normalizeTargets(rawMachines);
    const scoresByPlayer = groupScoresByPlayer(allEventScores);

    // Update score state for change detection
    const currentScoreState = new Map();

    if (tvTitle) {
      const event = league?.events?.find(e => String(e.id) === String(eventId));
      if (league?.type === 'session') {
        tvTitle.textContent = event?.eventName || 'Session Scoreboard';
      } else {
        tvTitle.textContent = `${league?.name || 'League'} - ${event?.eventName || 'Event'}`;
      }
    }

    renderFilterUI(players);

    const filteredPlayers = selectedPlayerIds.length > 0 ? players.filter(p => selectedPlayerIds.includes(String(p.id))) : players;
    const isTeamLeague = league?.participants === 'team';
    const supportsMatchups = !!Engine.getMatchupDescription(1);

    const rows = filteredPlayers.map(player => {
      const scores = scoresByPlayer[player.id] || [];
      const scoreMap = Engine.buildPlayerScoreMap(player.id, scores, scoresByPlayer, eventMatchups);
      // Check all three possible balls to see if a turn has data
      const ordersWithScores = new Set(scores.filter(s => Number(s.ball1) > 0 || Number(s.ball2) > 0 || Number(s.ball3) > 0).map(s => s.orderNumber));
      
      // Map for pulse animation detection
      scores.forEach(s => {
        currentScoreState.set(`${s.playerId}-${s.orderNumber}`, `${s.ball1}-${s.ball2}-${s.ball3}`);
      });

      const { turnResults, total, totalDisplay } = Engine.calculateTurnResults(machines, scoreMap);

      const playedTurns = turnResults.filter(t => t.played);
      const totalPar = playedTurns.reduce((sum, t) => {
        const machine = machines.find(m => m.orderNumber === t.orderNumber);
        return sum + Number(machine?.value2 || 3);
      }, 0);
      const parDiff = playedTurns.length > 0 ? total - totalPar : 0;

      // Determine weekly result for matchup-based formats
      let result = null;
      if (supportsMatchups) {
        const playerMatchup = eventMatchups.find(m => {
          if (m.status !== 'completed') return false;
          const p1 = Number(m.player1Id ?? m.player1_id);
          const p2 = Number(m.player2Id ?? m.player2_id);
          return p1 === player.id || p2 === player.id;
        });
        if (playerMatchup) {
          const p1Id = Number(playerMatchup.player1Id ?? playerMatchup.player1_id);
          const r1 = Number(playerMatchup.player1Score ?? playerMatchup.player1_score ?? 0);
          const r2 = Number(playerMatchup.player2Score ?? playerMatchup.player2_score ?? 0);
          const isPlayer1 = p1Id === player.id;
          const pScore = isPlayer1 ? r1 : r2;
          const oScore = isPlayer1 ? r2 : r1;
          result = pScore > oScore ? 'Win' : (pScore < oScore ? 'Loss' : 'Tie');
        }
      }

      return { player, turnResults, total, totalDisplay, ordersWithScores, parDiff, hasScores: playedTurns.length > 0, result };
    });

    renderStandingsTable({
      headerEl: standingsHeader,
      bodyEl: standingsBody,
      isSummary: false,
      league,
      event,
      isTeamLeague,
      rows,
      columns: machines,
      engine: Engine,
      supportsMatchups,
      head2headRecordsMap: (supportsMatchups && eventMatchups.length > 0)
        ? (() => {
            const playersForRecords = filteredPlayers.map(p => ({ id: p.id }));
            const matchupsByEvent = { [eventId]: eventMatchups };
            const scoresByEvent = { [eventId]: scoresByPlayer };
            const singleEventTargets = { [eventId]: machines };
            return calculateHead2HeadRecords(playersForRecords, [{ id: eventId }], matchupsByEvent, scoresByEvent, singleEventTargets, Engine);
          })()
        : null,
      allTeamsData,
      tvModeManager,
      lastScoreState,
      currentScoreState
    });

    lastScoreState = currentScoreState;

    if (standingsEmpty) standingsEmpty.classList.add('hidden');
    if (standingsWrapper) standingsWrapper.classList.remove('hidden');
  }

  tournamentSelector = await initTournamentSelector('.tournament-selector-container', { 
    onRefresh: refresh, 
    existingLeagues: allLeagues, // Pass the full list of leagues
    currentUser: currentUser, // Pass the current user for filtering
    filterLeagues: false
  });
}
