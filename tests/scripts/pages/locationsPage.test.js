/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initLocationsPage } from '@pages/locationsPage.js';
import { PB_API } from '@services/api.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLocations: vi.fn(),
    getMachines: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    deleteLocation: vi.fn(),
    addLocationMachine: vi.fn(),
    removeLocationMachine: vi.fn(),
  },
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@ui/uiComponents.js', () => ({
  showConfirm: vi.fn(() => Promise.resolve(true)),
  showPrompt: vi.fn(),
}));

describe('Locations Management Page (locationsPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="location-form">
        <input id="editing-location-id" />
        <input id="location-name" />
        <div class="form-row"><input id="location-city" /></div>
        <div class="form-row"><input id="location-state" /></div>
        <div class="form-actions">
           <button id="save-location-button">Save</button>
           <button id="cancel-loc-edit-button">Cancel</button>
        </div>
      </form>
      <div id="locations-list"></div>
      <div id="locations-list-empty"></div>
      <div id="location-machine-form-card" class="hidden"></div>
    `;

    vi.clearAllMocks();
    PB_API.getLocations.mockResolvedValue([
      { id: 1, name: 'The Sanctum', city: 'Meriden', state: 'CT', machines: [] }
    ]);
  });

  it('should list locations on initialization', async () => {
    await initLocationsPage();
    expect(PB_API.getLocations).toHaveBeenCalled();
    expect(document.getElementById('locations-list').textContent).toContain('The Sanctum');
  });

  it('should populate form when "Edit" is clicked', async () => {
    await initLocationsPage();
    const editBtn = document.querySelector('.edit-loc-btn');
    editBtn.click();

    expect(document.getElementById('location-name').value).toBe('The Sanctum');
    expect(document.getElementById('save-location-button').textContent).toBe('Update Location');
  });

  it('should call createLocation on form submit for new entry', async () => {
    await initLocationsPage();
    document.getElementById('location-name').value = 'New Spot';
    document.getElementById('location-city').value = 'Town';
    document.getElementById('location-state').value = 'ST';

    await document.getElementById('location-form').dispatchEvent(new Event('submit'));
    expect(PB_API.createLocation).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Spot',
      city: 'Town'
    }));
  });
});