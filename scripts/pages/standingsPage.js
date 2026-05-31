import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js'; 
import { getActiveEventId, getActiveLeagueId, formatNumber } from '@scripts/utils.js';
import { initTournamentSelector } from '@ui/tournamentSelector.js';

export async function initStandingsPage() {
  const standingsHeader = document.getElementById('standings-header');
  const standingsBody = document.getElementById('standings-body');
  const standingsEmpty = document.getElementById('standings-empty');
  const standingsWrapper = document.getElementById('standings-wrapper');
  const tvBtn = document.getElementById('tv-mode-btn');
  const tvTitle = document.getElementById('tv-title');

  let isTvMode = false;
  let refreshInterval = null;
  let scrollInterval = null;

  let Engine = getScoringEngine('bowling');

  if (tvBtn) {
    tvBtn.addEventListener('click', toggleTvMode);
  }

  function toggleTvMode() {
    isTvMode = !isTvMode;
    document.body.classList.toggle('tv-mode', isTvMode);
    
    if (isTvMode) {
      tvBtn.textContent = 'Exit (Esc)';
      // Update scores every 15 seconds
      refreshInterval = setInterval(refresh, 15000);
      startAutoScroll();
      // Enter browser fullscreen if possible
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
    } else {
      tvBtn.textContent = 'TV Mode';
      clearInterval(refreshInterval);
      clearInterval(scrollInterval);
      window.scrollTo(0, 0);
      if (document.fullscreenElement) document.exitFullscreen();
    }
  }

  // Exit TV mode on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isTvMode) toggleTvMode();
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
   * Logic for the 'Season Summary' view.
   * Calculates total points for every player across every event in the league.
   * 
   * Uses bulk-fetching for all scores and target definitions to ensure fast rendering.
   */
  const renderLeagueSummary = async (leagueId) => {
    const leagues = await PB_API.getLeagues();
    const league = leagues.find(l => String(l.id) === String(leagueId));
    const engine = getScoringEngine(league?.scoringFormat || 'bowling');
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

    const rows = players.map(player => {
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
          const { total } = engine.calculateTurnResults(eventTargets, scoreMap);
          eventTotals[event.id] = total;
          totalSeasonPoints += total;
        } else { eventTotals[event.id] = null; }
      });
      return { player, eventTotals, totalSeasonPoints };
    }).sort((a, b) => b.totalSeasonPoints - a.totalSeasonPoints);

    if (tvTitle) {
      const league = leagues.find(l => String(l.id) === String(leagueId));
      tvTitle.textContent = `${league?.name || 'League'} - Season Summary`;
    }

    if (standingsHeader) standingsHeader.innerHTML = `<tr><th>#</th><th>Player</th>${events.map(e => `<th>${e.eventName}</th>`).join('')}<th>Total</th></tr>`;
    if (standingsBody) standingsBody.innerHTML = rows.map((row, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td class="player-name-cell"></td>
        ${events.map(e => `<td>${row.eventTotals[e.id] !== null ? formatNumber(row.eventTotals[e.id]) : '−'}</td>`).join('')}
        <td class="standings-total">${formatNumber(row.totalSeasonPoints)}</td>
      </tr>
    `).join('');

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
      return;
    }

    const leagues = await PB_API.getLeagues();
    const league = leagues.find(l => String(l.id) === String(leagueId));
    Engine = getScoringEngine(league?.scoringFormat || 'bowling');

    // Dynamic Summary UI Setup
    if (!tournamentSummary) {
      const selectorContainer = document.querySelector('.tournament-selector-container');
      if (selectorContainer) {
        tournamentSelectorUI = selectorContainer.closest('.tournament-selector') || selectorContainer;
        tournamentSummary = document.createElement('div');
        tournamentSummary.className = 'hidden';
        tournamentSummary.style = "display: flex; justify-content: space-between; align-items: center; padding: 6px 12px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 5px;";
        tournamentSummaryText = document.createElement('span');
        tournamentSummaryText.style = "font-weight: bold; font-size: 1.1rem;";
        const changeBtn = document.createElement('button');
        changeBtn.className = 'secondary';
        changeBtn.style = "padding: 4px 10px; font-size: 0.85rem;";
        changeBtn.textContent = 'Change';
        changeBtn.onclick = () => {
          tournamentSelectorUI.classList.remove('hidden');
          tournamentSummary.classList.add('hidden');
        };
        tournamentSummary.appendChild(tournamentSummaryText);
        tournamentSummary.appendChild(changeBtn);
        tournamentSelectorUI.before(tournamentSummary);
      }
    }

    if (tournamentSelectorUI && tournamentSummary) {
      const event = eventId === 'summary' ? { eventName: 'Season Summary' } : league?.events.find(e => String(e.id) === String(eventId));
      tournamentSummaryText.textContent = `${league?.name || 'League'} - ${event?.eventName || 'Event'}`;
      tournamentSelectorUI.classList.add('hidden');
      tournamentSummary.classList.remove('hidden');
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

    if (tvTitle) {
      const event = league?.events?.find(e => String(e.id) === String(eventId));
      tvTitle.textContent = `${league?.name || 'League'} - ${event?.eventName || 'Event'}`;
    }

    const rows = players.map(player => {
      const scores = scoresByPlayer[player.id] || [];
      const scoreMap = scores.reduce((map, row) => {
        map[String(row.orderNumber)] = { ball1: Number(row.ball1), ball2: Number(row.ball2), ball3: Number(row.ball3) };
        return map;
      }, {});
      // Check all three possible balls to see if a turn has data
      const ordersWithScores = new Set(scores.filter(s => Number(s.ball1) > 0 || Number(s.ball2) > 0 || Number(s.ball3) > 0).map(s => s.orderNumber));
      const { turnResults, total } = Engine.calculateTurnResults(machines, scoreMap);
      return { player, turnResults, total, ordersWithScores };
    }).sort((a, b) => b.total - a.total);

    if (standingsHeader) standingsHeader.innerHTML = `<tr><th>#</th><th>Player</th>${machines.map(m => `<th>${Engine.getTurnHeaderPrefix()} ${m.orderNumber}</th>`).join('')}<th>Total</th></tr>`;
    if (standingsBody) standingsBody.innerHTML = rows.map((res, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="player-name-cell"></td>
        ${res.turnResults.map(t => `
          <td class="standings-round ${res.ordersWithScores.has(t.orderNumber) ? 'has-score' : 'no-score'}">
            <div class="standings-mark">${res.ordersWithScores.has(t.orderNumber) ? t.mark : '−'}</div>
            <div class="standings-round-score">${res.ordersWithScores.has(t.orderNumber) ? formatNumber(t.score) : ''}</div>
          </td>`).join('')}
        <td class="standings-total">${formatNumber(res.total)}</td>
      </tr>`).join('');

    if (standingsBody) {
      standingsBody.querySelectorAll('.player-name-cell').forEach((cell, i) => { cell.textContent = rows[i].player.playerName; });
    }
    if (standingsEmpty) standingsEmpty.classList.add('hidden');
    if (standingsWrapper) standingsWrapper.classList.remove('hidden');
  };

  initTournamentSelector(refresh);
}