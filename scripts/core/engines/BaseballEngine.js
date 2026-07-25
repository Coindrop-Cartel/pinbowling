import { ScoringEngine } from '../ScoringEngine.js';
import { formatNumber, escapeHTML } from '../../utils.js';
import { buildBaseballScoreMapForPlayer } from '../../services/normalizer.js';
import { buildRoundRobinMatchups, resolveMatchupRole, buildTeamRoundRobinMatchups, resolveTeamMatchupRole } from '../../services/matchupBuilder.js';

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
    if (diff <= 0 || !machine) {
      return 0;
    }
    const hasConfig = Boolean(machine.values || machine.value1 || machine.targetScore);
    if (!hasConfig) {
      return 0;
    }
    const values = machine.values || this.buildRoundValues(machine.value1 ?? machine.targetScore, machine.value2 ?? machine.multiplier);
    const thresholds = Object.entries(values)
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
    const opponentMap = scoreMap?.opponent || {};
    const isPlayer1 = scoreMap?.isPlayer1 !== false;

    // Symmetrically calculate top/bottom runs sequentially to handle walk-offs
    let homeScore = 0;
    let awayScore = 0;

    const lastMachineIdx = machines.length - 1;
    const roundPlayStatus = [];

    // First pre-calculate runs for each machine index sequentially
    const roundDetails = machines.map((machine, idx) => {
      const orderStr = String(machine.orderNumber);
      const playerEntry = scoreMap?.[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const opponentEntry = opponentMap[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };

      // Map who is Home (Player 1) vs Away (Player 2)
      const p1Entry = isPlayer1 ? playerEntry : opponentEntry;
      const p2Entry = isPlayer1 ? opponentEntry : playerEntry;

      const isTop = idx % 2 === 0;

      let runs = 0;
      let played = false;
      let isWalkOff = false;

      if (isTop) {
        // Top of inning: Player 2 (Away) is batter, Player 1 (Home) is pitcher
        const actualTurn = this.getInningData(machine, p2Entry, p1Entry, true, true);
        runs = actualTurn.score;
        played = actualTurn.played;
        if (played) {
          awayScore += runs;
        }
      } else {
        // Bottom of inning: Player 1 (Home) is batter, Player 2 (Away) is pitcher
        const isLastInning = idx === lastMachineIdx;
        const awayTopOfLastInningPlayed = lastMachineIdx >= 1 && roundPlayStatus[lastMachineIdx - 1];

        const actualTurn = this.getInningData(machine, p1Entry, p2Entry, true, true);
        const bottomRuns = actualTurn.score;
        const bottomPlayed = actualTurn.played;

        if (isLastInning && awayTopOfLastInningPlayed && homeScore > awayScore) {
          // Home was ALREADY ahead before bottom of last inning.
          // Bottom of last inning is unneeded for Home's win; preserved scores are not added to Home's total.
          isWalkOff = true;
          runs = 0;
          played = bottomPlayed;
        } else {
          runs = bottomRuns;
          played = bottomPlayed;
          if (played) {
            homeScore += runs;
          }
        }
      }

      roundPlayStatus[idx] = played;

      return {
        idx,
        machine,
        runs,
        played,
        isWalkOff
      };
    });

    let runningTotal = 0;
    const results = roundDetails.map((rd, idx) => {
      const orderStr = String(rd.machine.orderNumber);
      const playerEntry = scoreMap?.[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const opponentEntry = opponentMap[orderStr] || { ball1: 0, ball2: 0, ball3: 0 };
      const isBatter = idx % 2 === 1 ? isPlayer1 : !isPlayer1;

      const turn = this.getInningData(rd.machine, playerEntry, opponentEntry, isBatter);

      if (rd.isWalkOff) {
        return {
          orderNumber: rd.machine.orderNumber,
          machineName: rd.machine.machineName,
          isBatter,
          played: turn.played,
          score: 0,
          mark: turn.played ? this.formatMark(turn) : '-',
          isWalkOff: true,
          displayMark: turn.played ? this.formatMark(turn) : '-',
          displayRoundTotal: isBatter && turn.played ? '+0 (X)' : '',
          displayRunningTotal: this.formatTotalScore(runningTotal)
        };
      }

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
      totalDisplay: this.formatTotalScore(runningTotal),
      homeScore,
      awayScore
    };
  }

  /**
   * Calculates team baseball results. Each half-inning has multiple matchups
   * on the same machine. Runs accumulate across matchups within each half-inning.
   *
   * @param {Array} machines The machine entries (matchup slots).
   * @param {Object} scoreMap Map of orderNumber to ball scores from the current player.
   * @param {Object} context Additional context including allEventScores, eventMatchups, etc.
   * @returns {{ turnResults: Array, total: number, totalDisplay: string, teamTotals: Object }}
   */
  calculateTeamTurnResults(machines, scoreMap, context = {}) {
    const { allEventScores, eventMatchups, getCurrentPlayerId, normalizeScores } = context;

    const normalizedScores = normalizeScores ? normalizeScores(allEventScores || []) : (allEventScores || []);
    const scoresByTeam = {};
    normalizedScores.forEach(s => {
      const tId = String(s.teamId ?? s.team_id ?? 0);
      if (!scoresByTeam[tId]) scoresByTeam[tId] = [];
      scoresByTeam[tId].push(s);
    });

    const matchupW = (eventMatchups || [])[0] || {};
    const homeTeamId = Number(matchupW.player1Id ?? matchupW.player1_id ?? 0);
    const awayTeamId = Number(matchupW.player2Id ?? matchupW.player2_id ?? 0);
    const selectedTeamId = Number(getCurrentPlayerId ? getCurrentPlayerId() : 0);

    let awayScore = 0;
    let homeScore = 0;
    const teamTotals = { away: 0, home: 0 };
    const turnResults = [];
    let runningTotal = 0;

    machines.forEach((machine, idx) => {
      const orderNum = Number(machine.orderNumber ?? machine.order_number ?? (idx + 1));
      const orderStr = String(orderNum);
      const isTop = machine.isTop !== undefined ? Boolean(machine.isTop) : (orderNum % 2 !== 0);

      const awayScores = scoresByTeam[String(awayTeamId)] || [];
      const homeScores = scoresByTeam[String(homeTeamId)] || [];

      const awayRow = awayScores.find(s => Number(s.orderNumber ?? s.order_number) === orderNum);
      const homeRow = homeScores.find(s => Number(s.orderNumber ?? s.order_number) === orderNum);

      let awayEntry = awayRow ? { ball1: Number(awayRow.ball1), ball2: Number(awayRow.ball2), ball3: Number(awayRow.ball3) } : { ball1: 0, ball2: 0, ball3: 0 };
      let homeEntry = homeRow ? { ball1: Number(homeRow.ball1), ball2: Number(homeRow.ball2), ball3: Number(homeRow.ball3) } : { ball1: 0, ball2: 0, ball3: 0 };

      if (selectedTeamId === awayTeamId) {
        if (scoreMap?.[orderStr]) awayEntry = scoreMap[orderStr];
        if (scoreMap?.opponent?.[orderStr]) homeEntry = scoreMap.opponent[orderStr];
      } else if (selectedTeamId === homeTeamId) {
        if (scoreMap?.[orderStr]) homeEntry = scoreMap[orderStr];
        if (scoreMap?.opponent?.[orderStr]) awayEntry = scoreMap.opponent[orderStr];
      }

      const hasEnteredScores = (awayEntry.ball1 > 0 || awayEntry.ball2 > 0 || awayEntry.ball3 > 0 || homeEntry.ball1 > 0 || homeEntry.ball2 > 0 || homeEntry.ball3 > 0);

      // Check walk-off: if last bottom half-inning, home is already leading, and no scores were entered for this half-inning
      const isLastMachine = (idx === machines.length - 1);
      if (!isTop && isLastMachine && homeScore > awayScore && !hasEnteredScores) {
        turnResults.push({
          orderNumber: orderNum,
          machineName: machine.machineName,
          isBatter: selectedTeamId === homeTeamId,
          played: false,
          score: 0,
          mark: '-',
          isWalkOff: true,
          displayMark: '-',
          displayRoundTotal: '',
          displayRunningTotal: '-'
        });
        return;
      }

      const batterEntry = isTop ? awayEntry : homeEntry;
      const pitcherEntry = isTop ? homeEntry : awayEntry;

      const turn = this.getInningData(machine, batterEntry, pitcherEntry, true, true);
      const runs = turn.score;
      const played = turn.played;

      if (isTop) {
        awayScore += runs;
        teamTotals.away += runs;
      } else {
        homeScore += runs;
        teamTotals.home += runs;
      }

      const teamIsAway = selectedTeamId === awayTeamId;
      const isSelectedTeamTurn = (isTop && teamIsAway) || (!isTop && !teamIsAway);

      if (played) {
        runningTotal += (isSelectedTeamTurn ? runs : 0);
        turnResults.push({
          orderNumber: orderNum,
          machineName: machine.machineName,
          isBatter: isSelectedTeamTurn,
          played: true,
          score: runs,
          mark: turn.mark,
          displayMark: turn.mark,
          displayRoundTotal: isSelectedTeamTurn ? `+${runs}` : '0',
          displayRunningTotal: this.formatTotalScore(runningTotal)
        });
      } else {
        turnResults.push({
          orderNumber: orderNum,
          machineName: machine.machineName,
          isBatter: isSelectedTeamTurn,
          played: false,
          score: 0,
          mark: '-',
          displayMark: '-',
          displayRoundTotal: '',
          displayRunningTotal: '-'
        });
      }
    });

    return {
      turnResults,
      total: runningTotal,
      totalDisplay: this.formatTotalScore(runningTotal),
      teamTotals,
      homeScore,
      awayScore
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

  /**
   * Sorts head-to-head standings by win rate, then run diff, then total runs.
   */
  sortStandings(rows, { head2headRecordsMap } = {}) {
    return [...rows].sort((a, b) => {
      if (a.hasScores !== b.hasScores) return a.hasScores ? -1 : 1;

      if (head2headRecordsMap) {
        const recA = head2headRecordsMap[a.player.id];
        const recB = head2headRecordsMap[b.player.id];
        if (recA && recB) {
          const rateDiff = recB.winRate - recA.winRate;
          if (Math.abs(rateDiff) > 0.001) return rateDiff;
          const diffDiff = recB.runDiff - recA.runDiff;
          if (diffDiff !== 0) return diffDiff;
        }
      }

      return this.compareScores(a.total, b.total);
    });
  }

  getRoundCountOptions() {
    return [2, 4, 6, 9];
  }

  getRoundLabel() { return this.config.roundLabel || 'Round'; }
  getTurnHeaderPrefix() { return this.config.turnHeaderPrefix || 'Round'; }
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
    // Check if team mode is available from the last context
    const isTeam = this._lastContext?.isTeamMode;
    if (isTeam) {
      return {
        description: `Two teams compete head-to-head across ${roundCount} innings. Each inning has 4 matchups (2 per half-inning). Team members rotate as pitcher and batter.`,
        details: [
          { label: 'Format', value: 'Team Head-to-Head (4 matchups per inning)' },
          { label: 'Innings', value: String(roundCount) },
        ]
      };
    }
    return {
      description: `Exactly 2 players compete head-to-head across ${roundCount} innings. Roles alternate each inning (Pitcher/Batter) and each inning has 2 machines (Top and Bottom).`,
      details: [
        { label: 'Format', value: 'Head-to-Head (2 players per inning)' },
        { label: 'Innings', value: String(roundCount) },
      ]
    };
  }

  /**
   * Returns baseball-specific preview row data for the session generator.
   */
  getPreviewRowData(frame) {
    return {
      value1: frame.value1,
      value2: frame.value2
    };
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
    return buildRoundRobinMatchups(players, inningCount, machines);
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
   * Enriches the score map with opponent data for head-to-head scoring.
   * Attaches `opponent` score map and `isPlayer1` flag used by calculateTurnResults.
   *
   * @param {Object} scoreMap Map of orderNumber to ball scores from the DOM.
   * @param {Object} context Format-specific context.
   * @param {Array} context.allEventScores All scores for the current event.
   * @param {Array} context.eventMatchups Matchup data for the current event.
   * @param {Function} context.getCurrentPlayerId Returns the selected player ID.
   * @param {Function} context.normalizeScores Normalizes raw score rows.
   * @param {Function} context.groupScoresByPlayer Groups scores by player ID.
   * @returns {Object} The enriched score map with opponent data.
   */
  enrichScoreMap(scoreMap, context) {
    const { allEventScores, eventMatchups, getCurrentPlayerId, normalizeScores, groupScoresByPlayer, activeLeague, enrichedEntries } = context;
    const scoresByPlayer = groupScoresByPlayer(normalizeScores(allEventScores));
    const selectedPlayerId = getCurrentPlayerId();

    const isTeamMode = activeLeague?.participationType === 'team';

    if (isTeamMode) {
      const normalized = normalizeScores(allEventScores || []);
      const scoresByTeam = {};
      normalized.forEach(s => {
        const tId = String(s.teamId ?? s.team_id ?? 0);
        if (!scoresByTeam[tId]) scoresByTeam[tId] = [];
        scoresByTeam[tId].push(s);
      });

      const selectedTeamIdStr = String(selectedPlayerId);
      const matchupW = (eventMatchups || [])[0] || {};
      const p1TeamId = String(matchupW.player1Id ?? matchupW.player1_id ?? '');
      const p2TeamId = String(matchupW.player2Id ?? matchupW.player2_id ?? '');
      const opponentTeamIdStr = selectedTeamIdStr === p1TeamId ? p2TeamId : p1TeamId;

      const opponentScores = scoresByTeam[opponentTeamIdStr] || [];
      const opponentMap = {};
      opponentScores.forEach(row => {
        const orderStr = String(row.orderNumber ?? row.order_number);
        opponentMap[orderStr] = {
          ball1: Number(row.ball1 || 0),
          ball2: Number(row.ball2 || 0),
          ball3: Number(row.ball3 || 0)
        };
      });

      scoreMap.opponent = opponentMap;
      scoreMap.isPlayer1 = (selectedTeamIdStr === p1TeamId);
      scoreMap.isTeamMode = true;
      return scoreMap;
    }

    // Individual mode: existing logic
    const opponentMap2 = this.buildPlayerScoreMap(selectedPlayerId, scoresByPlayer[selectedPlayerId] || [], scoresByPlayer, eventMatchups);
    scoreMap.opponent = opponentMap2.opponent || {};
    scoreMap.isPlayer1 = opponentMap2.isPlayer1;
    return scoreMap;
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
   * Returns head-to-head context for a round row in the scoring form.
   * Provides matchup, role, and round display information.
   *
   * @param {Object} round The machine configuration for this round.
   * @param {Object} context Head-to-head context.
   * @returns {{matchup: Object|null, isPlayer1: boolean, isPitcher: boolean, opponentName: string, displayRoundNumber: string, role: string}}
   */
  getRoundRowContext(round, context) {
    const { eventMatchups, getCurrentPlayerId, allPlayersCache, activeLeague } = context;
    const currentPlayerId = Number(getCurrentPlayerId());
    
    const isTeamMode = activeLeague?.participationType === 'team';

    let result;
    if (isTeamMode) {
      result = resolveTeamMatchupRole(
        currentPlayerId,
        round.orderNumber,
        eventMatchups,
        { allPlayersCache, activeLeague }
      );
    } else {
      result = resolveMatchupRole(
        currentPlayerId,
        round.machineId,
        eventMatchups
      );
    }

    const { matchup, isPlayer1, isTop, opponentName, displayRoundNumber } = result;
    const roundNumber = round.orderNumber ?? 1;
    const finalDisplayRoundNumber = matchup ? displayRoundNumber : roundNumber;

    // Baseball-specific: player1 pitches on top, player2 pitches on bottom.
    const isPitcher = isPlayer1 ? isTop : !isTop;
    const role = isPitcher ? 'pitcher' : 'batter';

    return {
      matchup,
      isPlayer1,
      isPitcher,
      opponentName,
      displayRoundNumber: finalDisplayRoundNumber,
      displayRoundLabel: matchup ? '' : 'Round',
      role
    };
  }
}
