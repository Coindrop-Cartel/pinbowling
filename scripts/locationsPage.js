import { PB_API, ADMIN_PASSWORD } from './api.js';

/**
 * Initializes the Locations management page.
 */
export async function initLocationsPage() {
  const locationForm = document.getElementById('location-form');
  const locationIdInput = document.getElementById('location-id');
  const locationNameInput = document.getElementById('location-name');
  const locationCityInput = document.getElementById('location-city');
  const locationStateInput = document.getElementById('location-state');
  const locationsListDiv = document.getElementById('locations-list');
  const locationsListEmpty = document.getElementById('locations-list-empty');
  const cancelEditBtn = document.getElementById('cancel-location-edit');

  const machineFormCard = document.getElementById('machine-form-card');
  const machineForm = document.getElementById('machine-form');
  const machineLocationIdInput = document.getElementById('machine-location-id');
  const machineSelect = document.getElementById('machine-select');
  const cancelMachineBtn = document.getElementById('cancel-machine-add');

  async function renderLocations() {
    locationsListDiv.innerHTML = '';
    const locations = await PB_API.getLocations();

    if (locations.length === 0) {
      locationsListEmpty.classList.remove('hidden');
      return;
    }
    locationsListEmpty.classList.add('hidden');

    locations.forEach(loc => {
      const locDiv = document.createElement('div');
      locDiv.className = 'card location-item';
      locDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div>
            <h3 style="margin:0;">${loc.name}</h3>
            <small style="color: #666;">${loc.city || ''}${loc.city && loc.state ? ', ' : ''}${loc.state || ''}</small>
          </div>
          <div>
            <button class="add-machine-btn secondary">Add Machine</button>
            <button class="edit-location-btn secondary">Edit</button>
            <button class="delete-location-btn">Delete</button>
          </div>
        </div>
        <div class="machines-list" id="machines-for-location-${loc.id}">
          <h4 style="margin: 10px 0 5px 0;">Machines:</h4>
          <div class="machines-list-inner" style="display: flex; flex-wrap: wrap; gap: 8px;"></div>
          <div class="notice machines-empty hidden">No machines assigned to this location.</div>
        </div>
      `;
      locationsListDiv.appendChild(locDiv);

      locDiv.querySelector('.add-machine-btn').addEventListener('click', () => {
        showMachineForm(loc.id, loc.name);
      });
      locDiv.querySelector('.edit-location-btn').addEventListener('click', () => {
        editLocation(loc);
      });
      locDiv.querySelector('.delete-location-btn').addEventListener('click', () => {
        deleteLocation(loc.id);
      });

      renderMachinesForLocation(loc.id, loc.machines);
    });
  }

  function renderMachinesForLocation(locationId, machines = []) {
    const inner = document.querySelector(`#machines-for-location-${locationId} .machines-list-inner`);
    const empty = document.querySelector(`#machines-for-location-${locationId} .machines-empty`);
    inner.innerHTML = '';

    if (!machines || machines.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    machines.forEach(m => {
      const badge = document.createElement('div');
      badge.className = 'machine-badge';
      badge.style = 'background: #eee; padding: 4px 10px; border: 1px solid #000; font-size: 0.85rem; border-radius: 4px;';
      badge.textContent = m.machine_name;
      inner.appendChild(badge);
    });
  }

  function showMachineForm(locationId, locationName) {
    machineFormCard.classList.remove('hidden');
    document.getElementById('machine-form-title').textContent = `Add Machine to ${locationName}`;
    machineLocationIdInput.value = locationId;
    window.scrollTo(0, document.body.scrollHeight);
  }

  function editLocation(loc) {
    locationIdInput.value = loc.id;
    locationNameInput.value = loc.name;
    locationCityInput.value = loc.city || '';
    locationStateInput.value = loc.state || '';
    document.getElementById('location-form-title').textContent = 'Edit Location';
    if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  async function deleteLocation(id) {
    if (!confirm('Are you sure you want to delete this location?')) return;
    const confirmation = prompt('Enter Admin Password:');
    if (confirmation !== ADMIN_PASSWORD) return;
    await PB_API.deleteLocation(id);
    await renderLocations();
  }

  locationForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = locationIdInput.value;
    const payload = {
      name: locationNameInput.value.trim(),
      city: locationCityInput.value.trim(),
      state: locationStateInput.value.trim()
    };
    if (!payload.name) return;

    const confirmation = prompt('Enter Admin Password:');
    if (confirmation !== ADMIN_PASSWORD) return;

    if (id) {
      await PB_API.updateLocation(id, payload);
    } else {
      await PB_API.createLocation(payload);
    }
    locationForm.reset();
    locationIdInput.value = '';
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    document.getElementById('location-form-title').textContent = 'Add New Location';
    await renderLocations();
  });

  machineForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const locationId = machineLocationIdInput.value;
    const machineId = machineSelect.value;
    if (!locationId || !machineId) return;

    const confirmation = prompt('Enter Admin Password:');
    if (confirmation !== ADMIN_PASSWORD) return;

    await PB_API.addLocationMachine(locationId, machineId); 
    machineFormCard.classList.add('hidden');
    await renderLocations();
  });

  if (cancelEditBtn) cancelEditBtn.onclick = () => {
    locationForm.reset();
    locationIdInput.value = '';
    cancelEditBtn.classList.add('hidden');
    document.getElementById('location-form-title').textContent = 'Add New Location';
  };

  if (cancelMachineBtn) cancelMachineBtn.onclick = () => machineFormCard.classList.add('hidden');

  // Load master machines for the select
  const masterMachines = await PB_API.getMachines();
  machineSelect.innerHTML = '<option value="">Choose a machine...</option>';
  masterMachines.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.machine_name;
    machineSelect.appendChild(opt);
  });

  await renderLocations();
}