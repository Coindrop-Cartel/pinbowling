/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initLocationsPage } from '@pages/locationsPage.js';
import { PB_API } from '@services/api.js';
import { requireAdmin } from '@services/auth.js';
import { showConfirm } from '@ui/dialogs.js';
import { createExpandableRow } from '@ui/selectors.js';
import { getScoringEngine } from '@core/engine.js';

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

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    getValue1Label: vi.fn(() => 'High Score'),
    getInitialValues: vi.fn(() => ({ value1: 1000, value2: 100 })),
  })),
}));

const uiMocks = vi.hoisted(() => ({
  showConfirm: vi.fn(() => Promise.resolve(true)),
  showPrompt: vi.fn(),
  showAlert: vi.fn(),
  setupLiveFilter: vi.fn((input, data, options) => {
    const filterInstance = {
      performFilter: vi.fn(() => {
        const query = (input ? input.value || '' : '').toLowerCase();
        const filtered = data.filter(item => 
          (item[options.labelKey || 'name'] || '').toLowerCase().includes(query)
        );
        options.onFilter(filtered, query);
      })
    };
    if (input) input.addEventListener('input', () => filterInstance.performFilter());
    return filterInstance;
  }),
  createExpandableRow: vi.fn((container, options) => {
    const row = document.createElement(options.tag || 'div');
    row.className = options.className || 'location-registry-item';
    row.innerHTML = `
      <div class="header-bar">${options.headerHtml || ''}</div>
      <div class="content-area ${options.isExpanded ? '' : 'hidden'}">${options.contentHtml || ''}</div>
    `;
    container.appendChild(row);
    if (options.onHeaderClick) {
      row.querySelector('.header-bar').addEventListener('click', options.onHeaderClick);
    }
    return row;
  }),
}));

vi.mock('@ui/selectors.js', () => uiMocks);
vi.mock('@ui/dialogs.js', () => uiMocks);

