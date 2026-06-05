/**
 * Client-side logic for the PinBowling application.
 * Handles API communication, scoring calculations (mapping pinball to bowling),
 * and dynamic UI rendering across different pages.
 */

import { initNavigation } from '@ui/navigation.js';
import { initMachinesPage } from '@pages/machinesPage.js';
import { initLocationsPage } from '@pages/locationsPage.js';
import { initEventSetupPage } from '@scripts/pages/eventSetupPage.js';
import { initPlayersPage } from '@pages/playersPage.js';
import { initScoresPage } from '@pages/scoresPage.js';
import { initStandingsPage } from '@pages/standingsPage.js';
import { initLeaguesPage } from '@pages/leaguesPage.js';
import { initPlayPage } from '@pages/playPage.js';
import { initManagementPage } from '@pages/managementPage.js';
import { getDebugEnabled } from '@services/state.js';
import { getScoringEngine } from '@core/engine.js';
import { getCookie } from '@scripts/utils.js';
import { initAuthHeader } from '@services/auth.js';
import { applyPreferredTheme, fitTVModeToScreen } from '@ui/branding.js';
import { loadPage } from '@scripts/utils.js';

/**
 * Main entry point. Identifies which page is currently loaded 
 * and runs the appropriate initialization logic based on unique DOM elements.
 * 
 * This approach allows us to use a single 'main.js' script tag across all 
 * PHP pages while ensuring only the necessary module logic is executed 
 * for the current view context.
 */
export function initApp() {
  // Handle specific brand selection on the Home Page
  const heroLogoBtns = document.querySelectorAll('.hero-logo-btn');
  heroLogoBtns.forEach(btn => {
    btn.style.cursor = 'pointer';
    btn.onclick = () => {
      const format = btn.dataset.format; // bowling or golf
      document.cookie = `pb_preferred_format=${format}; path=/; max-age=31536000`;
      applyPreferredTheme(format);
    };
  });

  initNavigation('.nav-container'); 
  applyPreferredTheme();

  initAuthHeader();

  const pageInitializers = {
    'machine-form': initMachinesPage,
    'location-form': initLocationsPage,
    'round-form': initEventSetupPage,
    'player-list': initPlayersPage,
    'rounds-input': initScoresPage,
    'standings-body': initStandingsPage,
    'leagues-list': initLeaguesPage,
    'quick-play-form': initPlayPage,
    'management-tools': initManagementPage,
  };

  // Detect and run initialization for the current page based on element presence
  Object.entries(pageInitializers).forEach(([elementId, initialize]) => {
    if (document.getElementById(elementId)) initialize();
  });
}

async function ready() {
  // Restore debug mode from local storage if previously toggled in Management UI
  window.PB_DEBUG_MODE = getDebugEnabled();

  initApp();

  // Handle scaling if window is resized while in TV Mode
  window.addEventListener('resize', fitTVModeToScreen);

  // Handle back/forward browser buttons
  window.addEventListener('popstate', () => {
    loadPage(window.location.href, false);
  });

  // Re-run initialization when page content changes partially
  document.addEventListener('pb:pageChanged', () => {
    initApp();
  });
}

document.addEventListener('DOMContentLoaded', ready);
