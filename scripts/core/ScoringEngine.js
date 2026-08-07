import { getPlayerAssignmentStrategy, BaseAssignmentStrategy } from './PlayerAssignmentStrategy.js';
import { getCompetitionFormatStrategy, BaseCompetitionStrategy } from './CompetitionFormatStrategy.js';
import { FORMAT_TERMINOLOGY, isHead2Head } from '../services/scoringFormat.js';
import { FormatBranding } from '../services/scoringFormatBranding.js';

/**
 * Base class for all scoring logic in the PinBowling application.
 * Delegates entity-level scoring to a PlayerAssignmentStrategy and
 * standings sorting to a CompetitionFormatStrategy.
 */
export class ScoringEngine {
  /**
   * @param {Object} config UI and Terminology configuration from config.php
   * @param {Object} [options] Strategy configuration.
   * @param {string} [options.participationType='individual'] - 'individual' or 'team'.
   * @param {string} [options.competitionFormat='group'] - 'group', 'head_to_head', or 'head2head'.
   */
  constructor(config = {}, options = {}) {
    this.config = config;
    this._assignmentStrategy = getPlayerAssignmentStrategy(options.participationType || 'individual');
    this._competitionStrategy = getCompetitionFormatStrategy(options.competitionFormat || 'group');
  }

  /**
   * Returns presentational branding metadata for this engine format.
   * @returns {Object}
   */
  getBranding() {
    return FormatBranding.get(this.config?.format);
  }

  /**
   * Returns human-readable labels for bonus targets.
   * @param {Object} [_machine] The machine definition.
   * @returns {{label1: string, label2: string}}
   */
  getBonusTargetLabels(_machine) {
    return { label1: 'Bonus 1', label2: 'Bonus 2' };
  }

  /**
   * Returns the round number corresponding to a turn index in a matchup scoreboard.
   * Default: 1 turn per round.
   * @param {number} turnIndex Zero-based turn index.
   * @param {Array} [_machines] Machine list.
   * @returns {number} 1-based round index.
   */
  getRoundIndexForTurn(turnIndex, _machines = []) {
    return turnIndex + 1;
  }

  /**
   * Returns formatted score string for a single turn in a head-to-head scoreboard cell.
   * @param {Object} turn The turn object calculated by calculateTurnResults.
   * @param {string} [existingScore] Any score previously recorded in this round cell.
   * @returns {string}
   */
  formatMatchupScore(turn, existingScore) {
    if (turn?.played) return String(turn.score);
    return existingScore !== undefined ? existingScore : '-';
  }

  /**
   * Internal helper to resolve terminology with precedence:
   * 1. Explicitly configured property on this.config
   * 2. Format default from FORMAT_TERMINOLOGY[this.config.format]
   * 3. Static fallback parameter
   * @protected
   */
  _getTerm(key, fallback) {
    if (this.config && this.config[key] !== undefined) return this.config[key];
    if (this.config && this.config.format && FORMAT_TERMINOLOGY[this.config.format]) {
      const formatTerms = FORMAT_TERMINOLOGY[this.config.format];
      if (formatTerms[key] !== undefined) return formatTerms[key];
    }
    return fallback;
  }

  /**
   * Returns the active PlayerAssignmentStrategy.
   * @returns {BaseAssignmentStrategy}
   */
  getAssignmentStrategy() {
    return this._assignmentStrategy;
  }

  /**
   * Returns the active CompetitionFormatStrategy.
   * @returns {BaseCompetitionStrategy}
   */
  getCompetitionStrategy() {
    return this._competitionStrategy;
  }

  /**
   * Calculates an entity's (player or team) total score for an event.
   * Delegates to the PlayerAssignmentStrategy which handles the
   * individual-vs-team aggregation logic.
   *
   * @param {Object} entity - Player or Team object.
   * @param {Array} eventTargets - Machine targets for the event.
   * @param {Object} scoresByPlayer - Map of playerId -> score rows array.
   * @param {Object} [options] - Additional strategy options (e.g. dropLowestPlayer).
   * @returns {{ total: number, turnResults?: Array, hasData: boolean, memberTotals: Array, droppedMemberIds: Array, keptMembers?: Array }}
   */
  calculateEntityEventScore(entity, eventTargets, scoresByPlayer, options = {}) {
    return this._assignmentStrategy.calculateEntityEventScore(
      entity, eventTargets, scoresByPlayer, this, options
    );
  }

