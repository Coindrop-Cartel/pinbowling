import { initNavigation } from '@ui/navigation.js';

/**
 * Utility functions and state management helpers.
 */

/** @typedef {import('@scripts/types.js').ScoringEngine} ScoringEngine */

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
  
  // Re-run navigation logic to update header HREFs based on the new parameters.
  // This ensures that "Scores" in the header points to the newly selected league.
  initNavigation();
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
    let rawValue = originalValue.replace(/\D/g, '');
    
    if (rawValue === '') {
      input.value = '';
    } else {
      const formatted = Number(rawValue).toLocaleString();
      input.value = formatted;
      const diff = formatted.length - originalValue.length;
      input.setSelectionRange(cursor + diff, cursor + diff);
    }
  });
}

/**
 * Navigates to a specific internal route.
 * @param {string} url - The destination path (typically generated via ROUTES).
 */
export const navigateTo = (url) => {
  if (url) window.location.href = url;
};

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
  const highScore = Number(highScoreInput.value.replace(/\D/g, ''));
  const lowScore = Number(lowScoreInput.value.replace(/\D/g, ''));
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
            const style = engine ? engine.getThresholdRowStyle(rank, value1, value2) : '';
            const inline = style ? ` style="${style}"` : '';
            return `<div class="threshold-row"${inline}><strong>${label}:</strong> ${formatFn(val)}</div>`;
          })
          .join('')
        }
      </div>
    </div>
  `;
}