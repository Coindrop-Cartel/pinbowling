import { getScoringEngine } from '@core/engine.js';
import { ROUTES } from './routes.js';
import * as self from '@scripts/utils.js';

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

function setUrlParam(key, value) {
  const url = new URL(window.location);
  if (value) url.searchParams.set(key, value);
  else url.searchParams.delete(key);
  window.history.replaceState({}, '', url);
  self.initNavigation();
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
 * Dynamically generates the navigation menu from ROUTES and manages active states.
 * If the container already contains navigation links (from layout.php), it updates them.
 * @param {string} containerSelector CSS selector for the nav container.
 */
export function initNavigation(containerSelector = '.nav-container') {
  const navContainer = document.querySelector(containerSelector);
  if (!navContainer) return;

  const urlParams = new URLSearchParams(window.location.search);
  const PERSISTENT_PARAMS = ['leagueId', 'eventId', 'playerId'];

  // Normalize current path (e.g., "machines.php" or "machines" becomes "machines")
  const rawPath = window.location.pathname.split('/').filter(Boolean).pop() || '';
  const currentBase = rawPath.replace(/\.php$/, '') || 'index';

  // If the container is completely empty (Vitest unit tests fallback), build links dynamically
  if (navContainer.children.length === 0) {
    navContainer.innerHTML = ROUTES.map(route => {
      const url = new URL(route.path, window.location.origin);
      
      PERSISTENT_PARAMS.forEach(key => {
        if (urlParams.has(key)) url.searchParams.set(key, urlParams.get(key));
      });

      const cleanPath = url.pathname.replace(/\.php$/, '');
      const finalHref = cleanPath + url.search;
      const pathWithSlash = finalHref.startsWith('/') ? finalHref : '/' + finalHref;
      const hrefBase = cleanPath.split('/').pop() || 'index';
      const isActive = hrefBase === currentBase;

      return `<a href="${pathWithSlash}" class="nav-item ${isActive ? 'active' : ''}">${route.label}</a>`;
    }).join('');
  } else {
    // If the navbar is already rendered (the real app), update the hrefs using data-route
    const routeLinks = navContainer.querySelectorAll('[data-route]');
    
    routeLinks.forEach(link => {
      const routeName = link.dataset.route;
      if (ROUTES[routeName]) {
        const params = {};
        PERSISTENT_PARAMS.forEach(key => {
          if (urlParams.has(key)) {
            params[key] = urlParams.get(key);
          }
        });
        link.setAttribute('href', ROUTES[routeName](params));
      }
    });

    // Clear active classes first
    const allLinks = navContainer.querySelectorAll('.nav-link, .nav-item');
    allLinks.forEach(link => link.classList.remove('active'));
    navContainer.querySelectorAll('.dropbtn').forEach(btn => btn.classList.remove('active'));

    // Update active class on links
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href !== 'javascript:void(0)') {
        const rawHref = href.split('?')[0].split('/').filter(Boolean).pop() || '';
        const hrefBase = rawHref.replace(/\.php$/, '') || 'index';
        if (hrefBase === currentBase) {
          link.classList.add('active');
          const dropdown = link.closest('.dropdown');
          if (dropdown) {
            const dropbtn = dropdown.querySelector('.dropbtn');
            if (dropbtn) dropbtn.classList.add('active');
          }
        }
      }
    });
  }
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
export function renderPreview(score10Input, score1Input, previewValues, Engine, isLastRound = false, currentScaling) {
  const score10 = Number(score10Input.value.replace(/\D/g, ''));
  const score1 = Number(score1Input.value.replace(/\D/g, ''));
  const values = Engine.buildRoundValues(score10, score1, currentScaling);

  if (!values) {
    previewValues.innerHTML = "<div>Enter a 10 score or a 1 score to preview values for 9–2.</div>";
    return;
  }

  let html = Object.entries(values)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([rank, value]) => `<div><strong>${rank}:</strong> ${formatNumber(value)}</div>`)
    .join("");

  if (isLastRound && values[10]) {
    const { t1, t2 } = Engine.getBonusTargets({ values }, currentScaling); // Pass values in an object to match frame structure
    html += `<br><div><strong>Target 1:</strong> ${formatNumber(t1)}</div>`;
    html += `<div><strong>Target 2:</strong> ${formatNumber(t2)}</div>`;
  }

  previewValues.innerHTML = html;
}