  /**
   * Interface method: The primary orchestration method for calculating a complete game's results.
   * Maps each machine to a turn result and computes the aggregate total.
   * 
   * @param {Array<Object>} machines List of target definitions for the event.
   * @param {Object} scoreMap Dictionary of recorded ball scores keyed by orderNumber.
   * @returns {{turnResults: Array<Object>, total: number}} Calculated results and sum.
   * @throws {Error} If not implemented by subclass.
   */
  calculateTurnResults(machines, scoreMap) {
    throw new Error('calculateTurnResults must be implemented by subclass');
  }

  /**
   * Generic interpolation logic to calculate target scores for ranks 1-10.
   * 
   * @param {number} topScore The target score to be anchored at 'position'.
   * @param {number} bottomScore The baseline score (floor).
   * @param {number} position The rank (1-10) where topScore is anchored.
   * @param {string} type 'flat' or 'curved'.
   * @param {string} order 'desc' (Rank 10 is high) or 'asc' (Rank 1 is high).
   * @returns {Object|null}
   */
  calculateInterpolatedValues(topScore, bottomScore, position, type, order) {
    if (topScore <= 0 || bottomScore < 0 || position <= 0) return null;

    const values = {};
    const isDescending = order === 'desc';
    // Descending (Bowling): Rank 10 is high score requirement.
    // Ascending (Golf): Rank 1 is high score requirement.
    const getFraction = (r) => isDescending ? (r - 1) / 9 : (10 - r) / 9;

    const fractionAtAnchor = getFraction(position);
    const multiplierAtAnchor = Math.max(0.01, (type === 'curved') ? Math.pow(fractionAtAnchor, 2) : fractionAtAnchor);

    // Solve for range: topScore = bottomScore + (range * multiplierAtAnchor)
    const range = (topScore - bottomScore) / multiplierAtAnchor;

    for (let rank = 1; rank <= 10; rank++) {
      const fraction = getFraction(rank);
      const multiplier = (type === 'curved') ? Math.pow(fraction, 2) : fraction;
      values[rank] = Math.round(bottomScore + range * multiplier);
    }
    return values;
  }

  /**
   * Interface method: Generates a map of pin/stroke thresholds based on high/low bounds.
   * Default implementation uses linear or curved interpolation between target and base.
   *
   * @param {number} target The top-end goal score.
   * @param {number} base The entry-level or par score.
   * @param {string} scalingType 'flat' for linear, 'curved' for exponential.
   * @returns {Object|null} A map of rank to pinball score, or null if inputs are invalid.
   */
  buildRoundValues(target, base, scalingType) {
    // Default implementation assumes Bowling-style (Target is Rank 10, Descending)
    return this.calculateInterpolatedValues(target, base, 10, scalingType, 'desc');
  }

  /**
   * Interface method: Formats the visual representation of a frame.
   * 
   * @param {Object} turn The calculated turn data object.
   * @returns {string} The formatted mark (e.g., "X", "9/", "4").
   */
  formatMark(turn) {
    throw new Error('formatMark must be implemented by subclass');
  }

  /**
   * Returns configuration for bonus target values (e.g. Strike/Spare).
   * @param {Object} [_machine] The machine definition.
   * @returns {{t1: number, t2: number}}
   */
  getBonusTargets(_machine) { return { t1: 0, t2: 0 }; }

  /**
   * Returns generic team setup action configurations for UI buttons and modals.
   * @returns {Array<{id: string, label: string, action: string, title?: string, roleName?: string, actionLabel?: string}>}
   */
  getTeamSetupActions() {
    return [
      { id: 'set-roster-order', label: 'Set Roster Order', action: 'rosterOrder' },
      { id: 'assign-roles', label: 'Assign Roles', action: 'roleAssignments' }
    ];
  }

  /**
   * Returns rounds in which the active team/player is assigned to the first participant role.
   * @param {Array} machines Machine lineup.
   * @param {Object} context Engine context.
   * @returns {Array} List of matching machines/rounds.
   */
  getFirstPlayerRounds(machines, context) { return []; }



  /**
   * Returns structured data summary of target information for a single round/machine
   * on the printable blank score sheet.
   *
   * @param {import('@scripts/types.js').Machine} machine The machine/round data.
   * @param {boolean} isLastRound Whether this is the last round.
   * @returns {Array<{label: string, value: number, format: boolean}>} Target summary data.
   */
  getPrintTargetSummaryData(machine, isLastRound) {
    return [];
  }

