import { PB_API } from './api.js';

/**
 * Logic for managing league locations/venues.
 */
export function initLocationsPage() {
  const form = document.getElementById('location-form');
  const list = document.getElementById('locations-list');
  const emptyNotice = document.getElementById('locations-list-empty');
  const machineFormCard = document.getElementById('location-machine-form-card');

  const renderLocations = async () => {
    try {
      const locations = await PB_API.getLocations();
      list.innerHTML = '';

      if (locations && locations.length > 0) {
        emptyNotice.classList.add('hidden');
        for (const loc of locations) {
          const locDiv = document.createElement('div');
          locDiv.className = 'card league-item'; 
          locDiv.innerHTML = `
            <div class="location-header" style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="margin: 0;">${loc.name} <span class="mach-count-pill">(${loc.machines?.length || 0})</span></h3>
              <div>
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

          // Toggle logic: Click the header (but not the delete button) to expand
          locDiv.querySelector('.location-header').onclick = (e) => {
            if (e.target.classList.contains('delete-loc-btn')) return;
            const details = locDiv.querySelector('.location-details');
            details.classList.toggle('hidden');
          };

          locDiv.querySelector('.add-mach-btn').onclick = () => showMachineForm(loc.id, loc.name);
          locDiv.querySelector('.delete-loc-btn').onclick = () => window.deleteLocation(loc.id);

          renderMachinesForLocation(loc.id, loc.machines);
        }
      } else {
        emptyNotice.classList.remove('hidden');
      }
    } catch (err) {
      console.error('Failed to load locations:', err);
    }
  };

  async function renderMachinesForLocation(locationId, machines = null) {
    const inner = document.querySelector(`#mach-for-loc-${locationId} .mach-list-inner`);
    const empty = document.querySelector(`#mach-for-loc-${locationId} .mach-empty`);
    inner.innerHTML = '';

    if (!machines) {
      const loc = await PB_API.getLocations().then(all => all.find(l => l.id === locationId));
      machines = loc.machines || [];
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
        <span>${m.machine_name}</span>
        <button class="secondary">Remove</button>
      `;
      item.querySelector('button').onclick = async () => {
        if (!confirm(`Remove ${m.machine_name} from this location?`)) return;
        await PB_API.removeLocationMachine(locationId, m.machine_id);
        renderLocations();
      };
      inner.appendChild(item);
    });
  }

  async function showMachineForm(locationId, locationName) {
    const allMachines = await PB_API.getMachines();
    machineFormCard.innerHTML = `
      <h2>Add Machine to ${locationName}</h2>
      <div class="form-row">
        <label>Select Machine</label>
        <select id="loc-mach-select">
          <option value="">Choose machine...</option>
          ${allMachines.map(m => `<option value="${m.id}">${m.machine_name}</option>`).join('')}
        </select>
      </div>
      <div class="form-actions">
        <button id="save-loc-mach">Add to Location</button>
        <button id="cancel-loc-mach" class="secondary">Cancel</button>
      </div>
    `;
    machineFormCard.classList.remove('hidden');
    window.scrollTo(0, document.body.scrollHeight);

    document.getElementById('cancel-loc-mach').onclick = () => machineFormCard.classList.add('hidden');
    document.getElementById('save-loc-mach').onclick = async () => {
      const machineId = document.getElementById('loc-mach-select').value;
      if (!machineId) return;
      await PB_API.addLocationMachine(locationId, machineId);
      machineFormCard.classList.add('hidden');
      renderLocations();
    };
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('location-name');
    const locationName = nameInput.value.trim();

    if (!locationName) return;

    if (window.PB_ADMIN_PASSWORD) {
      const confirmation = prompt(`Enter Admin Password to add location "${locationName}":`);
      if (confirmation === null) return;
      if (confirmation !== window.PB_ADMIN_PASSWORD) {
        alert('Incorrect Admin Password.');
        return;
      }
    }

    try {
      await PB_API.createLocation({ name: locationName });
      nameInput.value = '';
      renderLocations();
    } catch (err) {
      alert(`Failed to save location: ${err.message}`);
    }
  });

  window.deleteLocation = async (id) => {
    if (window.PB_ADMIN_PASSWORD) {
      const confirmation = prompt('Enter Admin Password to confirm location deletion:');
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

  renderLocations();
}