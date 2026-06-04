/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock all the page initializers and UI components imported by main.js
// We do this before importing main.js to ensure the module uses our mocks.
vi.mock('@ui/navigation.js', () => ({ initNavigation: vi.fn() }));
vi.mock('@pages/machinesPage.js', () => ({ initMachinesPage: vi.fn() }));
vi.mock('@pages/locationsPage.js', () => ({ initLocationsPage: vi.fn() }));
vi.mock('@pages/configPage.js', () => ({ initConfigPage: vi.fn() }));
vi.mock('@pages/playersPage.js', () => ({ initPlayersPage: vi.fn() }));
vi.mock('@pages/scoresPage.js', () => ({ initScoresPage: vi.fn() }));
vi.mock('@pages/standingsPage.js', () => ({ initStandingsPage: vi.fn() }));
vi.mock('@pages/leaguesPage.js', () => ({ initLeaguesPage: vi.fn() }));
vi.mock('@pages/playPage.js', () => ({ initPlayPage: vi.fn() }));
vi.mock('@services/auth.js', () => ({ 
  initAuthHeader: vi.fn(() => Promise.resolve()),
  resetAuthCache: vi.fn() 
}));
vi.mock('@services/api.js', () => ({
  PB_API: { getCurrentUser: vi.fn(() => Promise.resolve(null)) }
}));

// Import the mocks so we can inspect their call counts
import { initNavigation } from '@ui/navigation.js';
import { initMachinesPage } from '@pages/machinesPage.js';
import { initAuthHeader } from '@services/auth.js';
import { initLocationsPage } from '@pages/locationsPage.js';
import { initConfigPage } from '@pages/configPage.js';
import { initPlayersPage } from '@pages/playersPage.js';
import { initScoresPage } from '@pages/scoresPage.js';
import { initStandingsPage } from '@pages/standingsPage.js';
import { initLeaguesPage } from '@pages/leaguesPage.js';
import { initPlayPage } from '@pages/playPage.js';

describe('Application Entry Point (main.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * Helper to simulate the browser's DOMContentLoaded event.
   */
  const triggerAppReady = async () => {
    // Re-import main.js to ensure the event listener is attached to the current JSDOM instance
    await import('@scripts/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
  };

  it('should always initialize navigation components', async () => {
    await triggerAppReady();
    expect(initNavigation).toHaveBeenCalledWith('.nav-container');
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
      { id: 'round-form', fn: initConfigPage },
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
});