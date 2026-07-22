import { escapeHTML } from '@scripts/utils.js';
import { flattenMatchupEntries } from '@services/normalizer.js';

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
  const { allEventScores, eventMatchups, allPlayersCache, getCurrentPlayerId, normalizeScores, groupScoresByPlayer } = context;

  if (!eventMatchups || eventMatchups.length === 0) {
    // Fall back to standard scoreboard rendering if no matchups exist
    renderStandardScoreboard(calcResult, domRefs);
    return;
  }

  const currentPlayerId = Number(getCurrentPlayerId());
  const allEntries = flattenMatchupEntries(eventMatchups);

  // Player IDs come from the wrapper object, not individual entries
  const wrapper = eventMatchups[0];
  const p1Id = Number(wrapper.player1Id ?? wrapper.player1_id);
  const p2Id = Number(wrapper.player2Id ?? wrapper.player2_id);
  const isCurrentPlayer1 = currentPlayerId === p1Id;
  const opponentId = isCurrentPlayer1 ? p2Id : p1Id;
  const opponentIds = opponentId ? [opponentId] : [];

  console.log('[renderHead2HeadScoreboard] currentPlayerId:', currentPlayerId, 'p1Id:', p1Id, 'p2Id:', p2Id, 'opponentId:', opponentId);
  console.log('[renderHead2HeadScoreboard] allEntries:', allEntries);

  const scoresByPlayer = groupScoresByPlayer(normalizeScores(allEventScores));
  console.log('[renderHead2HeadScoreboard] scoresByPlayer:', scoresByPlayer);

  const playerResults = [
    { id: currentPlayerId, name: allPlayersCache.find(p => p.id === currentPlayerId)?.playerName || `You`, scoreMap: engine.buildPlayerScoreMap(currentPlayerId, scoresByPlayer[currentPlayerId] || [], scoresByPlayer, eventMatchups) },
    ...opponentIds.map(oppId => ({
      id: oppId,
      name: allPlayersCache.find(p => p.id === oppId)?.playerName || `Opponent ${oppId}`,
      scoreMap: engine.buildPlayerScoreMap(oppId, scoresByPlayer[oppId] || [], scoresByPlayer, eventMatchups)
    }))
  ];
  console.log('[renderHead2HeadScoreboard] playerResults:', playerResults);

  // Sort: Away (playerOrder 2) always first, Home (playerOrder 1) second.
  playerResults.sort((a, b) => {
    const aHome = a.scoreMap.isPlayer1 ? 1 : 0;
    const bHome = b.scoreMap.isPlayer1 ? 1 : 0;
    return aHome - bHome;
  });

  const playerTotalScores = {};
  const roundScores = {};
  const playerEngineResults = {};

  playerResults.forEach(pResult => {
    const playerIdNum = Number(pResult.id);
    const pTurnResults = engine.calculateTurnResults(machines, pResult.scoreMap);
    const turnResults = Array.isArray(pTurnResults) ? pTurnResults : (pTurnResults.turnResults || []);
    playerEngineResults[playerIdNum] = turnResults;
    console.log('[renderHead2HeadScoreboard] player ' + playerIdNum + ' scoreMap:', pResult.scoreMap, 'turnResults:', turnResults);

    let currentTotal = 0;
    for (let i = 0; i < turnResults.length; i++) {
      const turn = turnResults[i];
      const roundNumber = Math.floor(i / 2) + 1;
      const roundKey = String(roundNumber);
      if (!roundScores[roundKey]) roundScores[roundKey] = {};

      if (turn.played) {
        currentTotal += turn.score;
        if (turn.isBatter && roundScores[roundKey][playerIdNum] === undefined) {
          roundScores[roundKey][playerIdNum] = String(turn.score);
        } else if (roundScores[roundKey][playerIdNum] === undefined) {
          roundScores[roundKey][playerIdNum] = '0';
        }
      } else if (turn.isWalkOff) {
        if (roundScores[roundKey][playerIdNum] === undefined) {
          roundScores[roundKey][playerIdNum] = 'X';
        }
      } else {
        if (roundScores[roundKey][playerIdNum] === undefined) {
          roundScores[roundKey][playerIdNum] = '-';
        }
      }
    }
    playerTotalScores[playerIdNum] = currentTotal;
  });

  const resultsTable = resultsPanel.querySelector('table.data-table');
  if (resultsTable) resultsTable.classList.add('hidden');

  const existingGrid = resultsPanel.querySelector('.scoreboard-grid');
  if (existingGrid) existingGrid.remove();

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
    const homeAwayLabel = pResult.scoreMap.isPlayer1 ? 'Home' : 'Away';

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
