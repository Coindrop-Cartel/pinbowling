import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';
import { formatNumber, escapeHTML } from '@scripts/utils.js';
import { normalizeTargets, normalizeScores, groupTargetsByEvent, groupScoresByEventAndPlayer, buildScoreMapFromRows, buildBaseballScoreMapForPlayer, groupScoresByPlayer } from '@services/normalizer.js';
import { calculateSeasonSummary } from '@services/seasonCalculator.js';

/**
 * Generates large printable signs showing target scores for each machine.
 * @param {Array<import('@scripts/types.js').Machine>} machines - The machines to print target scores for.
 * @param {string} [format=ScoringFormats.DEFAULT] - The scoring format ('bowling' or 'golf').
 * @returns {void}
 */
export function printMachineScores(machines, format = ScoringFormats.DEFAULT) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;
  const Engine = getScoringEngine(format);

  const pagesHtml = machines.map((m) => {
    const ranks = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    const scoresHtml = ranks.map((rank) => {
      const formatted = formatNumber(m.values[rank] || 0);
      let fontSize = (formatted.length > 9) ? '1.4rem' : (formatted.length > 7 ? '1.8rem' : '2.5rem');
      return `
        <div class="print-rank-card">
          <div class="print-rank-badge">${rank}</div>
          <div class="print-rank-value" style="font-size: ${fontSize};">${formatted}</div>
        </div>`;
    }).join('');

    let extraTargets = '';
    if (m.orderNumber === maxOrder) {
      const { t1, t2 } = Engine.getBonusTargets(m);
      extraTargets = `
        <div class="print-extra-targets">
          <div>Target 1: ${formatNumber(t1)}</div>
          <div>Target 2: ${formatNumber(t2)}</div>
        </div>`;
    }

    return `
      <div class="print-page">
        <div class="print-frame">
          <div class="print-frame-header">
            <h1 class="print-title">${escapeHTML(Engine.getRoundLabel())} ${m.orderNumber}</h1>
            <h2 class="print-title">${escapeHTML(m.machineName)}</h2>
          </div>
          <div class="print-grid">${scoresHtml}</div>
          ${extraTargets}
        </div>
      </div>`;
  }).join('');

  const printCss = `
    body { margin: 0; font-family: sans-serif; }
    .print-page { height:100vh; }
    .print-frame { box-sizing: border-box; }
  `;

  printWindow.document.write(`<html><head><style>${printCss}</style></head><body>${pagesHtml}</body></html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

/**
 * Generates a printable blank score sheet for a league event.
 * @param {Array<import('@scripts/types.js').Machine>} machines - The machines to include on the score sheet.
 * @param {string} leagueName - The league name displayed in the header.
 * @param {string} eventName - The event name displayed in the header.
 * @param {string} [format=ScoringFormats.DEFAULT] - The scoring format ('bowling' or 'golf').
 * @returns {void}
 */
export function printBlankScoreSheet(machines, leagueName, eventName, format = ScoringFormats.DEFAULT) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const Engine = getScoringEngine(format);
  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

  const instructions = `
    <p class="muted small threshold-row">${FormatBranding.get(format).scoringHint || 'Enter your score after each ball until you hit the target score, or run out of balls.'}</p>
  `;

  // This is the main header for the entire sheet
  const mainHeaderHtml = `
    <div class="print-meta">
      <div class="flex-between print-mb-5">
        <div class="print-font-lg">
          ${leagueName ? `<div class="print-mb-4"><strong>League:</strong> ${escapeHTML(leagueName)}</div>` : ''}
          <div class="print-mb-4"><strong>Event:</strong> ${escapeHTML(eventName)}</div>
        </div>
        <div class="text-right">
          <div>Player: __________________________</div>
          <div>Date: ________</div>
        </div>
      </div>
      <div class="print-instructions">
        ${instructions}
      </div>
    </div>
  `;

  // Now, iterate through machines to create individual frame/hole sections
  const machineSectionsHtml = machines.map((m) => {
    const isLast = m.orderNumber === maxOrder;
    const lfHint = isLast ? FormatBranding.get(format).lastFrameHint : null;
    let targetsHtml = Engine.getPrintTargetSummaryHtml(m, isLast, formatNumber);

    return `
      <div class="print-block">
        <div class="print-block-header">
          <h3 class="print-mt-0">${escapeHTML(Engine.getRoundLabel())} ${m.orderNumber}: ${escapeHTML(m.machineName)}</h3>
          <div class="targets-summary">${targetsHtml}</div>
        </div>
        ${lfHint ? `<div class="muted small print-hint-italic">${lfHint}</div>` : ''}
        <div class="flex gap-15">
          <div class="flex-1"><small>Ball 1</small><div class="score-line"></div></div>
          <div class="flex-1"><small>Ball 2</small><div class="score-line"></div></div>
          <div class="flex-1"><small>Ball 3</small><div class="score-line"></div></div>
        </div>
      </div>`;
  }).join('');

  const sheetCss = `
    body { font-family: sans-serif; padding: 10px 20px; line-height: 1.1; font-size: 13px; }
    .print-meta { border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 5px; }
    .print-block { border: 1px solid #ccc; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; page-break-inside: avoid; }
    .print-block-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px dashed #eee; }
    .targets-summary span { font-size: 0.85rem; }
    .flex { display: flex; }
    .flex-1 { flex: 1; }
    .score-line { border-bottom: 1.5pt solid #000; height: 1.5em; margin-top: 2px; }
    .flex-between { display: flex; justify-content: space-between; }
    .muted { opacity: 0.7; }
    .small { font-size: 0.75rem; }
    h3 { font-size: 1rem; margin: 0; }
    .threshold-row { margin: 2px 0; }
    .print-mb-4 { margin-bottom: 4px; }
    .print-mb-5 { margin-bottom: 5px; }
    .print-mt-0 { margin: 0; }
    .print-font-lg { font-size: 1.2rem; }
    .print-instructions { font-size: 0.9rem; line-height: 1.4; }
    .print-hint-italic { margin-bottom: 4px; font-style: italic; }
    .text-right { text-align: right; }
    .ml-15 { margin-left: 15px; }
    .gap-15 { gap: 15px; }
  `;

  printWindow.document.write(`
    <html>
      <head><style>${sheetCss}</style></head>
      <body>
        ${mainHeaderHtml}
        ${machineSectionsHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

/**
 * Generates a printable score sheet pre-filled with player scores, followed by results on the next page.
 * @param {Array<import('@scripts/types.js').Machine>} machines - The machines to include.
 * @param {string} leagueName - The league name.
 * @param {string} eventName - The event name.
 * @param {string} [format=ScoringFormats.DEFAULT] - The scoring format ('bowling' or 'golf').
 * @param {Object} player - The player object.
 * @param {Object} scoreMap - Currently entered scores keyed by order number.
 * @param {string} resultsHtml - The HTML content of the results panel to display on page 2.
 * @returns {void}
 */
export function printScoreSheet(machines, leagueName, eventName, format = ScoringFormats.DEFAULT, player, scoreMap, resultsHtml) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return alert('Please allow popups to print.');

  const Engine = getScoringEngine(format);
  const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

  const instructions = `
    <p class="muted small threshold-row">${FormatBranding.get(format).scoringHint || 'Enter your score after each ball until you hit the target score, or run out of balls.'}</p>
  `;

  // Main header for the first page
  const mainHeaderHtml = `
    <div class="print-meta">
      <div class="flex-between print-mb-5">
        <div class="print-font-lg">
          ${leagueName ? `<div class="print-mb-4"><strong>League:</strong> ${escapeHTML(leagueName)}</div>` : ''}
          <div class="print-mb-4"><strong>Event:</strong> ${escapeHTML(eventName)}</div>
        </div>
        <div class="text-right">
          <div><strong>Player:</strong> ${escapeHTML(player?.playerName || '')}</div>
          <div>Date: ________</div>
        </div>
      </div>
      <div class="print-instructions">
        ${instructions}
      </div>
    </div>
  `;

  // Iterate through machines to create individual frame/hole sections with scores
  const machineSectionsHtml = machines.map((m) => {
    const isLast = m.orderNumber === maxOrder;
    const lfHint = isLast ? FormatBranding.get(format).lastFrameHint : null;
    let targetsHtml = Engine.getPrintTargetSummaryHtml(m, isLast, formatNumber);

    const playerScores = scoreMap?.[String(m.orderNumber)] || {};
    const ball1Val = (playerScores.ball1 !== undefined && playerScores.ball1 !== null && playerScores.ball1 !== '') ? formatNumber(playerScores.ball1) : '';
    const ball2Val = (playerScores.ball2 !== undefined && playerScores.ball2 !== null && playerScores.ball2 !== '') ? formatNumber(playerScores.ball2) : '';
    const ball3Val = (playerScores.ball3 !== undefined && playerScores.ball3 !== null && playerScores.ball3 !== '') ? formatNumber(playerScores.ball3) : '';

    return `
      <div class="print-block">
        <div class="print-block-header">
          <h3 class="print-mt-0">${escapeHTML(Engine.getRoundLabel())} ${m.orderNumber}: ${escapeHTML(m.machineName)}</h3>
          <div class="targets-summary">${targetsHtml}</div>
        </div>
        ${lfHint ? `<div class="muted small print-hint-italic">${lfHint}</div>` : ''}
        <div class="flex gap-15">
          <div class="flex-1"><small>Ball 1</small><div class="score-line filled-score">${ball1Val}</div></div>
          <div class="flex-1"><small>Ball 2</small><div class="score-line filled-score">${ball2Val}</div></div>
          <div class="flex-1"><small>Ball 3</small><div class="score-line filled-score">${ball3Val}</div></div>
        </div>
      </div>`;
  }).join('');

  // Combine page 1 and page 2 (Results)
  const fullHtml = `
    <div class="score-sheet-page">
      ${mainHeaderHtml}
      ${machineSectionsHtml}
    </div>
    <div class="page-break"></div>
    <div class="results-page">
      <div class="print-meta">
        <div class="flex-between print-mb-5">
          <div class="print-font-lg">
            ${leagueName ? `<div class="print-mb-4"><strong>League:</strong> ${escapeHTML(leagueName)}</div>` : ''}
            <div class="print-mb-4"><strong>Event:</strong> ${escapeHTML(eventName)}</div>
            <div class="print-mb-4"><strong>Results</strong></div>
          </div>
          <div class="text-right">
            <div><strong>Player:</strong> ${escapeHTML(player?.playerName || '')}</div>
          </div>
        </div>
      </div>
      <div class="results-content">
        ${resultsHtml || '<div class="muted">No results available.</div>'}
      </div>
    </div>
  `;

  const sheetCss = `
    body { font-family: sans-serif; padding: 10px 20px; line-height: 1.1; font-size: 13px; }
    .print-meta { border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 5px; }
    .print-block { border: 1px solid #ccc; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; page-break-inside: avoid; }
    .print-block-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px dashed #eee; }
    .targets-summary span { font-size: 0.85rem; }
    .flex { display: flex; }
    .flex-1 { flex: 1; }
    .score-line { border-bottom: 1.5pt solid #000; height: 1.5em; margin-top: 2px; }
    .filled-score { display: flex; align-items: flex-end; padding-left: 5px; font-weight: bold; font-size: 1.1rem; }
    .flex-between { display: flex; justify-content: space-between; }
    .muted { opacity: 0.7; }
    .small { font-size: 0.75rem; }
    h3 { font-size: 1rem; margin: 0; }
    .threshold-row { margin: 2px 0; }
    .print-mb-4 { margin-bottom: 4px; }
    .print-mb-5 { margin-bottom: 5px; }
    .print-mt-0 { margin: 0; }
    .print-font-lg { font-size: 1.2rem; }
    .print-instructions { font-size: 0.9rem; line-height: 1.4; }
    .print-hint-italic { margin-bottom: 4px; font-style: italic; }
    .text-right { text-align: right; }
    .ml-15 { margin-left: 15px; }
    .gap-15 { gap: 15px; }
    .page-break { page-break-before: always; }
    
    /* Results formatting */
    .results-page { padding: 10px 0; }
    .results-content { margin-top: 15px; }
    
    /* Standard scoreboard table styles */
    .data-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    .data-table th, .data-table td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    .data-table th { background-color: #f2f2f2; }
    .total-score { font-size: 1.2rem; font-weight: bold; margin-top: 15px; }
    .hidden { display: none !important; }
    
    /* Baseball scoreboard grid styles */
    .scoreboard-grid { display: table; width: 100%; border-collapse: collapse; font-size: 0.9em; margin-top: 15px; }
    .scoreboard-row { display: table-row; }
    .scoreboard-row.header { font-weight: bold; background: #0a2d48; color: #ffffff; }
    .scoreboard-row.header > span, .scoreboard-row.player-row > span { display: table-cell; padding: 8px 10px; text-align: center; border: 1px solid #ccc; }
    .scoreboard-row.player-row.top-row { background: #ffffff; }
    .scoreboard-row.player-row.bot-row { background: #f2f2f2; font-size: 0.85em; }
    .scoreboard-row .player-name.half-label { font-weight: 400; font-size: 0.8em; padding-left: 1.5em; color: #666; }
    .scoreboard-row .player-col { text-align: left; }
    .scoreboard-row .player-name { text-align: left; font-weight: 600; white-space: nowrap; }
    .scoreboard-row .inning-header { min-width: 48px; font-size: 0.8em; }
    .scoreboard-row .inning-score { min-width: 36px; }
    .scoreboard-row .total-header, .scoreboard-row .total-score { font-weight: bold; min-width: 48px; border-left: 2px solid #0a2d48; }
    .home-away-label { font-size: 0.75em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 0.3em; }
    .away-label { color: #0a2d48; font-weight: 700; text-transform: uppercase; font-size: 0.85em; }
    .home-label { color: #0a2d48; font-weight: 700; text-transform: uppercase; font-size: 0.85em; }
  `;

  printWindow.document.write(`
    <html>
      <head><style>${sheetCss}</style></head>
      <body>
        ${fullHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

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
  const isBaseball = format === ScoringFormats.BASEBALL;
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
    if (!isBaseball) return buildScoreMapFromRows(scores);
    const scoresByPlayer = groupScoresByPlayer(Object.values(scoresByEventAndPlayer[eventId] || {}).flat());
    return buildBaseballScoreMapForPlayer(playerId, scoresByPlayer, matchupsByEvent[eventId] || []);
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

    if (isBaseball) {
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
      
      const p1Map = buildBaseballScoreMapForPlayer(awayId, scoresByPlayerForEvent, [matchup]);
      const p2Map = buildBaseballScoreMapForPlayer(homeId, scoresByPlayerForEvent, [matchup]);
      
      const { turnResults: p1Turns } = engine.calculateTurnResults(eventMachines, p1Map);
      const { turnResults: p2Turns } = engine.calculateTurnResults(eventMachines, p2Map);
      
      let awayTotal = 0;
      let homeTotal = 0;
      
      p1Turns.forEach(t => { if (t.played) awayTotal += t.score; });
      p2Turns.forEach(t => { if (t.played) homeTotal += t.score; });
      
      const totalInnings = Math.ceil(eventMachines.length / 2);
      const inningData = { away: {}, home: {} };
      
      const formatTurns = (turns, side) => {
        for (let i = 0; i < turns.length; i++) {
          const turn = turns[i];
          const inningNumber = Math.floor(i / 2) + 1;
          const inningKey = String(inningNumber);
          if (turn.played) {
            if (turn.isBatter && inningData[side][inningKey] === undefined) {
              inningData[side][inningKey] = String(turn.score);
            }
          } else if (turn.isWalkOff) {
            if (inningData[side][inningKey] === undefined) inningData[side][inningKey] = 'X';
          }
        }
      };
      formatTurns(p1Turns, 'away');
      formatTurns(p2Turns, 'home');
      
      let scoreboardHTML = '<div class="scoreboard-grid">';
      scoreboardHTML += '<div class="scoreboard-row header"><span class="player-col">Player</span>';
      for (let i = 1; i <= totalInnings; i++) {
        scoreboardHTML += `<span class="inning-header">${i}</span>`;
      }
      scoreboardHTML += '<span class="total-header">TOTAL</span></div>';
      
      scoreboardHTML += '<div class="scoreboard-row player-row top-row">';
      scoreboardHTML += `<span class="player-name"><span class="home-away-label">Away:</span> ${escapeHTML(matchup.awayPlayerName || 'BYE')}</span>`;
      for (let i = 1; i <= totalInnings; i++) {
        scoreboardHTML += `<span class="inning-score">${inningData.away[String(i)] || '-'}</span>`;
      }
      scoreboardHTML += `<span class="total-score">${awayTotal}</span></div>`;
      
      scoreboardHTML += '<div class="scoreboard-row player-row bot-row">';
      scoreboardHTML += `<span class="player-name"><span class="home-away-label">Home:</span> ${escapeHTML(matchup.homePlayerName)}</span>`;
      for (let i = 1; i <= totalInnings; i++) {
        scoreboardHTML += `<span class="inning-score">${inningData.home[String(i)] || '-'}</span>`;
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

      const machineSectionsHtml = eventMachinesNormalized.map((m) => {
        const isLast = m.orderNumber === eventMaxOrder;
        const lfHint = isLast ? FormatBranding.get(format).lastFrameHint : null;
        let targetsHtml = engine.getPrintTargetSummaryHtml(m, isLast, formatNumber);

        const currentTurnScores = scoreMap?.[String(m.orderNumber)] || {};
        const ball1Val = (currentTurnScores.ball1 !== undefined && currentTurnScores.ball1 !== null && currentTurnScores.ball1 !== '') ? formatNumber(currentTurnScores.ball1) : '';
        const ball2Val = (currentTurnScores.ball2 !== undefined && currentTurnScores.ball2 !== null && currentTurnScores.ball2 !== '') ? formatNumber(currentTurnScores.ball2) : '';
        const ball3Val = (currentTurnScores.ball3 !== undefined && currentTurnScores.ball3 !== null && currentTurnScores.ball3 !== '') ? formatNumber(currentTurnScores.ball3) : '';

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
    if (isBaseball) {
      weekScoreboardContent = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Away Player</th>
              <th>Runs</th>
              <th>Home Player</th>
              <th>Runs</th>
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
  if (isBaseball && !isTeamLeague) {
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
            const entityName = escapeHTML(res.entity.playerName);
            const rec = res.record || { wins: 0, losses: 0, ties: 0, runDiff: 0, winRate: 0 };
            const diffSign = rec.runDiff > 0 ? '+' : '';
            const winPct = rec.winRate.toFixed(3);
            const eventsHtml = events.map(e => {
              const eventData = res.eventTotals[e.id];
              return `<td class="text-center">${eventData && eventData.displayValue !== undefined ? eventData.displayValue : '-'}</td>`;
            }).join('');
            return `
              <tr>
                <td class="text-center">${idx + 1}</td>
                <td>${entityName}</td>
                ${eventsHtml}
                <td class="text-center">${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}</td>
                <td class="text-center">${diffSign}${rec.runDiff}</td>
                <td class="text-center">${winPct}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } else {
    const supportsMatchups = typeof engine.getMatchupDescription === 'function' && !!engine.getMatchupDescription(1);
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
                <td class="text-center">${idx + 1}</td>
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

  const sheetCss = `
    body { font-family: sans-serif; padding: 10px 20px; line-height: 1.1; font-size: 13px; }
    .print-meta { border-bottom: 2px solid #000; margin-bottom: 10px; padding-bottom: 5px; }
    .print-block { border: 1px solid #ccc; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; page-break-inside: avoid; }
    .print-block-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; padding-bottom: 5px; border-bottom: 1px dashed #eee; }
    .targets-summary span { font-size: 0.85rem; }
    .flex { display: flex; }
    .flex-1 { flex: 1; }
    .score-line { border-bottom: 1.5pt solid #000; height: 1.5em; margin-top: 2px; }
    .filled-score { display: flex; align-items: flex-end; padding-left: 5px; font-weight: bold; font-size: 1.1rem; }
    .flex-between { display: flex; justify-content: space-between; }
    .muted { opacity: 0.7; }
    .small { font-size: 0.75rem; }
    h1, h2, h3 { margin: 0; }
    .threshold-row { margin: 2px 0; }
    .print-mb-4 { margin-bottom: 4px; }
    .print-mb-5 { margin-bottom: 5px; }
    .print-mt-0 { margin: 0; }
    .print-font-lg { font-size: 1.2rem; }
    .print-instructions { font-size: 0.9rem; line-height: 1.4; }
    .print-hint-italic { margin-bottom: 4px; font-style: italic; }
    .text-right { text-align: right; }
    .ml-15 { margin-left: 15px; }
    .gap-15 { gap: 15px; }
    .page-break { page-break-before: always; }
    .results-content { margin-top: 15px; }
    .data-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    .data-table th, .data-table td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    .data-table th { background-color: #f2f2f2; }
    .text-center { text-align: center; }
  `;

  printWindow.document.write(`
    <html>
      <head><style>${sheetCss}</style></head>
      <body>
        ${summaryPageHtml}
        ${weeklySheetsHtml}
        ${seasonScoreboardPageHtml}
      </body>
    </html>`);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}