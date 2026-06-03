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
import { getScoringEngine } from '@core/engine.js';
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
  const getCookie = (name) => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  };

  // Handle global theme and format toggle
  const applyPreferredTheme = () => {
    const preferred = getCookie('pb_preferred_format') || 'bowling';
    const engine = getScoringEngine(preferred);
    
    // Clear any previous theme classes and apply the current engine's theme
    document.body.classList.remove('theme-golf');
    const themeClass = engine.getThemeClass();
    if (themeClass) document.body.classList.add(themeClass);
    
    const logoImgs = document.querySelectorAll('.nav-logo img, .header-logo img, .site-logo img, #site-logo, .hero-logo-img');
    logoImgs.forEach(img => {
      const basePath = img.src.substring(0, img.src.lastIndexOf('/') + 1);
      img.src = basePath + engine.getLogoImage();
      img.alt = engine.getBrandName() + ' Logo';
    });

    const logoText = document.querySelector('.nav-logo span');
    if (logoText) {
      logoText.textContent = engine.getBrandName();
    }

    // Update play CTA text based on the active engine
    const playLink = document.querySelector('[data-route="PLAY"]');
    if (playLink) {
      playLink.textContent = engine.getPlayActionLabel();
    }
  };

  const logoContainer = document.querySelector('.nav-logo, .header-logo, .site-logo, .logo-link');
  if (logoContainer) {
    logoContainer.style.cursor = 'pointer';
    logoContainer.title = 'Click to toggle site-wide scoring mode';
    logoContainer.onclick = (e) => {
      e.preventDefault();
      const current = getCookie('pb_preferred_format') || 'bowling';
      const next = current === 'bowling' ? 'golf' : 'bowling';
      document.cookie = `pb_preferred_format=${next}; path=/; max-age=31536000`; // Persist for 1 year
      window.location.reload(); 
    };
  }

  // Restore debug mode from local storage if previously toggled in Management UI
  window.PB_DEBUG_MODE = getDebugEnabled();

  if (window.PB_DEBUG_MODE) {
    console.log('[Main] Application ready() triggered.');
    console.log('[Main] Cache-Busting Version Active:', window.PB_UI_VERSION);
    console.log('[Main] Global window.PB_DEBUG_MODE finalized to:', window.PB_DEBUG_MODE);
  }

  initNavigation('.nav-container'); 
  applyPreferredTheme();
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
