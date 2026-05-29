import { PB_API } from './api.js';
import { applyScoreFormatting, formatNumber } from './utils.js';
import { showConfirm, showPrompt } from './uiComponents.js';

/**
 * Logic for managing league locations/venues.
 */
export function initLocationsPage() {
  const form = document.getElementById('location-form');
  const editingIdInput = document.getElementById('editing-location-id');
  const list = document.getElementById('locations-list');
  const emptyNotice = document.getElementById('locations-list-empty');
  const machineFormCard = document.getElementById('location-machine-form-card');

  const nameInput = document.getElementById('location-name');
  const cityInput = document.getElementById('location-city');
  const stateInput = document.getElementById('location-state');
  const saveBtn = document.getElementById('save-location-button');
  const cancelBtn = document.getElementById('cancel-loc-edit-button');

  let allLocations = [];

  /**
   * Filters the visible locations based on the Name, City, and State inputs.
   * Also handles validation to prevent duplicate venue names.
   */
  const onFilterUpdate = () => {
    const n = nameInput.value.trim().toLowerCase();
    const c = cityInput.value.trim().toLowerCase();
    const s = stateInput.value.trim().toLowerCase();

    const filtered = allLocations.filter(loc => {
      const matchN = !n || loc.name.toLowerCase().includes(n);
      const matchC = !c || (loc.city || '').toLowerCase().includes(c);
      const matchS = !s || (loc.state || '').toLowerCase().includes(s);
      return matchN && matchC && matchS;
    });

    list.innerHTML = '';
    if (filtered.length > 0) {
      emptyNotice.classList.add('hidden');
      filtered.forEach(loc => {
        const cityState = (loc.city && loc.state) ? ` (${loc.city}, ${loc.state})` : '';
        const locDiv = document.createElement('div');
        locDiv.className = 'card league-item'; 
        locDiv.innerHTML = `
          <div class="location-header" style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0;">
              ${loc.name}${cityState}<br>
              <small>Machines: (${loc.machines?.length || 0})</small>
            </h3>
            <div>
              <button class="edit-loc-btn secondary">Edit</button>
              <button class="delete-loc-btn">Delete</button>
            </div>
          </div>
          <div class="location-details hidden" style="margin-top: 20px; border-top: 2px solid var(--pb-black); padding-top: 20px;">
            <div style="margin-bottom: 20px;">
              <button class="add-mach-btn secondary">Add Machine to Venue</button>
            </div>
            <div class="league-details-columns" style="display: flex; gap: 2rem; flex-wrap: wrap;">
              <div class="machines-list" id="mach-for-loc-${loc.id}" style="flex: 1; min-width: 300px;">
                <div class="mach-list-inner"></div>
                <div class="notice mach-empty hidden">No machines at this venue.</div>
              </div>
            </div>
          </div>
        `;
        list.appendChild(locDiv);

        locDiv.querySelector('.location-header').onclick = (e) => {
          if (e.target.closest('button')) return;
          const details = locDiv.querySelector('.location-details');
          details.classList.toggle('hidden');
        };

        locDiv.querySelector('.edit-loc-btn').onclick = () => editLocation(loc.id);
        locDiv.querySelector('.add-mach-btn').onclick = () => showMachineForm(loc.id, loc.name);
        locDiv.querySelector('.delete-loc-btn').onclick = () => window.deleteLocation(loc.id);

        renderMachinesForLocation(loc.id, loc.name, loc.machines);
      });
    } else {
      emptyNotice.classList.remove('hidden');
      emptyNotice.textContent = allLocations.length === 0 ? 'No locations registered yet.' : 'No matching locations found.';
    }

    // Validation logic for duplicates
    const exactMatch = allLocations.find(l => 
      l.name.toLowerCase() === n &&
      (l.city || '').toLowerCase() === c &&
      (l.state || '').toLowerCase() === s
    );
    const isEditingThis = exactMatch && String(exactMatch.id) === String(editingIdInput.value);
    
    saveBtn.disabled = !n || (!!exactMatch && !isEditingThis);
    saveBtn.title = (exactMatch && !isEditingThis) ? "A venue with this name, city, and state already exists." : "";
  };

  /**
   * Fetches all registered venues and refreshes the UI.
   * @async
   */
  const renderLocations = async () => {
    try {
      allLocations = await PB_API.getLocations();
      onFilterUpdate();
      resetForm();
    } catch (err) {
      console.error('Failed to load locations:', err);
    }
  };

  /**
   * Populates the editor form with details from an existing location.
   * @param {number} locId The primary key of the location.
   */
  function editLocation(locId) {
    const loc = allLocations.find(l => l.id === locId);
    if (!loc) return;

    editingIdInput.value = loc.id;
    nameInput.value = loc.name;
    cityInput.value = loc.city || '';
    stateInput.value = loc.state || '';

    saveBtn.textContent = 'Update Location';
    cancelBtn.classList.remove('hidden');
    onFilterUpdate();
    window.scrollTo(0, 0);
  }

  /**
   * Resets the location editor form to its default state.
   */
  function resetForm() {
    editingIdInput.value = '';
    form.reset();
    saveBtn.textContent = 'Add Location';
    cancelBtn.classList.add('hidden');
    onFilterUpdate();
  }

  nameInput.addEventListener('input', onFilterUpdate);
  cityInput.addEventListener('input', onFilterUpdate);
  stateInput.addEventListener('input', onFilterUpdate);

  /**
   * Renders the machines associated with a specific location.
   * @param {number} locationId 
   * @param {string} locationName 
   * @param {Array<Object>|null} [machines=null] Optional pre-loaded machines.
   * @async
   */
  async function renderMachinesForLocation(locationId, locationName, machines = null) {
    const inner = document.querySelector(`#mach-for-loc-${locationId} .mach-list-inner`);
    const empty = document.querySelector(`#mach-for-loc-${locationId} .mach-empty`);
    inner.innerHTML = '';

    if (machines === null) {
      const all = await PB_API.getLocations();
      const loc = all.find(l => l.id === locationId);
      machines = loc.machines || [];
      locationName = loc?.name || 'Venue';
    }

    if (machines.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    machines.sort((a, b) => a.machine_name.localeCompare(b.machine_name));

    machines.forEach(m => {
      const item = document.createElement('div');
      item.className = 'event-item';
      item.innerHTML = `
        <span>
          ${m.machine_name}<br>
          <small>E: ${formatNumber(m.target_easy)} | M: ${formatNumber(m.target_med)} | H: ${formatNumber(m.target_hard)}</small>
        </span>
        <div>
          <button class="edit-mach-btn secondary">Edit</button>
          <button class="remove-mach-btn">Remove</button>
        </div>
      `;
      item.querySelector('.edit-mach-btn').onclick = () => showMachineForm(locationId, locationName, m);
      item.querySelector('.remove-mach-btn').onclick = async () => {
        if (confirm(`Remove ${m.machine_name} from this location?`)) {
          await PB_API.removeLocationMachine(locationId, m.machine_id);
          renderLocations();
        }
      };
      inner.appendChild(item);
    });
  }

  /**
   * Displays the interactive form for adding or editing a machine at a location.
   * This logic manages the "Target Templates" used for event setup.
   * 
   * @param {number} locationId 
   * @param {string} locationName 
   * @param {Object|null} [existing=null] Existing mapping to edit.
   * @async
   */
  async function showMachineForm(locationId, locationName, existing = null) {
    // Show the card and scroll immediately so the user sees something is happening
    machineFormCard.classList.remove('hidden');
    machineFormCard.innerHTML = `<h2>Loading Machine Details...</h2>`;

    const allMachines = await PB_API.getMachines();
    machineFormCard.innerHTML = `
      <h2>${existing ? 'Edit' : 'Add'} Machine for ${locationName}</h2>
      <div class="form-row">
        <label>Select Machine</label>
        <select id="loc-mach-select" ${existing ? 'disabled' : ''}>
          <option value="">Choose machine...</option>
          ${allMachines.map(m => `<option value="${m.id}" ${existing?.machine_id == m.id ? 'selected' : ''}>${m.machine_name}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>Target Score: Easy</label>
        <input type="text" id="target-easy" value="${existing ? formatNumber(existing.target_easy) : ''}">
      </div>
      <div class="form-row">
        <label>Target Score: Medium</label>
        <input type="text" id="target-med" value="${existing ? formatNumber(existing.target_med) : ''}">
      </div>
      <div class="form-row">
        <label>Target Score: Hard</label>
        <input type="text" id="target-hard" value="${existing ? formatNumber(existing.target_hard) : ''}">
      </div>
      <div class="form-actions">
        <button id="save-loc-mach">${existing ? 'Update' : 'Add to'} Location</button>
        <button id="cancel-loc-mach" class="secondary">Cancel</button>
      </div>
    `;

    applyScoreFormatting(document.getElementById('target-easy'));
    applyScoreFormatting(document.getElementById('target-med'));
    applyScoreFormatting(document.getElementById('target-hard'));

    machineFormCard.scrollIntoView({ behavior: 'smooth' });

    if (existing) {
      document.getElementById('target-easy').focus();
    } else {
      document.getElementById('loc-mach-select').focus();
    }

    document.getElementById('cancel-loc-mach').onclick = () => machineFormCard.classList.add('hidden');
    document.getElementById('save-loc-mach').onclick = async () => {
      const machineId = existing ? existing.machine_id : document.getElementById('loc-mach-select').value;
      if (!machineId) return;

      const extra = {
        target_easy: Number(document.getElementById('target-easy').value.replace(/\D/g, '')) || 0,
        target_med: Number(document.getElementById('target-med').value.replace(/\D/g, '')) || 0,
        target_hard: Number(document.getElementById('target-hard').value.replace(/\D/g, '')) || 0,
      };

      try {
        await PB_API.addLocationMachine(locationId, machineId, extra);
        machineFormCard.classList.add('hidden');
        renderLocations();
      } catch (err) {
        alert(`Failed to save machine: ${err.message}`);
      }
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = editingIdInput.value ? Number(editingIdInput.value) : null;
    const locationName = nameInput.value.trim();
    const city = cityInput.value.trim();
    const state = stateInput.value.trim();

    if (!locationName) return;

    if (window.PB_ADMIN_PASSWORD) {
      const confirmation = await showPrompt(`Enter Admin Password to ${id ? 'update' : 'create'} location "${locationName}":`);
      if (confirmation === null) return; 
      if (confirmation !== window.PB_ADMIN_PASSWORD) {
        alert('Incorrect Admin Password.');
        return;
      }
    }

    const payload = { name: locationName, city, state };

    try {
      if (id) {
        await PB_API.updateLocation(id, payload);
      } else {
        await PB_API.createLocation(payload);
      }
      renderLocations();
    } catch (err) {
      alert(`Failed to save location: ${err.message}`);
    }
  });

  /**
   * Global helper for deleting locations.
   * Attached to window to allow for simple inline event handlers if needed.
   * @param {number} id 
   */
  window.deleteLocation = async (id) => {
    const loc = allLocations.find(l => l.id === id);
    const locName = loc ? loc.name : 'this location';

    if (!await showConfirm(`Are you sure you want to delete the location "${locName}"?`, 'Delete Location')) {
      return;
    }

    if (window.PB_ADMIN_PASSWORD) {
      const confirmation = await showPrompt('Enter Admin Password to confirm location deletion:');
      if (confirmation === null) return; 
      if (confirmation !== window.PB_ADMIN_PASSWORD) {
        alert('Incorrect Admin Password.');
        return;
      }
    }

    try {
      await PB_API.deleteLocation(id);
      renderLocations();
    } catch (err) {
      alert(`Failed to delete location: ${err.message}`);
    }
  };

  cancelBtn.onclick = resetForm;

  renderLocations();
}