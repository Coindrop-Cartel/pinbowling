import { ScoringEngine } from '../ScoringEngine.js';
import { formatNumber, escapeHTML } from '../../utils.js';
import { buildBaseballScoreMapForPlayer, flattenMatchupInnings } from '../../services/normalizer.js';
import { renderBaseballScoreboard } from '../../ui/scoreboard.js';

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
   * Overridden for Baseball: Declares that this engine needs matchup data
   * and all event scores to calculate head-to-head results.
   *
   * @param {string|number} eventId The active event ID.
   * @param {Object} api The PB_API object.
   * @returns {Object} Map of contextKey → Promise.
   */
  getRequiredEventData(eventId, api) {
    return {
      eventMatchups: api.matchups.get(eventId).catch(() => []),
      allEventScores: api.scores.get(null, Number(eventId)).catch(() => [])
    };
  }

  /**
   * Helper to get run count for a given score difference based on machine values.
   * 
   * @param {Object} machine The machine config containing .values map.
   * @param {number} diff The score difference (batterScore - pitcherScore).
   * @returns {number} Runs scored (0-10).
   */
  getRunCount(machine, diff) {
    if (diff <= 0 || !machine || !machine.values) {
      return 0;
    }
    const thresholds = Object.entries(machine.values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => b.score - a.score);

    const match = thresholds.find(t => diff >= t.score);
    const runs = match ? match.rank : 0;
    return runs;
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
    const runs = this.getRunCount(machine, diff);
    return runs;
  }

  /**
   * Calculates turn data for a player on a machine (inning).
   * 
   * @param {Object} machine The machine/inning config.
   * @param {Object} playerEntry The player's scores entry (ball1, ball2, ball3).
   * @param {Object} opponentEntry The opponent's scores entry (ball1, ball2, ball3).
   * @param {boolean} isBatter Whether the player is the batter for this inning/half.
   * @param {boolean} [silent=false] If true, suppress console logging (used for opponent pre-computation).
   * @returns {Object} Calculated turn data.
   */
  getInningData(machine, playerEntry, opponentEntry, isBatter, silent = false) {
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
      // Pinball scores are cumulative, so each ball's score already represents
      // the running total. The differential for each ball is simply
      // batterScore - pitcherScore. We then check if the new differential
      // crosses the next run threshold, scoring only the marginal gain.
      const batterScores = [p1, p2, p3]; // Player is batter
      const pitcherScores = [o1, o2, o3]; // Opponent is pitcher

      let runsAccumulated = 0;

      for (let i = 0; i < 3; i++) {
        const ballNum = i + 1;
        const cumulativeDiff = batterScores[i] - pitcherScores[i];

        // Calculate the total potential runs for this cumulative differential
        const totalPossibleRuns = this.getRunCount(machine, cumulativeDiff);

        // Marginal gain: New Total Runs - Previously Accumulated Runs
        const marginalGain = Math.max(0, totalPossibleRuns - runsAccumulated);
        runsAccumulated += marginalGain;

        if (!silent) {}
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
    // Walk-off: if the home team is already ahead going into the bottom of
    // the last inning, they win — no need to play it (like real baseball).
    let opponentRunningTotal = 0;
    const opponentResults = machines.map((machine, idx) => {
      const orderStr = String(machine.orderNumber);
      const opponentEntry = opponentMap[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const playerEntry = scoreMap?.[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };

      // For baseball with top/bottom structure:
      // Each inning has 2 machines (top and bottom)
      // Top of inning (even index): Player 1 is Pitcher, Player 2 is Batter
      // Bottom of inning (odd index): Player 1 is Batter, Player 2 is Pitcher
      // When computing the OPPONENT's results, their isBatter is the inverse
      // of the player's isBatter for the same machine.
      const playerIsBatter = idx % 2 === 1 ? isPlayer1 : !isPlayer1;
      const opponentIsBatter = !playerIsBatter;
      const turn = this.getInningData(machine, opponentEntry, playerEntry, opponentIsBatter, true);
      if (turn.played) opponentRunningTotal += turn.score;
      return turn;
    });

    const lastMachineIdx = machines.length - 1;

    const results = machines.map((machine, idx) => {
      const orderStr = String(machine.orderNumber);
      const playerEntry = scoreMap?.[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const opponentEntry = opponentMap[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };

      // For baseball with top/bottom structure:
      // Each inning has 2 machines (top and bottom)
      // Top of inning (even index): Player 1 is Pitcher, Player 2 is Batter
      // Bottom of inning (odd index): Player 1 is Batter, Player 2 is Pitcher
      const isBatter = idx % 2 === 1 ? isPlayer1 : !isPlayer1;

      // Walk-off: In baseball, if the batter is already ahead going into the
      // bottom of the last inning, they win without needing to bat.
      // This only applies on the very last machine (bottom of last inning)
      // when the player is the batter and already leads.
      // Only mark as walk-off if the away team has completed the top of the
      // last inning (i.e., the opponent's top-of-last-inning turn was played).
      const isBottomOfLastInning = idx === lastMachineIdx && isBatter;
      const awayTopOfLastInningPlayed = lastMachineIdx >= 1 && opponentResults[lastMachineIdx - 1]?.played;
      if (isBottomOfLastInning && awayTopOfLastInningPlayed && runningTotal > opponentRunningTotal) {
        return {
          orderNumber: machine.orderNumber,
          machineName: machine.machineName,
          isBatter,
          played: false,
          score: 0,
          mark: '-',
          isWalkOff: true,
          displayMark: '-',
          displayRoundTotal: '',
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

formatMark(turn, scoreOverride = null) {
  if (!turn.played) return turn.mark || '-';
  if (!turn.isBatter) return turn.mark || 'P';
  return scoreOverride !== null ? `${scoreOverride}R` : (turn.mark || `${turn.score}R`);
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

  /** Baseball uses 2 machines per inning (top and bottom). */
  getMachinesPerRound() { return 2; }

  /** Baseball is head-to-head: maximum 2 players per session. */
  getMaxRosterSize() { return 2; }

  /**
   * Returns "Top of Inning N" or "Bottom of Inning N" based on index parity.
   * Even index = Top, Odd index = Bottom (within the inning pair).
   * @param {number} index Zero-based index of the round in the list.
   * @returns {string}
   */
  getRoundDisplayLabel(index) {
    const inningNumber = Math.floor(index / 2) + 1;
    const positionLabel = index % 2 === 0 ? 'Top' : 'Bottom';
    return `${positionLabel} of Inning ${inningNumber}`;
  }

  /**
   * Returns matchup description for the baseball head-to-head format.
   * @param {number} roundCount Number of innings in the session.
   * @returns {{ description: string, details: Array<{ label: string, value: string }> }}
   */
  getMatchupDescription(roundCount) {
    return {
      description: `Exactly 2 players compete head-to-head across ${roundCount} innings. Roles alternate each inning (Pitcher/Batter) and each inning has 2 machines (Top and Bottom).`,
      details: [
        { label: 'Format', value: 'Head-to-Head (2 players per inning)' },
        { label: 'Innings', value: String(roundCount) },
      ]
    };
  }

  /**
   * Returns baseball-specific preview row HTML for the session generator.
   * Uses a simplified header without value1/value2 labels since innings
   * use consistent baseline/multiplier across both halves.
   */
  getPreviewRowHtml(frame, index, _isExpanded, _expandedTempId, formatFn, escapeFn, renderGridFn) {
    const headerHtml = `
      <div class="flex gap-12 w-100 wrap matchup-inning">
        <div class="flex gap-12 flex-1 min-250 align-center">
          <div class="drag-handle">☰</div>
          <span class="round-number">${this.getRoundDisplayLabel(index)}</span>
          <span class="machine-name-display">${escapeFn(frame.machineName)}</span>
        </div>
      </div>
    `;

    const contentHtml = `
      <div class="form-row">
        <label class="small">Change Machine</label>
        <input type="text" class="row-machine-search" placeholder="Filter machines...">
        <select class="row-machine-select"></select>
      </div>
      <div class="flex-between mb-10">
        <div class="flex gap-6">
           <button type="button" class="qfill secondary btn-row" data-type="easy">Easy</button>
           <button type="button" class="qfill secondary btn-row" data-type="med">Med</button>
           <button type="button" class="qfill secondary btn-row" data-type="hard">Hard</button>
        </div>
        <div class="flex gap-4">
           <button type="button" class="scaling-btn ${frame.scaling === 'flat' ? 'btn-standard' : 'secondary'} btn-row" data-scale="flat">Flat</button>
           <button type="button" class="scaling-btn ${frame.scaling === 'curved' ? 'btn-standard' : 'secondary'} btn-row" data-scale="curved">Curved</button>
        </div>
      </div>
      <div class="preview-values-container">${renderGridFn(this.filterThresholds(frame.values), formatFn, this, frame.value1, frame.value2)}</div>
    `;

    return { headerHtml, contentHtml };
  }

  /**
   * Generates matchup payload objects for a baseball session.
   * Produces a round-robin schedule where each player faces every other player.
   *
   * For baseball, each inning has 2 machines (top and bottom). Each matchup row
   * represents a single player's slot in a half-inning:
   *   orderNumber = inning index (1 = 1st inning, 2 = 2nd inning, ...)
   *   playerOrder = role within the slot (1 = home/top, 2 = away/bottom)
   * Both players in a pairing share the same orderNumber; their player_order
   * distinguishes home (1) from away (2). Role alternation (Pitcher/Batter)
   * is determined by player_order in the scoring engine.
   *
   * For N players, there are N*(N-1)/2 unique pairings (single round-robin).
   * If the number of innings exceeds the number of unique pairings, the schedule
   * cycles through the same pairings again.
   *
   * @param {Array<{id: number, playerName?: string}>} players Array of player objects.
   * @param {number} inningCount Number of innings in the session.
   * @param {Array<{machineId: number}>} machines Array of machine objects (2 per inning).
   * @returns {Array<{orderNumber: number, playerId: number, playerOrder: number, machineId: number}>}
   */
  generateMatchupPayload(players, inningCount, machines) {
    if (!players || players.length < 2 || inningCount < 1) return [];

    // Build all unique pairings (round-robin)
    const pairings = [];
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        pairings.push({ player1Id: players[i].id, player2Id: players[j].id });
      }
    }

    const matchups = [];
    for (let inning = 0; inning < inningCount; inning++) {
      const pairing = pairings[inning % pairings.length];
      const orderNumber = inning + 1;

      // Each inning has 2 machines: top (even index) and bottom (odd index)
      const topMachine = machines[inning * 2] || machines[0];
      const bottomMachine = machines[inning * 2 + 1] || machines[1] || topMachine;

      // Home player (player_order 1) on the top machine
      matchups.push({
        orderNumber,
        playerId: pairing.player1Id,
        playerOrder: 1,
        machineId: topMachine.machineId || topMachine.id
      });

      // Away player (player_order 2) on the bottom machine
      matchups.push({
        orderNumber,
        playerId: pairing.player2Id,
        playerOrder: 2,
        machineId: bottomMachine.machineId || bottomMachine.id
      });
    }

    return matchups;
  }

  formatTotalScore(total) {
    return `${formatNumber(total)} R`;
  }

  getInitialValues(suggestedTarget = 5000000) {
    // 5M target, 1.5 multiplier
    return { value1: suggestedTarget, value2: 1.5 };
  }

  /**
   * Baseball-specific target summary for the printable blank score sheet.
   * Shows the Baseline Score and Multiplier for the inning.
   */
  getPrintTargetSummaryHtml(machine, _isLastRound, formatNumberFn) {
    return `
        <span>Baseline: <strong>${formatNumberFn(machine.value1)}</strong></span>
        <span class="ml-15">Multiplier: <strong>${machine.value2}</strong></span>
      `;
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
    renderBaseballScoreboard(calcResult, machines, scoreMap, context, domRefs, this);
  }

  /**
   * Builds a baseball score map for a player including opponent scores.
   * @param {number|string} playerId
   * @param {Array} _playerScores Unused — baseball uses allScoresByPlayer.
   * @param {Object<number, Array>} allScoresByPlayer
   * @param {Array} matchups
   * @returns {Object}
   */
  buildPlayerScoreMap(playerId, _playerScores, allScoresByPlayer, matchups) {
    return buildBaseballScoreMapForPlayer(playerId, allScoresByPlayer, matchups);
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

    // Each baseball inning has 2 machines (top + bottom). Each player has ONE
    // matchup row per inning, on their own machine. The current player may be
    // viewing either their own machine OR the opponent's machine for the inning.
    // So we find the inning (orderNumber) that contains round.machineId, then
    // resolve the player's matchup and the opponent (sibling) within that inning.
    //
    // The API always returns eventMatchups as a list of wrapper objects, each
    // with an `innings` array (true for both league and one-off sessions). We
    // flatten all innings into a single list so we only have to search one place.
    const innings = flattenMatchupInnings(eventMatchups);

    // Step 1: Find any matchup row whose machineId matches this round's machine.
    // That tells us which inning (orderNumber) this machine belongs to.
    const machineMatch = innings.find(
      m => Number(m.machineId ?? m.machine_id) === Number(round.machineId)
    );
    const inningOrderNumber = machineMatch ? Number(machineMatch.orderNumber ?? machineMatch.order_number) : null;

    // Step 2: Within that inning, find the current player's matchup row.
    const matchup = inningOrderNumber !== null
      ? innings.find(
          m => Number(m.orderNumber ?? m.order_number) === inningOrderNumber
            && Number(m.playerId ?? m.player_id) === currentPlayerId
        )
      : null;

    // Sibling row = same inning, different playerOrder (the opponent).
    const sibling = inningOrderNumber !== null
      ? innings.find(
          m => Number(m.orderNumber ?? m.order_number) === inningOrderNumber
            && Number(m.playerId ?? m.player_id) !== currentPlayerId
        )
      : null;

    // playerOrder 1 = Home, 2 = Away.
    // In baseball: Top of inning = Away bats, Home pitches.
    //              Bottom of inning = Home bats, Away pitches.
    // Determine whether this machine is the Top or Bottom half.
    // In our generator, playerOrder 1 is always the Top machine.
    const topMatchup = innings.find(
      m => Number(m.orderNumber ?? m.order_number) === inningOrderNumber && Number(m.playerOrder ?? m.player_order) === 1
    );
    const isTop = topMatchup ? Number(topMatchup.machineId ?? topMatchup.machine_id) === Number(round.machineId) : true;

    const isHome = matchup ? Number(matchup.playerOrder ?? matchup.player_order) === 1 : true;
    // isPitcher reflects the CURRENT player's role on this machine, not the
    // machine owner's role. The current player may be viewing the opponent's
    // machine for the inning, so we use the current player's home/away status.
    // Home pitches on Top, bats on Bottom. Away is the inverse.
    // Top (playerOrder 1) = Home pitches, Away bats.
    // Bottom (playerOrder 2) = Away pitches, Home bats.
    const isPitcher = isHome ? isTop : !isTop;
    const opponentName = sibling ? (sibling.playerName ?? sibling.player_name) : '';
    const roleHtml = matchup ? `
        <div class="baseball-role-row">
          <span class="role-label ${isPitcher ? 'pitcher' : 'batter'}">${isPitcher ? 'Pitcher' : 'Batter'}</span>
          <span class="meta-muted">vs ${escapeHTML(opponentName)}</span>
        </div>
      ` : '';

    let displayRoundNumber = round.orderNumber;
    if (matchup) {
      const inningNumber = Number(matchup.orderNumber ?? matchup.order_number);
      const positionLabel = isTop ? 'Top' : 'Bottom';
      displayRoundNumber = `${positionLabel} of ${inningNumber}`;
    }

    return { matchup, isPitcher, opponentName, displayRoundNumber, roleHtml };
  }
}
