import { escapeHTML, getInitials } from '@scripts/utils.js';
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
  if (typeof resultsPanel?.querySelectorAll === 'function') {
    resultsPanel.querySelectorAll('.scoreboard-grid, .skins-scoreboard').forEach(el => el.remove());
  }
  if (typeof resultsPanel?.querySelector === 'function') {
    const grid1 = resultsPanel.querySelector('.scoreboard-grid');
    if (grid1 && grid1.remove) grid1.remove();
    const grid2 = resultsPanel.querySelector('.skins-scoreboard');
    if (grid2 && grid2.remove) grid2.remove();
  }

  resultsBody.innerHTML = (turnResults || [])
    .map(result => {
      const markHtml = result.styleClass
        ? `<span class="${result.styleClass}">${result.displayMark}</span>`
        : result.displayMark;
      return `
        <tr>
          <td>${result.orderNumber}</td>
          <td>${result.machineName}</td>
          <td>${markHtml}</td>
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

  const resultsTable = typeof resultsPanel?.querySelector === 'function' ? resultsPanel.querySelector('table.data-table') : null;
  if (resultsTable && resultsTable.classList) resultsTable.classList.add('hidden');

  if (typeof resultsPanel?.querySelectorAll === 'function') {
    resultsPanel.querySelectorAll('.scoreboard-grid, .skins-scoreboard').forEach(el => el.remove());
  }
  if (typeof resultsPanel?.querySelector === 'function') {
    const grid1 = resultsPanel.querySelector('.scoreboard-grid');
    if (grid1 && grid1.remove) grid1.remove();
    const grid2 = resultsPanel.querySelector('.skins-scoreboard');
    if (grid2 && grid2.remove) grid2.remove();
  }

  if (isTeamMode && calcResult.teamTotals) {
    _renderTeamScoreboard(calcResult, machines, context, domRefs, engine);
    return;
  }

  if (typeof engine.calculateSkinsResults === 'function' || engine.config?.format === 'golf_skins') {
    _renderSkinsScoreboard(calcResult, machines, context, domRefs, engine);
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
      const roundNumber = engine?.getRoundIndexForTurn ? engine.getRoundIndexForTurn(i, machines) : (i + 1);
      const roundKey = String(roundNumber);
      if (!roundScores[roundKey]) roundScores[roundKey] = {};

      if (turn.played) {
        currentTotal += turn.score;
      }
      const existingScore = roundScores[roundKey][playerIdNum];
      roundScores[roundKey][playerIdNum] = engine?.formatMatchupScore ? engine.formatMatchupScore(turn, existingScore) : (turn.played ? String(turn.score) : '-');
    }
    playerTotalScores[playerIdNum] = currentTotal;
  });

  const roundGroups = [];
  const maxTurnIndex = Math.max(0, machines.length - 1);
  const totalRounds = engine?.getRoundIndexForTurn ? engine.getRoundIndexForTurn(maxTurnIndex, machines) : machines.length;
  for (let i = 1; i <= totalRounds; i++) {
    roundGroups.push({ roundNumber: i });
  }

  // 1. Desktop Grid (horizontal line score)
  let desktopHTML = '<div class="scoreboard-grid desktop-grid">';
  desktopHTML += '<div class="scoreboard-row header"><span class="player-col">Player</span>';
  for (const rg of roundGroups) {
    desktopHTML += `<span class="round-header">${rg.roundNumber}</span>`;
  }
  desktopHTML += '<span class="total-header">TOTAL</span></div>';

  playerResults.forEach(pResult => {
    const playerIdNum = Number(pResult.id);
    const totalScoreValue = playerTotalScores[playerIdNum] || 0;
    const homeAwayLabel = pResult.isHome ? 'Home' : 'Away';

    desktopHTML += '<div class="scoreboard-row player-row">';
    desktopHTML += `<span class="player-name"><span class="home-away-label">${homeAwayLabel}:</span> ${escapeHTML(pResult.name)}</span>`;
    for (const rg of roundGroups) {
      const score = roundScores[String(rg.roundNumber)]?.[playerIdNum] || '-';
      desktopHTML += `<span class="round-score">${score}</span>`;
    }
    desktopHTML += `<span class="total-score">${totalScoreValue}</span></div>`;
  });
  desktopHTML += '</div>';

  // 2. Mobile Grid (vertical transposed line score: Inning | Away | Home)
  const roundLabelName = engine?.getRoundLabel ? engine.getRoundLabel() : 'Inning';
  let mobileHTML = '<div class="scoreboard-grid mobile-grid">';
  mobileHTML += '<div class="scoreboard-row header">';
  mobileHTML += `<span class="player-col">${escapeHTML(roundLabelName)}</span>`;
  playerResults.forEach(pResult => {
    const homeAwayLabel = pResult.isHome ? 'Home' : 'Away';
    const initials = getInitials(pResult.name);
    mobileHTML += `<span class="round-header" title="${homeAwayLabel}: ${escapeHTML(pResult.name)}">${escapeHTML(initials)}</span>`;
  });
  mobileHTML += '</div>';

  roundGroups.forEach(rg => {
    mobileHTML += '<div class="scoreboard-row player-row">';
    mobileHTML += `<span class="player-name">${roundLabelName} ${rg.roundNumber}</span>`;
    playerResults.forEach(pResult => {
      const playerIdNum = Number(pResult.id);
      const score = roundScores[String(rg.roundNumber)]?.[playerIdNum] || '-';
      mobileHTML += `<span class="round-score">${score}</span>`;
    });
    mobileHTML += '</div>';
  });

  mobileHTML += '<div class="scoreboard-row player-row font-bold" style="background: rgba(0,0,0,0.05);">';
  mobileHTML += '<span class="player-name">TOTAL</span>';
  playerResults.forEach(pResult => {
    const playerIdNum = Number(pResult.id);
    const totalScoreValue = playerTotalScores[playerIdNum] || 0;
    mobileHTML += `<span class="total-score font-bold">${totalScoreValue}</span>`;
  });
  mobileHTML += '</div></div>';

  const scoreboardHTML = desktopHTML + mobileHTML;

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

  // 1. Desktop Grid
  let desktopHTML = '<div class="scoreboard-grid desktop-grid">';
  const roundLabel = engine.getRoundLabel();
  desktopHTML += '<div class="scoreboard-row header"><span class="player-col">Team</span>';
  roundGroups.forEach(rg => {
    desktopHTML += `<span class="round-header" style="min-width: 80px;">${roundLabel} ${rg.roundNumber}</span>`;
  });
  desktopHTML += '<span class="total-header">TOTAL</span></div>';

  // Away team row
  desktopHTML += '<div class="scoreboard-row player-row">';
  desktopHTML += `<span class="player-name"><span class="home-away-label">Away:</span> ${escapeHTML(awayTeamName)}</span>`;
  roundGroups.forEach(rg => {
    const topRuns = rg.top?.entries.reduce((sum, e) => sum + (e.played ? e.score : 0), 0) ?? '-';
    desktopHTML += `<span class="round-score">${topRuns === 0 && !rg.top?.entries.some(e => e.played) ? '-' : topRuns}</span>`;
  });
  desktopHTML += `<span class="total-score">${teamTotals.away}</span></div>`;

  // Home team row
  desktopHTML += '<div class="scoreboard-row player-row">';
  desktopHTML += `<span class="player-name"><span class="home-away-label">Home:</span> ${escapeHTML(homeTeamName)}</span>`;
  roundGroups.forEach(rg => {
    const bottomRuns = rg.bottom?.entries.reduce((sum, e) => sum + (e.played ? e.score : 0), 0) ?? '-';
    desktopHTML += `<span class="round-score">${bottomRuns === 0 && !rg.bottom?.entries.some(e => e.played) ? '-' : bottomRuns}</span>`;
  });
  desktopHTML += `<span class="total-score">${teamTotals.home}</span></div>`;
  desktopHTML += '</div>';

  // 2. Mobile Grid (vertical transposed)
  let mobileHTML = '<div class="scoreboard-grid mobile-grid">';
  mobileHTML += '<div class="scoreboard-row header">';
  mobileHTML += `<span class="player-col">${escapeHTML(roundLabel)}</span>`;
  mobileHTML += `<span class="round-header"><span class="home-away-label">Away:</span> ${escapeHTML(awayTeamName)}</span>`;
  mobileHTML += `<span class="round-header"><span class="home-away-label">Home:</span> ${escapeHTML(homeTeamName)}</span>`;
  mobileHTML += '</div>';

  roundGroups.forEach(rg => {
    const topRuns = rg.top?.entries.reduce((sum, e) => sum + (e.played ? e.score : 0), 0) ?? '-';
    const bottomRuns = rg.bottom?.entries.reduce((sum, e) => sum + (e.played ? e.score : 0), 0) ?? '-';
    const topStr = topRuns === 0 && !rg.top?.entries.some(e => e.played) ? '-' : topRuns;
    const botStr = bottomRuns === 0 && !rg.bottom?.entries.some(e => e.played) ? '-' : bottomRuns;

    mobileHTML += '<div class="scoreboard-row player-row">';
    mobileHTML += `<span class="player-name">${roundLabel} ${rg.roundNumber}</span>`;
    mobileHTML += `<span class="round-score">${topStr}</span>`;
    mobileHTML += `<span class="round-score">${botStr}</span>`;
    mobileHTML += '</div>';
  });

  mobileHTML += '<div class="scoreboard-row player-row font-bold" style="background: rgba(0,0,0,0.05);">';
  mobileHTML += '<span class="player-name">TOTAL</span>';
  mobileHTML += `<span class="total-score font-bold">${teamTotals.away}</span>`;
  mobileHTML += `<span class="total-score font-bold">${teamTotals.home}</span>`;
  mobileHTML += '</div></div>';

  const scoreboardHTML = desktopHTML + mobileHTML;

  resultsBody.innerHTML = '';
  resultsPanel.insertAdjacentHTML('beforeend', scoreboardHTML);

  totalScore.innerHTML = `<span class="away-label">Away:</span> ${escapeHTML(awayTeamName)} ${teamTotals.away} &nbsp; <span class="home-label">Home:</span> ${escapeHTML(homeTeamName)} ${teamTotals.home}`;

  resultsEmpty.classList.add('hidden');
  resultsPanel.classList.remove('hidden');
}

/**
 * Renders a Golf Skins multi-player scoreboard showing per-hole strokes, skin winners, carryovers, and total skins won.
 * @private
 */
function _renderSkinsScoreboard(calcResult, machines, context, domRefs, engine) {
  const { resultsPanel, resultsBody, totalScore, resultsEmpty } = domRefs;
  const { allEventScores, eventMatchups, normalizeScores, groupScoresByPlayer } = context;

  const wrapper = eventMatchups[0] || {};
  const scoresByPlayer = groupScoresByPlayer(normalizeScores(allEventScores));

  const players = [];
  const addedIds = new Set();
  const addP = (id, name) => {
    const numId = Number(id);
    if (numId > 0 && !addedIds.has(numId)) {
      addedIds.add(numId);
      players.push({ id: numId, name: name || `Player ${numId}` });
    }
  };

  if (wrapper?.players && Array.isArray(wrapper.players)) {
    wrapper.players.forEach(p => addP(p.id || p.player_id, p.name || p.playerName));
  } else {
    ['player1', 'player2', 'player3', 'player4'].forEach((key, idx) => {
      const pId = Number(wrapper[`${key}Id`] ?? wrapper[`player${idx+1}_id`]);
      const pName = wrapper[`${key}Name`] ?? wrapper[`player${idx+1}_name`];
      if (pId > 0) {
        addP(pId, pName);
      }
    });
  }

  if (players.length < 2 && context?.activeSession?.players?.length) {
    context.activeSession.players.forEach(p => {
      addP(p.id || p.player_id, p.playerName || p.name);
    });
  }

  if (players.length < 2 && allEventScores?.length) {
    Object.keys(scoresByPlayer).forEach(pIdStr => {
      const pId = Number(pIdStr);
      if (pId > 0) {
        const pCache = context.allPlayersCache?.find(p => Number(p.id) === pId);
        addP(pId, pCache?.playerName || pCache?.name);
      }
    });
  }

  if (players.length === 0) {
    renderStandardScoreboard(calcResult, domRefs);
    return;
  }

  const scoreMapByPlayer = {};
  players.forEach(p => {
    const pId = Number(p.id);
    const pScores = scoresByPlayer[pId] || [];
    const pMap = {};
    pScores.forEach(row => {
      const orderStr = String(row.orderNumber ?? row.order_number);
      pMap[orderStr] = {
        ball1: Number(row.ball1 || 0),
        ball2: Number(row.ball2 || 0),
        ball3: Number(row.ball3 || 0)
      };
    });
    scoreMapByPlayer[pId] = pMap;
  });

  const skinsCalc = engine.calculateSkinsResults(machines, scoreMapByPlayer);
  const { holeResults, skinsWon } = skinsCalc;

  // 1. Desktop Grid
  let desktopHTML = '<div class="scoreboard-grid desktop-grid skins-scoreboard">';
  desktopHTML += '<div class="scoreboard-row header"><span class="player-col">Player</span>';
  machines.forEach((m, idx) => {
    const holeNum = m.orderNumber ?? (idx + 1);
    desktopHTML += `<span class="round-header">Hole ${holeNum}</span>`;
  });
  desktopHTML += '<span class="total-header">TOTAL</span></div>';

  players.forEach(p => {
    const pId = Number(p.id);
    const totalSkins = skinsWon[pId] || 0;
    desktopHTML += '<div class="scoreboard-row player-row">';
    desktopHTML += `<span class="player-name">${escapeHTML(p.name)}</span>`;
    holeResults.forEach(hr => {
      const strokes = hr.strokes[pId];
      if (strokes === null || strokes === undefined) {
        desktopHTML += '<span class="round-score">-</span>';
      } else {
        const isWinner = hr.winnerId === pId;
        let cellText = `${strokes}`;
        if (isWinner) {
          cellText += ` <span style="color: #2e7d32; font-weight: bold;">(+${hr.skinsAwarded})</span>`;
        } else if (hr.tied) {
          cellText += ` <span style="color: #757575;">(-)</span>`;
        }
        desktopHTML += `<span class="round-score ${isWinner ? 'font-bold' : ''}">${cellText}</span>`;
      }
    });
    desktopHTML += `<span class="total-score font-bold">${totalSkins} ${totalSkins === 1 ? 'Skin' : 'Skins'}</span></div>`;
  });

  desktopHTML += '</div>';

  // 2. Mobile Grid (vertical transposed: Hole | K.V. | A.B.)
  let mobileHTML = '<div class="scoreboard-grid mobile-grid skins-scoreboard">';
  mobileHTML += '<div class="scoreboard-row header"><span class="player-col">Hole</span>';
  players.forEach(p => {
    const initials = getInitials(p.name);
    mobileHTML += `<span class="round-header" title="${escapeHTML(p.name)}">${escapeHTML(initials)}</span>`;
  });
  mobileHTML += '</div>';

  holeResults.forEach((hr, idx) => {
    const holeNum = hr.orderNumber ?? (idx + 1);
    mobileHTML += '<div class="scoreboard-row player-row">';
    mobileHTML += `<span class="player-name">Hole ${holeNum}</span>`;
    players.forEach(p => {
      const pId = Number(p.id);
      const strokes = hr.strokes[pId];
      if (strokes === null || strokes === undefined) {
        mobileHTML += '<span class="round-score">-</span>';
      } else {
        const isWinner = hr.winnerId === pId;
        let cellText = `${strokes}`;
        if (isWinner) {
          cellText += ` <span style="color: #2e7d32; font-weight: bold;">(+${hr.skinsAwarded})</span>`;
        } else if (hr.tied) {
          cellText += ` <span style="color: #757575;">(-)</span>`;
        }
        mobileHTML += `<span class="round-score ${isWinner ? 'font-bold' : ''}">${cellText}</span>`;
      }
    });
    mobileHTML += '</div>';
  });

  mobileHTML += '<div class="scoreboard-row player-row font-bold" style="background: rgba(0,0,0,0.05);">';
  mobileHTML += '<span class="player-name">TOTAL</span>';
  players.forEach(p => {
    const pId = Number(p.id);
    const totalSkins = skinsWon[pId] || 0;
    mobileHTML += `<span class="total-score font-bold">${totalSkins} ${totalSkins === 1 ? 'Skin' : 'Skins'}</span>`;
  });
  mobileHTML += '</div></div>';

  const scoreboardHTML = desktopHTML + mobileHTML;

  if (typeof resultsPanel?.querySelectorAll === 'function') {
    resultsPanel.querySelectorAll('.skins-scoreboard').forEach(el => el.remove());
  }
  const dataTable = typeof resultsPanel?.querySelector === 'function' ? resultsPanel.querySelector('table.data-table') : null;
  if (dataTable) dataTable.classList.add('hidden');

  resultsBody.innerHTML = '';
  const totalScoreDiv = resultsPanel.querySelector('.total-score');
  if (totalScoreDiv) {
    totalScoreDiv.insertAdjacentHTML('beforebegin', scoreboardHTML);
  } else {
    resultsPanel.insertAdjacentHTML('beforeend', scoreboardHTML);
  }

  const summaryParts = players.map(p => `${escapeHTML(p.name)}: ${skinsWon[Number(p.id)] || 0} Skins`);
  totalScore.innerHTML = summaryParts.join(' &nbsp;|&nbsp; ');

  resultsEmpty.classList.add('hidden');
  resultsPanel.classList.remove('hidden');
}
