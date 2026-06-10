import { PB_API } from '@services/api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { applyPreferredTheme, fitTVModeToScreen } from '@ui/branding.js';
import { showDialog } from '@ui/dialogs.js';
import { renderActionSummary, initTournamentSelector } from '@ui/selectors.js';
import { filterLeaguesForUser } from '@services/auth.js'; // Import for filtering
import { normalizeTargets, normalizeScores, groupTargetsByEvent, groupScoresByEventAndPlayer, groupScoresByPlayer, buildScoreMapFromRows } from '@services/normalizer.js';
import { calculateSeasonSummary } from '@services/seasonCalculator.js';

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

  let tournamentSelector = null;
  let isTvMode = false;
  let refreshInterval = null;
  let scrollInterval = null;
  let wakeLock = null;
  let selectedPlayerIds = []; // Not preserved in localStorage per request
  let lastScoreState = new Map(); // Tracks playerId-orderNumber -> ballString for change detection

  let Engine = getScoringEngine('bowling');

  // Fetch initial data to check context
  const allLeagues = await PB_API.getLeagues(); // Use a more descriptive name
  const currentUser = await PB_API.getCurrentUser(); // Fetch current user for filtering

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
    tvBtn.addEventListener('click', toggleTvMode);
  }

  async function toggleTvMode() {
    if (!getActiveEventId()) return; // Cannot enter TV Mode without a selection

    isTvMode = !isTvMode;
    document.body.classList.toggle('tv-mode-active', isTvMode);
    
    if (isTvMode) {
      tvBtn.textContent = 'Exit (Esc)';
      fitTVModeToScreen();
      // Update scores every 15 seconds
      refreshInterval = setInterval(refresh, 15000);
      startAutoScroll();
      // Enter browser fullscreen if possible
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }

      // Request Screen Wake Lock to prevent the display from sleeping
      if ('wakeLock' in navigator) {
        try {
          wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
          console.error('[TV Mode] Wake Lock request failed:', err);
        }
      }
    } else {
      tvBtn.textContent = 'TV Mode';
      clearInterval(refreshInterval);
      clearInterval(scrollInterval);
      window.scrollTo(0, 0);
      if (document.fullscreenElement) document.exitFullscreen();

      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    }
  }

  // Exit TV mode on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isTvMode) toggleTvMode();
  });

  // Re-acquire wake lock if the tab becomes visible again while in TV mode
  document.addEventListener('visibilitychange', async () => {
    if (isTvMode && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.error('[TV Mode] Re-acquiring Wake Lock failed:', err);
      }
    }
  });

  function startAutoScroll() {
    clearInterval(scrollInterval);
    scrollInterval = setInterval(() => {
      if (!isTvMode) return;
      
      const scrollSpeed = 1; // Pixels per tick
      window.scrollBy(0, scrollSpeed);

      // Check if we reached the bottom
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 2) {
        // Stay at bottom for 5 seconds then reset to top
        clearInterval(scrollInterval);
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          setTimeout(startAutoScroll, 2000);
        }, 5000);
      }
    }, 50); // ~20fps scroll
  }

  /**
   * Shows a multi-select dialog to filter which players are visible.
   */
  async function openPlayerFilterDialog(players) {
    const content = document.createElement('div');
    content.className = 'player-filter-grid';
    
    players.sort((a,b) => a.playerName.localeCompare(b.playerName)).forEach(p => {
        const label = document.createElement('label');
      label.className = 'player-filter-label';
      const isChecked = selectedPlayerIds.length === 0 || selectedPlayerIds.includes(String(p.id));
      label.innerHTML = `<input type="checkbox" value="${p.id}" ${isChecked ? 'checked' : ''} class="checkbox-lg">
        <span class="ellipsis flex-1">${p.playerName}</span>`;
      content.appendChild(label);
      });

    const result = await showDialog({
      title: 'Select Players to Show',
      message: 'Choose players for your scoreboard view. Uncheck players to hide them.',
      confirmText: 'Apply Filter',
      cancelText: 'Reset to All',
      customElement: content
    });

    if (result === null) return; // Escape/Cancel

    if (result === false) {
      selectedPlayerIds = [];
    } else {
      const checked = Array.from(content.querySelectorAll('input:checked')).map(i => i.value);
      // If everyone is checked, just clear the filter
      selectedPlayerIds = checked.length === players.length ? [] : checked;
    }
    refresh();
  }

  function renderFilterUI(players) {
    if (!playerFilterContainer || isTvMode) return;
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
      PB_API.getLeagues(),
      PB_API.getTeams()
    ]);
    const league = leagues.find(l => String(l.id) === String(leagueId));
    const format = league?.scoringFormat || 'bowling';
    const engine = getScoringEngine(format);
    const isTeamLeague = league?.participants === 'team';

    applyPreferredTheme(format);
    
    let players = league?.players || [];
    if (league?.participants === 'team') {
      const memberMap = new Map();
      (league.teams || []).forEach(t => {
        (t.members || []).forEach(m => memberMap.set(String(m.id), { ...m, id: Number(m.id) }));
      });
      players = Array.from(memberMap.values());
    }

    const events = league?.events || [];

    const [rawScores, allLeagueTargets] = await Promise.all([
      PB_API.getScores(null, null, leagueId),
      PB_API.getTargetScores(null, leagueId)
    ]);

    const normalizedLeagueTargets = normalizeTargets(allLeagueTargets);
    const targetsByEvent = groupTargetsByEvent(normalizedLeagueTargets);
    const normalizedScores = normalizeScores(rawScores);
    const scoresByEventAndPlayer = groupScoresByEventAndPlayer(normalizedScores);

    const result = calculateSeasonSummary({ league, players, events, targetsByEvent, scoresByEventAndPlayer, engine, selectedPlayerIds });
    const rows = result.rows;

    if (!isTeamLeague) renderFilterUI(players);

    if (tvTitle) {
      const league = leagues.find(l => String(l.id) === String(leagueId));
      tvTitle.textContent = `${league?.name || 'League'} - Season Summary`;
    }

    const playerLabel = isTeamLeague ? 'Team' : 'Player';

    if (standingsHeader) standingsHeader.innerHTML = `<tr><th class="text-center">#</th><th class="text-center">${playerLabel}</th>${events.map((e, i) => `<th class="text-center">${i + 1}</th>`).join('')}<th class="text-center">Total</th></tr>`;
    
    if (standingsBody) {
      standingsBody.innerHTML = rows.map((res, idx) => {
        const entityName = isTeamLeague ? res.entity.name : res.entity.playerName;
        
        const eventsHtml = events.map(e => {
          const val = res.eventTotals[e.id] || '-';
          return `<td class="standings-round">${val}</td>`;
        }).join('');

        const totalDisplay = league?.seasonScoring === 'weekly' 
          ? `${res.totalSeasonPoints} pts` 
          : Engine.formatTotalScore(res.totalSeasonPoints);

        return `
          <tr>
            <td>${idx + 1}</td>
            <td class="player-name-cell">${entityName}</td>
            ${eventsHtml}
            <td class="standings-total">${totalDisplay}</td>
          </tr>`;
      }).join('');
    }

    if (standingsEmpty) standingsEmpty.classList.add('hidden');
    if (standingsWrapper) standingsWrapper.classList.remove('hidden');
  };

  // Selection UI Toggles (matching the scores page behavior)
  let tournamentSummary, tournamentSummaryText, tournamentSelectorUI;

  const refresh = async () => {
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

    if (tvBtn) tvBtn.classList.remove('hidden');
    if (standingsEmpty) standingsEmpty.classList.add('hidden');

    // If the event changed, reset player filters to ensure the full scoreboard 
    // is shown for the new context.
    if (eventId !== lastEventId) {
      selectedPlayerIds = [];
      lastEventId = eventId;
    }

    // Fetch all leagues to support both standard tournaments and one-off sessions
    const leagues = await PB_API.getLeagues();

    if (tournamentSelector) {
      tournamentSelector.setData(leagues);
    }
    const league = leagues.find(l => String(l.id) === String(leagueId));
    const event = eventId === 'summary' ? { eventName: 'Season Summary' } : league?.events.find(e => String(e.id) === String(eventId));
    
    // Priority: Event Format > League Format > Default
    const format = event?.scoringFormat || league?.scoringFormat || 'bowling';
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
        ? (event?.eventName || 'Session Scoreboard')
        : `${league?.name || 'League'} - ${event?.eventName || 'Event'}`;

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

    const rawMachines = await PB_API.getTargetScores(eventId);
    const [rawScores, allTeamsData] = await Promise.all([
      PB_API.getScores(null, Number(eventId)),
      PB_API.getTeams()
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

    const rows = filteredPlayers.map(player => {
      const scores = scoresByPlayer[player.id] || [];
      const scoreMap = buildScoreMapFromRows(scores);
      // Check all three possible balls to see if a turn has data
      const ordersWithScores = new Set(scores.filter(s => Number(s.ball1) > 0 || Number(s.ball2) > 0 || Number(s.ball3) > 0).map(s => s.orderNumber));
      
      // Map for pulse animation detection
      scores.forEach(s => {
        currentScoreState.set(`${s.playerId}-${s.orderNumber}`, `${s.ball1}-${s.ball2}-${s.ball3}`);
      });

      const { turnResults, total, totalDisplay } = Engine.calculateTurnResults(machines, scoreMap);

      return { player, turnResults, total, totalDisplay, ordersWithScores };
    });

    const isTeamLeague = league?.participants === 'team';
    const playerLabel = isTeamLeague ? 'Team' : 'Player';

    if (standingsHeader) standingsHeader.innerHTML = `<tr><th class="text-center">#</th><th class="text-center">${playerLabel}</th>${machines.map(m => `<th class="text-center">${m.orderNumber}</th>`).join('')}<th class="text-center">Total</th></tr>`;
    
    if (standingsBody) {
      if (isTeamLeague) {
        const leagueTeamIds = new Set((league.teams || []).map(t => t.id));
        const teams = allTeamsData.filter(t => leagueTeamIds.has(t.id));

        const teamResults = teams.map(team => {
          const memberIds = new Set(team.members.map(m => m.id));
          const teamMembers = rows.filter(r => memberIds.has(r.player.id));
          const teamTotal = teamMembers.reduce((sum, m) => sum + m.total, 0);
          return { team, teamMembers, teamTotal };
        }).sort((a, b) => Engine.compareScores(a.teamTotal, b.teamTotal));

        standingsBody.innerHTML = teamResults.map((tr, idx) => {
          const teamHeader = `<tr class="team-header"><td class="text-center">${idx + 1}</td><td colspan="${machines.length + 1}">${tr.team.name}</td><td class="standings-total">${Engine.formatTotalScore(tr.teamTotal)}</td></tr>`;
          const memberRows = tr.teamMembers.map(res => {
            let rowHasUpdate = false;
            const turnsHtml = res.turnResults.map(t => {
              const scoreKey = `${res.player.id}-${t.orderNumber}`;
              const isNew = lastScoreState.has(scoreKey) && lastScoreState.get(scoreKey) !== currentScoreState.get(scoreKey);
              if (isNew) rowHasUpdate = true;
              return `<td class="standings-round ${t.played ? 'has-score' : 'no-score'} ${(isTvMode && isNew) ? 'score-just-updated' : ''}"><div class="standings-mark">${t.displayMark}</div><div class="standings-round-score">${t.displayRoundTotal}</div></td>`;
            }).join('');
              return `<tr><td></td><td class="player-name-cell player-name-indent">${res.player.playerName}</td>${turnsHtml}<td class="standings-total ${rowHasUpdate ? 'score-just-updated' : ''}">${res.totalDisplay}</td></tr>`;
          }).join('');
          return teamHeader + memberRows;
        }).join('');
      } else {
        const sortedRows = rows.sort((a, b) => Engine.compareScores(a.total, b.total));
        standingsBody.innerHTML = sortedRows.map((res, idx) => {
          let rowHasUpdate = false;
            const turnsHtml = res.turnResults.map(t => {
              const scoreKey = `${res.player.id}-${t.orderNumber}`;
              const isNew = lastScoreState.has(scoreKey) && lastScoreState.get(scoreKey) !== currentScoreState.get(scoreKey);
              if (isNew) rowHasUpdate = true;
              return `<td class="standings-round ${t.played ? 'has-score' : 'no-score'} ${(isTvMode && isNew) ? 'score-just-updated' : ''}"><div class="standings-mark">${t.displayMark}</div><div class="standings-round-score">${t.displayRoundTotal}</div></td>`;
            }).join('');

          return `
          <tr>
            <td>${idx + 1}</td>
            <td class="player-name-cell">${res.player.playerName}</td>
            ${turnsHtml}
            <td class="standings-total ${rowHasUpdate ? 'score-just-updated' : ''}">${res.totalDisplay}</td>
          </tr>`;
        }).join('');
      }
    }

    lastScoreState = currentScoreState;

    if (standingsEmpty) standingsEmpty.classList.add('hidden');
    if (standingsWrapper) standingsWrapper.classList.remove('hidden');
  };

  tournamentSelector = await initTournamentSelector('.tournament-selector-container', { 
    onRefresh: refresh, 
    existingLeagues: allLeagues, // Pass the full list of leagues
    currentUser: currentUser // Pass the current user for filtering
  });
}