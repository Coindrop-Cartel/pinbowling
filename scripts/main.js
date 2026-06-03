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
import { getCookie } from '@scripts/utils.js';
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
  // Handle global theme and format toggle
  const applyPreferredTheme = () => {
    const preferred = getCookie('pb_preferred_format') || 'bowling';
    const engine = getScoringEngine(preferred);

    // Dynamically swap the theme stylesheet to change colors instantly
    const themeLink = document.getElementById('theme-stylesheet');
    if (themeLink) {
      const currentHref = themeLink.getAttribute('href');
      const basePath = currentHref.substring(0, currentHref.lastIndexOf('/') + 1);
      themeLink.setAttribute('href', basePath + (preferred === 'golf' ? 'golf.css' : 'bowling.css'));
    }

    // Clear any previous theme classes and apply the current engine's theme
    document.body.classList.remove('theme-golf', 'theme-bowling');
    const themeClass = engine.getThemeClass();
    if (themeClass) document.body.classList.add(themeClass);
    
    // Update dynamic logos (header/nav) but skip the static selection logos on the home page
    const logoImgs = document.querySelectorAll('.nav-logo img, .header-logo img, .site-logo img, #site-logo');
    logoImgs.forEach(img => {
      const basePath = img.src.substring(0, img.src.lastIndexOf('/') + 1);
      img.src = basePath + engine.getLogoImage();
      img.alt = engine.getBrandName() + ' Logo';
    });

    // Update the navigation brand name label
    document.querySelectorAll('.nav-logo span').forEach(el => {
      el.textContent = engine.getBrandName();
    });

    // Update all play CTA links (nav and home button)
    document.querySelectorAll('[data-route="PLAY"]').forEach(link => {
      link.textContent = engine.getPlayActionLabel();
    });

    // Update homepage descriptive text
    const logicText = document.getElementById('scoring-logic-text');
    if (logicText) {
      logicText.textContent = engine.getScoringDescription();
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
      
      applyPreferredTheme();

      // We only reload if we are NOT on the homepage. Other pages (like Setup) 
      // have internal logic tied to the engine that requires a fresh init.
      if (!document.getElementById('scoring-logic-text')) {
        window.location.reload(); 
      }
    };
  }

  // Handle specific brand selection on the Home Page
  const heroLogoBtns = document.querySelectorAll('.hero-logo-btn');
  heroLogoBtns.forEach(btn => {
    btn.style.cursor = 'pointer';
    btn.onclick = () => {
      const format = btn.dataset.format; // bowling or golf
      document.cookie = `pb_preferred_format=${format}; path=/; max-age=31536000`;
      window.location.reload();
    };
  });

  // Restore debug mode from local storage if previously toggled in Management UI
  window.PB_DEBUG_MODE = getDebugEnabled();

  if (window.PB_DEBUG_MODE) {
    console.log('[Main] Application ready() triggered.');
    console.log('[Main] Cache-Busting Version Active:', window.PB_UI_VERSION);
    console.log('[Main] Global window.PB_DEBUG_MODE finalized to:', window.PB_DEBUG_MODE);
  }

  initNavigation('.nav-container'); 
  applyPreferredTheme();

  // Optimization: Do NOT await the auth header. It populates navigation elements 
  // (like the username) but it should not block the main page logic from 
  // loading leagues, machines, or scores.
  initAuthHeader();

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
