import { PB_API } from './api.js';
import { BowlingEngine } from './engine.js'; 
import { getActiveEventId, getActiveLeagueId, formatNumber } from './utils.js';
import { initTournamentSelector } from './tournamentSelector.js';

export async function initStandingsPage() {
  const standingsHeader = document.getElementById('standings-header');
  const standingsBody = document.getElementById('standings-body');
  const standingsEmpty = document.getElementById('standings-empty');
  const standingsWrapper = document.getElementById('standings-wrapper');

  const renderLeagueSummary = async (leagueId) => {
    const players = await PB_API.getPlayers();
    const leagues = await PB_API.getLeagues();
    const events = leagues.find(l => String(l.id) === String(leagueId))?.events || [];

    const [allLeagueScores, allLeagueTargets] = await Promise.all([
      PB_API.getScores(null, null, leagueId),
      PB_API.getTargetScores(null, leagueId)
    ]);

    const targetsByEvent = allLeagueTargets.reduce((acc, t) => {
      if (!acc[t.event_id]) acc[t.event_id] = [];
      acc[t.event_id].push(t);
      return acc;
    }, {});

    const scoresByEventAndPlayer = allLeagueScores.reduce((acc, s) => {
      if (!acc[s.event_id]) acc[s.event_id] = {};
      if (!acc[s.event_id][s.player_id]) acc[s.event_id][s.player_id] = [];
      acc[s.event_id][s.player_id].push(s);
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
            map[String(row.frame)] = { ball1: row.ball1, ball2: row.ball2, ball3: row.ball3 };
            return map;
          }, {});
          const { total } = BowlingEngine.calculateFrameResults(eventTargets, scoreMap);
          eventTotals[event.id] = total;
          totalSeasonPoints += total;
        } else { eventTotals[event.id] = null; }
      });
      return { player, eventTotals, totalSeasonPoints };
    }).sort((a, b) => b.totalSeasonPoints - a.totalSeasonPoints);

    standingsHeader.innerHTML = `<tr><th>#</th><th>Player</th>${events.map(e => `<th>${e.event_name}</th>`).join('')}<th>Total</th></tr>`;
    standingsBody.innerHTML = rows.map((row, idx) => `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td class="player-name-cell"></td>
        ${events.map(e => `<td>${row.eventTotals[e.id] !== null ? formatNumber(row.eventTotals[e.id]) : '−'}</td>`).join('')}
        <td class="standings-total">${formatNumber(row.totalSeasonPoints)}</td>
      </tr>
    `).join('');

    standingsBody.querySelectorAll('.player-name-cell').forEach((cell, i) => { cell.textContent = rows[i].player.player_name; });
    standingsEmpty.classList.add('hidden');
    standingsWrapper.classList.remove('hidden');
  };

  const refresh = async () => {
    const eventId = getActiveEventId();
    if (!eventId) {
      standingsWrapper.classList.add('hidden');
      standingsEmpty.classList.remove('hidden');
      return;
    }
    if (eventId === 'summary') return renderLeagueSummary(getActiveLeagueId());

    const players = await PB_API.getPlayers();
    const machines = await PB_API.getTargetScores(eventId);
    const allEventScores = await PB_API.getScores(null, Number(eventId));
    
    const scoresByPlayer = allEventScores.reduce((acc, s) => {
      if (!acc[s.player_id]) acc[s.player_id] = [];
      acc[s.player_id].push(s);
      return acc;
    }, {});

    const rows = players.map(player => {
      const scores = scoresByPlayer[player.id] || [];
      const scoreMap = scores.reduce((map, row) => {
        map[String(row.frame)] = { ball1: Number(row.ball1), ball2: Number(row.ball2), ball3: Number(row.ball3) };
        return map;
      }, {});
      const framesWithScores = new Set(scores.filter(s => s.ball1 > 0 || s.ball2 > 0).map(s => s.frame));
      const { frameResults, total } = BowlingEngine.calculateFrameResults(machines, scoreMap);
      return { player, frameResults, total, framesWithScores };
    }).sort((a, b) => b.total - a.total);

    standingsHeader.innerHTML = `<tr><th>#</th><th>Player</th>${machines.map(m => `<th>Frame ${m.frame_number}</th>`).join('')}<th>Total</th></tr>`;
    standingsBody.innerHTML = rows.map((res, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="player-name-cell"></td>
        ${res.frameResults.map(f => `
          <td class="standings-frame ${res.framesWithScores.has(f.frame) ? 'has-score' : 'no-score'}">
            <div class="standings-mark">${res.framesWithScores.has(f.frame) ? f.mark : '−'}</div>
            <div class="standings-frame-score">${res.framesWithScores.has(f.frame) ? formatNumber(f.score) : ''}</div>
          </td>`).join('')}
        <td class="standings-total">${formatNumber(res.total)}</td>
      </tr>`).join('');

    standingsBody.querySelectorAll('.player-name-cell').forEach((cell, i) => { cell.textContent = rows[i].player.player_name; });
    standingsEmpty.classList.add('hidden');
    standingsWrapper.classList.remove('hidden');
  };

  initTournamentSelector(refresh);
  refresh();
}