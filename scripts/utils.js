/**
 * Utility functions and state management helpers.
 */

/** @typedef {import('@scripts/types.js').ScoringEngine} ScoringEngine */

/**
 * Escapes a string for safe usage in HTML.
 * @param {string|any} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') {
    if (str === null || str === undefined) return '';
    str = String(str);
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 
 * Helper to retrieve a value from the current URL search string.
 * @param {string} key 
 * @returns {string|null}
 */
function getUrlParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

/**
 * Helper to retrieve a cookie value by name.
 * @param {string} name 
 * @returns {string|null}
 */
export function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

/**
 * Updates a URL parameter and triggers a history state replacement 
 * and navigation UI refresh.
 * @param {string} key 
 * @param {string|null} value 
 */
function setUrlParam(key, value) {
  // Using .href is the industry standard as it explicitly returns the 
  // string representation of the Location object, satisfying type checkers
  // and providing better semantic clarity than .toString().
  const url = new URL(window.location.href);
  
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState({}, '', url);
  
  // Notify the app that state has changed. main.js listens for this to refresh UI/Navigation.
  document.dispatchEvent(new CustomEvent('pb:pageChanged', { detail: { url: url.href } }));
}

/** @returns {string|null} The currently active league ID from the URL. */
export const getActiveLeagueId = () => getUrlParam('leagueId');

/** @param {string|null} id - Sets the active league ID in the URL. */
export function setActiveLeagueId(id) {
  setUrlParam('leagueId', id);
}

/** @returns {string|null} The currently active event ID from the URL. */
export const getActiveEventId = () => getUrlParam('eventId');

/** @param {string|null} id - Sets the active event ID in the URL. */
export function setActiveEventId(id) {
  setUrlParam('eventId', id);
}

/** @returns {string|null} The currently active player ID from the URL. */
export const getCurrentPlayerId = () => getUrlParam('playerId');

/** @param {string|null} playerId - Sets the active player ID in the URL. */
export function setCurrentPlayerId(playerId) {
  setUrlParam('playerId', playerId);
}

/**
 * Sets the active player ID in the URL without dispatching pb:pageChanged.
 * Use this when the caller is already inside the target page and does not
 * need the full app re-initialization that pb:pageChanged triggers.
 * @param {string|null} playerId
 */
export function setCurrentPlayerIdSilent(playerId) {
  const url = new URL(window.location.href);
  if (playerId) url.searchParams.set('playerId', playerId);
  else url.searchParams.delete('playerId');
  window.history.replaceState({}, '', url);
}

/** @returns {string|null} The currently active matchup ID from the URL. */
export const getActiveMatchupId = () => getUrlParam('matchupId');

/** @param {string|null} id - Sets the active matchup ID in the URL. */
export function setActiveMatchupId(id) {
  setUrlParam('matchupId', id);
}

/** Sets the active matchup ID in the URL silently. */
export function setActiveMatchupIdSilent(id) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('matchupId', id);
  else url.searchParams.delete('matchupId');
  window.history.replaceState({}, '', url);
}

/**
 * Formats a number with locale-specific thousands separators.
 * @param {number} num 
 * @returns {string}
 */
export function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  const val = Number(num);
  return isNaN(val) ? '0' : val.toLocaleString();
}

/**
 * Attaches real-time locale-aware number formatting to an input field.
 * Prevents non-numeric input and handles cursor positioning.
 * @param {HTMLInputElement} input 
 */
export function applyScoreFormatting(input) {
  if (!input) return;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.addEventListener('input', (e) => {
    // selectionStart can be null if the input type doesn't support it 
    // or if the element is not focused. We default to 0 to ensure 
    // arithmetic operations don't fail.
    const cursor = input.selectionStart ?? 0;
    const originalValue = input.value;
    const allowDecimal = input.dataset.allowDecimal === 'true';
    let rawValue = allowDecimal
      ? originalValue.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
      : originalValue.replace(/\D/g, '');
    
    if (rawValue === '') {
      input.value = '';
    } else {
      const [whole, decimal] = rawValue.split('.');
      const formattedWhole = Number(whole || 0).toLocaleString();
      const formatted = allowDecimal && decimal !== undefined ? `${formattedWhole}.${decimal}` : formattedWhole;
      input.value = formatted;
      const diff = formatted.length - originalValue.length;
      input.setSelectionRange(cursor + diff, cursor + diff);
    }
  });
}

/**
 * Reads a formatted numeric input, preserving decimals when requested.
 * @param {string} value
 * @param {boolean} [allowDecimal=false]
 * @returns {number}
 */