describe('Locations Management Page (locationsPage.js)', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    document.body.innerHTML = `
      <form id="location-form">
        <input id="editing-location-id" />
        <input id="location-name" />
        <div id="location-city-state-row" class="form-row hidden">
          <div class="form-row"><input id="location-city" /></div>
          <div class="form-row"><input id="location-state" /></div>
        </div>
        <div class="form-actions hidden">
          <button id="save-location-button" class="btn-mgmt">Add Location</button>
          <button id="cancel-loc-edit-button">Cancel</button>
        </div>
      </form>
      <div id="locations-list"></div>
      <div id="locations-list-empty"></div>
      <div id="location-machine-form-card" class="hidden"></div>
    `;
    vi.clearAllMocks();
    PB_API.getLocations.mockResolvedValue([
      { id: 1, name: 'The Sanctum', city: 'Meriden', state: 'CT', machines: [] },
      { id: 2, name: 'Pin Palace', city: 'Austin', state: 'TX', machines: [] },
    ]);
    PB_API.getMachines.mockResolvedValue([]);
    requireAdmin.mockResolvedValue(true);
    showConfirm.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should list locations on initialization', async () => {
      await initLocationsPage();
      expect(PB_API.getLocations).toHaveBeenCalled();
      expect(document.getElementById('locations-list').textContent).toContain('The Sanctum');
      expect(document.getElementById('locations-list').textContent).toContain('Pin Palace');
    });

    it('should show empty notice when no locations exist', async () => {
      PB_API.getLocations.mockResolvedValue([]);
      await initLocationsPage();
      const emptyNotice = document.getElementById('locations-list-empty');
      expect(emptyNotice.classList.contains('hidden')).toBe(false);
      expect(emptyNotice.textContent).toContain('No locations registered yet');
    });

    it('should hide city/state row and actions on init', async () => {
      await initLocationsPage();
      expect(document.getElementById('location-city-state-row').classList.contains('hidden')).toBe(true);
    });

    it('should create a "Create New Location" toggle button', async () => {
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      expect(toggle).not.toBeNull();
      expect(toggle.textContent).toContain('Create New Location');
    });

    it('should handle API errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      PB_API.getLocations.mockRejectedValue(new Error('Network Error'));
      await initLocationsPage();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('Create Location Toggle', () => {
    it('should reveal city/state fields when toggle is clicked', async () => {
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      toggle.click();
      expect(document.getElementById('location-city-state-row').classList.contains('hidden')).toBe(false);
    });

    it('should collapse fields and reset form when toggle is clicked again (Cancel)', async () => {
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      // First click: expand
      toggle.click();
      expect(document.getElementById('location-city-state-row').classList.contains('hidden')).toBe(false);
      // Find the Cancel toggle
      const cancelToggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cancel') && b.id !== 'cancel-loc-edit-button');
      if (cancelToggle) cancelToggle.click();
      await vi.waitFor(() => {
        expect(document.getElementById('location-city-state-row').classList.contains('hidden')).toBe(true);
      });
    });

    it('should change toggle text to Cancel when form is expanded', async () => {
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      toggle.click();
      const cancelToggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cancel'));
      expect(cancelToggle).not.toBeNull();
    });
  });

  describe('Edit Location', () => {
    it('should populate form when Edit is clicked', async () => {
      await initLocationsPage();
      const editBtn = document.querySelector('.edit-loc-btn');
      editBtn.click();
      expect(document.getElementById('location-name').value).toBe('The Sanctum');
      expect(document.getElementById('location-city').value).toBe('Meriden');
      expect(document.getElementById('location-state').value).toBe('CT');
      expect(document.getElementById('save-location-button').textContent).toBe('Update Location');
    });

    it('should set editing-location-id when editing', async () => {
      await initLocationsPage();
      const editBtn = document.querySelector('.edit-loc-btn');
      editBtn.click();
      expect(document.getElementById('editing-location-id').value).toBe('1');
    });

    it('should reveal city/state fields when editing', async () => {
      await initLocationsPage();
      const editBtn = document.querySelector('.edit-loc-btn');
      editBtn.click();
      expect(document.getElementById('location-city-state-row').classList.contains('hidden')).toBe(false);
    });

    it('should scroll to top when editing', async () => {
      await initLocationsPage();
      const editBtn = document.querySelector('.edit-loc-btn');
      editBtn.click();
      expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    });
  });

  describe('Form Submission - Create', () => {
    it('should call createLocation on form submit for new entry', async () => {
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      toggle.click();
      document.getElementById('location-name').value = 'New Spot';
      document.getElementById('location-city').value = 'Town';
      document.getElementById('location-state').value = 'ST';
      await document.getElementById('location-form').dispatchEvent(new Event('submit'));
      expect(PB_API.createLocation).toHaveBeenCalledWith(expect.objectContaining({
        name: 'New Spot',
        city: 'Town',
        state: 'ST',
      }));
    });

    it('should require admin password before creating', async () => {
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      toggle.click();
      document.getElementById('location-name').value = 'New Spot';
      document.getElementById('location-city').value = 'Town';
      document.getElementById('location-state').value = 'ST';
      await document.getElementById('location-form').dispatchEvent(new Event('submit'));
      expect(requireAdmin).toHaveBeenCalled();
    });

    it('should not create location if admin password rejected', async () => {
      requireAdmin.mockResolvedValue(false);
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      toggle.click();
      document.getElementById('location-name').value = 'New Spot';
      document.getElementById('location-city').value = 'Town';
      document.getElementById('location-state').value = 'ST';
      await document.getElementById('location-form').dispatchEvent(new Event('submit'));
      expect(PB_API.createLocation).not.toHaveBeenCalled();
    });

    it('should not submit if location name is empty', async () => {
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      toggle.click();
      document.getElementById('location-name').value = '';
      await document.getElementById('location-form').dispatchEvent(new Event('submit'));
      expect(PB_API.createLocation).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission - Update', () => {
    it('should call updateLocation on form submit when editing', async () => {
      await initLocationsPage();
      const editBtn = document.querySelector('.edit-loc-btn');
      editBtn.click();
      document.getElementById('location-city').value = 'New Haven';
      await document.getElementById('location-form').dispatchEvent(new Event('submit'));
      expect(PB_API.updateLocation).toHaveBeenCalledWith(1, expect.objectContaining({
        city: 'New Haven',
      }));
    });

    it('should require admin password before updating', async () => {
      await initLocationsPage();
      const editBtn = document.querySelector('.edit-loc-btn');
      editBtn.click();
      await document.getElementById('location-form').dispatchEvent(new Event('submit'));
      expect(requireAdmin).toHaveBeenCalledWith(expect.stringContaining('update'));
    });

    it('should not update if admin password rejected', async () => {
      requireAdmin.mockResolvedValue(false);
      await initLocationsPage();
      const editBtn = document.querySelector('.edit-loc-btn');
      editBtn.click();
      await document.getElementById('location-form').dispatchEvent(new Event('submit'));
      expect(PB_API.updateLocation).not.toHaveBeenCalled();
    });
  });

  describe('Delete Location', () => {
    it('should confirm before deleting', async () => {
      await initLocationsPage();
      const deleteBtn = document.querySelector('.delete-loc-btn');
      deleteBtn.click();
      expect(showConfirm).toHaveBeenCalledWith(
        expect.stringContaining('The Sanctum'),
        'Delete Location'
      );
    });

    it('should call deleteLocation API after confirmation', async () => {
      await initLocationsPage();
      const deleteBtn = document.querySelector('.delete-loc-btn');
      deleteBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.deleteLocation).toHaveBeenCalledWith(1);
      });
    });

    it('should require admin password for deletion', async () => {
      await initLocationsPage();
      const deleteBtn = document.querySelector('.delete-loc-btn');
      deleteBtn.click();
      await vi.waitFor(() => {
        expect(requireAdmin).toHaveBeenCalled();
      });
    });

    it('should not delete if user cancels confirmation', async () => {
      showConfirm.mockResolvedValue(false);
      await initLocationsPage();
      const deleteBtn = document.querySelector('.delete-loc-btn');
      deleteBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.deleteLocation).not.toHaveBeenCalled();
      });
    });

    it('should not delete if admin password rejected', async () => {
      requireAdmin.mockResolvedValue(false);
      await initLocationsPage();
      const deleteBtn = document.querySelector('.delete-loc-btn');
      deleteBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.deleteLocation).not.toHaveBeenCalled();
      });
    });

    it('should handle API error on delete', async () => {
      PB_API.deleteLocation.mockRejectedValue(new Error('Delete failed'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      await initLocationsPage();
      const deleteBtn = document.querySelector('.delete-loc-btn');
      deleteBtn.click();
      await vi.waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to delete'));
      });
      alertSpy.mockRestore();
    });
  });

  describe('Duplicate Name Validation', () => {
    it('should disable save button when duplicate name is entered', async () => {
      await initLocationsPage();
      const nameInput = document.getElementById('location-name');
      const cityInput = document.getElementById('location-city');
      const stateInput = document.getElementById('location-state');
      cityInput.value = 'Meriden'; // Set city to match existing
      stateInput.value = 'CT';     // Set state to match existing
      nameInput.value = 'The Sanctum';
      nameInput.dispatchEvent(new Event('input'));
      await vi.waitFor(() => {
        expect(document.getElementById('save-location-button').disabled).toBe(true);
      });
    });

    it('should allow save when editing the same location (same name)', async () => {
      await initLocationsPage();
      const editBtn = document.querySelector('.edit-loc-btn');
      editBtn.click();
      // Name is already populated with "The Sanctum" which matches, but we're editing it
      expect(document.getElementById('save-location-button').disabled).toBe(false);
    });

    it('should set title tooltip on duplicate name', async () => {
      await initLocationsPage();
      const nameInput = document.getElementById('location-name');
      const cityInput = document.getElementById('location-city');
      const stateInput = document.getElementById('location-state');
      cityInput.value = 'Meriden'; // Set city to match existing
      stateInput.value = 'CT';     // Set state to match existing
      nameInput.value = 'The Sanctum';
      nameInput.dispatchEvent(new Event('input'));
      await vi.waitFor(() => {
        expect(document.getElementById('save-location-button').title).toContain('already exists');
      });
    });

    it('should hide create toggle when duplicate name exists and form is not open', async () => {
      await initLocationsPage();
      const nameInput = document.getElementById('location-name');
      const cityInput = document.getElementById('location-city');
      const stateInput = document.getElementById('location-state');
      cityInput.value = 'Meriden'; // Set city to match existing
      stateInput.value = 'CT';     // Set state to match existing
      nameInput.value = 'The Sanctum';
      nameInput.dispatchEvent(new Event('input'));
      await vi.waitFor(() => {
        const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
        expect(toggle.classList.contains('hidden')).toBe(true);
      });
    });
  });

  describe('Machine Management', () => {
    it('should show machine form when Add Machine is clicked', async () => {
      await initLocationsPage();
      const addBtn = document.querySelector('.add-mach-btn');
      await addBtn.click();
      expect(document.getElementById('location-machine-form-card').classList.contains('hidden')).toBe(false);
    });

    it('should render machines for a location', async () => {
      PB_API.getLocations.mockResolvedValue([
        {
          id: 1,
          name: 'The Sanctum',
          city: 'Meriden',
          state: 'CT',
          machines: [
            { machineId: 10, machineName: 'Iron Maiden', targetEasy: 1000, targetMed: 2000, targetHard: 3000 },
          ],
        },
      ]);
      await initLocationsPage();
      const machinesList = document.querySelector('#mach-for-loc-1 .mach-list-inner');
      expect(machinesList.innerHTML).toContain('Iron Maiden');
    });

    it('should show empty notice when no machines at venue', async () => {
      await initLocationsPage();
      const emptyNotice = document.querySelector('#mach-for-loc-1 .mach-empty');
      expect(emptyNotice.classList.contains('hidden')).toBe(false);
    });

    it('should call removeLocationMachine when Remove is clicked', async () => {
      PB_API.getLocations.mockResolvedValue([
        {
          id: 1,
          name: 'The Sanctum',
          city: 'Meriden',
          state: 'CT',
          machines: [
            { machineId: 10, machineName: 'Iron Maiden', targetEasy: 1000, targetMed: 2000, targetHard: 3000 },
          ],
        },
      ]);
      await initLocationsPage();
      const removeBtn = document.querySelector('.remove-mach-btn');
      removeBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.removeLocationMachine).toHaveBeenCalledWith(1, 10);
      });
    });

    it('should not remove machine if confirmation is cancelled', async () => {
      showConfirm.mockResolvedValue(false);
      PB_API.getLocations.mockResolvedValue([
        {
          id: 1,
          name: 'The Sanctum',
          city: 'Meriden',
          state: 'CT',
          machines: [
            { machineId: 10, machineName: 'Iron Maiden', targetEasy: 1000, targetMed: 2000, targetHard: 3000 },
          ],
        },
      ]);
      await initLocationsPage();
      const removeBtn = document.querySelector('.remove-mach-btn');
      removeBtn.click();
      await vi.waitFor(() => {
        expect(PB_API.removeLocationMachine).not.toHaveBeenCalled();
      });
    });

    it('should save machine with target scores when save is clicked', async () => {
      PB_API.getMachines.mockResolvedValue([{ id: 10, machineName: 'Iron Maiden' }]);
      await initLocationsPage();
      const addBtn = document.querySelector('.add-mach-btn');
      await addBtn.click();

      const select = document.getElementById('loc-mach-select');
      if (select) select.value = '10';
      const easyInput = document.getElementById('target-easy');
      const medInput = document.getElementById('target-med');
      const hardInput = document.getElementById('target-hard');
      if (easyInput) easyInput.value = '1000';
      if (medInput) medInput.value = '2000';
      if (hardInput) hardInput.value = '3000';

      const saveMachBtn = document.getElementById('save-loc-mach');
      if (saveMachBtn) {
        saveMachBtn.click();
        await vi.waitFor(() => {
          expect(PB_API.addLocationMachine).toHaveBeenCalled();
        });
      }
    });

    it('should not save machine if no machine is selected', async () => {
      PB_API.getMachines.mockResolvedValue([{ id: 10, machineName: 'Iron Maiden' }]);
      await initLocationsPage();
      const addBtn = document.querySelector('.add-mach-btn');
      await addBtn.click();

      const saveMachBtn = document.getElementById('save-loc-mach');
      if (saveMachBtn) {
        saveMachBtn.click();
        // No machine selected (value is empty string)
        expect(PB_API.addLocationMachine).not.toHaveBeenCalled();
      }
    });

    it('should hide machine form when Cancel is clicked', async () => {
      PB_API.getMachines.mockResolvedValue([{ id: 10, machineName: 'Iron Maiden' }]);
      await initLocationsPage();
      const addBtn = document.querySelector('.add-mach-btn');
      await addBtn.click();
      const cancelBtn = document.getElementById('cancel-loc-mach');
      if (cancelBtn) {
        cancelBtn.click();
        expect(document.getElementById('location-machine-form-card').classList.contains('hidden')).toBe(true);
      }
    });

    it('should show Edit Machine form with existing values', async () => {
      PB_API.getLocations.mockResolvedValue([
        {
          id: 1,
          name: 'The Sanctum',
          city: 'Meriden',
          state: 'CT',
          machines: [
            { machineId: 10, machineName: 'Iron Maiden', targetEasy: 1000, targetMed: 2000, targetHard: 3000 },
          ],
        },
      ]);
      PB_API.getMachines.mockResolvedValue([{ id: 10, machineName: 'Iron Maiden' }]);
      await initLocationsPage();
      const editMachBtn = document.querySelector('.edit-mach-btn');
      if (editMachBtn) {
        await editMachBtn.click();
        expect(document.getElementById('location-machine-form-card').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('location-machine-form-card').innerHTML).toContain('Edit Machine');
      }
    });

    it('should handle API error when saving machine', async () => {
      PB_API.getMachines.mockResolvedValue([{ id: 10, machineName: 'Iron Maiden' }]);
      PB_API.addLocationMachine.mockRejectedValue(new Error('Save failed'));
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      await initLocationsPage();
      const addBtn = document.querySelector('.add-mach-btn');
      await addBtn.click();

      const select = document.getElementById('loc-mach-select');
      if (select) select.value = '10';
      const easyInput = document.getElementById('target-easy');
      if (easyInput) easyInput.value = '1000';

      const saveMachBtn = document.getElementById('save-loc-mach');
      if (saveMachBtn) {
        saveMachBtn.click();
        await vi.waitFor(() => {
          expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save machine'));
        });
      }
      alertSpy.mockRestore();
    });
  });

  describe('Filtering', () => {
    it('should filter locations by name input', async () => {
      await initLocationsPage();
      const nameInput = document.getElementById('location-name');
      nameInput.value = 'Pin';
      nameInput.dispatchEvent(new Event('input'));
      const items = document.querySelectorAll('.location-registry-item');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('Pin Palace');
    });

    it('should show "No matching locations" when filter has no results', async () => {
      await initLocationsPage();
      const nameInput = document.getElementById('location-name');
      nameInput.value = 'Nonexistent';
      nameInput.dispatchEvent(new Event('input'));
      const emptyNotice = document.getElementById('locations-list-empty');
      expect(emptyNotice.classList.contains('hidden')).toBe(false);
      expect(emptyNotice.textContent).toContain('No matching locations found');
    });

    it('should filter by city', async () => {
      await initLocationsPage();
      const cityInput = document.getElementById('location-city');
      cityInput.value = 'Austin';
      cityInput.dispatchEvent(new Event('input'));
      const items = document.querySelectorAll('.location-registry-item');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('Pin Palace');
    });

    it('should filter by state', async () => {
      await initLocationsPage();
      const stateInput = document.getElementById('location-state');
      stateInput.value = 'CT';
      stateInput.dispatchEvent(new Event('input'));
      const items = document.querySelectorAll('.location-registry-item');
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain('The Sanctum');
    });
  });

  describe('Expandable Rows', () => {
    it('should toggle expansion on header click', async () => {
      await initLocationsPage();
      const header = document.querySelector('.header-bar');
      header.click();
      const contentArea = document.querySelector('.content-area');
      expect(contentArea.classList.contains('hidden')).toBe(false);
    });
  });

  describe('Form Reset', () => {
    it('should reset form to Add mode after successful create', async () => {
      await initLocationsPage();
      const toggle = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create New Location'));
      toggle.click();
      document.getElementById('location-name').value = 'New Spot';
      document.getElementById('location-city').value = 'Town';
      document.getElementById('location-state').value = 'ST';
      await document.getElementById('location-form').dispatchEvent(new Event('submit'));
      // After successful create, form should reset
      expect(document.getElementById('editing-location-id').value).toBe('');
      expect(document.getElementById('save-location-button').textContent).toBe('Add Location');
    });
  });
});