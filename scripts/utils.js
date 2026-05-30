import { getScoringEngine } from '@core/engine.js';
import * as self from '@scripts/utils.js';

/**
 * Utility functions and state management helpers.
 */

/**
 * State helpers that prioritize URL parameters for sharing and consistency.
 */
export function getActiveLeagueId() {
  return new URLSearchParams(window.location.search).get('leagueId');
}

export function setActiveLeagueId(id) {
  const url = new URL(window.location);
  if (id) url.searchParams.set('leagueId', id);
  else url.searchParams.delete('leagueId');
  window.history.replaceState({}, '', url);
  self.initNavigation();
}

export function getActiveEventId() {
  return new URLSearchParams(window.location.search).get('eventId');
}

export function setActiveEventId(id) {
  const url = new URL(window.location);
  if (id) url.searchParams.set('eventId', id);
  else url.searchParams.delete('eventId');
  window.history.replaceState({}, '', url);
  self.initNavigation();
}

export function getCurrentPlayerId() {
  return new URLSearchParams(window.location.search).get('playerId');
}

export function setCurrentPlayerId(playerId) {
  const url = new URL(window.location);
  if (playerId) url.searchParams.set('playerId', playerId);
  else url.searchParams.delete('playerId');
  window.history.replaceState({}, '', url);
  self.initNavigation();
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
 * Sets the 'active' class on the navigation item matching the current URL.
 */
export function initNavigation() {
  // Normalize current path (e.g., "machines.php" or "machines" becomes "machines")
  const rawPath = window.location.pathname.split('/').pop() || 'index';
  const currentBase = rawPath.replace(/\.php$/, '') || 'index';

  const urlParams = new URLSearchParams(window.location.search);

  document.querySelectorAll('.nav-item').forEach(link => {
    let originalHref = link.getAttribute('href');
    if (originalHref && !originalHref.startsWith('http') && !originalHref.startsWith('#')) {
      let [path, existingQuery] = originalHref.split('?');
      
      // Normalize the path for the UI links (strip .php)
      const cleanPath = path.replace(/\.php$/, '');
      const targetParams = new URLSearchParams(existingQuery || '');
      
      // Carry over global state params to navigation links
      ['leagueId', 'eventId', 'playerId'].forEach(key => {
        if (urlParams.has(key) && !targetParams.has(key)) {
          targetParams.set(key, urlParams.get(key));
        }
      });
      
      const newQuery = targetParams.toString();
      const updatedHref = cleanPath + (newQuery ? '?' + newQuery : '');
      link.setAttribute('href', updatedHref);
      originalHref = updatedHref;
    }

    // Compare base filenames to set active state accurately
    const hrefBase = originalHref ? originalHref.split('?')[0].split('/').pop().replace(/\.php$/, '') || 'index' : '';
    if (hrefBase === currentBase) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/**
 * Renders a preview of calculated pinball-to-pin mapping on the config page.
 * Also displays bonus targets for Frame 10.
 * @param {HTMLInputElement} score10Input 
 * @param {HTMLInputElement} score1Input 
 * @param {HTMLElement} previewValues 
 * @param {Object} Engine
 * @param {boolean} isLastRound
 */
export function renderPreview(score10Input, score1Input, previewValues, Engine, isLastRound = false) {
  const score10 = Number(score10Input.value.replace(/\D/g, ''));
  const score1 = Number(score1Input.value.replace(/\D/g, ''));
  const values = Engine.buildRoundValues(score10, score1);

  if (!values) {
    previewValues.innerHTML = "<div>Enter a 10 score or a 1 score to preview values for 9–2.</div>";
    return;
  }

  let html = Object.entries(values)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([rank, value]) => `<div><strong>${rank}:</strong> ${formatNumber(value)}</div>`)
    .join("");

  if (isLastRound && values[10]) {
    const { t1, t2 } = Engine.getBonusTargets({ values }); // Pass values in an object to match frame structure
    html += `<br><div><strong>Target 1:</strong> ${formatNumber(t1)}</div>`;
    html += `<div><strong>Target 2:</strong> ${formatNumber(t2)}</div>`;
  }

  previewValues.innerHTML = html;
}