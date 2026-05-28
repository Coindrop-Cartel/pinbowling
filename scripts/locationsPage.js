import { PB_API } from './api.js';

/**
 * Logic for managing league locations/venues.
 */
export function initLocationsPage() {
  const form = document.getElementById('location-form');
  const list = document.getElementById('locations-list');
  const emptyNotice = document.getElementById('locations-list-empty');

  const fetchLocations = async () => {
    try {
      const locations = await PB_API.getLocations();
      
      if (locations && locations.length > 0) {
        emptyNotice.classList.add('hidden');
        list.innerHTML = locations.map(l => `
          <div class="event-item">
            <span>${l.name}</span>
            <button class="secondary" onclick="window.deleteLocation(${l.id})">Delete</button>
          </div>
        `).join('');
      } else {
        emptyNotice.classList.remove('hidden');
        list.innerHTML = '';
      }
    } catch (err) {
      console.error('Failed to load locations:', err);
    }
  };

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
      fetchLocations();
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
      fetchLocations();
    } catch (err) {
      alert(`Failed to delete location: ${err.message}`);
    }
  };

  fetchLocations();
}