/**
 * Client-side logic for the PinBowling application.
 * Handles API communication, scoring calculations (mapping pinball to bowling),
 * and dynamic UI rendering across different pages.
 */

import { initNavigation } from '@ui/navigation.js';
import { initMachinesPage } from '@pages/machinesPage.js';
import { initLocationsPage } from '@pages/locationsPage.js';
import { initEventSetupPage } from '@pages/eventSetupPage.js';
import { initPlayersPage } from '@pages/playersPage.js';
import { initScoresPage } from '@pages/scoresPage.js';
import { initTeamsPage } from '@pages/teamsPage.js';
import { initStandingsPage } from '@pages/standingsPage.js';
import { initLeaguesPage } from '@pages/leaguesPage.js';
import { initPlayPage } from '@pages/playPage.js';
import { initManagementPage } from '@pages/managementPage.js';
import { initWpprPage } from '@pages/wpprPage.js';
import { getDebugEnabled } from '@services/state.js';
import { initAuthHeader } from '@services/auth.js';
import { applyPreferredTheme, fitTVModeToScreen } from '@ui/branding.js';
import { loadPage } from '@scripts/utils.js';
import { showAlert, showPrompt } from '@ui/dialogs.js';
import { PB_API } from '@services/api.js';

/**
 * Main entry point. Identifies which page is currently loaded 
 * and runs the appropriate initialization logic based on unique DOM elements.
 * 
 * This approach allows us to use a single 'main.js' script tag across all 
 * PHP pages while ensuring only the necessary module logic is executed 
 * for the current view context.
 */
/**
 * Mobile carousel for the home page format logos.
 *
 * On small screens only the active format logo is shown, flanked by
 * prev/next arrows that let the user cycle through the available formats.
 * On larger screens all logos are shown and the arrows are hidden (via CSS).
 */
function initHeroLogoCarousel() {
  const track = document.querySelector('.hero-logo-track');
  if (!track) return;

  const logos = Array.from(track.querySelectorAll('.hero-logo-btn'));
  if (logos.length === 0) return;

  const navButtons = document.querySelectorAll('.hero-logo-nav');

  const getActiveIndex = () => {
    const theme = document.body.classList;
    for (let i = 0; i < logos.length; i++) {
      const fmt = logos[i].dataset.format;
      if (theme.contains(`theme-${fmt}`)) return i;
    }
    return 0;
  };

  const render = () => {
    const active = getActiveIndex();
    logos.forEach((logo, i) => {
      if (i === active) {
        logo.removeAttribute('hidden');
      } else {
        logo.setAttribute('hidden', '');
      }
    });
  };

  const cycle = (direction) => {
    const current = getActiveIndex();
    const next = (current + direction + logos.length) % logos.length;
    const format = logos[next].dataset.format;
    document.cookie = `pb_preferred_format=${format}; path=/; max-age=31536000`;
    applyPreferredTheme(format);
    render();
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = parseInt(btn.dataset.direction || '1', 10);
      cycle(dir);
    });
  });

  // Keep the carousel in sync when the theme changes from any source
  // (e.g. direct logo tap on desktop, or other brand-switching UI).
  document.addEventListener('pb:themeChanged', render);

  render();
}

export function initApp() {
  // Handle specific brand selection on the Home Page
  const heroLogoBtns = document.querySelectorAll('.hero-logo-btn');
  heroLogoBtns.forEach(btn => {
    btn.onclick = () => {
      const format = btn.dataset.format; // bowling or golf
      document.cookie = `pb_preferred_format=${format}; path=/; max-age=31536000`;
      applyPreferredTheme(format);
    };
  });

  initHeroLogoCarousel();

  initNavigation('.nav-container'); 
  applyPreferredTheme();

  initAuthHeader();

  const pageInitializers = {
    'machine-form': initMachinesPage,
    'location-form': initLocationsPage,
    'round-form': initEventSetupPage,
    'player-list': initPlayersPage,
    'team-form': initTeamsPage,
    'rounds-input': initScoresPage,
    'standings-body': initStandingsPage,
    'leagues-list': initLeaguesPage,
    'quick-play-form': initPlayPage,
    'management-tools': initManagementPage,
    'wppr-calculator': initWpprPage,
  };

  // Detect and run initialization for the current page based on element presence
  Object.entries(pageInitializers).forEach(([elementId, initialize]) => {
    if (document.getElementById(elementId)) initialize();
  });
}

async function ready() {
  // Global listener for unhandled promise rejections (e.g. 401 Unauthorized errors from playPage.js)
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason || 'Unknown error');
    if (message.includes('Unauthorized')) {
      showAlert(message, 'Access Denied');
    }
  });

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

  // Check for reset_token in URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get('reset_token');
  if (resetToken) {
    // Clear token from URL so it doesn't trigger again on reload
    const newUrl = window.location.pathname;
    window.history.replaceState({}, document.title, newUrl);
    
    // Defer showing prompt slightly to let app initialize and render
    setTimeout(async () => {
      const newPassword = await showPrompt('Enter your new password:', 'Reset Password', true);
      if (newPassword) {
        try {
          await PB_API.auth.resetWithToken(resetToken, newPassword);
          showAlert('Your password has been reset successfully. You can now login.', 'Success');
        } catch (err) {
          showAlert(err.message, 'Reset Failed');
        }
      }
    }, 100);
  }
}

document.addEventListener('DOMContentLoaded', ready);
