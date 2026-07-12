import { escapeHTML } from '../utils.js';

/**
 * Base class for all scoring logic in the PinBowling application.
 */
export class ScoringEngine {
  /**
   * @param {Object} config UI and Terminology configuration from config.php
   */
  constructor(config = {}) {
    this.config = config;
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
   * @returns {{t1: number, t2: number}}
   */
  getBonusTargets() { return { t1: 0, t2: 0 }; }

  /**
   * Returns HTML representation for secondary targets (e.g. bonus frames).
   * @param {Object} round - The round data.
   * @returns {string}
   */
  getBonusTargetHtml() { return ''; }

  /**
   * Returns the HTML summary of target information for a single round/machine
   * on the printable blank score sheet. Each engine format controls its own
   * display so the UI does not branch on format.
   *
   * @param {import('@scripts/types.js').Machine} machine The machine/round data.
   * @param {boolean} isLastRound Whether this is the last round.
   * @param {Function} formatNumber Function to format numeric values for display.
   * @returns {string} HTML string for the targets summary line.
   */
  getPrintTargetSummaryHtml(machine, isLastRound, formatNumber) {
    return '';
  }

  /**
   * Returns the terminology used for an individual round (e.g., "Round", "Frame", "Hole").
   * @returns {string}
   */
  getRoundLabel() { return this.config.roundLabel || 'Round'; }

  /**
   * Returns the terminology used for columns in summary tables.
   * Useful for dynamic headers in the Scoreboard or Results list.
   * @returns {string} e.g. "Frame" or "Hole".
   */
  getTurnHeaderPrefix() { return this.config.turnHeaderPrefix || 'Round'; }

  /**
   * Returns the label for the primary goal score (e.g., "Strike", "Target", "Par").
   * @returns {string}
   */
  getPrimaryTargetLabel() { return this.config.primaryTargetLabel || 'Target'; }

  /**
   * Comparator function for sorting player standings.
   * 
   * @param {number} a Score of player A.
   * @param {number} b Score of player B.
   * @returns {number} Default: High score wins (descending).
   */
  compareScores(a, b) { return b - a; }

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
   * Returns the general scoring hint shown to players.
   * @returns {string}
   */
  getScoringHint() { return this.config.hint || ''; }

  /**
   * Returns specific instructions for the final turn of a game.
   * @returns {string}
   */
  getLastFrameHint() { return this.config.lastFrameHint || ''; }

  // UI Branding and Meta Properties
  getThemeClass() { return this.config.themeClass || ''; }
  getLogoImage() { return this.config.logo || 'logo.png'; }
  getBrandName() { return this.config.brand || 'PinBowling'; }
  getPlayActionLabel() { return this.config.cta || 'Play'; }
  getScoringDescription() { return this.config.logic || ''; }
  getValue1Label() { return this.config.value1Label || 'High Score'; }
  getValue2Label() { return this.config.value2Label || 'Low Score'; }
  getThresholdPrefix() { return 'Value'; }

  /**
   * Returns the primary target summary HTML for a scoring row.
   * @param {Object} round 
   * @param {Function} formatFn 
   * @returns {string}
   */
  getRowSummaryHtml(round, formatFn) {
    return `<div class="strike-target"><b>${escapeHTML(this.getPrimaryTargetLabel())}:</b> ${formatFn(round.value1)}</div>`;
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
   * Returns the HTML for a frame preview row in the session generator.
   * Baseball overrides this to show "Top/Bottom of Inning N" headers.
   * @param {Object} frame The frame data object.
   * @param {number} index Zero-based index.
   * @param {boolean} isExpanded Whether the row is expanded.
   * @param {string} expandedTempId The tempId of the expanded row.
   * @param {Function} formatFn Number formatting function.
   * @param {Function} escapeFn HTML escaping function.
   * @param {Function} renderGridFn renderThresholdGrid function.
   * @returns {{headerHtml: string, contentHtml: string}}
   */
  getPreviewRowHtml(frame, index, isExpanded, expandedTempId, formatFn, escapeFn, renderGridFn) {
    const headerHtml = `
      <div class="flex gap-12 w-100 wrap">
        <div class="flex gap-12 flex-1 min-250 align-center">
          <div class="drag-handle">☰</div>
          <span class="round-number">${this.getRoundDisplayLabel(index)}</span>
          <span class="machine-name-display">${escapeFn(frame.machineName)}</span>
        </div>
        <div class="flex gap-12 wrap justify-end" onclick="event.stopPropagation()">
          <div class="flex gap-6 min-140 flex-1 align-center">
            <label class="small value-label">${this.getValue1Label()}:</label>
            <input type="text" class="score10-input score-input" value="${formatFn(frame.value1)}">
          </div>
          <div class="flex gap-6 min-140 flex-1 align-center">
            <label class="small value-label">${this.getValue2Label()}:</label>
            <input type="text" class="score1-input score-input" value="${formatFn(frame.value2)}">
          </div>
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
   */
  getThresholdRowClass(rank, _value1, _value2) {
    const r = Number(rank);
    const isMajor = r === this.getThresholdStart() || r === this.getThresholdEnd();
    return isMajor ? 'threshold-major' : 'threshold-minor';
  }

  /**
   * Returns HTML for a threshold grid display, showing all ranks and their corresponding values.
   * @param {Object} values Map of rank to score value.
   * @param {Function} formatNumber Function to format numeric values for display.
   * @param {number} value1 Primary context value (e.g. high score).
   * @param {number} value2 Secondary context value (e.g. low score).
   * @returns {string}
   */
  getThresholdGridHtml(values, formatNumber, value1 = 0, value2 = 0) {
    if (!values || Object.keys(values).length === 0) return '<div class="notice">Enter scores to see thresholds.</div>';
    const prefix = this.getThresholdPrefix();

    const ranksToDisplay = this.getThresholdRange()
      .filter(rank => values[rank] !== undefined);

    return `
      <div class="threshold-grid-container">
        ${prefix ? `<div class="threshold-prefix">${prefix}:</div>` : ''}
        <div class="threshold-grid">
          ${ranksToDisplay
            .map(rank => {
              const val = values[rank];
              const label = this.getThresholdLabel(rank, value1, value2);
              const rowClass = this.getThresholdRowClass(rank, value1, value2);
              return `<div class="threshold-row ${rowClass}"><strong>${label}:</strong> ${formatNumber(val)}</div>`;
            })
            .join('')
          }
        </div>
      </div>
    `;
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
    return {};
  }

  // --- Score Map & Results Rendering Hooks ---
  // These methods allow format-specific engines to handle their own
  // enrichment and rendering logic, keeping the UI page format-agnostic.

  /**
   * Enriches the score map with format-specific data before calculation.
   * Default implementation returns the score map unchanged.
   * Baseball overrides this to attach opponent scores and player-role info.
   *
   * @param {Object} scoreMap Map of orderNumber to ball scores from the DOM.
   * @param {Object} context Format-specific context data.
   * @param {Array} context.allEventScores All scores for the current event.
   * @param {Array} context.eventMatchups Matchup data for the current event.
   * @param {Array} context.allPlayersCache Cached player list.
   * @param {Function} context.getCurrentPlayerId Returns the selected player ID.
   * @param {Function} context.normalizeScores Normalizes raw score rows.
   * @param {Function} context.groupScoresByPlayer Groups scores by player ID.
   * @param {Function} context.buildBaseballScoreMapForPlayer Builds a baseball score map.
   * @returns {Object} The enriched score map.
   */
  enrichScoreMap(scoreMap, context) {
    return scoreMap;
  }

  /**
   * Renders the results panel content for this format.
   * Default implementation renders a standard table of turn results.
   * Baseball overrides this to render a head-to-head scoreboard grid.
   *
   * @param {{turnResults: Array, totalDisplay: string}} calcResult Output from calculateTurnResults.
   * @param {Array} machines Target definitions for the event.
   * @param {Object} scoreMap The enriched score map used for calculation.
   * @param {Object} context Format-specific context data (same keys as enrichScoreMap).
   * @param {Object} domRefs DOM element references for the results panel.
   * @param {HTMLElement} domRefs.resultsPanel The results panel container.
   * @param {HTMLElement} domRefs.resultsBody The table body for standard results.
   * @param {HTMLElement} domRefs.totalScore The total score display element.
   * @param {HTMLElement} domRefs.resultsEmpty The empty-state element.
   * @param {Function} domRefs.escapeHTML HTML escaping utility.
   */
  renderResults(calcResult, machines, scoreMap, context, domRefs) {
    const { turnResults, totalDisplay } = calcResult;
    const { resultsPanel, resultsBody, totalScore, resultsEmpty, escapeHTML: escHTML } = domRefs;

    // Show the standard table (may have been hidden by a previous format)
    const resultsTable = resultsPanel.querySelector('table.data-table');
    if (resultsTable) resultsTable.classList.remove('hidden');

    // Remove any format-specific grid from a previous render
    const existingGrid = resultsPanel.querySelector('.scoreboard-grid');
    if (existingGrid) existingGrid.remove();

    resultsBody.innerHTML = turnResults
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
   * Returns format-specific context for a round row in the scoring form.
   * Default implementation returns an empty object (no extra context).
   * Baseball overrides this to provide matchup/role information.
   *
   * @param {Object} round The machine configuration for this round.
   * @param {Object} context Format-specific context data (same keys as enrichScoreMap).
   * @returns {Object} Format-specific row context. May include:
   *   - {Object|null} matchup The matchup for this round (if applicable).
   *   - {boolean} isPitcher Whether the current player is the pitcher.
   *   - {string} opponentName Name of the opponent.
   *   - {string} displayRoundNumber How to label this round (e.g. "Top of Inning 1").
   *   - {string} roleHtml Additional HTML for the role indicator.
   */
  getRoundRowContext(round, context) {
    return {};
  }

  /**
   * Builds a score map for a specific player from raw score data.
   * Default implementation creates a basic {orderNumber: {ball1, ball2, ball3}} map.
   * Baseball overrides this to include opponent scores and role info.
   *
   * @param {number|string} playerId The player ID.
   * @param {Array} playerScores The player's own score rows.
   * @param {Object<number, Array>} allScoresByPlayer All scores grouped by player ID.
   * @param {Array} matchups Matchup data for the event (empty for non-matchup formats).
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

  /**
   * Builds an entire round row for the UI.
   *
   * @param {Object}   round         Machine config (orderNumber, machineName, values…)
   * @param {Object|null} turnValues Existing scores from the DB (or null)
   * @param {boolean} isLastRound  Is this frame 10?
   * @param {Object|null} targetPlayer Player being scored
   * @param {Object} roundContext Engine‑specific data from getRoundRowContext()
   * @returns {HTMLElement}
   */
  async renderRoundRow(round, turnValues, isLastRound, targetPlayer, roundContext) {
    const row = document.createElement('div');
    row.className = 'round-row';
    row.dataset.orderNumber = round?.orderNumber || 0;

    const displayRoundNumber = roundContext?.displayRoundNumber ?? round?.orderNumber ?? '';
    const displayRoundLabel = roundContext?.displayRoundLabel ?? this.getRoundLabel();
    const machineName = round?.machineName || '';

    row.innerHTML = `
      <div class="round-info">
        <div class="round-label"><b>${escapeHTML(displayRoundLabel)} ${displayRoundNumber}:</b> ${escapeHTML(machineName)}</div>
        ${roundContext?.roleHtml ?? ''}
      </div>
      <div class="round-actions">
        <div class="round-inputs-container"></div>
      </div>
    `;
    return row;
  }
  
  /**
   * Returns the header logo image.
   * @returns {string}
   */
  getHeaderLogoImage() { return this.config.headerLogo || this.getLogoImage(); }

}