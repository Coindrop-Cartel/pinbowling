import { escapeHTML } from '@scripts/utils.js';
import { flattenMatchupInnings } from '@services/normalizer.js';

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
 * Renders the head-to-head scoreboard grid for Baseball (PinBaseball).
 * Displays teams, alternating halves (top/bottom), run outcomes, and Walk-offs.
 * 
 * @param {Object} calcResult The outputs from calculateTurnResults.
 * @param {Array} machines Inning target configurations.
 * @param {Object} scoreMap The player's active scores map.
 * @param {Object} context Matchup details, scores by player, and caches.
 * @param {Object} domRefs References to results panel DOM nodes.
 * @param {Object} engine The active baseball engine instance.
 */
export function renderBaseballScoreboard(calcResult, machines, scoreMap, context, domRefs, engine) {
  const { resultsPanel, resultsBody, totalScore, resultsEmpty } = domRefs;
  const { allEventScores, eventMatchups, allPlayersCache, getCurrentPlayerId, normalizeScores, groupScoresByPlayer, buildBaseballScoreMapForPlayer } = context;

  if (!eventMatchups || eventMatchups.length === 0) {
    // Fall back to standard scoreboard rendering if no matchups exist
    renderStandardScoreboard(calcResult, domRefs);
    return;
  }

  const currentPlayerId = Number(getCurrentPlayerId());
  const innings = flattenMatchupInnings(eventMatchups);
  const myMatchups = innings.filter(m => Number(m.playerId) === currentPlayerId);
  const opponentIds = [...new Set(
    myMatchups.flatMap(m =>
      innings
        .filter(s => Number(s.orderNumber) === Number(m.orderNumber) && Number(s.playerOrder) !== Number(m.playerOrder))
        .map(s => Number(s.playerId))
    )
  )];

  const scoresByPlayer = groupScoresByPlayer(normalizeScores(allEventScores));

  const playerResults = [
    { id: currentPlayerId, name: allPlayersCache.find(p => p.id === currentPlayerId)?.playerName || `You`, scoreMap: buildBaseballScoreMapForPlayer(currentPlayerId, scoresByPlayer, eventMatchups) },
    ...opponentIds.map(oppId => ({
      id: oppId,
      name: allPlayersCache.find(p => p.id === oppId)?.playerName || `Opponent ${oppId}`,
      scoreMap: buildBaseballScoreMapForPlayer(oppId, scoresByPlayer, eventMatchups)
    }))
  ];

  // Sort: Away (playerOrder 2) always first, Home (playerOrder 1) second.
  playerResults.sort((a, b) => {
    const aHome = a.scoreMap.isPlayer1 ? 1 : 0;
    const bHome = b.scoreMap.isPlayer1 ? 1 : 0;
    return aHome - bHome;
  });

  const playerTotalScores = {};
  const inningData = {};
  const playerEngineResults = {};

  playerResults.forEach(pResult => {
    const playerIdNum = Number(pResult.id);
    const { turnResults: pTurnResults } = engine.calculateTurnResults(machines, pResult.scoreMap);
    playerEngineResults[playerIdNum] = pTurnResults;

    let currentTotal = 0;
    for (let i = 0; i < pTurnResults.length; i++) {
      const turn = pTurnResults[i];
      const inningNumber = Math.floor(i / 2) + 1;
      const inningKey = String(inningNumber);
      if (!inningData[inningKey]) inningData[inningKey] = {};

      if (turn.played) {
        currentTotal += turn.score;
        if (turn.isBatter && inningData[inningKey][playerIdNum] === undefined) {
          inningData[inningKey][playerIdNum] = String(turn.score);
        } else if (inningData[inningKey][playerIdNum] === undefined) {
          inningData[inningKey][playerIdNum] = '0';
        }
      } else if (turn.isWalkOff) {
        if (inningData[inningKey][playerIdNum] === undefined) {
          inningData[inningKey][playerIdNum] = 'X';
        }
      } else {
        if (inningData[inningKey][playerIdNum] === undefined) {
          inningData[inningKey][playerIdNum] = '-';
        }
      }
    }
    playerTotalScores[playerIdNum] = currentTotal;
  });

  const resultsTable = resultsPanel.querySelector('table.data-table');
  if (resultsTable) resultsTable.classList.add('hidden');

  const existingGrid = resultsPanel.querySelector('.scoreboard-grid');
  if (existingGrid) existingGrid.remove();

  const inningGroups = [];
  const totalInnings = Math.ceil(machines.length / 2);
  for (let i = 1; i <= totalInnings; i++) {
    inningGroups.push({ inningNumber: i });
  }

  let scoreboardHTML = '<div class="scoreboard-grid">';

  // 1. Header Row
  scoreboardHTML += '<div class="scoreboard-row header"><span class="player-col">Player</span>';
  for (const ig of inningGroups) {
    scoreboardHTML += `<span class="inning-header">${ig.inningNumber}</span>`;
  }
  scoreboardHTML += '<span class="total-header">TOTAL</span></div>';

  // 2. Player Rows
  playerResults.forEach(pResult => {
    const playerIdNum = Number(pResult.id);
    const totalScoreValue = playerTotalScores[playerIdNum] || 0;
    const homeAwayLabel = pResult.scoreMap.isPlayer1 ? 'Home' : 'Away';

    scoreboardHTML += '<div class="scoreboard-row player-row">';
    scoreboardHTML += `<span class="player-name"><span class="home-away-label">${homeAwayLabel}:</span> ${escapeHTML(pResult.name)}</span>`;
    for (const ig of inningGroups) {
      const score = inningData[String(ig.inningNumber)]?.[playerIdNum] || '-';
      scoreboardHTML += `<span class="inning-score">${score}</span>`;
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

  const awayResult = playerResults.find(p => !p.scoreMap.isPlayer1);
  const homeResult = playerResults.find(p => p.scoreMap.isPlayer1);
  const awayTotal = awayResult ? (playerTotalScores[Number(awayResult.id)] ?? 0) : 0;
  const homeTotal = homeResult ? (playerTotalScores[Number(homeResult.id)] ?? 0) : 0;
  const awayName = awayResult ? escapeHTML(awayResult.name) : 'Away';
  const homeName = homeResult ? escapeHTML(homeResult.name) : 'Home';
  totalScore.innerHTML = `<span class="away-label">Away:</span> ${awayName} ${awayTotal} &nbsp; <span class="home-label">Home:</span> ${homeName} ${homeTotal}`;

  resultsEmpty.classList.add('hidden');
  resultsPanel.classList.remove('hidden');
}
