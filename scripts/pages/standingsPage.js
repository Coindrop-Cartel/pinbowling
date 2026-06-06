import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js'; 
import { getActiveEventId, getActiveLeagueId, setActiveEventId, setActiveLeagueId, formatNumber } from '@scripts/utils.js';
import { initTournamentSelector, renderActionSummary } from '@ui/selectors.js';
import { fitTVModeToScreen, applyPreferredTheme } from '@ui/branding.js';
import { showDialog } from '@ui/dialogs.js';

export async function initStandingsPage() {
  const standingsHeader = document.getElementById('standings-header');
  const standingsBody = document.getElementById('standings-body');
  const standingsEmpty = document.getElementById('standings-empty');
  const standingsWrapper = document.getElementById('standings-wrapper');
  const tvBtn = document.getElementById('tv-mode-btn');
  const tvTitle = document.getElementById('tv-title');
  const playerFilterContainer = document.getElementById('player-filter-container');

  let isTvMode = false;
  let refreshInterval = null;
  let scrollInterval = null;
  let wakeLock = null;
  let selectedPlayerIds = []; // Not preserved in localStorage per request
  let lastScoreState = new Map(); // Tracks playerId-orderNumber -> ballString for change detection

  let Engine = getScoringEngine('bowling');

  // Fetch initial data to check context
  const initialLeagues = await PB_API.getLeagues();

  // If we arrive at standings without an eventId (Standard Nav entry), 
  // we must ensure we aren't "leaking" a session league into the standard scoreboard.
  const initialLeagueId = getActiveLeagueId();
  const initialEventId = getActiveEventId();

  if (initialLeagueId && !initialEventId) {
    const active = initialLeagues.find(l => String(l.id) === String(initialLeagueId));
    // If the active league is a session, clear it to reset the selector to standard leagues
    if (active && active.type !== 'standard') {
      setActiveLeagueId('');
      setActiveEventId('');
    }
  }

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
    content.style = "max-height: 400px; overflow-y: auto; margin: 15px 0; border: 1px solid #eee; padding: 15px; display: grid; grid-template-columns: repeat(2, 1fr); column-gap: 20px; row-gap: 5px;";
    
    players.sort((a,b) => a.playerName.localeCompare(b.playerName)).forEach(p => {
        const label = document.createElement('label');
      label.style = "display: flex; align-items: center; gap: 10px; padding: 6px 0; cursor: pointer; border-bottom: 1px solid #f5f5f5; min-width: 0;";
        const isChecked = selectedPlayerIds.length === 0 || selectedPlayerIds.includes(String(p.id));
      label.innerHTML = `<input type="checkbox" value="${p.id}" ${isChecked ? 'checked' : ''} style="width: 18px !important; height: 18px !important; margin: 0 !important; flex-shrink: 0; cursor: pointer;"> <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.95rem; flex: 1;">${p.playerName}</span>`;
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
    // Fetch all leagues to ensure we can resolve metadata regardless of type
    const leagues = await PB_API.getLeagues();
    const league = leagues.find(l => String(l.id) === String(leagueId));
    const format = league?.scoringFormat || 'bowling';
    const engine = getScoringEngine(format);
    applyPreferredTheme(format);
    const players = league?.players || [];
    const events = league?.events || [];

    const [allLeagueScores, allLeagueTargets] = await Promise.all([
      PB_API.getScores(null, null, leagueId),
      PB_API.getTargetScores(null, leagueId)
    ]);

    const targetsByEvent = allLeagueTargets.reduce((acc, t) => {
      if (!acc[t.eventId]) acc[t.eventId] = [];
      acc[t.eventId].push(t);
      return acc;
    }, {});

    const scoresByEventAndPlayer = allLeagueScores.reduce((acc, s) => {
      if (!acc[s.eventId]) acc[s.eventId] = {};
      if (!acc[s.eventId][s.playerId]) acc[s.eventId][s.playerId] = [];
      acc[s.eventId][s.playerId].push(s);
      return acc;
    }, {});

    const filteredPlayers = selectedPlayerIds.length > 0 ? players.filter(p => selectedPlayerIds.includes(String(p.id))) : players;

    // Pre-calculate which targets a player has actually touched across the whole league
    // to ensure par-relativity is accurate for the season total.
    const getPlayedTargets = (playerId) => {
      return allLeagueTargets.filter(target => {
        const playerScores = scoresByEventAndPlayer[target.eventId]?.[playerId] || [];
        return playerScores.some(s => Number(s.orderNumber) === Number(target.orderNumber));
      });
    };

    const rows = filteredPlayers.map(player => {
      let totalSeasonPoints = 0;
      const eventTotals = {};
      events.forEach(event => {
        const eventTargets = targetsByEvent[event.id] || [];
        const playerEventScores = scoresByEventAndPlayer[event.id]?.[player.id] || [];

        if (playerEventScores.length > 0 && eventTargets.length > 0) {
          const scoreMap = playerEventScores.reduce((map, row) => {
            map[String(row.orderNumber)] = { ball1: Number(row.ball1), ball2: Number(row.ball2), ball3: Number(row.ball3) };
            return map;
          }, {});

          // Pass eventTargets to calculateTurnResults for correct par calculation in Golf
          const { total, totalDisplay } = engine.calculateTurnResults(eventTargets, scoreMap); 
          eventTotals[event.id] = totalDisplay;
          totalSeasonPoints += total; 
        } else { eventTotals[event.id] = null; }
      });

      return { player, eventTotals, totalSeasonPoints, playedTargets: getPlayedTargets(player.id) };
    }).sort((a, b) => engine.compareScores(a.totalSeasonPoints, b.totalSeasonPoints));

    renderFilterUI(players);

    if (tvTitle) {
      const league = leagues.find(l => String(l.id) === String(leagueId));
      tvTitle.textContent = `${league?.name || 'League'} - Season Summary`;
    }

    if (standingsHeader) standingsHeader.innerHTML = `<tr><th>#</th><th>Player</th>${events.map(e => `<th>${e.eventName}</th>`).join('')}<th>Total</th></tr>`;
    if (standingsBody) standingsBody.innerHTML = rows.map((row, idx) => {
      return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td class="player-name-cell"></td>
        ${events.map(e => `<td>${row.eventTotals[e.id] !== null ? row.eventTotals[e.id] : '−'}</td>`).join('')}
        <td class="standings-total">${engine.formatTotalScore(row.totalSeasonPoints, row.playedTargets)}</td>
      </tr>
    `;}).join('');

    if (standingsBody) {
      standingsBody.querySelectorAll('.player-name-cell').forEach((cell, i) => { cell.textContent = rows[i].player.playerName; });
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

    // Fetch all leagues to support both standard tournaments and one-off sessions
    const leagues = await PB_API.getLeagues();
    const league = leagues.find(l => String(l.id) === String(leagueId));
    const format = league?.scoringFormat || 'bowling';
    Engine = getScoringEngine(format);
    applyPreferredTheme(format);

    // Set up selector UI references if they don't exist
    if (!tournamentSelectorUI) {
      const selectorContainer = document.querySelector('.tournament-selector-container');
      tournamentSelectorUI = selectorContainer?.closest('.tournament-selector') || selectorContainer;
      tournamentSummary = document.getElementById('tournament-summary');
    }

    if (tournamentSelectorUI && tournamentSummary) {
      const event = eventId === 'summary' ? { eventName: 'Season Summary' } : league?.events.find(e => String(e.id) === String(eventId));
      
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

    const players = league?.players || [];
    const machines = await PB_API.getTargetScores(eventId);
    const allEventScores = await PB_API.getScores(null, Number(eventId));
    
    const scoresByPlayer = allEventScores.reduce((acc, s) => {
      if (!acc[s.playerId]) acc[s.playerId] = [];
      acc[s.playerId].push(s);
      return acc;
    }, {});

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
      const scoreMap = scores.reduce((map, row) => {
        map[String(row.orderNumber)] = { ball1: Number(row.ball1), ball2: Number(row.ball2), ball3: Number(row.ball3) };
        return map;
      }, {});
      // Check all three possible balls to see if a turn has data
      const ordersWithScores = new Set(scores.filter(s => Number(s.ball1) > 0 || Number(s.ball2) > 0 || Number(s.ball3) > 0).map(s => s.orderNumber));
      
      // Map for pulse animation detection
      scores.forEach(s => {
        currentScoreState.set(`${s.playerId}-${s.orderNumber}`, `${s.ball1}-${s.ball2}-${s.ball3}`);
      });

      const { turnResults, total, totalDisplay } = Engine.calculateTurnResults(machines, scoreMap);

      return { player, turnResults, total, totalDisplay, ordersWithScores };
    }).sort((a, b) => Engine.compareScores(a.total, b.total));

    if (standingsHeader) standingsHeader.innerHTML = `<tr><th>#</th><th>Player</th>${machines.map(m => `<th>${Engine.getTurnHeaderPrefix()} ${m.orderNumber}</th>`).join('')}<th>Total</th></tr>`;
    if (standingsBody) standingsBody.innerHTML = rows.map((res, idx) => {
      let rowHasUpdate = false;
      const turnsHtml = res.turnResults.map(t => {
          const scoreKey = `${res.player.id}-${t.orderNumber}`;
          const isNew = lastScoreState.has(scoreKey) && lastScoreState.get(scoreKey) !== currentScoreState.get(scoreKey);
          if (isNew) rowHasUpdate = true;

          return `
          <td class="standings-round ${t.played ? 'has-score' : 'no-score'} ${(isTvMode && isNew) ? 'score-just-updated' : ''}" style="text-align: center;">
            <div class="standings-mark">${t.displayMark}</div>
            <div class="standings-round-score">${t.displayRoundTotal}</div>
          </td>`;
      }).join('');

      return `
      <tr>
        <td>${idx + 1}</td>
        <td class="player-name-cell"></td>
        ${turnsHtml}
        <td class="standings-total ${rowHasUpdate ? 'score-just-updated' : ''}">${res.totalDisplay}</td>
      </tr>`;
    }).join('');

    lastScoreState = currentScoreState;

    if (standingsBody) {
      standingsBody.querySelectorAll('.player-name-cell').forEach((cell, i) => { cell.textContent = rows[i].player.playerName; });
    }
    if (standingsEmpty) standingsEmpty.classList.add('hidden');
    if (standingsWrapper) standingsWrapper.classList.remove('hidden');
  };

  await initTournamentSelector('.tournament-selector-container', { onRefresh: refresh, existingLeagues: initialLeagues });
}