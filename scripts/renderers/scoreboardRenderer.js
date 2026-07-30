import { escapeHTML } from '@scripts/utils.js';
import { flattenMatchupEntries } from '@services/normalizer.js';
import { resolvePlayersForMatchupParticipant } from '@services/playerSelector.js';

/**
 * Renders the standard table scoreboard for formats like Bowling and Golf.
 *
 * @param {{turnResults: Array, totalDisplay: string}} calcResult Output from calculateTurnResults.
 * @param {Object} domRefs DOM element references for the results panel.
 * @param {HTMLElement} domRefs.resultsPanel The results panel container.
 * @param {HTMLElement} domRefs.resultsBody The table body for standard results.
 * @param {HTMLElement} domRefs.totalScore The total score display element.
 * @param {HTMLElement} domRefs.resultsEmpty The empty-state element.
 */
export function renderStandardScoreboard(calcResult, domRefs) {
  const { turnResults, totalDisplay } = calcResult;
  const { resultsPanel, resultsBody, totalScore, resultsEmpty } = domRefs;

  // Show the standard table (may have been hidden by a previous format)
  const resultsTable = resultsPanel.querySelector('table.data-table');
  if (resultsTable) resultsTable.classList.remove('hidden');

  // Remove any format-specific grid from a previous render
  const existingGrid = resultsPanel.querySelector('.scoreboard-grid');
  if (existingGrid) existingGrid.remove();

  resultsBody.innerHTML = (turnResults || [])
    .map(result => {
      return `
        <tr>
          <td>${result.orderNumber}</td>
          <td>${result.machineName}</td>
          <td>${result.displayMark}</td>
          <td>${result.displayRunningTotal}</td>
        </tr>
      `;
    })
    .join('');

  totalScore.textContent = totalDisplay;
  resultsEmpty.classList.add('hidden');
  resultsPanel.classList.remove('hidden');
}

/**
 * Renders a head-to-head scoreboard grid showing all players'
 * results side-by-side organized by round.
 * 
 * @param {Object} calcResult The outputs from calculateTurnResults.
 * @param {Array} machines Round target configurations.
 * @param {Object} context Matchup details, scores by player, and caches.
 * @param {Object} domRefs References to results panel DOM nodes.
 * @param {Object} engine The active engine instance.
 */
