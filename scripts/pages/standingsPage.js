import { PB_API } from '@services/api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId, escapeHTML, getUrlParam } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { applyPreferredTheme, fitTVModeToScreen } from '@ui/branding.js';
import { showMultiSelectDialog } from '@ui/dialogs.js';
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

  const initialLeagueId = getActiveLeagueId();
  const initialEventId = getActiveEventId();
  const initialSessionId = getUrlParam('sessionId');

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
    const result = await showMultiSelectDialog({
      title: 'Select Players to Show',
      message: 'Choose players for your scoreboard view. Applying with none selected will show everyone.',
      items: players
        .sort((a, b) => a.playerName.localeCompare(b.playerName))
        .map(p => ({ value: String(p.id), label: p.playerName })),
      selected: selectedPlayerIds,
      searchPlaceholder: 'Search players...'
    });

    if (result === null) return; // Escape or Cancel

    // Optimization: If everyone is selected, treat it as "Show Everyone"
    selectedPlayerIds = result.length === players.length ? [] : result;
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
    const engine = getScoringEngine(format, {
      participationType: league?.participationType,
      competitionFormat: league?.competitionFormat
    });
    const isTeamLeague = league?.participationType === 'team';

    applyPreferredTheme(format);
    const loader = createSkeletonLoader(standingsBody, { type: 'table', count: 10 });
    
    let players = league?.players || [];
    if (league?.participationType === 'team') {
      const memberMap = new Map();
      (league.teams || []).forEach(t => {
        (t.members || []).forEach(m => memberMap.set(String(m.id), { ...m, id: Number(m.id) }));
      });
      players = Array.from(memberMap.values());
    }

    const events = league?.events || [];

    const { targetsByEvent, scoresByEventAndPlayer, matchupsByEvent } = await fetchSeasonData(leagueId, events, PB_API, engine, isTeamLeague);
    
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
    const sessionId = getUrlParam('sessionId');

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

    let league = null;
    let event = null;

    if (sessionId) {
      const session = await PB_API.sessions.get(sessionId);
      if (session) {
        league = { ...session, isSession: true, participationType: 'individual' };
        event = eventId === 'summary' ? { eventName: session.name || 'Session Scoreboard' } : session.events?.find(e => String(e.id) === String(eventId)) || session.events?.[0];
      }
    }

    if (!league) {
      const leagues = await PB_API.leagues.getAll();
      if (tournamentSelector) {
        tournamentSelector.setData(leagues);
      }
      league = leagues.find(l => String(l.id) === String(leagueId));
      event = eventId === 'summary' ? { eventName: 'Season Summary' } : league?.events?.find(e => String(e.id) === String(eventId));
    }
    
    // Priority: Event Format > League Format > Default
    const format = ScoringFormats.resolve(event?.scoringFormat || league?.scoringFormat);
    Engine = getScoringEngine(format, {
      participationType: league?.participationType,
      competitionFormat: league?.competitionFormat
    });
    applyPreferredTheme(format);

    // Set up selector UI references if they don't exist
    if (!tournamentSelectorUI) {
      const selectorContainer = document.querySelector('.tournament-selector-container');
      tournamentSelectorUI = selectorContainer?.closest('.tournament-selector') || selectorContainer;
      tournamentSummary = document.getElementById('tournament-summary');
    }

    if (tournamentSelectorUI && tournamentSummary) {
      const isSession = league?.isSession === true;
      const title = isSession 
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

    const isPlayoffs = event?.eventName && event.eventName.startsWith('Playoffs:');
    const standingsTable = document.getElementById('standings-table') || standingsWrapper?.querySelector('table');
    let playoffBracketContainer = document.getElementById('playoff-bracket-container');

    if (!playoffBracketContainer && standingsWrapper) {
      playoffBracketContainer = document.createElement('div');
      playoffBracketContainer.id = 'playoff-bracket-container';
      playoffBracketContainer.className = 'hidden';
      standingsWrapper.appendChild(playoffBracketContainer);
    }

    if (isPlayoffs) {
      if (standingsTable) standingsTable.classList.add('hidden');
      if (playoffBracketContainer) {
        playoffBracketContainer.classList.remove('hidden');

        // Build bracket HTML
        const playoffEvents = (league.events || []).filter(e => e.eventName && e.eventName.startsWith('Playoffs:'));
        let rounds = [];
        if (playoffEvents.some(e => e.eventName.includes('Quarterfinals'))) {
          rounds = ['Quarterfinals', 'Semifinals', 'Finals'];
        } else if (playoffEvents.some(e => e.eventName.includes('Semifinals'))) {
          rounds = ['Semifinals', 'Finals'];
        } else {
          rounds = ['Finals'];
        }

        const roundData = {};
        playoffEvents.forEach(e => {
          const match = e.eventName.match(/Playoffs:\s*(Quarterfinals|Semifinals|Finals)/);
          if (match) {
            const rName = match[1];
            roundData[rName] = e.matchups || [];
          }
        });

        const columnsHtml = rounds.map((rName) => {
          let seriesCount = 1;
          if (rName === 'Quarterfinals') seriesCount = 4;
          else if (rName === 'Semifinals') seriesCount = 2;

          const cardsHtml = [];
          for (let sId = 1; sId <= seriesCount; sId++) {
            const games = (roundData[rName] || []).filter(m => (m.seriesId || 1) === sId);
            games.sort((a, b) => a.gameNumber - b.gameNumber);

            let awayName = 'TBD';
            let homeName = 'TBD';
            let awayWins = 0;
            let homeWins = 0;

            if (games.length > 0) {
              const firstGame = games[0];
              awayName = firstGame.player2Name || 'BYE';
              homeName = firstGame.player1Name || 'TBD';

              games.forEach(g => {
                if (g.status === 'completed') {
                  if (g.winnerId === g.player1Id) homeWins++;
                  else if (g.winnerId === g.player2Id) awayWins++;
                }
              });
            }

            const clinchCount = Math.ceil((league.playoffSeriesLength || 1) / 2);
            const finished = (homeWins >= clinchCount || awayWins >= clinchCount);
            const homeClinched = homeWins >= clinchCount;
            const awayClinched = awayWins >= clinchCount;

            cardsHtml.push(`
              <div class="bracket-series-card" style="padding: 12px; margin: 10px 0; border: 1px solid ${finished ? '#2e7d32' : (games.length > 0 ? '#2196f3' : '#ccc')}; border-radius: 6px; background: ${games.length > 0 ? '#fff' : '#f5f5f5'}; box-shadow: 0 2px 4px rgba(0,0,0,0.05); min-width: 180px;">
                <div style="font-size: 0.8em; font-weight: bold; color: ${games.length > 0 ? '#1976d2' : '#888'}; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
                  Series ${sId}
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 4px; ${awayClinched ? 'font-weight: bold; color: #2e7d32;' : ''}">
                  <span style="${games.length === 0 ? 'color: #888;' : ''}">${escapeHTML(awayName)}</span>
                  <span>${games.length > 0 ? awayWins : '-'}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.9em; ${homeClinched ? 'font-weight: bold; color: #2e7d32;' : ''}">
                  <span style="${games.length === 0 ? 'color: #888;' : ''}">${escapeHTML(homeName)}</span>
                  <span>${games.length > 0 ? homeWins : '-'}</span>
                </div>
              </div>
            `);
          }

          return `
            <div class="bracket-column" style="display: flex; flex-direction: column; justify-content: space-around; align-items: center; min-width: 200px;">
              <h4 style="text-align: center; color: #333; border-bottom: 2px solid #ddd; padding-bottom: 6px; width: 100%; margin-bottom: 10px; font-size: 0.95em;">${escapeHTML(rName)}</h4>
              <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-around; width: 100%;">
                ${cardsHtml.join('')}
              </div>
            </div>
          `;
        }).join('');

        playoffBracketContainer.innerHTML = `
          <div class="playoff-bracket-section" style="padding: 10px 0;">
            <div class="playoff-bracket-tree" style="display: flex; gap: 40px; overflow-x: auto; padding: 20px; background: #fafafa; border-radius: 6px; border: 1px solid #eaeaea; justify-content: center; min-height: 350px;">
              ${columnsHtml}
            </div>
          </div>
        `;
      }

      if (standingsEmpty) standingsEmpty.classList.add('hidden');
      if (standingsWrapper) standingsWrapper.classList.remove('hidden');
      if (playerFilterContainer) playerFilterContainer.classList.add('hidden');
      return;
    } else {
      if (standingsTable) standingsTable.classList.remove('hidden');
      if (playoffBracketContainer) playoffBracketContainer.classList.add('hidden');
      if (playerFilterContainer) playerFilterContainer.classList.remove('hidden');
    }

    let players = league?.players || [];
    if (league?.participationType === 'team') {
      const memberMap = new Map();
      (league.teams || []).forEach(t => {
        (t.members || []).forEach(m => memberMap.set(String(m.id), { ...m, id: Number(m.id) }));
      });
      players = Array.from(memberMap.values());
    }

    const rawMachines = await PB_API.machines.getTargets(eventId);
    const isTeamMode = league?.participationType === 'team';
    const fetchMatchups = isTeamMode
      ? PB_API.teamMatchups.get(eventId).catch(() => [])
      : PB_API.matchups.get(eventId).catch(() => []);
    const [rawScores, allTeamsData, eventMatchups] = await Promise.all([
      PB_API.scores.get(null, Number(eventId)),
      PB_API.teams.getAll(),
      Engine.getMatchupDescription(1) ? fetchMatchups : Promise.resolve([])
    ]);

    if (window.PB_DEBUG_MODE) {
      console.log('[StandingsPage] Loaded data for eventId=' + eventId + ' teamMode=' + isTeamMode + ' rawScores=' + (rawScores?.length ?? 0) + ' eventMatchups=', JSON.stringify(eventMatchups?.slice(0, 20)));
    }
    
    const allEventScores = normalizeScores(rawScores);
    const machines = normalizeTargets(rawMachines);
    const scoresByPlayer = groupScoresByPlayer(allEventScores);

    // Update score state for change detection
    const currentScoreState = new Map();

    if (tvTitle) {
      const isSession = league?.isSession === true;
      if (isSession) {
        tvTitle.textContent = event?.eventName || 'Session Scoreboard';
      } else {
        tvTitle.textContent = `${league?.name || 'League'} - ${event?.eventName || 'Event'}`;
      }
    }

    renderFilterUI(players);

    const filteredPlayers = selectedPlayerIds.length > 0 ? players.filter(p => selectedPlayerIds.includes(String(p.id))) : players;
    const isTeamLeague = league?.participationType === 'team';
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
