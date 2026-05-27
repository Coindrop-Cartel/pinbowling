/**
 * Client-side logic for the PinBowling application.
 * Handles API communication, scoring calculations (mapping pinball to bowling),
 * and dynamic UI rendering across different pages.
 */

import { 
  initNavigation
} from './utils.js';
import { initConfigPage } from './configPage.js';
import { initPlayersPage } from './playersPage.js';
import { initScoresPage } from './scoresPage.js';
import { initStandingsPage } from './standingsPage.js';
import { initLeaguesPage } from './leaguesPage.js';

/**
 * Main entry point. Identifies which page is currently loaded 
 * and runs the appropriate initialization logic.
 */
function ready() {
  initNavigation(); // From utils.js
  if (document.getElementById('frame-form')) {
    initConfigPage(); // From pages/configPage.js
  }
  if (document.getElementById('player-list')) {
    initPlayersPage(); // From pages/playersPage.js
  }
  if (document.getElementById('player-form')) {
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
