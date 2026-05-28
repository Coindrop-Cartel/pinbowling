import { PB_API } from './api.js';

/**
 * Logic for managing the global machine registry.
 */
export function initMachinesPage() {
  const form = document.getElementById('machine-form');
  const list = document.getElementById('machines-list');
  const emptyNotice = document.getElementById('machines-list-empty');

  const fetchMachines = async () => {
    try {
      const machines = await PB_API.getMachines();
      
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
    const machineName = nameInput.value.trim();

    if (!machineName) return;

    if (window.PB_ADMIN_PASSWORD) {
      const confirmation = prompt(`Enter Admin Password to add machine "${machineName}":`);
      if (confirmation === null) return;
      if (confirmation !== window.PB_ADMIN_PASSWORD) {
        alert('Incorrect Admin Password.');
        return;
      }
    }

    try {
      await PB_API.createMachine(machineName);
      nameInput.value = '';
      fetchMachines();
    } catch (err) {
      alert(`Failed to save machine: ${err.message}`);
    }
  });

  window.deleteMachine = async (id) => {
    if (window.PB_ADMIN_PASSWORD) {
      const confirmation = prompt('Enter Admin Password to confirm machine deletion (this may affect historical data):');
      if (confirmation === null) return;
      if (confirmation !== window.PB_ADMIN_PASSWORD) {
        alert('Incorrect Admin Password.');
        return;
      }
    }

    try {
      await PB_API.deleteMachine(id);
      fetchMachines();
    } catch (err) {
      alert(`Failed to delete machine: ${err.message}`);
    }
  };

  fetchMachines();
}