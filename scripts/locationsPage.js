/**
 * Logic for managing league locations/venues.
 */
export function initLocationsPage() {
  const form = document.getElementById('location-form');
  const list = document.getElementById('locations-list');
  const emptyNotice = document.getElementById('locations-list-empty');

  const fetchLocations = async () => {
    try {
      const res = await fetch('api.php?action=getLocations');
      const locations = await res.json();
      
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
    
    const res = await fetch('api.php?action=saveLocation', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-PB-SECRET': window.PB_API_SECRET 
      },
      body: JSON.stringify({ name: nameInput.value })
    });

    if (res.ok) {
      nameInput.value = '';
      fetchLocations();
    }
  });

  window.deleteLocation = async (id) => {
    if (!confirm('Are you sure?')) return;
    await fetch(`api.php?action=deleteLocation&id=${id}`, {
      method: 'DELETE',
      headers: { 'X-PB-SECRET': window.PB_API_SECRET }
    });
    fetchLocations();
  };

  fetchLocations();
}