  /**
   * Returns the terminology used for an individual round (e.g., "Round", "Frame", "Hole").
   * @returns {string}
   */
  getRoundLabel() { return this._getTerm('roundLabel', 'Round'); }
  getTurnHeaderPrefix() { return this._getTerm('turnHeaderPrefix', 'Round'); }
  getPrimaryTargetLabel() { return this._getTerm('primaryTargetLabel', 'Target'); }
  getValue1Label() { return this._getTerm('value1Label', 'Target Score'); }
  getValue2Label() { return this._getTerm('value2Label', 'Base Score'); }
  getThresholdPrefix() { return this._getTerm('thresholdPrefix', 'Score'); }

  /**
   * Determines if a given threshold rank corresponds to Par score.
   * @param {string|number} rank
   * @param {number} value1
   * @param {number} value2
   * @returns {boolean}
   */
  isParThreshold(_rank, _value1, _value2) {
    return false;
  }

  /**
   * Comparator function for sorting player standings.
   * 
   * @param {number} a Score of player A.
   * @param {number} b Score of player B.
   * @returns {number} Default: High score wins (descending).
   */
  compareScores(a, b) { return b - a; }

  /**
   * Sorts standings rows for display. Delegates to the CompetitionFormatStrategy
   * which applies group or head-to-head tiebreaking rules.
   * Format-specific engines can override this to add their own tiebreaking rules.
   *
   * @param {Array} rows - Player result rows ({ hasScores, total, ... })
   * @param {Object} [options] - Sort options (e.g. seasonScoring).
   * @returns {Array} Sorted copy of rows
   */
  sortStandings(rows, options = {}) {
    return this._competitionStrategy.sortStandings(rows, this, options);
  }

  /**
   * Evaluates whether two standings rows are tied according to the competition strategy.
   *
   * @param {Object} a Standings row for participant A.
   * @param {Object} b Standings row for participant B.
   * @param {Object} [options] Options for tiebreaking.
   * @returns {boolean} True if a and b are tied.
   */
  isTie(a, b, options = {}) {
    return this._competitionStrategy.isTie(a, b, this, options);
  }

  /**
   * Whether this engine's sortStandings handles ALL sorting (including tiebreaking)
   * so the competition strategy should not re-sort by total score.
   * Override in engines that have sport-specific primary sort keys (e.g. parDiff in Golf).
   */
  handlesSortCompletely() { return false; }

  /**
   * Default implementation for team turn results (works for standard formats like Bowling and Golf).
   * Aggregates individual member turn results, sorts members best-to-worst using
   * this.compareScores(), optionally drops the worst N members, and sums the team total.
   *
   * @param {Array<Object>} machines Target definitions for the event.
   * @param {Object<number|string, Object>} scoreMapByPlayer Dictionary of player scoreMaps keyed by playerId.
   * @param {Array<Object>} members List of team member objects.
   * @param {number} dropLowestCount Number of lowest member game totals to drop per game.
   * @returns {Object}
   */
  calculateTeamTurnResults(machines, scoreMapByPlayer = {}, members = [], dropLowestCount = 0) {
    const memberResults = {};
    const memberGameTotals = [];

    members.forEach(member => {
      const pScores = scoreMapByPlayer[member.id] || {};
      const res = this.calculateTurnResults(machines, pScores);
      memberResults[member.id] = res;
      memberGameTotals.push({
        playerId: member.id,
        playerName: member.playerName || member.name,
        total: res.total,
        totalDisplay: res.totalDisplay,
        hasScores: res.turnResults.some(t => t.played)
      });
    });

    // Best performing members first, worst at the end (so dropLowestCount slices off the tail)
    memberGameTotals.sort((a, b) => this.compareScores(a.total, b.total));

    let effectiveMemberTotals = memberGameTotals;
    let droppedMemberTotals = [];

    if (dropLowestCount > 0 && memberGameTotals.length > dropLowestCount) {
      effectiveMemberTotals = memberGameTotals.slice(0, memberGameTotals.length - dropLowestCount);
      droppedMemberTotals = memberGameTotals.slice(memberGameTotals.length - dropLowestCount);
    }

    const teamGameTotal = effectiveMemberTotals.reduce((sum, m) => sum + m.total, 0);

    return {
      memberResults,
      memberGameTotals,
      effectiveMemberTotals,
      droppedMemberTotals,
      total: teamGameTotal,
      totalDisplay: this.formatTotalScore(teamGameTotal, machines)
    };
  }