export function parseFormattedNumber(value, allowDecimal = false) {
  const raw = String(value || '');
  const cleaned = allowDecimal ? raw.replace(/[^\d.]/g, '') : raw.replace(/\D/g, '');
  const parsed = allowDecimal ? Number.parseFloat(cleaned) : Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Fetches and injects page content into the main container without a full reload.
 * @param {string} url - The destination URL.
 * @param {boolean} [pushState=true] - Whether to update the browser history.
 * @returns {Promise<void>}
 */
export async function loadPage(url, pushState = true) {
  const main = document.querySelector('main.page-container');
  if (!main) {
    window.location.href = url;
    return;
  }

  try {
    const response = await fetch(url, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!response.ok) throw new Error('Partial load failed');
    const html = await response.text();

    // Parse the HTML to extract the inner content of the <main> tag if it exists.
    // This avoids nested <main> elements.
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main.page-container');

    main.innerHTML = newMain ? newMain.innerHTML : html;
    window.scrollTo(0, 0);

    if (pushState) {
      window.history.pushState({}, '', url);
    }
    document.dispatchEvent(new CustomEvent('pb:pageChanged', { detail: { url } }));
  } catch (err) {
    window.location.href = url;
  }
}

/**
 * Renders a preview of calculated pinball-to-pin mapping on the config page.
 * Also displays bonus targets for Frame 10.
 * @param {HTMLInputElement} highScoreInput 
 * @param {HTMLInputElement} lowScoreInput 
 * @param {HTMLElement} previewValues 
 * @param {ScoringEngine} Engine
 * @param {boolean} isLastRound
 * @param {number} currentScaling - Optional scaling factor for point calculations.
 */
export function renderPreview(highScoreInput, lowScoreInput, previewValues, Engine, isLastRound = false, currentScaling) {
  const highScore = parseFormattedNumber(highScoreInput.value);
  const lowScore = parseFormattedNumber(lowScoreInput.value, Engine.getValue2AllowsDecimal?.() === true);
  const values = Engine.buildRoundValues(highScore, lowScore, currentScaling);

  if (!values) {
    previewValues.innerHTML = "<div>Enter a High Score and a Low Score to preview interpolation values.</div>";
    return;
  }

  let html = renderThresholdGrid(Engine.filterThresholds(values), formatNumber, Engine, highScore, lowScore);

  const bonusHtml = Engine.getBonusTargetHtml({ values }, isLastRound, formatNumber, currentScaling);
  if (bonusHtml) {
    html += `<br>${bonusHtml}`;
  }

  previewValues.innerHTML = html;
}

/**
 * Renders a standardized grid of score thresholds for 1-10.
 * @param {Object<string, number>} values - Key-value pairs of rank to score.
 * @param {function(any): any} [formatFn] - Function to format the score values.
 * @param {ScoringEngine} [engine] - Optional scoring engine for custom labels and styles.
 * @param {number} [value1] - Primary context value (e.g. high score).
 * @param {number} [value2] - Secondary context value (e.g. low score).
 * @returns {string} HTML string representing the grid.
 */
export function renderThresholdGrid(values, formatFn = (v) => v, engine = undefined, value1 = 0, value2 = 0) {
  if (!values || Object.keys(values).length === 0) return '<div class="notice">Enter scores to see thresholds.</div>';
  const prefix = engine ? engine.getThresholdPrefix() : '';

  const ranksToDisplay = (engine ? engine.getThresholdRange() : Array.from({ length: 10 }, (_, i) => 10 - i)) // Default to Bowling if no engine
    .filter(rank => values[rank] !== undefined);

  return `
    <div class="threshold-grid-container">
      ${prefix ? `<div class="threshold-prefix">${prefix}:</div>` : ''}
      <div class="threshold-grid">
        ${ranksToDisplay
          .map(rank => {
            const val = values[rank]; // Get value from the full 1-10 map
            const label = engine ? engine.getThresholdLabel(rank, value1, value2) : rank; // Use engine's label for special cases
            const rowClass = engine ? engine.getThresholdRowClass(rank, value1, value2) : '';
            return `<div class="threshold-row ${rowClass}"><strong>${label}:</strong> ${formatFn(val)}</div>`;
          })
          .join('')
        }
      </div>
    </div>
  `;
}

/**
 * Detects whether threshold values exhibit exponential (curved) or linear (flat) scaling.
 * Analyzes gaps between consecutive rank thresholds to determine if the growth rate
 * is increasing significantly (indicating curved/exponential scaling).
 *
 * @param {Object<string, number>} values - Map of rank (as string key) to score value.
 * @returns {'flat'|'curved'} Returns 'curved' if end gap > start gap * 1.5, otherwise 'flat'.
 */
export function detectScalingFromValues(values) {
  if (!values || Object.keys(values).length < 3) return 'flat';

  const ranks = Object.keys(values).map(Number).sort((a, b) => a - b);
  if (ranks.length < 3) return 'flat';

  // Calculate gaps between consecutive ranks
  const gapStart = Math.abs(values[ranks[1]] - values[ranks[0]]);
  const gapEnd = Math.abs(values[ranks[ranks.length - 1]] - values[ranks[ranks.length - 2]]);

  return (gapEnd > gapStart * 1.5) ? 'curved' : 'flat';
}
