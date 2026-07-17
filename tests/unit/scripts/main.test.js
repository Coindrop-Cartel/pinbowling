/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock all the page initializers and UI components imported by main.js
// We do this before importing main.js to ensure the module uses our mocks.
vi.mock('@ui/navigation.js', () => ({ initNavigation: vi.fn() }));
vi.mock('@pages/machinesPage.js', () => ({ initMachinesPage: vi.fn() }));
vi.mock('@pages/locationsPage.js', () => ({ initLocationsPage: vi.fn() }));
vi.mock('@pages/eventSetupPage.js', () => ({ initEventSetupPage: vi.fn() }));
vi.mock('@pages/playersPage.js', () => ({ initPlayersPage: vi.fn() }));
vi.mock('@pages/scoresPage.js', () => ({ initScoresPage: vi.fn() }));
vi.mock('@pages/standingsPage.js', () => ({ initStandingsPage: vi.fn() }));
vi.mock('@pages/leaguesPage.js', () => ({ initLeaguesPage: vi.fn() }));
vi.mock('@pages/playPage.js', () => ({ initPlayPage: vi.fn() }));
vi.mock('@ui/branding.js', () => ({ applyPreferredTheme: vi.fn(), fitTVModeToScreen: vi.fn() }));
vi.mock('@ui/dialogs.js', () => ({ showAuthDialog: vi.fn() }));
vi.mock('@services/auth.js', () => ({ 
  initAuthHeader: vi.fn(() => Promise.resolve()), // Keep this mock
  resetAuthCache: vi.fn(), // Keep this mock
  can: vi.fn(), // Added for managementPage.js
  isManagementAuthorized: vi.fn(), // Added for teamsPage.js
}));
vi.mock('@services/api.js', () => ({
  PB_API: { getCurrentUser: vi.fn(() => Promise.resolve(null)) },
  fetchJSON: vi.fn()
}));
vi.mock('@pages/managementPage.js', () => ({ initManagementPage: vi.fn() })); // Added mock
vi.mock('@pages/teamsPage.js', () => ({ initTeamsPage: vi.fn() })); // Added mock
vi.mock('@scripts/utils.js', async (importOriginal) => { // Modified to mock loadPage
  const actual = await importOriginal();
  return {
    ...actual,
    loadPage: vi.fn(), // Added mock
  };
});
vi.mock('@services/state.js', async (importOriginal) => { // Modified to mock getDebugEnabled
  const actual = await importOriginal();
  return {
    ...actual,
    getDebugEnabled: vi.fn(), // Added mock
  };
});

// Import the mocks so we can inspect their call counts
import { initNavigation } from '@ui/navigation.js';
import { initMachinesPage } from '@pages/machinesPage.js';
import { initAuthHeader } from '@services/auth.js';
import { initLocationsPage } from '@pages/locationsPage.js';
import { initEventSetupPage } from '@pages/eventSetupPage.js';
import { initPlayersPage } from '@pages/playersPage.js';
import { initScoresPage } from '@pages/scoresPage.js';
import { initStandingsPage } from '@pages/standingsPage.js';
import { initLeaguesPage } from '@pages/leaguesPage.js';
import { initPlayPage } from '@pages/playPage.js';
import { initManagementPage } from '@pages/managementPage.js'; // Imported mock
import { initTeamsPage } from '@pages/teamsPage.js'; // Imported mock
import { loadPage } from '@scripts/utils.js'; // Imported mock
import { getDebugEnabled } from '@services/state.js';
import { applyPreferredTheme, fitTVModeToScreen } from '@ui/branding.js';

