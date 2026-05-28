/**
 * Client-side logic for the PinBowling application.
 * Handles API communication, scoring calculations (mapping pinball to bowling),
 * and dynamic UI rendering across different pages.
 */

import { 
  initNavigation
} from './utils.js';
import { initMachinesPage } from './machinesPage.js';
import { initLocationsPage } from './locationsPage.js';
import { initConfigPage } from './configPage.js';
import { initPlayersPage } from './playersPage.js';
import { initScoresPage } from './scoresPage.js';
import { initStandingsPage } from './standingsPage.js';
import { initLeaguesPage } from './leaguesPage.js';

/**
 * Main entry point. Identifies which page is currently loaded 
 * and runs the appropriate initialization logic based on unique DOM elements.
 * 
 * This approach allows us to use a single 'main.js' script tag across all 
 * PHP pages while ensuring only the necessary module logic is executed 
 * for the current view context.
 */
function ready() {
  initNavigation(); // From utils.js
  if (document.getElementById('machine-form')) {
    initMachinesPage();
  }
  if (document.getElementById('location-form')) {
    initLocationsPage();
  }
  if (document.getElementById('round-form')) {
    initConfigPage(); // From pages/configPage.js
  }
  if (document.getElementById('player-list')) {
    initPlayersPage(); // From pages/playersPage.js
  }
  if (document.getElementById('rounds-input')) {
    initScoresPage(); // From pages/scoresPage.js
  }
  if (document.getElementById('standings-body')) {
    initStandingsPage(); // From pages/standingsPage.js
  }
  if (document.getElementById('leagues-list')) {
    initLeaguesPage(); // From pages/leaguesPage.js
  }
}

document.addEventListener('DOMContentLoaded', ready);
