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

/**
 * Main entry point. Identifies which page is currently loaded 
 * and runs the appropriate initialization logic based on unique DOM elements.
 * 
 * This approach allows us to use a single 'main.js' script tag across all 
 * PHP pages while ensuring only the necessary module logic is executed 
 * for the current view context.
 */
function ready() {
  initNavigation('.nav-container'); 

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
}

document.addEventListener('DOMContentLoaded', ready);
