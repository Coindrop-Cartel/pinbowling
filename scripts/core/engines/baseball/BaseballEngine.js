import { ScoringEngine } from '../../ScoringEngine.js';
import { formatNumber, escapeHTML } from '../../../utils.js';
import { buildRoundRobinMatchups, resolveMatchupRole, buildTeamRoundRobinMatchups, resolvePlayerForBall } from '../../../services/matchupBuilder.js';
import { resolvePlayersForMatchupParticipant } from '../../../services/playerSelector.js';

/**
 * Implementation of Baseball-style scoring logic (PinBaseball).
 * Head-to-head format where players alternate roles as pitcher and batter.
 */
export class BaseballEngine extends ScoringEngine {
  constructor(config = {}, options = {}) {
    super({ format: 'baseball', ...config }, { competitionFormat: 'head_to_head', ...options });
  }

  getQuickFillScale() {
    return 10;
  }
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
        const awayBatterPlayed = (isPlayer1 ? !!opponentMap[orderStr] : !!scoreMap[orderStr]) || actualTurn.played;
        played = awayBatterPlayed;
        if (played) {
          awayScore += runs;
        }
        roundPlayStatus[idx] = awayBatterPlayed;
      } else {
        // Bottom of inning: Player 1 (Home) is batter, Player 2 (Away) is pitcher
        const topOfThisInningPlayed = idx >= 1 && roundPlayStatus[idx - 1];
        const isLastInning = idx === lastMachineIdx;
        const awayTopOfLastInningPlayed = lastMachineIdx >= 1 && roundPlayStatus[lastMachineIdx - 1];

        if (!topOfThisInningPlayed) {
          // Bottom of inning cannot be played/scored if Top of that inning was not played by Away batter
          runs = 0;
          played = false;
          roundPlayStatus[idx] = false;
        } else {
          const actualTurn = this.getInningData(machine, p1Entry, p2Entry, true, true);
          const bottomRuns = actualTurn.score;
          const homeBatterPlayed = (isPlayer1 ? !!scoreMap[orderStr] : !!opponentMap[orderStr]) || actualTurn.played;
          const bottomPlayed = actualTurn.played && homeBatterPlayed;

          if (isLastInning && awayTopOfLastInningPlayed && homeScore > awayScore) {
            // Home was ALREADY ahead before bottom of last inning.
            // Bottom of last inning is unneeded for Home's win; preserved scores are not added to Home's total.
            isWalkOff = true;
            runs = 0;
            played = bottomPlayed;
            roundPlayStatus[idx] = bottomPlayed;
          } else {
            runs = bottomRuns;
            played = bottomPlayed;
            if (played) {
              homeScore += runs;
            }
            roundPlayStatus[idx] = homeBatterPlayed;
          }
        }
      }

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
      const tId = String(s.teamId ?? 0);
      if (!scoresByTeam[tId]) scoresByTeam[tId] = [];
      scoresByTeam[tId].push(s);
    });

    const matchupW = (eventMatchups || [])[0] || {};
    const homeTeamId = Number(matchupW.team1Id ?? 0);
    const awayTeamId = Number(matchupW.team2Id ?? 0);
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

      // Check walk-off: if last bottom half-inning and home team is already leading
      const isLastMachine = (idx === machines.length - 1);
      if (!isTop && isLastMachine && homeScore > awayScore) {
        turnResults.push({
          orderNumber: orderNum,
          machineName: machine.machineName,
          isBatter: selectedTeamId === homeTeamId,
          played: false,
          score: 0,
          mark: '-',
          isWalkOff: true,
          displayMark: '-',
          displayRoundTotal: 'Walk-off',
          displayRunningTotal: this.formatTotalScore(runningTotal)
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

  getRoundCountOptions() {
    return [2, 4, 6, 9];
  }

  allowsTies() {
    return false;
  }

  supportsExtraRounds() {
    return true;
  }

  getExtraRoundConfig() {
    return {
      roundsToAdd: 2,
      label: 'Extra Inning',
      roundName: 'Extra Inning'
    };
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
   * Formats cell score in a head-to-head baseball line score table cell.
   * Prioritizes the batter's scored runs for the inning over the pitcher's 0 runs.
   * @param {Object} turn Turn object for one half-inning.
   * @param {string} [existingScore] Score previously formatted for this inning cell.
   * @returns {string}
   */
  formatMatchupScore(turn, existingScore) {
    if (turn?.isBatter && turn?.played) {
      return String(turn.score);
    }
    if (existingScore !== undefined && existingScore !== '-') {
      return existingScore;
    }
    if (turn?.played) {
      return String(turn.score);
    }
    return '-';
  }

  /**
   * Returns matchup description for the baseball head-to-head format.
   * @param {number} roundCount Number of innings in the session.
   * @returns {{ description: string, details: Array<{ label: string, value: string }> }}
   */
  requiresHeadToHead() {
    return true;
  }

  getMatchupDescription(roundCount) {
    if (!this.requiresHeadToHead()) return null;
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
  /**
   * Enriches the score map with opponent data for head-to-head scoring.
   * Delegates to team or individual helper methods based on participation type.
   *
   * @param {Object} scoreMap Map of orderNumber to ball scores from the DOM.
   * @param {Object} context Format-specific context.
   * @returns {Object} The enriched score map with opponent data.
   */
  enrichScoreMap(scoreMap, context) {
    const isTeamMode = context?.activeLeague?.participationType === 'team' || context?.activeSession?.participationType === 'team';
    return isTeamMode
      ? this._enrichTeamScoreMap(scoreMap, context)
      : this._enrichIndividualScoreMap(scoreMap, context);
  }

  /**
   * Enriches score map for team baseball mode.
   */
  _enrichTeamScoreMap(scoreMap, context) {
    const { allEventScores, eventMatchups, getCurrentPlayerId, getActiveTeamId, normalizeScores } = context;
    const activeTeamIdVal = getActiveTeamId?.();
    const selectedTeamIdStr = (activeTeamIdVal !== undefined && activeTeamIdVal !== null && String(activeTeamIdVal).trim() !== '')
      ? String(activeTeamIdVal)
      : String(getCurrentPlayerId ? getCurrentPlayerId() : 0);

    const normalized = normalizeScores(allEventScores || []);

    const scoresByTeam = {};
    normalized.forEach(s => {
      const tId = String(s.teamId ?? 0);
      if (!scoresByTeam[tId]) scoresByTeam[tId] = [];
      scoresByTeam[tId].push(s);
    });

    scoreMap.byTeam = {};
    Object.entries(scoresByTeam).forEach(([tId, rows]) => {
      const numId = Number(tId);
      if (!numId) return;
      const tMap = {};
      (rows || []).forEach(r => {
        const order = r.orderNumber ?? r.order_number;
        if (order !== undefined) {
          tMap[String(order)] = {
            ball1: Number(r.ball1 || 0),
            ball2: Number(r.ball2 || 0),
            ball3: Number(r.ball3 || 0)
          };
        }
      });
      scoreMap.byTeam[numId] = tMap;
      scoreMap.byTeam[String(numId)] = tMap;
    });

    // Merge transient DOM input scores into scoreMap.byTeam
    Object.entries(scoreMap).forEach(([orderStr, entry]) => {
      if (!entry?.byPlayer) return;
      Object.entries(entry.byPlayer).forEach(([pId, pRow]) => {
        const numId = Number(pId);
        if (!numId) return;
        if (!scoreMap.byTeam[numId]) scoreMap.byTeam[numId] = {};
        if (!scoreMap.byTeam[String(numId)]) scoreMap.byTeam[String(numId)] = scoreMap.byTeam[numId];
        if (pRow.ball1 > 0 || pRow.ball2 > 0 || pRow.ball3 > 0) {
          scoreMap.byTeam[numId][orderStr] = {
            ball1: pRow.ball1 || 0,
            ball2: pRow.ball2 || 0,
            ball3: pRow.ball3 || 0
          };
        }
      });
    });

    const isAllTeams = selectedTeamIdStr === 'all';
    const activeMatchupId = context?.activeMatchupId || context?.activeTeamEventMatchupId || context?.matchupId;
    const matchupW = (activeMatchupId && (eventMatchups || []).find(m => String(m.id) === String(activeMatchupId)))
      || (eventMatchups || []).find(m => {
        const t1 = String(m.team1Id ?? '');
        const t2 = String(m.team2Id ?? '');
        return (!isAllTeams && selectedTeamIdStr !== '0' && (t1 === selectedTeamIdStr || t2 === selectedTeamIdStr));
      })
      || (eventMatchups || [])[0]
      || {};

    const p1TeamId = String(matchupW.team1Id ?? '');
    const p2TeamId = String(matchupW.team2Id ?? '');
    const opponentTeamIdStr = isAllTeams ? p2TeamId : (selectedTeamIdStr === p1TeamId ? p2TeamId : p1TeamId);

    const opponentScores = scoresByTeam[opponentTeamIdStr] || [];
    const opponentMap = {};
    opponentScores.forEach(row => {
      const orderStr = String(row.orderNumber ?? 0);
      opponentMap[orderStr] = {
        ball1: Number(row.ball1 || 0),
        ball2: Number(row.ball2 || 0),
        ball3: Number(row.ball3 || 0)
      };
    });

    scoreMap.opponent = opponentMap;
    scoreMap.isPlayer1 = (isAllTeams || !selectedTeamIdStr || selectedTeamIdStr === '0') ? true : (selectedTeamIdStr === p1TeamId);
    scoreMap.isTeamMode = true;
    return scoreMap;
  }

  /**
   * Enriches score map for individual baseball mode.
   */
  _enrichIndividualScoreMap(scoreMap, context) {
    const { allEventScores, eventMatchups, getCurrentPlayerId, normalizeScores, groupScoresByPlayer } = context;
    const scoresByPlayer = groupScoresByPlayer(normalizeScores(allEventScores));
    const selectedPlayerId = Number(getCurrentPlayerId());
    const activeMatchupId = context?.activeMatchupId || context?.activeEventMatchupId || context?.matchupId;

    scoreMap.byPlayer = scoreMap.byPlayer || {};
    Object.entries(scoresByPlayer).forEach(([pId, rows]) => {
      const numId = Number(pId);
      if (!numId) return;
      const pMap = {};
      (rows || []).forEach(r => {
        const order = r.orderNumber ?? r.order_number;
        if (order !== undefined) {
          pMap[String(order)] = {
            ball1: Number(r.ball1 || 0),
            ball2: Number(r.ball2 || 0),
            ball3: Number(r.ball3 || 0)
          };
        }
      });
      scoreMap.byPlayer[numId] = pMap;
      scoreMap.byPlayer[String(numId)] = pMap;
    });

    // Merge transient DOM input scores into scoreMap.byPlayer
    Object.entries(scoreMap).forEach(([orderStr, entry]) => {
      if (!entry?.byPlayer) return;
      Object.entries(entry.byPlayer).forEach(([pId, pRow]) => {
        const numId = Number(pId);
        if (!numId) return;
        if (!scoreMap.byPlayer[numId]) scoreMap.byPlayer[numId] = {};
        if (!scoreMap.byPlayer[String(numId)]) scoreMap.byPlayer[String(numId)] = scoreMap.byPlayer[numId];
        if (pRow.ball1 > 0 || pRow.ball2 > 0 || pRow.ball3 > 0) {
          scoreMap.byPlayer[numId][orderStr] = {
            ball1: pRow.ball1 || 0,
            ball2: pRow.ball2 || 0,
            ball3: pRow.ball3 || 0
          };
        }
      });
    });

    const opponentMap2 = this.buildPlayerScoreMap(selectedPlayerId, scoresByPlayer[selectedPlayerId] || [], scoresByPlayer, eventMatchups, activeMatchupId);
    scoreMap.opponent = opponentMap2.opponent || {};
    scoreMap.isPlayer1 = opponentMap2.isPlayer1;

    // If scoreMap was built from DOM and has section breakdown (e.g. in All Players view or dual input rows)
    const hasDomSections = Object.keys(scoreMap).some(k => scoreMap[k]?.bySection?.player1 || scoreMap[k]?.bySection?.player2);
    if (hasDomSections) {
      const isPlayer1 = scoreMap.isPlayer1 !== false;
      Object.keys(scoreMap).forEach(orderStr => {
        const orderNum = Number(orderStr);
        if (isNaN(orderNum)) return;
        const entry = scoreMap[orderStr];
        if (!entry || !entry.bySection) return;

        const isTop = orderNum % 2 !== 0;
        const p1SectionKey = isTop ? 'player1' : 'player2';
        const p2SectionKey = isTop ? 'player2' : 'player1';

        const mySectionKey = isPlayer1 ? p1SectionKey : p2SectionKey;
        const oppSectionKey = isPlayer1 ? p2SectionKey : p1SectionKey;

        if (entry.bySection[mySectionKey]) {
          entry.ball1 = entry.bySection[mySectionKey].ball1;
          entry.ball2 = entry.bySection[mySectionKey].ball2;
          entry.ball3 = entry.bySection[mySectionKey].ball3;
        }

        if (entry.bySection[oppSectionKey]) {
          scoreMap.opponent = scoreMap.opponent || {};
          scoreMap.opponent[orderStr] = {
            ball1: entry.bySection[oppSectionKey].ball1,
            ball2: entry.bySection[oppSectionKey].ball2,
            ball3: entry.bySection[oppSectionKey].ball3,
          };
        }
      });
    }

    return scoreMap;
  }

  /**
   * Builds a head-to-head score map for a player including opponent scores.
   * @param {number|string} playerId
   * @param {Array} playerScores
   * @param {Object<number, Array>} allScoresByPlayer
   * @param {Array} matchups
   * @param {number|string} [activeMatchupId] Optional active matchup ID.
   * @returns {Object}
   */
  buildPlayerScoreMap(playerId, playerScores, allScoresByPlayer, matchups, activeMatchupId = null) {
    const id = Number(playerId);
    const pScores = (allScoresByPlayer?.[id] || allScoresByPlayer?.[String(id)]) ?? playerScores ?? [];
    const scoreMap = {};
    pScores.forEach(row => {
      scoreMap[String(row.orderNumber ?? row.order_number)] = {
        ball1: Number(row.ball1 || 0),
        ball2: Number(row.ball2 || 0),
        ball3: Number(row.ball3 || 0)
      };
    });
    const opponent = {};

    const targetMatchup = (activeMatchupId && (matchups || []).find(m => String(m.id) === String(activeMatchupId)))
      || (matchups || []).find(m => {
        const p1 = Number(m.player1Id ?? 0);
        const p2 = Number(m.player2Id ?? 0);
        return id === p1 || id === p2;
      })
      || (matchups || [])[0];

    if (!targetMatchup) {
      scoreMap.isPlayer1 = true;
      scoreMap.opponent = opponent;
      return scoreMap;
    }

    const p1Id = Number(targetMatchup.player1Id ?? targetMatchup.player1_id ?? 0);
    const p2Id = Number(targetMatchup.player2Id ?? targetMatchup.player2_id ?? 0);

    const p1Players = resolvePlayersForMatchupParticipant(p1Id, targetMatchup.player1Name, [], [], false);
    const p2Players = resolvePlayersForMatchupParticipant(p2Id, targetMatchup.player2Name, [], [], false);

    const isPlayer1 = (p1Id > 0 || p2Id > 0)
      ? (p1Players.some(p => Number(p.id) === id) || id === p1Id)
      : (targetMatchup.playerId ? Number(targetMatchup.playerId) === id : true);
    const isPlayer2 = (p1Id > 0 || p2Id > 0)
      ? (p2Players.some(p => Number(p.id) === id) || id === p2Id)
      : !isPlayer1;

    let opponentId = 0;
    if (isPlayer1) {
      opponentId = p2Players[0]?.id ? Number(p2Players[0].id) : p2Id;
    } else if (isPlayer2) {
      opponentId = p1Players[0]?.id ? Number(p1Players[0].id) : p1Id;
    } else {
      opponentId = p2Id;
    }

    const opponentScores = allScoresByPlayer?.[opponentId] || allScoresByPlayer?.[String(opponentId)] || [];

    scoreMap.isPlayer1 = isPlayer1;

    opponentScores.forEach(row => {
      const roundNumber = Number(row.orderNumber ?? row.order_number);
      if (roundNumber > 0) {
        opponent[String(roundNumber)] = {
          ball1: Number(row.ball1 || 0),
          ball2: Number(row.ball2 || 0),
          ball3: Number(row.ball3 || 0)
        };
      }
    });

    scoreMap.opponent = opponent;
    return scoreMap;
  }

  static getFormatDefaults() {
    return {
      easy: 3000000,
      medium: 5000000,
      hard: 10000000,
      multiplier: 1.5,
    };
  }

  static hasHead2HeadScoring() {
    return true;
  }

  static requiresHeadToHead() {
    return true;
  }

  static getDefaultCompetitionFormat() {
    return 'head2head';
  }

  static getDefaultRoundsPerGame(totalFrames = 0) {
    return totalFrames > 0 ? Math.ceil(totalFrames / 2) : 2;
  }

  static getDefaultMatchupsPerRound() {
    return 2;
  }

  static getDefaultQuickFillTargets() {
    return {
      easy: 5000000,
      med: 7500000,
      hard: 10000000
    };
  }

  static getDefaultFallbackTargetValues() {
    return { value1: 5000000, value2: 1.5, values: null };
  }

  static getDefaultTargetForDifficulty(difficulty = 'medium') {
    const diff = String(difficulty).toLowerCase();
    if (diff === 'easy') return 3000000;
    if (diff === 'hard') return 10000000;
    return 5000000;
  }

  static getCrossFormatPreferenceOrder() {
    return [
      { format: 'bowling', scale: 0.1 },
      { format: 'golf', scale: 0.1 }
    ];
  }

  showValueInputsInPreview() {
    return false;
  }

  /**
   * Returns head-to-head context for a round row in the scoring form.
   * Provides matchup and generic participant sections for display.
   *
   * @param {Object} round The machine configuration for this round.
   * @param {Object} context Head-to-head context.
   * @returns {Object} { matchup, displayRoundNumber, displayRoundLabel, sections }
   */
  getRoundRowContext(round, context) {
    const isTeamMode = context?.activeCompetition?.isTeamMode ?? (context?.activeLeague?.participationType === 'team' || context?.activeSession?.participationType === 'team');
    return isTeamMode
      ? this._getTeamRoundRowContext(round, context)
      : this._getIndividualRoundRowContext(round, context);
  }

  /**
   * Returns round row context for individual baseball mode.
   */
  _getIndividualRoundRowContext(round, context) {
    const { eventMatchups, getCurrentPlayerId, allPlayersCache, activeLeague } = context;
    const currentPlayerId = Number(getCurrentPlayerId());
    const matchupW = eventMatchups?.[0] || {};

    const roleResult = resolveMatchupRole(
      currentPlayerId,
      round.machineId,
      eventMatchups,
      { allPlayersCache, activeLeague }
    );

    if (!roleResult.matchup) {
      return {
        matchup: null,
        displayRoundNumber: round.orderNumber ?? 1,
        displayRoundLabel: 'Round',
        sections: [],
        isPlayer1: true,
        isPitcher: true,
        role: 'pitcher',
        opponentName: ''
      };
    }

    const homePlayerId = Number(matchupW.player1Id ?? 0);
    const awayPlayerId = Number(matchupW.player2Id ?? 0);
    const homePlayerName = matchupW.player1Name || 'Home';
    const awayPlayerName = matchupW.player2Name || 'Away';

    const orderNum = Number(round.orderNumber ?? 1);
    const isPlayer1 = roleResult.isPlayer1;
    const isTopInning = (roleResult.isTop !== undefined && roleResult.isTop !== null) ? roleResult.isTop : (orderNum % 2 !== 0);
    const displayRoundNumber = roleResult.displayRoundNumber || `${isTopInning ? 'Top' : 'Bottom'} of ${Math.ceil(orderNum / 2)}`;

    const defendingPlayerId = isTopInning ? homePlayerId : awayPlayerId;
    const battingPlayerId = isTopInning ? awayPlayerId : homePlayerId;
    const pitcherDisplayName = isTopInning ? homePlayerName : awayPlayerName;
    const batterDisplayName = isTopInning ? awayPlayerName : homePlayerName;

    const isAllMode = context?.isAllScoresMode || String(getCurrentPlayerId()) === 'all';
    const isPitcherActive = isAllMode ? true : (isPlayer1 ? isTopInning : !isTopInning);
    const isBatterActive = isAllMode ? true : (!isPitcherActive);

    const sections = [
      {
        key: 'player1',
        roleLabel: 'Pitcher',
        displayName: pitcherDisplayName,
        isActiveParticipant: isPitcherActive,
        playerId: defendingPlayerId,
        perBallPlayers: []
      },
      {
        key: 'player2',
        roleLabel: 'Batter',
        displayName: batterDisplayName,
        isActiveParticipant: isBatterActive,
        playerId: battingPlayerId,
        perBallPlayers: []
      }
    ];

    return {
      matchup: roleResult.matchup,
      displayRoundNumber,
      displayRoundLabel: 'Inning',
      sections,
      isPlayer1,
      isPitcher: isPitcherActive,
      role: isPitcherActive ? 'pitcher' : 'batter',
      opponentName: roleResult.opponentName || (isPlayer1 ? awayPlayerName : homePlayerName)
    };
  }

  /**
   * Returns round row context for team baseball mode.
   */
  _getTeamRoundRowContext(round, context) {
    const { eventMatchups, getActiveTeamId, getCurrentPlayerId, activeLeague, activeSession, enrichedEntries } = context;
    const currentPlayerId = Number(getActiveTeamId?.() ?? getCurrentPlayerId());
    const matchupW = eventMatchups?.[0] || {};

    const homeTeamId = Number(matchupW.team1Id ?? 0);
    const awayTeamId = Number(matchupW.team2Id ?? 0);
    const homeTeamName = matchupW.team1Name || 'Home';
    const awayTeamName = matchupW.team2Name || 'Away';

    const orderNum = Number(round.orderNumber ?? round.order_number ?? 1);
    const isTopInning = round.isTop !== undefined ? Boolean(round.isTop) : (orderNum % 2 !== 0);
    const inningNumber = Math.ceil(orderNum / 2);
    const displayRoundNumber = `${isTopInning ? 'Top' : 'Bottom'} ${inningNumber}`;

    const isPlayer1 = (homeTeamId === currentPlayerId);
    const defendingTeamId = Number(round.team1Id ?? (isTopInning ? homeTeamId : awayTeamId));
    const battingTeamId = Number(round.team2Id ?? (isTopInning ? awayTeamId : homeTeamId));

    const isAllMode = context?.isAllScoresMode || String(getActiveTeamId?.() ?? getCurrentPlayerId()) === 'all';
    const isPitcherActive = isAllMode ? true : (isPlayer1 ? isTopInning : !isTopInning);
    const isBatterActive = isAllMode ? true : (!isPitcherActive);

    const roleAssignmentsByTeam = context.roleAssignmentsByTeam || context.pitcherAssignmentsByTeam;
    const rosterOrdersByTeam = context.rosterOrdersByTeam || context.battingOrdersByTeam;

    // Team Pitcher resolution
    const activeLeagueTeams = activeLeague?.teams || activeSession?.teams || [];
    const defendingTeam = activeLeagueTeams.find(t => Number(t.id) === defendingTeamId);
    const defendingMembers = defendingTeam?.members || [];
    const defendingTeamIdStr = String(defendingTeamId);
    const pitcherAssignments = roleAssignmentsByTeam?.[defendingTeamIdStr] ||
      (defendingTeamId === currentPlayerId ? (context?.roleAssignments || context?.pitcherAssignments) : {}) || {};
    const explicitPitcherId = pitcherAssignments[round.orderNumber];

    let defendingPitcherObj = null;
    if (explicitPitcherId) {
      defendingPitcherObj = defendingMembers.find(m => String(m.id) === String(explicitPitcherId));
    }
    if (!defendingPitcherObj && defendingMembers.length > 0) {
      const allRounds = enrichedEntries || [];
      let priorDefendingRounds = 0;
      for (const m of allRounds) {
        if (m.orderNumber >= round.orderNumber) break;
        const mDefendingId = Number(m.team1Id ?? ((m.orderNumber % 2 !== 0) ? homeTeamId : awayTeamId));
        if (mDefendingId === defendingTeamId) priorDefendingRounds++;
      }
      defendingPitcherObj = resolvePlayerForBall(defendingMembers, priorDefendingRounds);
    }

    const pitcherPlayerName = defendingPitcherObj?.playerName || defendingPitcherObj?.name || (isTopInning ? homeTeamName : awayTeamName);
    const pitcherDisplayName = pitcherPlayerName;

    // Team Batter rotation (per-ball)
    const battingTeamIdStr = String(battingTeamId);
    let teamBattingOrder = rosterOrdersByTeam?.[battingTeamIdStr];
    if (!teamBattingOrder || teamBattingOrder.length === 0) {
      if (battingTeamId === currentPlayerId && (context?.rosterOrder?.length || context?.battingOrder?.length)) {
        teamBattingOrder = context.rosterOrder || context.battingOrder;
      } else {
        const battingTeam = activeLeagueTeams.find(t => Number(t.id) === battingTeamId);
        teamBattingOrder = battingTeam?.members || [];
      }
    }

    const allRounds = enrichedEntries || [];
    let priorBattingRounds = 0;
    for (const m of allRounds) {
      if (m.orderNumber >= round.orderNumber) break;
      const mBattingTeamId = Number(m.team2Id ?? ((m.orderNumber % 2 !== 0) ? awayTeamId : homeTeamId));
      if (mBattingTeamId === battingTeamId) priorBattingRounds++;
    }

    const ballOffset = priorBattingRounds * 3;
    const playerPerBall = [];
    for (let i = 0; i < 3; i++) {
      const player = resolvePlayerForBall(teamBattingOrder, ballOffset + i);
      playerPerBall.push({ id: player?.id, playerName: player?.playerName || player?.name || '' });
    }

    const sections = [
      {
        key: 'player1',
        roleLabel: 'Pitcher',
        displayName: pitcherDisplayName,
        isActiveParticipant: isPitcherActive,
        playerId: defendingTeamId,
        teamId: defendingTeamId,
        perBallPlayers: []
      },
      {
        key: 'player2',
        roleLabel: 'Batter',
        displayName: '',
        isActiveParticipant: isBatterActive,
        playerId: battingTeamId,
        teamId: battingTeamId,
        perBallPlayers: playerPerBall
      }
    ];

    const allRoundsList = enrichedEntries || [];
    const isLastMachineInList = allRoundsList.length > 0 && round.orderNumber === allRoundsList[allRoundsList.length - 1].orderNumber;
    let isWalkOff = false;

    if (!isTopInning && isLastMachineInList) {
      let priorHomeScore = 0;
      let priorAwayScore = 0;
      const allScores = context?.allEventScores || [];
      const scoreMapByEntity = {};
      allScores.forEach(s => {
        const entityId = Number(s.teamId ?? s.playerId ?? 0);
        const orderNum = Number(s.orderNumber ?? 0);
        if (entityId > 0 && orderNum > 0) {
          scoreMapByEntity[entityId] = scoreMapByEntity[entityId] || {};
          scoreMapByEntity[entityId][orderNum] = s;
        }
      });

      for (let i = 0; i < allRoundsList.length - 1; i++) {
        const r = allRoundsList[i];
        const rIsTop = (r.isTop !== undefined) ? Boolean(r.isTop) : ((r.orderNumber ?? 1) % 2 !== 0);
        const rBattingId = rIsTop ? awayTeamId : homeTeamId;
        const target = r.value1 ? { value1: r.value1, value2: r.value2 } : { value1: 5000000, value2: 1.5 };
        const bEntry = scoreMapByEntity[rBattingId]?.[r.orderNumber];
        if (bEntry && (bEntry.ball1 || bEntry.ball2 || bEntry.ball3)) {
          const turn = this.getInningData(r, bEntry, { ball1: 0, ball2: 0, ball3: 0 }, true, true);
          const runs = turn.score;
          if (rIsTop) priorAwayScore += runs;
          else priorHomeScore += runs;
        }
      }

      if (priorHomeScore > priorAwayScore) {
        isWalkOff = true;
      }
    }

    return {
      matchup: round,
      displayRoundNumber,
      displayRoundLabel: '',
      sections,
      isPlayer1,
      isPitcher: isPitcherActive,
      role: isPitcherActive ? 'pitcher' : 'batter',
      opponentName: isPlayer1 ? awayTeamName : homeTeamName,
      isWalkOff,
      isDisabled: false,
      walkOffNotice: isWalkOff ? 'Walk-off: Home team is leading in the bottom of the last inning. No need to play extra balls. Save this round to complete the game.' : null
    };
  }

  getPrintTargetSummaryData(machine, _isLastRound) {
    if (!machine) return [];
    const goal = machine.values?.[1] || machine.value1 || 0;
    return [
      { label: 'Baseline', value: goal, format: true },
      { label: 'Multiplier', value: machine.value2 || 1.5, format: false }
    ];
  }

  getFirstPlayerRounds(machines, context) {
    const { getCurrentPlayerId, getActiveTeamId, eventMatchups, activeLeague, activeSession } = context || {};
    const isTeamMode = activeLeague?.participationType === 'team' || activeSession?.participationType === 'team' || context?.participationType === 'team';
    if (!isTeamMode) return [];

    let teamIdStr = '';
    if (typeof getActiveTeamId === 'function') {
      const tid = getActiveTeamId();
      if (tid !== undefined && tid !== null && String(tid) !== '') teamIdStr = String(tid);
    }
    if (!teamIdStr && typeof getCurrentPlayerId === 'function') {
      const pid = getCurrentPlayerId();
      if (pid !== undefined && pid !== null && String(pid) !== '') teamIdStr = String(pid);
    }
    if (!teamIdStr) teamIdStr = String(context?.activeTeamId ?? context?.activePlayerId ?? '');

    const matchup = eventMatchups?.[0] || {};
    const homeTeamId = String(matchup?.team1Id ?? matchup?.player1Id ?? matchup?.team1_id ?? matchup?.player1_id ?? '');
    const awayTeamId = String(matchup?.team2Id ?? matchup?.player2Id ?? matchup?.team2_id ?? matchup?.player2_id ?? '');
    const isHomeTeam = teamIdStr === homeTeamId || !teamIdStr;

    return (machines || []).filter(m => {
      const entryTeam1Id = String(m.team1Id ?? m.team1_id ?? '');
      if (entryTeam1Id) {
        return entryTeam1Id === teamIdStr;
      }
      return isHomeTeam ? ((m.orderNumber ?? 1) % 2 !== 0) : ((m.orderNumber ?? 1) % 2 === 0);
    });
  }
}