  /**
   * Formats the total score for display (e.g., adds par relativity).
   * @param {number} total The raw points.
   * @param {Array} machines The target definitions for context.
   * @returns {string}
   */
  formatTotalScore(total, machines) { return String(total); }

  /**
   * Returns the available round count options for a new game/league of this format.
   * @returns {Array<number>}
   */
  getRoundCountOptions() { return [10]; }

  /**
   * Returns the primary target summary data for a scoring row.
   * @param {Object} round 
   * @returns {Object}
   */
  getRowSummaryData(round) {
    return {
      label: this.getPrimaryTargetLabel(),
      value: round.value1
    };
  }

  /**
   * Returns a CSS class string for formatting a mark based on its value relative to par.
   * Default implementation returns an empty string (no special formatting).
   * @param {number} markValue The numeric value of the mark (e.g., pin count, stroke count).
   * @param {number} parValue The par value for the current round (if applicable).
   * @returns {string} CSS class string.
   */
  getMarkFormatting(markValue, parValue) { return ''; }

  getThresholdStart() { return this.config.thresholdStart ?? 10; } // Default to Bowling
  getThresholdEnd() { return this.config.thresholdEnd ?? 1; }     // Default to Bowling

  /**
   * Returns the structured data for a frame preview row.
   * @param {Object} frame The frame data object.
   * @returns {Object}
   */
  getPreviewRowData(frame) {
    return {
      value1: frame.value1,
      value2: frame.value2
    };
  }

  /**
   * Returns an ordered array of ranks (1-10) to display in the threshold grid,
   * based on the engine's configured thresholdStart and thresholdEnd.
   * @returns {Array<number>}
   */
  getThresholdRange() {
    const ranks = [];
    const start = this.getThresholdStart();
    const end = this.getThresholdEnd();

    if (start <= end) { // Ascending (Golf)
      for (let i = start; i <= end; i++) ranks.push(i);
    } else { // Descending (Bowling)
      for (let i = start; i >= end; i--) ranks.push(i);
    }
    return ranks;
  }

  filterThresholds(values) { return values; }

  /**
   * Returns a comparator function for sorting thresholds in UI grids.
   * Default: Sort by rank descending (e.g., 10 down to 1).
   */
  getThresholdSort() {
    return (a, b) => Number(b[0]) - Number(a[0]);
  }

  /**
   * Returns a display label for a specific threshold rank.
   */
  getThresholdLabel(rank, _value1, _value2) {
    return rank;
  }

  /**
   * Returns CSS class string for a threshold display element.
   * Default implementation returns a class based on whether it's a major threshold.
   * @param {string|number} rank The rank threshold level.
   * @param {number} _value1 Parameter 1 value.
   * @param {number} _value2 Parameter 2 value.
   * @returns {string} The CSS class name.
   */
  getThresholdRowClass(rank, _value1, _value2) {
    const r = Number(rank);
    const isMajor = r === this.getThresholdStart() || r === this.getThresholdEnd();
    return isMajor ? 'threshold-major' : 'threshold-minor';
  }



  /**
   * Calculates quick-fill suggested values for a machine.
   * @param {Object} machineData { targetEasy, targetMed, targetHard }
   * @param {string} type 'easy', 'med', or 'hard'
   * @returns {{value1: number, value2: number}}
   */
  getQuickFillValues(machineData, type) {
    const val = machineData?.['target' + type.charAt(0).toUpperCase() + type.slice(1)];
    if (!val) return null;
    const defaults = this.getInitialValues(val);
    return { value1: val, value2: defaults.value2 };
  }

  /**
   * Returns the number of machines required per round.
   * Baseball uses 2 (top and bottom of inning), others use 1.
   * @returns {number}
   */
  getMachinesPerRound() { return 1; }

  /**
   * Returns the maximum number of players allowed on a session roster.
   * Baseball limits to 2 (head-to-head), others have no limit.
   * @returns {number}
   */
  getMaxRosterSize() { return Infinity; }

  /**
   * Returns how many more players can join the current roster.
   * @param {number} currentRosterSize Number of players already in the session.
   * @returns {number} Number of available spots (Infinity means unlimited).
   */
  availableSpots(currentRosterSize) {
    const max = this.getMaxRosterSize();
    if (max === Infinity) return Infinity;
    return Math.max(0, max - currentRosterSize);
  }

