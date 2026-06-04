import { getScoringEngine } from '@core/engine.js';
import { ROUTES } from './routes.js';
import * as self from '@scripts/utils.js';
import { initNavigation } from '@ui/navigation.js';

/**
 * Utility functions and state management helpers.
 */

/**
 * Global parameters that should persist across navigation.
 */
const PERSISTENT_PARAMS = ['leagueId', 'eventId', 'playerId'];

/**
 * State helpers that prioritize URL parameters for sharing and consistency.
 */
function getUrlParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

/**
 * Helper to retrieve a cookie value by name.
 * @param {string} name 
 */
export function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function setUrlParam(key, value) {
  const url = new URL(window.location);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState({}, '', url);
  
  // Re-run navigation logic to update header HREFs based on the new parameters.
  // This ensures that "Scores" in the header points to the newly selected league.
  initNavigation();
}

export const getActiveLeagueId = () => getUrlParam('leagueId');
export function setActiveLeagueId(id) {
  setUrlParam('leagueId', id);
}

export const getActiveEventId = () => getUrlParam('eventId');
export function setActiveEventId(id) {
  setUrlParam('eventId', id);
}

export const getCurrentPlayerId = () => getUrlParam('playerId');

export function setCurrentPlayerId(playerId) {
  setUrlParam('playerId', playerId);
}


/**
 * Formats a number with locale-specific thousands separators.
 * @param {number} num 
 * @returns {string}
 */
export function formatNumber(num) {
  return Number(num).toLocaleString();
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
    const cursor = e.target.selectionStart;
    const originalValue = e.target.value;
    let rawValue = originalValue.replace(/\D/g, '');
    
    if (rawValue === '') {
      e.target.value = '';
    } else {
      const formatted = Number(rawValue).toLocaleString();
      e.target.value = formatted;
      const diff = formatted.length - originalValue.length;
      e.target.setSelectionRange(cursor + diff, cursor + diff);
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
    console.error('[SPA] Partial load failed, falling back to full reload:', err);
    window.location.href = url;
  }
}

/**
 * Renders a preview of calculated pinball-to-pin mapping on the config page.
 * Also displays bonus targets for Frame 10.
 * @param {HTMLInputElement} highScoreInput 
 * @param {HTMLInputElement} lowScoreInput 
 * @param {HTMLElement} previewValues 
 * @param {Object} Engine
 * @param {boolean} isLastRound
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
 */
export function renderThresholdGrid(values, formatFn = (v) => v, engine = null, value1 = 0, value2 = 0) {
  if (!values || Object.keys(values).length === 0) return '<div class="notice">Enter scores to see thresholds.</div>';
  return `
    <div class="threshold-grid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; font-size: 0.75rem; background: var(--pb-gray); padding: 8px; border-radius: 4px;">
      ${Object.entries(values)
        .sort(engine ? engine.getThresholdSort() : (a, b) => Number(b[0]) - Number(a[0]))
        .map(([rank, val]) => {
          const label = engine ? engine.getThresholdLabel(rank, value1, value2) : rank;
          const style = engine ? engine.getThresholdRowStyle(rank, value1, value2) : 'margin: 2px 0;';
          return `<div style="${style}"><strong>${label}:</strong> ${formatFn(val)}</div>`;
        })
        .join('')
      }
    </div>
  `;
}