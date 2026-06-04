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
  isManagementAuthorized: vi.fn(() => Promise.resolve(true)),
  requireAdmin: vi.fn(() => Promise.resolve(true)),
  can: vi.fn(() => Promise.resolve(true)),
  PERMISSIONS: {
    CREATE_SESSION: 'CREATE_SESSION',
    JOIN_SESSION: 'JOIN_SESSION',
    ADD_ANY_SCORE: 'ADD_ANY_SCORE',
    MANAGE_LEAGUES: 'MANAGE_LEAGUES'
  }
}));

vi.mock('@ui/uiComponents.js', () => ({
  showConfirm: vi.fn(),
  showPrompt: vi.fn(),
  showAlert: vi.fn()
}));

import { initLocationsPage } from '@scripts/pages/locationsPage.js';
import { PB_API } from '@services/api.js';
import { isManagementAuthorized, can } from '@services/auth.js';
import { navigateTo } from '@scripts/utils.js';
import { showAlert, showConfirm } from '@ui/uiComponents.js';

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
    
    // Reset mocks to authorized state by default
    can.mockResolvedValue(true);
    isManagementAuthorized.mockResolvedValue(true);
  });

  it('should redirect unauthorized users', async () => {
    can.mockResolvedValue(false);
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

  it('should populate the form when editing an existing location', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLoc = { id: 1, name: 'The Sanctum', city: 'Meriden', state: 'CT', machines: [] };
    PB_API.getLocations.mockResolvedValue([mockLoc]);

    await initLocationsPage();

    const editBtn = document.querySelector('.edit-loc-btn');
    editBtn.click();

    expect(document.getElementById('location-name').value).toBe('The Sanctum');
    expect(document.getElementById('editing-location-id').value).toBe('1');
    expect(document.getElementById('save-location-button').textContent).toBe('Update Location');
  });

  it('should open machine form and allow adding a machine to a venue', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    const mockLoc = { id: 1, name: 'L1', machines: [] };
    PB_API.getLocations.mockResolvedValue([mockLoc]);
    PB_API.getMachines.mockResolvedValue([{ id: 10, machineName: 'M1' }]);

    await initLocationsPage();

    // Expand location to see add button
    document.querySelector('.location-header').click();
    
    const addMachBtn = document.querySelector('.add-mach-btn');
    addMachBtn.click();

    // Wait for async machine fetch and render
    await vi.waitFor(() => {
      expect(document.getElementById('loc-mach-select')).not.toBeNull();
    });

    const select = document.getElementById('loc-mach-select');
    select.value = '10';
    document.getElementById('target-med').value = '1,000';
    
    const saveBtn = document.getElementById('save-loc-mach');
    saveBtn.click();

    await vi.waitFor(() => {
      expect(PB_API.addLocationMachine).toHaveBeenCalledWith(1, '10', expect.objectContaining({
        targetMed: 1000
      }));
    });
  });

  it('should call delete API when global deleteLocation is triggered', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.getLocations.mockResolvedValue([{ id: 1, name: 'L1' }]);
    showConfirm.mockResolvedValue(true);

    await initLocationsPage();
    await window.deleteLocation(1);

    expect(PB_API.deleteLocation).toHaveBeenCalledWith(1);
  });
});