/**
 * Client-side logic for the PinBowling application.
 * Handles API communication, scoring calculations (mapping pinball to bowling),
 * and dynamic UI rendering across different pages.
 */

import { initNavigation } from '@ui/navigation.js';
import { initMachinesPage } from '@pages/machinesPage.js';
import { initLocationsPage } from '@pages/locationsPage.js';
import { initConfigPage } from '@pages/configPage.js';
import { initPlayersPage } from '@pages/playersPage.js';
import { initScoresPage } from '@pages/scoresPage.js';
import { initStandingsPage } from '@pages/standingsPage.js';
import { initLeaguesPage } from '@pages/leaguesPage.js';
import { initPlayPage } from '@pages/playPage.js';
import { initManagementPage } from '@pages/managementPage.js';
import { getDebugEnabled } from '@services/state.js';
import { initAuthHeader } from '@services/auth.js';
import { fitTVModeToScreen } from '@ui/uiComponents.js';

/**
 * Main entry point. Identifies which page is currently loaded 
 * and runs the appropriate initialization logic based on unique DOM elements.
 * 
 * This approach allows us to use a single 'main.js' script tag across all 
 * PHP pages while ensuring only the necessary module logic is executed 
 * for the current view context.
 */
async function ready() {
  // Restore debug mode from local storage if previously toggled in Management UI
  window.PB_DEBUG_MODE = getDebugEnabled();

  if (window.PB_DEBUG_MODE) {
    console.log('[Main] Application ready() triggered.');
    console.log('[Main] Cache-Busting Version Active:', window.PB_UI_VERSION);
    console.log('[Main] Global window.PB_DEBUG_MODE finalized to:', window.PB_DEBUG_MODE);
  }

  initNavigation('.nav-container'); 
  await initAuthHeader();

  const pageInitializers = {
    'machine-form': initMachinesPage,
    'location-form': initLocationsPage,
    'round-form': initConfigPage,
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

  // Handle scaling if window is resized while in TV Mode
  window.addEventListener('resize', fitTVModeToScreen);
}

document.addEventListener('DOMContentLoaded', ready);