export function renderHead2HeadScoreboard(calcResult, machines, context, domRefs, engine) {
  const { resultsPanel, resultsBody, totalScore, resultsEmpty } = domRefs;
  const { allEventScores, eventMatchups, allPlayersCache, getCurrentPlayerId, normalizeScores, groupScoresByPlayer, isTeamMode, activeLeague } = context;

  if (!eventMatchups || eventMatchups.length === 0) {
    renderStandardScoreboard(calcResult, domRefs);
    return;
  }

  const resultsTable = resultsPanel.querySelector('table.data-table');
  if (resultsTable) resultsTable.classList.add('hidden');
  const existingGrid = resultsPanel.querySelector('.scoreboard-grid');
  if (existingGrid) existingGrid.remove();

  if (isTeamMode && calcResult.teamTotals) {
    _renderTeamScoreboard(calcResult, machines, context, domRefs, engine);
    return;
  }

  const currentPlayerId = Number(getCurrentPlayerId());

  // Player / Team IDs come from the wrapper object
  const wrapper = eventMatchups[0];
  const p1Id = Number(wrapper.player1Id);
  const p2Id = Number(wrapper.player2Id);

  const leagues = activeLeague ? [activeLeague] : [];
  const isTeamModeContext = isTeamMode || activeLeague?.participationType === 'team' || (wrapper.team1Id !== undefined && wrapper.team1Id !== null);
  const p1Players = resolvePlayersForMatchupParticipant(p1Id, wrapper.player1Name, allPlayersCache, leagues, isTeamModeContext);
  const p2Players = resolvePlayersForMatchupParticipant(p2Id, wrapper.player2Name, allPlayersCache, leagues, isTeamModeContext);

  const p1Player = p1Players[0];
  const p2Player = p2Players[0];

  const p1ActualId = Number(p1Player?.id ?? p1Id);
  const p2ActualId = Number(p2Player?.id ?? p2Id);

  const p1Name = p1Player?.playerName || wrapper.player1Name || wrapper.player1_name || 'Home';
  const p2Name = p2Player?.playerName || wrapper.player2Name || wrapper.player2_name || 'Away';

  const scoresByPlayer = groupScoresByPlayer(normalizeScores(allEventScores));

  const p1Map = engine.buildPlayerScoreMap(p1ActualId, scoresByPlayer[p1ActualId] || [], scoresByPlayer, eventMatchups);
  p1Map.isPlayer1 = true;

  const p2Map = engine.buildPlayerScoreMap(p2ActualId, scoresByPlayer[p2ActualId] || [], scoresByPlayer, eventMatchups);
  p2Map.isPlayer1 = false;

  // Away (Player 2) always first, Home (Player 1) second
  const playerResults = [
    { id: p2ActualId, name: p2Name, isHome: false, scoreMap: p2Map },
    { id: p1ActualId, name: p1Name, isHome: true, scoreMap: p1Map }
  ];

  const playerTotalScores = {};
  const roundScores = {};
  const playerEngineResults = {};

  playerResults.forEach(pResult => {
    const playerIdNum = Number(pResult.id);
    const pTurnResults = engine.calculateTurnResults(machines, pResult.scoreMap);
    const turnResults = Array.isArray(pTurnResults) ? pTurnResults : (pTurnResults.turnResults || []);
    playerEngineResults[playerIdNum] = turnResults;

    let currentTotal = 0;
    for (let i = 0; i < turnResults.length; i++) {
      const turn = turnResults[i];
      const roundNumber = Math.floor(i / 2) + 1;
      const roundKey = String(roundNumber);
      if (!roundScores[roundKey]) roundScores[roundKey] = {};

      if (turn.isWalkOff) {
        if (turn.isBatter || roundScores[roundKey][playerIdNum] === undefined) {
          roundScores[roundKey][playerIdNum] = 'X';
        }
      } else if (turn.played) {
        currentTotal += turn.score;
        if (turn.isBatter) {
          roundScores[roundKey][playerIdNum] = String(turn.score);
        } else if (roundScores[roundKey][playerIdNum] === undefined) {
          roundScores[roundKey][playerIdNum] = '0';
        }
      } else {
        if (roundScores[roundKey][playerIdNum] === undefined) {
          roundScores[roundKey][playerIdNum] = '-';
        }
      }
    }
    playerTotalScores[playerIdNum] = currentTotal;
  });

  const roundGroups = [];
  const totalRounds = Math.ceil(machines.length / 2);
  for (let i = 1; i <= totalRounds; i++) {
    roundGroups.push({ roundNumber: i });
  }

  let scoreboardHTML = '<div class="scoreboard-grid">';

  // 1. Header Row
  scoreboardHTML += '<div class="scoreboard-row header"><span class="player-col">Player</span>';
  for (const rg of roundGroups) {
    scoreboardHTML += `<span class="round-header">${rg.roundNumber}</span>`;
  }
  scoreboardHTML += '<span class="total-header">TOTAL</span></div>';

  // 2. Player Rows
  playerResults.forEach(pResult => {
    const playerIdNum = Number(pResult.id);
    const totalScoreValue = playerTotalScores[playerIdNum] || 0;
    const homeAwayLabel = pResult.isHome ? 'Home' : 'Away';

    scoreboardHTML += '<div class="scoreboard-row player-row">';
    scoreboardHTML += `<span class="player-name"><span class="home-away-label">${homeAwayLabel}:</span> ${escapeHTML(pResult.name)}</span>`;
    for (const rg of roundGroups) {
      const score = roundScores[String(rg.roundNumber)]?.[playerIdNum] || '-';
      scoreboardHTML += `<span class="round-score">${score}</span>`;
    }
    scoreboardHTML += `<span class="total-score">${totalScoreValue}</span></div>`;
  });

  scoreboardHTML += '</div>';

  resultsBody.innerHTML = '';
  const totalScoreDiv = resultsPanel.querySelector('.total-score');
  if (totalScoreDiv) {
    totalScoreDiv.insertAdjacentHTML('beforebegin', scoreboardHTML);
  } else {
    resultsPanel.insertAdjacentHTML('beforeend', scoreboardHTML);
  }

  const awayTotal = playerTotalScores[p2ActualId] ?? 0;
  const homeTotal = playerTotalScores[p1ActualId] ?? 0;
  totalScore.innerHTML = `<span class="away-label">Away:</span> ${escapeHTML(p2Name)} ${awayTotal} &nbsp; <span class="home-label">Home:</span> ${escapeHTML(p1Name)} ${homeTotal}`;

  resultsEmpty.classList.add('hidden');
  resultsPanel.classList.remove('hidden');
}