  /**
   * Returns the display label for a round at the given index.
   * Used in the session generator preview to show round headers.
   * Default: "Frame N" or "Hole N" based on round label.
   * Baseball overrides to show "Top/Bottom of Inning N".
   * @param {number} index Zero-based index of the round in the list.
   * @returns {string}
   */
  getRoundDisplayLabel(index) {
    return `${this.getRoundLabel()} ${index + 1}`;
  }

  /**
   * Returns an array of default value2 settings for the given round count.
   * Golf overrides this to return randomized par values (3, 4, 5).
   * Other formats return an empty array (no default value2 overrides).
   * @param {number} count Number of rounds.
   * @returns {Array<number>}
   */
  generateValue2Defaults(count) { return []; }

  /**
   * Returns a description of the matchup structure for this format, or null
   * if the format does not use matchups. Used by the UI to conditionally
   * render matchup preview sections.
   * @param {number} roundCount Number of rounds in the session.
   * @returns {{ description: string, details: Array<{ label: string, value: string }> } | null}
   */
  getMatchupDescription(roundCount) { return null; }

  /**
   * Returns default scoring values for a new machine setup.
   * @param {number} [suggestedTarget] Optional base value to derive defaults from.
   * @returns {{value1: number, value2: number}}
   */
  getInitialValues(suggestedTarget = 0) {
    return { value1: suggestedTarget, value2: 0 };
  }

  // --- Data Fetching Hooks ---
  // These methods allow format-specific engines to declare what additional
  // API data they need, keeping the UI page format-agnostic.

  /**
   * Returns an object describing additional API data this engine requires
   * for a given event. The UI calls this method and fetches the declared
   * data generically, then merges it into the engine context.
   *
   * Default implementation returns an empty object (no extra data needed).
   * Baseball overrides this to request matchups and all event scores.
   *
   * @param {string|number} eventId The active event ID.
   * @param {Object} api The PB_API object (avoids circular import).
   * @returns {Object} Map of contextKey → Promise. Each key becomes a
   *   property in the engine context after the promise resolves.
   *   Example: { eventMatchups: api.matchups.get(eventId), allEventScores: api.scores.get(null, eventId) }
   */
  getRequiredEventData(eventId, api) {
    if (!eventId) return {};
    // Load event matchups and all scores so a head-to-head matchup can be
    // resolved by the selected player without requiring a deep-link ID.
    // Group-format engines simply ignore these when _isHeadToHead() is false.
    return {
      eventMatchups: api.matchups.get(eventId).catch(() => []),
      allEventScores: api.scores.get(null, eventId).catch(() => [])
    };
  }

  // --- Score Map & Results Rendering Hooks ---
  // These methods allow format-specific engines to handle their own
  // enrichment and rendering logic, keeping the UI page format-agnostic.

  /**
   * Enriches the score map with format-specific data before calculation.
   * Default implementation returns the score map unchanged.
   * Head-to-head formats override this to attach opponent scores and player-role info.
   *
   * @param {Object} scoreMap Map of orderNumber to ball scores from the DOM.
   * @param {Object} context Format-specific context data.
   * @param {Array} context.allEventScores All scores for the current event.
   * @param {Array} context.eventMatchups Matchup data for the current event.
   * @param {Array} context.allPlayersCache Cached player list.
   * @param {Function} context.getCurrentPlayerId Returns the selected player ID.
   * @param {Function} context.normalizeScores Normalizes raw score rows.
   * @param {Function} context.groupScoresByPlayer Groups scores by player ID.
   * @returns {Object} The enriched score map.
   */
  enrichScoreMap(scoreMap, context) {
    if (!context || !this._isHeadToHead(context)) return scoreMap;
    this._attachOpponentScores(scoreMap, context);
    return scoreMap;
  }

  /**
   * True when the context describes a head-to-head matchup (two participants
   * sharing the same rounds). Applies to any format via generic two-participant UI.
   */
  _isHeadToHead(context) {
    const fmt = context?.activeLeague?.competitionFormat || context?.competitionFormat;
    return isHead2Head(fmt) || this.requiresHeadToHead();
  }

