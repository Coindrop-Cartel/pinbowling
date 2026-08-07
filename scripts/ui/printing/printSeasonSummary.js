import { ScoringFormats } from '@services/scoringFormat.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';
import { formatNumber, escapeHTML } from '@scripts/utils.js';
import { normalizeTargets, normalizeScores, groupTargetsByEvent, groupScoresByEventAndPlayer, buildScoreMapFromRows, groupScoresByPlayer } from '@services/normalizer.js';
import { calculateSeasonSummary } from '@services/seasonCalculator.js';
import { computeRanks } from '../../renderers/standingsTableRenderer.js';
import { formatPrintTargets, getPrintStylesheetLink } from './printStyles.js';

/**
 * Generates a printable booklet of season results.
 * Includes a summary page, weekly player score sheets, weekly scoreboards, and the season scoreboard.
 * @param {Object} league - The league model.
 * @param {Array<Object>} players - List of roster players.
 * @param {Array<Object>} events - List of events.
 * @param {Array<Object>} locations - List of locations.
 * @param {Array<Object>} allLeagueTargets - List of targets across the league.
 * @param {Array<Object>} rawScores - List of scores entered across the league.
 * @param {Object} engine - The scoring engine.
 * @returns {void}
 */
export function printSeasonResults(league, players, events, locations, allLeagueTargets, rawScores, engine) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const format = ScoringFormats.resolve(league.scoringFormat);
  const hasH2H = typeof engine?.hasHead2HeadScoring === 'function' ? engine.hasHead2HeadScoring() : false;
  const isTeamLeague = league.participationType === 'team';
  
  const normalizedTargets = normalizeTargets(allLeagueTargets);
  const targetsByEvent = groupTargetsByEvent(normalizedTargets);
  const normalizedScores = normalizeScores(rawScores);
  const scoresByEventAndPlayer = groupScoresByEventAndPlayer(normalizedScores);

  const matchupsByEvent = {};
  events.forEach(e => {
    matchupsByEvent[e.id] = e.matchups || [];
  });

  const getScoreMapForPlayer = (eventId, playerId, scores) => {
    const scoresByPlayer = groupScoresByPlayer(Object.values(scoresByEventAndPlayer[eventId] || {}).flat());
    return engine.buildPlayerScoreMap(playerId, scores, scoresByPlayer, matchupsByEvent[eventId] || []);
  };

  const generatePlayerResultsHtml = (event, playerId, playerObj, eventMachines, scoresByEventAndPlayer, matchupsByEvent, engine) => {
    const scores = scoresByEventAndPlayer[event.id]?.[playerId] || [];
    const scoreMap = getScoreMapForPlayer(event.id, playerId, scores);
    
    const resultsHeaderHtml = `
      <div class="print-meta">
        <div class="flex-between print-mb-5">
          <div class="print-font-lg">
            <div class="print-mb-4"><strong>League:</strong> ${escapeHTML(league.name)}</div>
            <div class="print-mb-4"><strong>Event:</strong> ${escapeHTML(event.eventName)}</div>
            <div class="print-mb-4"><strong>Results</strong></div>
          </div>
          <div class="text-right">
            <div><strong>Player:</strong> ${escapeHTML(playerObj.playerName)}</div>
          </div>
        </div>
      </div>
    `;

    if (hasH2H) {
      const matchups = matchupsByEvent[event.id] || [];
      const matchup = matchups.find(m => Number(m.awayPlayerId) === playerId || Number(m.homePlayerId) === playerId);
      if (!matchup) return '';
      
      const awayId = Number(matchup.awayPlayerId);
      const homeId = Number(matchup.homePlayerId);
      
      const awayScores = scoresByEventAndPlayer[event.id]?.[awayId] || [];
      const homeScores = scoresByEventAndPlayer[event.id]?.[homeId] || [];
      
      const scoresByPlayerForEvent = {
        [awayId]: awayScores,
        [homeId]: homeScores
      };
      
      const p1Map = engine.buildPlayerScoreMap(awayId, awayScores, scoresByPlayerForEvent, [matchup]);
      const p2Map = engine.buildPlayerScoreMap(homeId, homeScores, scoresByPlayerForEvent, [matchup]);
      
      const { turnResults: p1Turns } = engine.calculateTurnResults(eventMachines, p1Map);
      const { turnResults: p2Turns } = engine.calculateTurnResults(eventMachines, p2Map);
      
      let awayTotal = 0;
      let homeTotal = 0;
      
      p1Turns.forEach(t => { if (t.played) awayTotal += t.score; });
      p2Turns.forEach(t => { if (t.played) homeTotal += t.score; });
      
      const totalRounds = Math.ceil(eventMachines.length / 2);
      const roundData = { away: {}, home: {} };
      
      const formatTurns = (turns, side) => {
        for (let i = 0; i < turns.length; i++) {
          const turn = turns[i];
          const roundNumber = Math.floor(i / 2) + 1;
          const roundKey = String(roundNumber);
          if (turn.played) {
            if (turn.isBatter && roundData[side][roundKey] === undefined) {
              roundData[side][roundKey] = String(turn.score);
            }
          } else if (turn.isWalkOff) {
            if (roundData[side][roundKey] === undefined) roundData[side][roundKey] = 'X';
          }
        }
      };
      formatTurns(p1Turns, 'away');
      formatTurns(p2Turns, 'home');
      
      let scoreboardHTML = '<div class="scoreboard-grid">';
      scoreboardHTML += '<div class="scoreboard-row header"><span class="player-col">Player</span>';
      for (let i = 1; i <= totalRounds; i++) {
        scoreboardHTML += `<span class="round-header">${i}</span>`;
      }
      scoreboardHTML += '<span class="total-header">TOTAL</span></div>';
      
      scoreboardHTML += '<div class="scoreboard-row player-row top-row">';
      scoreboardHTML += `<span class="player-name"><span class="home-away-label">Away:</span> ${escapeHTML(matchup.awayPlayerName || 'BYE')}</span>`;
      for (let i = 1; i <= totalRounds; i++) {
        scoreboardHTML += `<span class="round-score">${roundData.away[String(i)] || '-'}</span>`;
      }
      scoreboardHTML += `<span class="total-score">${awayTotal}</span></div>`;
      
      scoreboardHTML += '<div class="scoreboard-row player-row bot-row">';
      scoreboardHTML += `<span class="player-name"><span class="home-away-label">Home:</span> ${escapeHTML(matchup.homePlayerName)}</span>`;
      for (let i = 1; i <= totalRounds; i++) {
        scoreboardHTML += `<span class="round-score">${roundData.home[String(i)] || '-'}</span>`;
      }
      scoreboardHTML += `<span class="total-score">${homeTotal}</span></div>`;
      
      scoreboardHTML += '</div>';
      
      return `
        <div class="results-page">
          ${resultsHeaderHtml}
          <div class="results-content">${scoreboardHTML}</div>
        </div>
      `;
    } else {
      const calcResult = engine.calculateTurnResults(eventMachines, scoreMap);
      return `
        <div class="results-page">
          ${resultsHeaderHtml}
          <div class="results-content">
            <table class="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Machine</th>
                  <th>Score</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${(calcResult.turnResults || []).map(r => `
                  <tr>
                    <td>${r.orderNumber}</td>
                    <td>${escapeHTML(r.machineName)}</td>
                    <td>${escapeHTML(String(r.displayMark || ''))}</td>
                    <td>${escapeHTML(String(r.displayRunningTotal || ''))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="total-score">Total Score: <strong>${escapeHTML(String(calcResult.totalDisplay || '0'))}</strong></div>
          </div>
        </div>
      `;
    }
  };

  const getLocationName = (locId) => {
    const loc = locations.find(l => String(l.id) === String(locId));
    return loc ? loc.name : 'No Location';
  };

  const eventsListHtml = events.map(e => {
    const locName = getLocationName(e.locationId);
    const formatName = ScoringFormats.resolve(e.scoringFormat || league.scoringFormat);
    return `<li>${escapeHTML(e.eventName)} - ${escapeHTML(e.eventDate || 'No Date')} - ${escapeHTML(locName)} - ${escapeHTML(formatName)}</li>`;
  }).join('') || '<li>No events scheduled.</li>';

  const rosterHtml = players.map(p => {
    return `<li>${escapeHTML(p.playerName)} | ${escapeHTML(p.ifpaNumber || p.ifpa_number || 'N/A')}</li>`;
  }).join('') || '<li>No players assigned.</li>';

  // Page 1: League Summary
  let summaryPageHtml = `
    <div class="print-page league-summary-page">
      <div class="print-meta">
        <h1>League Summary</h1>
        <div class="print-mb-4"><strong>League Name:</strong> ${escapeHTML(league.name)}</div>
        <div class="print-mb-4"><strong>Start Date:</strong> ${escapeHTML(league.startDate || 'N/A')}</div>
        <div class="print-mb-4"><strong>League Type:</strong> ${escapeHTML(league.participationType === 'team' ? 'Team' : (league.competitionFormat === 'head2head' ? 'Head-to-head' : 'Individual'))}</div>
        <div class="print-mb-4"><strong>Scoring Format:</strong> ${escapeHTML(format)}</div>
        <div class="print-mb-4"><strong>Season Scoring:</strong> ${escapeHTML(league.seasonScoring === 'weekly' ? 'Weekly Points' : 'Cumulative')}</div>
        <div class="print-mb-4"><strong>Drop Lowest Weeks:</strong> ${escapeHTML(String(league.dropLowestWeeks || 0))}</div>
      </div>
      
      <div style="margin-top: 20px;">
        <h3>Events</h3>
        <ul>${eventsListHtml}</ul>
      </div>

      <div style="margin-top: 20px;">
        <h3>Roster</h3>
        <ul>${rosterHtml}</ul>
      </div>
    </div>
  `;

  // Weekly score sheets & scoreboards
  let weeklySheetsHtml = '';
  events.forEach(event => {
    const eventTargets = targetsByEvent[event.id] || [];
    const eventMachinesNormalized = normalizeTargets(eventTargets);
    const eventMaxOrder = eventMachinesNormalized.length > 0 ? Math.max(...eventMachinesNormalized.map(m => m.orderNumber)) : 0;
    
    // For each player, print score sheet
    players.forEach(player => {
      const playerScores = scoresByEventAndPlayer[event.id]?.[player.id] || [];
      if (playerScores.length === 0) return; // Skip if no scores
      const scoreMap = getScoreMapForPlayer(event.id, player.id, playerScores);
      
      const instructions = `
        <p class="muted small threshold-row">${FormatBranding.get(format).scoringHint || 'Enter your score after each ball until you hit the target score, or run out of balls.'}</p>
      `;

      const mainHeaderHtml = `
        <div class="print-meta">
          <div class="flex-between print-mb-5">
            <div class="print-font-lg">
              <div class="print-mb-4"><strong>League:</strong> ${escapeHTML(league.name)}</div>
              <div class="print-mb-4"><strong>Event:</strong> ${escapeHTML(event.eventName)}</div>
            </div>
            <div class="text-right">
              <div><strong>Player:</strong> ${escapeHTML(player.playerName)}</div>
              <div>Date: ${escapeHTML(event.eventDate || '')}</div>
            </div>
          </div>
          <div class="print-instructions">
            ${instructions}
          </div>
        </div>
      `;

      // Compute per-round scores for the Score column
      const seasonTurnResults = engine.calculateTurnResults(eventMachinesNormalized, scoreMap);

      const machineSectionsHtml = eventMachinesNormalized.map((m) => {
        const isLast = m.orderNumber === eventMaxOrder;
        const lfHint = isLast ? FormatBranding.get(format).lastFrameHint : null;
        let targetsHtml = formatPrintTargets(engine.getPrintTargetSummaryData(m, isLast), formatNumber);

        const currentTurnScores = scoreMap?.[String(m.orderNumber)] || {};
        const ball1Val = (currentTurnScores.ball1 !== undefined && currentTurnScores.ball1 !== null && currentTurnScores.ball1 !== '') ? formatNumber(currentTurnScores.ball1) : '';
        const ball2Val = (currentTurnScores.ball2 !== undefined && currentTurnScores.ball2 !== null && currentTurnScores.ball2 !== '') ? formatNumber(currentTurnScores.ball2) : '';
        const ball3Val = (currentTurnScores.ball3 !== undefined && currentTurnScores.ball3 !== null && currentTurnScores.ball3 !== '') ? formatNumber(currentTurnScores.ball3) : '';

        const seasonTurnResult = seasonTurnResults.turnResults.find(t => t.orderNumber === m.orderNumber);
        const seasonScoreVal = seasonTurnResult?.displayRunningTotal ?? '';

        return `
          <div class="print-block">
            <div class="print-block-header">
              <h3 class="print-mt-0">${escapeHTML(engine.getRoundLabel())} ${m.orderNumber}: ${escapeHTML(m.machineName)}</h3>
              <div class="targets-summary">${targetsHtml}</div>
            </div>
            ${lfHint ? `<div class="muted small print-hint-italic">${lfHint}</div>` : ''}
            <div class="flex gap-15">
              <div class="flex-1"><small>Ball 1</small><div class="score-line filled-score">${ball1Val}</div></div>
              <div class="flex-1"><small>Ball 2</small><div class="score-line filled-score">${ball2Val}</div></div>
              <div class="flex-1"><small>Ball 3</small><div class="score-line filled-score">${ball3Val}</div></div>
              <div class="flex-1"><small>Score</small><div class="score-line filled-score">${seasonScoreVal}</div></div>
            </div>
          </div>`;
      }).join('');

      weeklySheetsHtml += `
        <div class="page-break"></div>
        <div class="score-sheet-page">
          ${mainHeaderHtml}
          ${machineSectionsHtml}
        </div>
        <div class="page-break"></div>
        ${generatePlayerResultsHtml(event, player.id, player, eventMachinesNormalized, scoresByEventAndPlayer, matchupsByEvent, engine)}
      `;
    });

    // Weekly scoreboard
    let weekScoreboardContent = '';
    if (hasH2H) {
      const scoreUnitLabel = engine.getThresholdPrefix ? engine.getThresholdPrefix() : 'Score';
      weekScoreboardContent = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Away Player</th>
              <th>${escapeHTML(scoreUnitLabel)}</th>
              <th>Home Player</th>
              <th>${escapeHTML(scoreUnitLabel)}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(event.matchups || []).map(m => `
              <tr>
                <td>${escapeHTML(m.awayPlayerName || 'BYE')}</td>
                <td>${m.status === 'completed' ? m.awayRuns : '-'}</td>
                <td>${escapeHTML(m.homePlayerName)}</td>
                <td>${m.status === 'completed' ? m.homeRuns : '-'}</td>
                <td>${escapeHTML(m.status || 'pending')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      const turnResults = [];
      players.forEach(p => {
        const scores = scoresByEventAndPlayer[event.id]?.[p.id] || [];
        if (scores.length > 0) {
          const scoreMap = buildScoreMapFromRows(scores);
          const calcResult = engine.calculateTurnResults(eventMachinesNormalized, scoreMap);
          turnResults.push({ player: p, total: calcResult.total, formatted: engine.formatTotalScore(calcResult.total) });
        }
      });
      turnResults.sort((a, b) => engine.compareScores(a.total, b.total));

      weekScoreboardContent = `
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 60px;">Rank</th>
              <th>Player</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            ${turnResults.map((r, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHTML(r.player.playerName)}</td>
                <td>${escapeHTML(r.formatted)}</td>
              </tr>
            `).join('') || '<tr><td colspan="3">No scores recorded for this event.</td></tr>'}
          </tbody>
        </table>
      `;
    }

    weeklySheetsHtml += `
      <div class="page-break"></div>
      <div class="weekly-scoreboard-page">
        <div class="print-meta">
          <h2>${escapeHTML(event.eventName)} Scoreboard</h2>
          <div>Date: ${escapeHTML(event.eventDate || 'N/A')}</div>
        </div>
        <div class="results-content">
          ${weekScoreboardContent}
        </div>
      </div>
    `;
  });

  // Last page: Season Scoreboard
  const summary = calculateSeasonSummary({
    league,
    players,
    events,
    targetsByEvent,
    scoresByEventAndPlayer,
    matchupsByEvent,
    engine
  });

  const playerLabel = isTeamLeague ? 'Team' : 'Player';
  let seasonScoreboardHtml = '';
  if (hasH2H && !isTeamLeague) {
    const ranks = computeRanks(summary.rows, (a, b) => engine.isTie(a, b));

    seasonScoreboardHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="text-center">#</th>
            <th class="text-left">${playerLabel}</th>
            ${events.map((e, i) => `<th class="text-center">W${i + 1}</th>`).join('')}
            <th class="text-center">Record</th>
            <th class="text-center">Diff</th>
            <th class="text-center">Win %</th>
          </tr>
        </thead>
        <tbody>
          ${summary.rows.map((res, idx) => {
            const entityName = escapeHTML(res.entity.playerName || res.entity.name);
            const rec = res.record || { wins: 0, losses: 0, ties: 0, scoreDiff: 0, winRate: 0 };
            const diffVal = rec.scoreDiff ?? 0;
            const diffSign = diffVal > 0 ? '+' : '';
            const winPct = (rec.winRate ?? 0).toFixed(3);
            const eventsHtml = events.map(e => {
              const eventData = res.eventTotals[e.id];
              return `<td class="text-center">${eventData && eventData.displayValue !== undefined ? eventData.displayValue : '-'}</td>`;
            }).join('');
            return `
              <tr>
                <td class="text-center">${ranks[idx]}</td>
                <td>${entityName}</td>
                ${eventsHtml}
                <td class="text-center">${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}</td>
                <td class="text-center">${diffSign}${diffVal}</td>
                <td class="text-center">${winPct}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } else {
    const supportsMatchups = typeof engine.getMatchupDescription === 'function' && !!engine.getMatchupDescription(1);
    const isSeasonTie = (a, b) => (a.totalSeasonPoints ?? 0) === (b.totalSeasonPoints ?? 0);
    const ranks = computeRanks(summary.rows, isSeasonTie);

    seasonScoreboardHtml = `
      <table class="data-table">
        <thead>
          <tr>
            <th class="text-center">#</th>
            <th class="text-left">${playerLabel}</th>
            ${events.map((e, i) => `<th class="text-center">${i + 1}</th>`).join('')}
            ${supportsMatchups ? '<th class="text-center">W-L</th>' : ''}
            <th class="text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          ${summary.rows.map((res, idx) => {
            const entityName = isTeamLeague ? escapeHTML(res.entity.name) : escapeHTML(res.entity.playerName);
            const eventsHtml = events.map(e => {
              const eventData = res.eventTotals[e.id];
              return `<td class="text-center">${eventData && eventData.displayValue !== undefined ? eventData.displayValue : '-'}</td>`;
            }).join('');
            const wlHtml = supportsMatchups ? `<td class="text-center">${res.record ? `${res.record.wins}-${res.record.losses}` : '-'}</td>` : '';
            const totalDisplay = league?.seasonScoring === 'weekly' 
              ? `${res.totalSeasonPoints} pts` 
              : engine.formatTotalScore(res.totalSeasonPoints);
            return `
              <tr>
                <td class="text-center">${ranks[idx]}</td>
                <td>${entityName}</td>
                ${eventsHtml}
                ${wlHtml}
                <td class="text-center"><strong>${escapeHTML(totalDisplay)}</strong></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  const seasonScoreboardPageHtml = `
    <div class="page-break"></div>
    <div class="season-scoreboard-page">
      <div class="print-meta">
        <h2>Season Scoreboard</h2>
        <div>League: ${escapeHTML(league.name)}</div>
      </div>
      <div class="results-content">
        ${seasonScoreboardHtml}
      </div>
    </div>
  `;

  printWindow.document.write(`
    <html>
      <head>${getPrintStylesheetLink()}</head>
      <body class="print-window-body">
        ${summaryPageHtml}
        ${weeklySheetsHtml}
        ${seasonScoreboardPageHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}