/**
 * Renders a team baseball scoreboard showing team totals and per-player breakdown.
 * @private
 */
function _renderTeamScoreboard(calcResult, machines, context, domRefs, engine) {
  const { resultsPanel, resultsBody, totalScore, resultsEmpty } = domRefs;
  const { eventMatchups, allPlayersCache, allEventScores, normalizeScores, groupScoresByPlayer } = context;
  const { turnResults, teamTotals } = calcResult;

  const wrapper = eventMatchups[0];
  const homeTeamId = Number(wrapper.team1Id);
  const awayTeamId = Number(wrapper.team2Id);
  const homeTeamName = wrapper.team1Name ?? 'Home';
  const awayTeamName = wrapper.team2Name ?? 'Away';

  // Group turn results by machine (round)
  const machineGroups = [];
  machines.forEach(m => {
    const orderNum = Number(m.orderNumber ?? m.order_number);
    const machineId = Number(m.machineId ?? m.id);
    machineGroups.push({
      orderNumber: orderNum,
      machineId,
      machineName: m.machineName,
      entries: turnResults.filter(tr => Number(tr.orderNumber) === orderNum)
    });
  });

  // Pair machines into rounds (2 turns per round for baseball: top/bottom)
  const roundGroups = [];
  for (let i = 0; i < machineGroups.length; i += 2) {
    const topGroup = machineGroups[i];
    const bottomGroup = machineGroups[i + 1];
    roundGroups.push({
      roundNumber: Math.floor(i / 2) + 1,
      top: topGroup,
      bottom: bottomGroup
    });
  }

  let scoreboardHTML = '<div class="scoreboard-grid">';

  // Header row
  const roundLabel = engine.getRoundLabel();
  scoreboardHTML += '<div class="scoreboard-row header"><span class="player-col">Team</span>';
  roundGroups.forEach(rg => {
    scoreboardHTML += `<span class="round-header" style="min-width: 80px;">${roundLabel} ${rg.roundNumber}</span>`;
  });
  scoreboardHTML += '<span class="total-header">TOTAL</span></div>';

  // Away team row
  scoreboardHTML += '<div class="scoreboard-row player-row">';
  scoreboardHTML += `<span class="player-name"><span class="home-away-label">Away:</span> ${escapeHTML(awayTeamName)}</span>`;
  roundGroups.forEach(rg => {
    const topRuns = rg.top?.entries.reduce((sum, e) => sum + (e.played ? e.score : 0), 0) ?? '-';
    scoreboardHTML += `<span class="round-score">${topRuns === 0 && !rg.top?.entries.some(e => e.played) ? '-' : topRuns}</span>`;
  });
  scoreboardHTML += `<span class="total-score">${teamTotals.away}</span></div>`;

  // Home team row
  scoreboardHTML += '<div class="scoreboard-row player-row">';
  scoreboardHTML += `<span class="player-name"><span class="home-away-label">Home:</span> ${escapeHTML(homeTeamName)}</span>`;
  roundGroups.forEach(rg => {
    const bottomRuns = rg.bottom?.entries.reduce((sum, e) => sum + (e.played ? e.score : 0), 0) ?? '-';
    scoreboardHTML += `<span class="round-score">${bottomRuns === 0 && !rg.bottom?.entries.some(e => e.played) ? '-' : bottomRuns}</span>`;
  });
  scoreboardHTML += `<span class="total-score">${teamTotals.home}</span></div>`;

  scoreboardHTML += '</div>';

  resultsBody.innerHTML = '';
  resultsPanel.insertAdjacentHTML('beforeend', scoreboardHTML);

  totalScore.innerHTML = `<span class="away-label">Away:</span> ${escapeHTML(awayTeamName)} ${teamTotals.away} &nbsp; <span class="home-label">Home:</span> ${escapeHTML(homeTeamName)} ${teamTotals.home}`;

  resultsEmpty.classList.add('hidden');
  resultsPanel.classList.remove('hidden');
}
