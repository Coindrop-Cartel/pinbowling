import { ScoringEngine } from '../ScoringEngine.js';
import { formatNumber, escapeHTML } from '../../utils.js';

/**
 * Implementation of Baseball-style scoring logic (PinBaseball).
 * Head-to-head format where players alternate roles as pitcher and batter.
 */
export class BaseballEngine extends ScoringEngine {
  /**
   * Overridden for Baseball:
   * Returns a map of rank (1-10) to target score using exponential scaling.
   * 1 run = target
   * n runs = target * (multiplier ^ (n-1))
   * 
   * @param {number} target The baseline target score for 1 run.
   * @param {number|string} multiplier The exponential multiplier (e.g. 1.5).
   * @param {string} scalingType Ignored for baseball (always exponential).
   * @returns {Object} Map of rank -> score.
   */
  buildRoundValues(target, multiplier, scalingType) {
    const t = Number(target) || 5000000;
    const m = Number(multiplier) || 1.5;
    const values = {};
    for (let rank = 1; rank <= 10; rank++) {
      values[rank] = Math.round(t * Math.pow(m, rank - 1));
    }
    return values;
  }

  getThresholdStart() { return 1; }
  getThresholdEnd() { return 10; }
  getThresholdPrefix() { return 'Runs'; }

  getThresholdSort() {
    return (a, b) => Number(a[0]) - Number(b[0]);
  }

  getThresholdLabel(rank, _value1, _value2) {
    return `${rank} R`;
  }

  /**
   * Helper to get run count for a given score difference based on machine values.
   * 
   * @param {Object} machine The machine config containing .values map.
   * @param {number} diff The score difference (batterScore - pitcherScore).
   * @returns {number} Runs scored (0-10).
   */
  getRunCount(machine, diff) {
    if (diff <= 0 || !machine || !machine.values) return 0;
    const thresholds = Object.entries(machine.values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => b.score - a.score);

    const match = thresholds.find(t => diff >= t.score);
    return match ? match.rank : 0;
  }

  /**
   * Calculates the result of a single ball.
   * 
   * @param {Object} machine The machine/inning configuration.
   * @param {number} pitcherScore Score of the pitcher.
   * @param {number} batterScore Score of the batter.
   * @returns {number} Runs scored on this ball.
   */
  calculateBallRuns(machine, pitcherScore, batterScore) {
    const diff = batterScore - pitcherScore;
    return this.getRunCount(machine, diff);
  }

  /**
   * Calculates turn data for a player on a machine (inning).
   * 
   * @param {Object} machine The machine/inning config.
   * @param {Object} playerEntry The player's scores entry (ball1, ball2, ball3).
   * @param {Object} opponentEntry The opponent's scores entry (ball1, ball2, ball3).
   * @param {boolean} isBatter Whether the player is the batter for this inning/half.
   * @returns {Object} Calculated turn data.
   */
  getInningData(machine, playerEntry, opponentEntry, isBatter) {
 const p1 = Number(playerEntry?.ball1 || 0);
    const p2 = Number(playerEntry?.ball2 || 0);
    const p3 = Number(playerEntry?.ball3 || 0);

    const o1 = Number(opponentEntry?.ball1 || 0);
    const o2 = Number(opponentEntry?.ball2 || 0);
    const o3 = Number(opponentEntry?.ball3 || 0);

    let runs = 0;
    let played = false;

    if (isBatter) {
      // Batter runs are calculated cumulatively across the three balls.
      // We calculate the differential for each ball and then sum up the marginal run gains.
      const differentials = [
        { p: p1, o: o1 }, // Ball 1: Opponent is batter (o), Player is pitcher (p)
        { p: p2, o: o2 }, // Ball 2
        { p: p3, o: o3 }  // Ball 3
      ];

      let currentRunningDiff = 0;
      let runsAccumulated = 0;

      for (const diffPair of differentials) {
        const ballDifferential = Number(diffPair.o - diffPair.p); // Opponent score - Player score
        currentRunningDiff += ballDifferential;

        // Calculate the total potential runs for this new cumulative differential
        let totalPossibleRuns = this.getRunCount(machine, Math.abs(currentRunningDiff));
        
        // Marginal gain: New Total Runs - Previously Accumulated Runs
        const marginalGain = Math.max(0, totalPossibleRuns - runsAccumulated);
        runsAccumulated += marginalGain;
      }
      runs = runsAccumulated;

      played = p1 > 0 || o1 > 0 || p2 > 0 || o2 > 0 || p3 > 0 || o3 > 0;
    } else {
      // Pitcher scores 0 runs.
      runs = 0;
      played = p1 > 0 || p2 > 0 || p3 > 0;
    }

    return {
      orderNumber: machine.orderNumber,
      machineName: machine.machineName,
      isBatter,
      played,
      score: runs,
      mark: `${runs}R`
    };
  }