describe('Application Entry Point (main.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * Helper to simulate the browser's DOMContentLoaded event.
   */
  const triggerAppReady = async () => {
    // Re-import main.js to ensure the event listener is attached to the current JSDOM instance.
    await import('@scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  };

  it('should always initialize navigation components', async () => {
    await triggerAppReady();
    expect(initNavigation).toHaveBeenCalledWith('.nav-container');
  });

  it('should apply the preferred theme on startup', async () => {
    await triggerAppReady();
    expect(applyPreferredTheme).toHaveBeenCalled();
  });

  it('should initialize the correct page based on a unique element ID', async () => {
    // Test Machines Page detection
    document.body.innerHTML = '<div id="machine-form"></div>';
    await triggerAppReady();
    expect(initMachinesPage).toHaveBeenCalled();
    expect(initLeaguesPage).not.toHaveBeenCalled();

    // Test Leagues Page detection
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="leagues-list"></div>';
    await triggerAppReady();
    expect(initLeaguesPage).toHaveBeenCalled();
  });

  it('should correctly map all defined triggers to their initializers', async () => {
    const triggers = [
      { id: 'machine-form', fn: initMachinesPage },
      { id: 'location-form', fn: initLocationsPage },
      { id: 'round-form', fn: initEventSetupPage },
      { id: 'player-list', fn: initPlayersPage },
      { id: 'rounds-input', fn: initScoresPage },
      { id: 'standings-body', fn: initStandingsPage },
      { id: 'leagues-list', fn: initLeaguesPage },
      { id: 'quick-play-form', fn: initPlayPage },
    ];

    for (const trigger of triggers) {
      vi.clearAllMocks();
      document.body.innerHTML = `<div id="${trigger.id}"></div>`;
      await triggerAppReady();
      expect(trigger.fn, `Failed to initialize for ID: ${trigger.id}`).toHaveBeenCalled();
    }
  });

  it('should handle cases where no matching page elements are found', async () => {
    document.body.innerHTML = '<div id="not-a-page-trigger"></div>';
    await triggerAppReady();
    expect(initNavigation).toHaveBeenCalled();
    // No page initializers should have been called
    expect(initMachinesPage).not.toHaveBeenCalled();
  });
  it('should set cookie and apply theme when hero logo button is clicked', async () => {
    document.body.innerHTML = '<button class="hero-logo-btn" data-format="golf"></button>';
    const { applyPreferredTheme } = await import('@ui/branding.js');
    await triggerAppReady();
    const btn = document.querySelector('.hero-logo-btn');
    btn.click();
    expect(document.cookie).toContain('pb_preferred_format=golf');
    expect(applyPreferredTheme).toHaveBeenCalledWith('golf');
  });
  it('should initialize management page when management-tools element exists', async () => { // No longer needs import inside test
    document.body.innerHTML = '<div id="management-tools"></div>';
    await triggerAppReady();
    expect(initManagementPage).toHaveBeenCalled();
  });
  it('should initialize teams page when team-form element exists', async () => { // No longer needs import inside test
    document.body.innerHTML = '<div id="team-form"></div>';
    await triggerAppReady();
    expect(initTeamsPage).toHaveBeenCalled();
  });
  it('should add resize event listener for TV mode', async () => {
    document.body.innerHTML = '';
    await triggerAppReady();
    const { fitTVModeToScreen } = await import('@ui/branding.js');
    window.dispatchEvent(new Event('resize'));
    expect(fitTVModeToScreen).toHaveBeenCalled();
  });
  it('should handle popstate event to reload page', async () => { // No longer needs import inside test
    document.body.innerHTML = '';
    await triggerAppReady();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(loadPage).toHaveBeenCalled();
  });
  it('should re-initialize on pb:pageChanged event', async () => {
    document.body.innerHTML = '<div id="machine-form"></div>';
    await triggerAppReady();
    vi.clearAllMocks();
    document.dispatchEvent(new CustomEvent('pb:pageChanged'));
    expect(initNavigation).toHaveBeenCalled();
  });
  it('should restore debug mode from state on ready', async () => { // No longer needs import inside test
    getDebugEnabled.mockReturnValue(true);
    document.body.innerHTML = '';
    await triggerAppReady();
    expect(window.PB_DEBUG_MODE).toBe(true);
  });
});