  /**
   * Resolves the active matchup for the current context.
   * Prefers the matchup containing the selected player; falls back to the first
   * matchup (e.g. a deep-linked single matchup or an admin without a selected player).
   * @returns {Object|null}
   */
  _resolveActiveParticipantId(context) {
    if (context?.activeParticipantId !== undefined && context?.activeParticipantId !== null) {
      return Number(context.activeParticipantId);
    }
    const isTeamMode = context?.isTeamMode || context?.activeLeague?.participationType === 'team' || context?.activeSession?.participationType === 'team';
    if (isTeamMode) {
      return Number(context?.getActiveTeamId?.() || context?.getCurrentPlayerId?.() || 0);
    }
    return Number(context?.getCurrentPlayerId?.() || 0);
  }

  _resolveActiveMatchup(context) {
    const matchups = context?.eventMatchups || [];
    const currentId = this._resolveActiveParticipantId(context);
    return matchups.find(m => {
      const a = Number(m.team1Id ?? m.team1_id ?? m.player1Id ?? m.player1_id);
      const b = Number(m.team2Id ?? m.team2_id ?? m.player2Id ?? m.player2_id);
      return currentId === a || currentId === b;
    }) || matchups[0] || null;
  }

  /**
   * Attaches the opponent's saved per-round scores to the map under `scoreMap.opponent`.
   * The opponent is the other participant in the selected player's matchup.
   */
  _attachOpponentScores(scoreMap, context) {
    const scoresByPlayer = context?.groupScoresByPlayer?.(context?.normalizeScores?.(context?.allEventScores || []) || []) || {};

    const currentId = this._resolveActiveParticipantId(context);
    const matchup = this._resolveActiveMatchup(context);
    if (!matchup || !currentId) return;

    const p1 = Number(matchup.team1Id ?? matchup.team1_id ?? matchup.player1Id ?? matchup.player1_id);
    const p2 = Number(matchup.team2Id ?? matchup.team2_id ?? matchup.player2Id ?? matchup.player2_id);
    const opponentId = currentId === p1 ? p2 : currentId === p2 ? p1 : null;
    if (opponentId === null) return;

    const oScores = scoresByPlayer[opponentId] || scoresByPlayer[String(opponentId)] || [];
    const opponent = {};
    oScores.forEach(s => {
      const order = s?.orderNumber ?? s?.order_number;
      if (order === undefined) return;
      opponent[String(order)] = {
        ball1: Number(s?.ball1 || 0),
        ball2: Number(s?.ball2 || 0),
        ball3: Number(s?.ball3 || 0)
      };
    });
    scoreMap.opponent = opponent;
  }

  /**
   * Returns format-specific context for a round row in the scoring form.
   * Default implementation returns an empty object (no extra context).
   * Head-to-head formats override this to provide participant sections and matchup info.
   *
   * @param {Object} round The machine configuration for this round.
   * @param {Object} context Format-specific context data (same keys as enrichScoreMap).
   * @returns {Object} Format-specific row context containing:
   *   - {Object|null} matchup The matchup for this round (if applicable).
   *   - {string} displayRoundNumber How to label this round (e.g. "Top of 1" or "1").
   *   - {string} [displayRoundLabel] Terminology prefix for the round label.
   *   - {Array<{key: string, roleLabel: string, displayName: string, isActiveParticipant: boolean, perBallPlayers?: Array}>} [sections] Participant descriptors.
   */
  getRoundRowContext(round, context) {
    if (!round || Object.keys(round).length === 0) return {};

    const base = {
      displayRoundNumber: round?.orderNumber || 1,
      displayRoundLabel: this.getRoundLabel(),
      matchup: null,
      sections: []
    };

    if (context && this._isHeadToHead(context)) {
      const sections = this._buildSharedH2hSections(context);
      if (sections?.length) {
        return {
          ...base,
          matchup: this._resolveActiveMatchup(context),
          sections
        };
      }
    }

    return base;
  }

  /**
   * Builds two participant sections (selected player editable, opponent readonly)
   * that share the same round. Used generically for H2H bowling/golf and extensible
   * to per-round comparison (e.g. golf skins) later.
   * @returns {Array<{key: string, roleLabel: string, displayName: string, isActiveParticipant: boolean}>}
   */
  _buildSharedH2hSections(context) {
    const matchup = this._resolveActiveMatchup(context);
    const currentId = Number(context?.getCurrentPlayerId?.());
    if (!matchup) return null;

    const p1 = Number(matchup.player1Id ?? matchup.player1_id);
    const p2 = Number(matchup.player2Id ?? matchup.player2_id);
    const name1 = matchup.player1Name || matchup.player1_name || this.getRoundLabel() + ' 1';
    const name2 = matchup.player2Name || matchup.player2_name || this.getRoundLabel() + ' 2';

    return [
      { key: 'h2h-1', roleLabel: '', displayName: name1, isActiveParticipant: currentId === p1 },
      { key: 'h2h-2', roleLabel: '', displayName: name2, isActiveParticipant: currentId === p2 }
    ];
  }

