/**
 * Logic for managing the global machine registry.
 */
export function initMachinesPage() {
  const form = document.getElementById('machine-form');
  const list = document.getElementById('machines-list');
  const emptyNotice = document.getElementById('machines-list-empty');

  const fetchMachines = async () => {
    try {
      const res = await fetch('api.php?action=getMachines');
      const machines = await res.json();
      
      if (machines && machines.length > 0) {
        emptyNotice.classList.add('hidden');
        list.innerHTML = machines.map(m => `
          <div class="event-item">
            <span>${m.machine_name}</span>
            <button class="secondary" onclick="window.deleteMachine(${m.id})">Delete</button>
          </div>
        `).join('');
      } else {
        emptyNotice.classList.remove('hidden');
        list.innerHTML = '';
      }
    } catch (err) {
      console.error('Failed to load machines:', err);
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('machine-name');
    
    const res = await fetch('api.php?action=saveMachine', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-PB-SECRET': window.PB_API_SECRET 
      },
      body: JSON.stringify({ machine_name: nameInput.value })
    });

    if (res.ok) {
      nameInput.value = '';
      fetchMachines();
    }
  });

  window.deleteMachine = async (id) => {
    if (!confirm('Are you sure? This may affect historical data.')) return;
    await fetch(`api.php?action=deleteMachine&id=${id}`, {
      method: 'DELETE',
      headers: { 'X-PB-SECRET': window.PB_API_SECRET }
    });
    fetchMachines();
  };

  fetchMachines();
}