  /**
   * Calculates the full game results.
   * scoreMap can contain an `opponent` property (another scoreMap)
   * and `isPlayer1` property (boolean, true if player is Player 1/Home).
   * 
   * If opponent scoreMap is not present, we assume 0 for opponent.
   */
  calculateTurnResults(machines, scoreMap) {
    let runningTotal = 0;
    const opponentMap = scoreMap?.opponent || {};
    // Default to player being Player 1 (home) if not specified
    const isPlayer1 = scoreMap?.isPlayer1 !== false;

    // Pre-compute opponent's running total to support walk-off detection.
    // Walk-off: if the batter is already ahead going into the last inning,
    // they win — no need to play it (like real baseball).
    let opponentRunningTotal = 0;
    const opponentResults = machines.map((machine, idx) => {
      const orderStr = String(machine.orderNumber);
      const opponentEntry = opponentMap[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const playerEntry = scoreMap?.[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      
      // For baseball with top/bottom structure:
      // Each inning has 2 machines (top and bottom)
      // Top of inning (even index): Player 1 is Pitcher, Player 2 is Batter
      // Bottom of inning (odd index): Player 1 is Batter, Player 2 is Pitcher
      const isBatter = idx % 2 === 1 ? isPlayer1 : !isPlayer1;
      const turn = this.getInningData(machine, opponentEntry, playerEntry, isBatter);
      if (turn.played) opponentRunningTotal += turn.score;
      return turn;
    });

    const lastInning = machines.length > 0 ? machines[machines.length - 1] : null;

    const results = machines.map((machine, idx) => {
      const orderStr = String(machine.orderNumber);
      const playerEntry = scoreMap?.[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const opponentEntry = opponentMap[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };

      // For baseball with top/bottom structure:
      // Each inning has 2 machines (top and bottom)
      // Top of inning (even index): Player 1 is Pitcher, Player 2 is Batter
      // Bottom of inning (odd index): Player 1 is Batter, Player 2 is Pitcher
      const isBatter = idx % 2 === 1 ? isPlayer1 : !isPlayer1;

      // Walk-off check for the last inning:
      // If this player is the batter in the last inning and is already ahead,
      // they win without needing to play — mark as walk-off.
      const isLastInning = lastInning && machine.orderNumber === lastInning.orderNumber;
      if (isLastInning && isBatter && runningTotal > opponentRunningTotal) {
        return {
          orderNumber: machine.orderNumber,
          machineName: machine.machineName,
          isBatter,
          played: false,
          score: 0,
          mark: 'WO',
          isWalkOff: true,
          displayMark: 'WO',
          displayRoundTotal: '0',
          displayRunningTotal: this.formatTotalScore(runningTotal)
        };
      }

      const turn = this.getInningData(machine, playerEntry, opponentEntry, isBatter);

      if (turn.played) {
        runningTotal += turn.score;
        return {
          ...turn,
          displayMark: this.formatMark(turn),
          displayRoundTotal: isBatter ? `+${turn.score}` : '0',
          displayRunningTotal: this.formatTotalScore(runningTotal)
        };
      }

      return {
        ...turn,
        displayMark: '-',
        displayRoundTotal: '',
        displayRunningTotal: '-'
      };
    });

    return {
      turnResults: results,
      total: runningTotal,
      totalDisplay: this.formatTotalScore(runningTotal)
    };
  }

  formatMark(turn) {
    if (!turn.played) return '-';
    if (!turn.isBatter) return 'P'; // Pitcher role
    return `${turn.score}R`;
  }

  compareScores(a, b) {
    return b - a; // High score wins (total runs)
  }

  getRoundCountOptions() {
    return [2, 4, 6, 9];
  }

  getRoundLabel() { return this.config.roundLabel || 'Inning'; }
  getTurnHeaderPrefix() { return this.config.turnHeaderPrefix || 'Inning'; }
  getPrimaryTargetLabel() { return this.config.primaryTargetLabel || 'Run Baseline'; }
  getValue1Label() { return this.config.value1Label || 'Baseline Score'; }
  getValue2Label() { return this.config.value2Label || 'Multiplier'; }
  getValue2AllowsDecimal() { return true; }

  formatTotalScore(total) {
    return `${formatNumber(total)} R`;
  }

  getInitialValues(suggestedTarget = 5000000) {
    // 5M target, 1.5 multiplier
    return { value1: suggestedTarget, value2: 1.5 };
  }

  // --- Score Map & Results Rendering Overrides ---

  /**
   * Enriches the score map with opponent data for baseball head-to-head scoring.
   * Attaches `opponent` score map and `isPlayer1` flag used by calculateTurnResults.
   *
   * @param {Object} scoreMap Map of orderNumber to ball scores from the DOM.
   * @param {Object} context Baseball-specific context.
   * @param {Array} context.allEventScores All scores for the current event.
   * @param {Array} context.eventMatchups Matchup data for the current event.
   * @param {Function} context.getCurrentPlayerId Returns the selected player ID.
   * @param {Function} context.normalizeScores Normalizes raw score rows.
   * @param {Function} context.groupScoresByPlayer Groups scores by player ID.
   * @param {Function} context.buildBaseballScoreMapForPlayer Builds a baseball score map.
   * @returns {Object} The enriched score map with opponent data.
   */
  enrichScoreMap(scoreMap, context) {
    const { allEventScores, eventMatchups, getCurrentPlayerId, normalizeScores, groupScoresByPlayer, buildBaseballScoreMapForPlayer } = context;
    const scoresByPlayer = groupScoresByPlayer(normalizeScores(allEventScores));
    const selectedPlayerId = getCurrentPlayerId();
    const opponentMap = buildBaseballScoreMapForPlayer(selectedPlayerId, scoresByPlayer, eventMatchups);
    scoreMap.opponent = opponentMap.opponent || {};
    scoreMap.isPlayer1 = opponentMap.isPlayer1;
    return scoreMap;
  }

  /**
   * Renders a head-to-head scoreboard grid for baseball, showing all players'
   * results side-by-side organized by inning.
   *
   * @param {{turnResults: Array, totalDisplay: string}} calcResult Output from calculateTurnResults.
   * @param {Array} machines Target definitions for the event.
   * @param {Object} scoreMap The enriched score map used for calculation.
   * @param {Object} context Baseball-specific context.
   * @param {Object} domRefs DOM element references for the results panel.
   */
  renderResults(calcResult, machines, scoreMap, context, domRefs) {
    const { turnResults, totalDisplay } = calcResult;
    const { resultsPanel, resultsBody, totalScore, resultsEmpty, escapeHTML: escHTML } = domRefs;
    const { allEventScores, eventMatchups, allPlayersCache, getCurrentPlayerId, normalizeScores, groupScoresByPlayer, buildBaseballScoreMapForPlayer } = context;

    if (eventMatchups.length === 0) {
      // No matchups — fall back to standard table rendering
      ScoringEngine.prototype.renderResults.call(this, calcResult, machines, scoreMap, context, domRefs);
      return;
    }

    const currentPlayerId = Number(getCurrentPlayerId());
    // Find all matchups involving this player
    const myMatchups = eventMatchups.filter(m => Number(m.player1Id) === currentPlayerId || Number(m.player2Id) === currentPlayerId);
    const opponentIds = [...new Set(myMatchups.map(m => Number(m.player1Id) === currentPlayerId ? Number(m.player2Id) : Number(m.player1Id)))];

    // Build opponent score maps and calculate their totals
    const scoresByPlayer = groupScoresByPlayer(normalizeScores(allEventScores));

    // Calculate results for all players involved (Current Player + Opponents)
    const playerResults = [
      { id: currentPlayerId, name: allPlayersCache.find(p => p.id === currentPlayerId)?.playerName || `You`, scoreMap: buildBaseballScoreMapForPlayer(currentPlayerId, scoresByPlayer, eventMatchups) },
      ...opponentIds.map(oppId => ({
        id: oppId,
        name: allPlayersCache.find(p => p.id === oppId)?.playerName || `Opponent ${oppId}`,
        scoreMap: buildBaseballScoreMapForPlayer(oppId, scoresByPlayer, eventMatchups)
      }))
    ];

    // --- Core Scoreboard Aggregation Logic ---
    const playerTotalScores = {};   // {playerId: total}
    const inningData = {};          // {orderNumber: {playerId: score}}
    const playerEngineResults = {}; // {playerId: turnResults[]}

    playerResults.forEach(pResult => {
      const playerIdNum = Number(pResult.id);
      const { turnResults: pTurnResults } = this.calculateTurnResults(machines, pResult.scoreMap);
      playerEngineResults[playerIdNum] = pTurnResults;

      let currentTotal = 0;
      for (const turn of pTurnResults) {
        const orderNum = String(turn.orderNumber);
        if (!inningData[orderNum]) inningData[orderNum] = {};

        if (turn.played) {
          currentTotal += turn.score;
          inningData[orderNum][playerIdNum] = turn.isBatter ? String(turn.score) : '0';
        } else if (turn.isWalkOff) {
          inningData[orderNum][playerIdNum] = 'WO';
        } else {
          inningData[orderNum][playerIdNum] = '-';
        }
      }
      playerTotalScores[playerIdNum] = currentTotal;
    });

    // --- Render the Scoreboard Grid ---
    // Hide the old <table> — the scoreboard grid provides its own header.
    const resultsTable = resultsPanel.querySelector('table.data-table');
    if (resultsTable) resultsTable.classList.add('hidden');

    // Remove any previous scoreboard grid (in case of re-render)
    const existingGrid = resultsPanel.querySelector('.scoreboard-grid');
    if (existingGrid) existingGrid.remove();

    // Group machines into innings (pairs of Top/Bot)
    const inningGroups = []; // { inningNumber, topOrder, botOrder }
    for (let i = 0; i < machines.length; i += 2) {
      const inningNumber = Math.floor(i / 2) + 1;
      inningGroups.push({
        inningNumber,
        topOrder: machines[i]?.orderNumber,
        botOrder: machines[i + 1]?.orderNumber
      });
    }

    let scoreboardHTML = '<div class="scoreboard-grid">';

    // 1. Header Row: Player | 1 | 2 | ... | TOTAL
    scoreboardHTML += '<div class="scoreboard-row header"><span class="player-col">Player</span>';
    for (const ig of inningGroups) {
      scoreboardHTML += `<span class="inning-header">${ig.inningNumber}</span>`;
    }
    scoreboardHTML += '<span class="total-header">TOTAL</span></div>';

    // 2. Player Rows — each player gets two sub-rows (Top / Bot) per inning
    playerResults.forEach(pResult => {
      const playerIdNum = Number(pResult.id);
      const totalScoreValue = playerTotalScores[playerIdNum] || 0;

      // Top half-row
      scoreboardHTML += '<div class="scoreboard-row player-row top-row">';
      scoreboardHTML += `<span class="player-name">${escHTML(pResult.name)}</span>`;
      for (const ig of inningGroups) {
        const score = pResult.scoreMap.isPlayer1 ? inningData[String(ig.botOrder)]?.[playerIdNum] || '-'
            : inningData[String(ig.topOrder)]?.[playerIdNum] || '-';

        scoreboardHTML += `<span class="inning-score">${score}</span>`;
      }
      scoreboardHTML += `<span class="total-score">${totalScoreValue}</span></div>`;
    });

    scoreboardHTML += '</div>';

    // Insert the grid into resultsPanel (not the hidden tbody)
    resultsBody.innerHTML = '';
    const totalScoreDiv = resultsPanel.querySelector('.total-score');
    if (totalScoreDiv) {
      totalScoreDiv.insertAdjacentHTML('beforebegin', scoreboardHTML);
    } else {
      resultsPanel.insertAdjacentHTML('beforeend', scoreboardHTML);
    }

    // Total score summary line
    const myTotal = playerTotalScores[currentPlayerId] ?? 0;
    const oppTotals = opponentIds.map(oppId => ({
      id: oppId,
      name: allPlayersCache.find(p => p.id === oppId)?.playerName || `Opponent ${oppId}`,
      total: playerTotalScores[oppId] ?? 0
    }));
    if (oppTotals.length > 0) {
      const oppLines = oppTotals.map(o => `${escHTML(o.name)}: ${o.total}`).join(', ');
      totalScore.innerHTML = `${myTotal} <span class="meta-muted">vs ${oppLines}</span>`;
    } else {
      totalScore.textContent = String(myTotal);
    }

    resultsEmpty.classList.add('hidden');
    resultsPanel.classList.remove('hidden');
  }

  /**
   * Returns baseball-specific context for a round row in the scoring form.
   * Provides matchup, role, and inning display information.
   *
   * @param {Object} round The machine configuration for this round.
   * @param {Object} context Baseball-specific context.
   * @returns {{matchup: Object|null, isPitcher: boolean, opponentName: string, displayRoundNumber: string, roleHtml: string}}
   */
  getRoundRowContext(round, context) {
    const { eventMatchups, getCurrentPlayerId } = context;
    const currentPlayerId = Number(getCurrentPlayerId());
    const matchup = eventMatchups.find(m => Number(m.machineId) === Number(round.machineId) && (Number(m.player1Id) === currentPlayerId || Number(m.player2Id) === currentPlayerId));
    const isPitcher = matchup ? Number(matchup.player1Id) === currentPlayerId : true;
    const opponentName = matchup ? (isPitcher ? matchup.player2Name : matchup.player1Name) : '';
    const roleHtml = matchup ? `
        <div class="baseball-role-row">
          <span class="role-label ${isPitcher ? 'pitcher' : 'batter'}">${isPitcher ? 'Pitcher' : 'Batter'}</span>
          <span class="meta-muted">vs ${escapeHTML(opponentName)}</span>
        </div>
      ` : '';

    let displayRoundNumber = round.orderNumber;
    if (matchup) {
      const inningNumber = matchup.orderNumber;
      const positionLabel = matchup.playerOrder === 1 ? 'Top' : 'Bottom';
      displayRoundNumber = `${positionLabel} of Inning ${inningNumber}`;
    }

    return { matchup, isPitcher, opponentName, displayRoundNumber, roleHtml };
  }
}