  /**
   * Returns default target thresholds and multipliers for this scoring format.
   * @returns {{easy: number, medium: number, hard: number, multiplier: number}}
   */
  static getFormatDefaults() {
    return {
      easy: 25000000,
      medium: 50000000,
      hard: 100000000,
      multiplier: 1.0,
    };
  }
  getFormatDefaults() {
    return this.constructor.getFormatDefaults();
  }

  /**
   * Returns whether this engine format uses head-to-head matchup scoring.
   * @returns {boolean}
   */
  static hasHead2HeadScoring() {
    return false;
  }
  hasHead2HeadScoring() {
    return this.constructor.hasHead2HeadScoring();
  }

  static requiresHeadToHead() {
    return false;
  }
  requiresHeadToHead() {
    return this.constructor.requiresHeadToHead();
  }

  static getDefaultCompetitionFormat() {
    return 'group';
  }
  getDefaultCompetitionFormat() {
    return this.constructor.getDefaultCompetitionFormat();
  }

  static getDefaultRoundsPerGame(_totalFrames = 0) {
    return 2;
  }
  getDefaultRoundsPerGame(totalFrames = 0) {
    return this.constructor.getDefaultRoundsPerGame(totalFrames);
  }

  static getDefaultMatchupsPerRound() {
    return null;
  }
  getDefaultMatchupsPerRound() {
    return this.constructor.getDefaultMatchupsPerRound();
  }

  static getDefaultQuickFillTargets() {
    return null;
  }
  getDefaultQuickFillTargets() {
    return this.constructor.getDefaultQuickFillTargets();
  }

  static getDefaultFallbackTargetValues() {
    return { value1: 50000000, value2: 1, values: null };
  }
  getDefaultFallbackTargetValues() {
    return this.constructor.getDefaultFallbackTargetValues();
  }

  static getDefaultTargetForDifficulty(difficulty = 'medium') {
    const diff = String(difficulty).toLowerCase();
    if (diff === 'easy') return 25000000;
    if (diff === 'hard') return 100000000;
    return 50000000;
  }
  getDefaultTargetForDifficulty(difficulty = 'medium') {
    return this.constructor.getDefaultTargetForDifficulty(difficulty);
  }

  static getCrossFormatPreferenceOrder() {
    return [
      { format: 'bowling', scale: 1 },
      { format: 'golf', scale: 1 },
      { format: 'baseball', scale: 10 }
    ];
  }
  getCrossFormatPreferenceOrder() {
    return this.constructor.getCrossFormatPreferenceOrder();
  }

  /**
   * Returns whether the session setup preview row should show value inputs (value1 / value2).
   * @returns {boolean}
   */
  showValueInputsInPreview() {
    return true;
  }

  /**
   * Builds a score map for a specific player from raw score data.
   * Default implementation creates a basic {orderNumber: {ball1, ball2, ball3}} map.
   * Baseball overrides this to include opponent scores and role info.
   *
   * @param {number|string} _playerId The player ID.
   * @param {Array} playerScores The player's own score rows.
   * @param {Object<number, Array>} _allScoresByPlayer All scores grouped by player ID.
   * @param {Array} _matchups Matchup data for the event (empty for non-matchup formats).
   * @returns {Object} Score map with ball scores per order number.
   */
  buildPlayerScoreMap(_playerId, playerScores, _allScoresByPlayer, _matchups) {
    const map = {};
    (playerScores || []).forEach(row => {
      map[String(row.orderNumber)] = { ball1: Number(row.ball1), ball2: Number(row.ball2), ball3: Number(row.ball3) };
    });
    return map;
  }

  /**
   * Simple helper to tell if an orderNumber is the last round.
   * @param {number} orderNumber
   * @returns {boolean}
   */
  isLastRound(orderNumber) {
    return orderNumber === this.getMaxOrder();
  }

  /**
   * Max order number in the current event – used by several derived engines.
   * Derived classes should set `this.maxOrder` appropriately after loading targets.
   */
  getMaxOrder() { return this.config?.maxOrder ?? 0; }



}