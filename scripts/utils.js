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

        // Prevent redundant reloads if the user is already on the target page
        link.onclick = (e) => {
          e.preventDefault();
          const targetUrl = new URL(link.href, window.location.origin);
          const currentUrl = new URL(window.location.href, window.location.origin);
          if (targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search) {
            return;
          }
          self.loadPage(link.href);
        };
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