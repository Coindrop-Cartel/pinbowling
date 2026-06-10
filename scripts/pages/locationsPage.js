import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { applyScoreFormatting, formatNumber } from '@scripts/utils.js';
import { showConfirm, showPrompt } from '@ui/dialogs.js';
import { createExpandableRow } from '@ui/selectors.js';
import { requireAdmin } from '@services/auth.js';

/**
 * Logic for managing league locations/venues.
 */
export async function initLocationsPage() {
  const form = document.getElementById('location-form');
  const editingIdInput = document.getElementById('editing-location-id');
  const list = document.getElementById('locations-list');
  const emptyNotice = document.getElementById('locations-list-empty');
  const machineFormCard = document.getElementById('location-machine-form-card');

  const nameInput = document.getElementById('location-name');
  const cityInput = document.getElementById('location-city');
  const stateInput = document.getElementById('location-state');
  const saveBtn = document.getElementById('save-location-button');

  // Reference the existing city/state row from the PHP template
  const cityStateContainer = document.getElementById('location-city-state-row');

  // Setup "Create Location" toggle behavior
  const actionsRow = saveBtn.closest('.form-actions');
  if (cityStateContainer) cityStateContainer.classList.add('hidden');
  if (actionsRow) actionsRow.classList.add('hidden');

  const createToggle = document.createElement('button');
  createToggle.type = 'button';
  createToggle.className = 'secondary btn-mgmt mt-10';
  createToggle.textContent = 'Create New Location';
  nameInput.after(createToggle);

  if (saveBtn) saveBtn.classList.add('btn-mgmt');

  createToggle.onclick = () => {
    if (!cityStateContainer) return;
    const isHidden = cityStateContainer.classList.contains('hidden');
    if (isHidden) {
      cityStateContainer.classList.remove('hidden');
      actionsRow.classList.remove('hidden');
      createToggle.textContent = 'Cancel';
      createToggle.classList.replace('mt-10', 'mt-0');
      actionsRow.appendChild(createToggle);
    } else {
      resetForm();
    }
  };

  let allLocations = [];
  let expandedLocationId = null;

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
        const isExpanded = String(loc.id) === String(expandedLocationId);

        const headerHtml = `
          <div class="header-bar">
            <h3 class="section-heading flex-1">
              ${loc.name}${cityState}<br>
              <small>Machines: (${loc.machines?.length || 0})</small>
            </h3>
            <div class="action-buttons">
              <button class="edit-loc-btn secondary btn-row">Edit</button>
              <button class="delete-loc-btn btn-row">Delete</button>
            </div>
          </div>
        `;

        const contentHtml = `
          <div class="mb-15">
            <button class="add-mach-btn secondary btn-row">Add Machine to Venue</button>
          </div>
          <div class="league-details-columns columns-wrap">
            <div class="machines-list flex-1 min-250" id="mach-for-loc-${loc.id}">
              <div class="mach-list-inner"></div>
              <div class="notice mach-empty hidden">No machines at this venue.</div>
            </div>
          </div>
        `;

        const row = createExpandableRow(list, {
          id: loc.id,
          className: 'location-registry-item',
          headerHtml,
          contentHtml,
          isExpanded,
          onHeaderClick: () => {
            expandedLocationId = (expandedLocationId === loc.id) ? null : loc.id;
            onFilterUpdate();
          }
        });

        row.querySelector('.edit-loc-btn').onclick = (e) => { e.stopPropagation(); editLocation(loc.id); };
        row.querySelector('.delete-loc-btn').onclick = (e) => { e.stopPropagation(); deleteLocation(loc.id); };
        row.querySelector('.add-mach-btn').onclick = (e) => { e.stopPropagation(); showMachineForm(loc.id, loc.name); };

        renderMachinesForLocation(loc.id, loc.name, loc.machines);
      });
    } else {
      emptyNotice.classList.remove('hidden');
      emptyNotice.textContent = allLocations.length === 0 ? 'No locations registered yet.' : 'No matching locations found.';
    }

    // Validation logic for duplicates
    const exactNameMatch = allLocations.find(l => l.name.toLowerCase() === n);
    const exactFullMatch = allLocations.find(l => 
      l.name.toLowerCase() === n &&
      (l.city || '').toLowerCase() === c &&
      (l.state || '').toLowerCase() === s
    );
    const isEditingThis = exactFullMatch && String(exactFullMatch.id) === String(editingIdInput.value);

    // Hide the "Create" toggle if the name already exists, unless the form is open
    const isFormOpen = cityStateContainer && !cityStateContainer.classList.contains('hidden');
    if (createToggle) {
      createToggle.classList.toggle('hidden', !!exactFullMatch && !isFormOpen);
    }
    
    saveBtn.disabled = !n || (!!exactFullMatch && !isEditingThis);
    saveBtn.title = (exactFullMatch && !isEditingThis) ? "A venue with this name, city, and state already exists." : "";
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

    // Expand fields for editing
    if (cityStateContainer) cityStateContainer.classList.remove('hidden');
    if (actionsRow) actionsRow.classList.remove('hidden');
    createToggle.textContent = 'Cancel';
    createToggle.classList.replace('mt-10', 'mt-0');
    actionsRow.appendChild(createToggle);

    onFilterUpdate();
    window.scrollTo(0, 0);
  }

  /**
   * Resets the location editor form to its default state.
   */
  function resetForm() {
    editingIdInput.value = '';
    nameInput.value = '';
    form.reset();
    saveBtn.textContent = 'Add Location';

    // Collapse creation fields
    if (cityStateContainer) cityStateContainer.classList.add('hidden');
    if (actionsRow) actionsRow.classList.add('hidden');
    createToggle.textContent = 'Create New Location';
    createToggle.classList.replace('mt-0', 'mt-10');
    nameInput.after(createToggle);

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

    machines.sort((a, b) => a.machineName.localeCompare(b.machineName));

    machines.forEach(m => {
      const item = document.createElement('div');
      item.className = 'list-item-row';
      item.innerHTML = `
        <span>
          <strong class="small">${m.machineName}</strong><br>
          <small>E: ${formatNumber(m.targetEasy)} | M: ${formatNumber(m.targetMed)} | H: ${formatNumber(m.targetHard)}</small>
        </span>
        <div class="small-action-buttons">
          <button class="edit-mach-btn secondary btn-row">Edit</button>
          <button class="remove-mach-btn btn-row">Remove</button>
        </div>
      `;
      item.querySelector('.edit-mach-btn').onclick = () => showMachineForm(locationId, locationName, m);
      item.querySelector('.remove-mach-btn').onclick = async () => {
        if (await showConfirm(`Remove ${m.machineName} from this location?`, 'Remove Machine')) {
          await PB_API.removeLocationMachine(locationId, m.machineId);
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

    const engine = getScoringEngine();
    const highScoreLabel = engine.getValue1Label();
    const defaults = engine.getInitialValues();

    const allMachines = await PB_API.getMachines();
    machineFormCard.innerHTML = `
      <h2>${existing ? 'Edit' : 'Add'} Machine for ${locationName}</h2>
      <div class="form-row">
        <label>Select Machine</label>
        <select id="loc-mach-select" ${existing ? 'disabled' : ''}>
          <option value="">Choose machine...</option>
          ${allMachines.map(m => `<option value="${m.id}" ${existing?.machineId == m.id ? 'selected' : ''}>${m.machineName}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>${highScoreLabel}: Easy</label>
        <input type="text" id="target-easy" placeholder="e.g. ${formatNumber(defaults.value1)}" value="${existing ? formatNumber(existing.targetEasy) : ''}">
      </div>
      <div class="form-row">
        <label>${highScoreLabel}: Medium</label>
        <input type="text" id="target-med" placeholder="e.g. ${formatNumber(defaults.value1 * 2)}" value="${existing ? formatNumber(existing.targetMed) : ''}">
      </div>
      <div class="form-row">
        <label>${highScoreLabel}: Hard</label>
        <input type="text" id="target-hard" placeholder="e.g. ${formatNumber(defaults.value1 * 3)}" value="${existing ? formatNumber(existing.targetHard) : ''}">
      </div>
      <div class="form-actions">
        <button id="save-loc-mach" class="btn-mgmt">${existing ? 'Update' : 'Add to'} Location</button>
        <button id="cancel-loc-mach" class="secondary btn-mgmt">Cancel</button>
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
      const machineId = existing ? existing.machineId : document.getElementById('loc-mach-select').value;
      if (!machineId) return;

      const extra = {
        targetEasy: Number(document.getElementById('target-easy').value.replace(/\D/g, '')) || 0,
        targetMed: Number(document.getElementById('target-med').value.replace(/\D/g, '')) || 0,
        targetHard: Number(document.getElementById('target-hard').value.replace(/\D/g, '')) || 0,
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

    if (!await requireAdmin(`Enter Admin Password to ${id ? 'update' : 'create'} location "${locationName}":`)) {
      return;
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
   * Handles the deletion of a location venue.
   */
  async function deleteLocation(id) {
    const loc = allLocations.find(l => l.id === id);
    const locName = loc ? loc.name : 'this location';

    if (!await showConfirm(`Are you sure you want to delete the location "${locName}"?`, 'Delete Location')) return;
    if (!await requireAdmin('Enter Admin Password to confirm location deletion:')) return;

    try {
      await PB_API.deleteLocation(id);
      renderLocations();
    } catch (err) {
      alert(`Failed to delete location: ${err.message}`);
    }
  }

  // Backwards compatibility for unit tests
  window.deleteLocation = deleteLocation;

  await renderLocations();
}