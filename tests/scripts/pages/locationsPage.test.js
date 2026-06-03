/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getLocations: vi.fn(),
    getMachines: vi.fn(),
    addLocationMachine: vi.fn(),
    removeLocationMachine: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn()
  }
}));

vi.mock('@scripts/utils.js', () => ({
  applyScoreFormatting: vi.fn(),
  formatNumber: vi.fn(n => n?.toLocaleString() || '0'),
  navigateTo: vi.fn(),
}));

vi.mock('@services/auth.js', () => ({
  isManagementAuthorized: vi.fn(),
  requireAdmin: vi.fn()
}));

vi.mock('@ui/uiComponents.js', () => ({
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showAlert: vi.fn()
}));

import { initLocationsPage } from '@scripts/pages/locationsPage.js';
import { PB_API } from '@services/api.js';
import { isManagementAuthorized } from '@services/auth.js';
import { navigateTo } from '@scripts/utils.js';
import { showAlert } from '@ui/uiComponents.js';

describe('Locations Page (locationsPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="location-form">
        <input id="editing-location-id" />
        <input id="location-name" />
        <input id="location-city" />
        <input id="location-state" />
        <div id="location-city-state-row" class="hidden"></div>
        <div class="form-actions hidden">
           <button id="save-location-button"></button>
           <button id="cancel-loc-edit-button" class="hidden"></button>
        </div>
      </form>
      <div id="locations-list"></div>
      <div id="locations-list-empty"></div>
      <div id="location-machine-form-card" class="hidden"></div>
    `;
    vi.clearAllMocks();
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should redirect unauthorized users', async () => {
    isManagementAuthorized.mockResolvedValue(false);
    PB_API.getLocations.mockResolvedValue([]);

    await initLocationsPage();

    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'), 'Access Denied');
    expect(navigateTo).toHaveBeenCalled();
  });

  it('should render locations list for authorized users', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockData = [{ id: 1, name: 'The Sanctum', city: 'Meriden', state: 'CT', machines: [] }];
    PB_API.getLocations.mockResolvedValue(mockData);

    await initLocationsPage();

    const list = document.getElementById('locations-list');
    expect(list.innerHTML).toContain('The Sanctum');
    expect(list.innerHTML).toContain('(Meriden, CT)');
  });

  it('should toggle the creation form visibility', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.getLocations.mockResolvedValue([]);
    await initLocationsPage();

    const createBtn = document.querySelector('.secondary'); // Create New Location button
    createBtn.click();

    expect(document.getElementById('location-city-state-row').classList.contains('hidden')).toBe(false);
    expect(createBtn.textContent).toBe('Cancel');
  });

  it('should save a new location via the API', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.getLocations.mockResolvedValue([]);
    await initLocationsPage();

    const nameInput = document.getElementById('location-name');
    nameInput.value = 'Pinball Wizard';
    nameInput.dispatchEvent(new Event('input'));

    const form = document.getElementById('location-form');
    await form.dispatchEvent(new Event('submit'));

    expect(PB_API.createLocation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Pinball Wizard'
    }));
  });
});