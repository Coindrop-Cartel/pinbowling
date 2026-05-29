import { PB_API } from './api.js';
import { getAdminSessionPassword, setAdminSessionPassword } from './state.js';
import { setupLiveFilter, showConfirm, showPrompt } from './uiComponents.js';

/**
 * Logic for the Global Machine Registry page.
 * 
 * Provides an interface to manage the master list of pinball machines.
 * Includes live filtering, deduplication checks during entry, and 
 * administrative protection for deletions.
 * @async
 */
export async function initMachinesPage() {
  const form = document.getElementById('machine-form');
  const nameInput = document.getElementById('machine-name');
  const list = document.getElementById('machines-list');
  const emptyNotice = document.getElementById('machines-list-empty');
  const submitBtn = document.getElementById('add-machine-btn');

  let allMachines = [];
  let filterInstance = null;

  /**
   * Renders the machine registry list based on the current filter text.
   * Also handles the validation of the "Add Machine" button.
   * 
   * @param {Array<Object>} filtered The list of machines matching the query.
   * @param {string} query The search string entered by the user.
   */
  const onFilterUpdate = (filtered, query) => {
    list.innerHTML = '';
    if (filtered.length === 0) {
      emptyNotice.classList.remove('hidden');
      emptyNotice.textContent = allMachines.length === 0 ? 'No machines registered yet.' : 'No matching machines found.';
    } else {
      emptyNotice.classList.add('hidden');
      filtered.forEach(m => {
        const item = document.createElement('div');
        item.className = 'card league-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '10px 15px';
        item.style.marginBottom = '10px';
        
        item.innerHTML = `
          <span style="font-weight: bold;">${m.machine_name}</span>
          <button class="delete-mach-btn">Delete</button>
        `;

        item.querySelector('.delete-mach-btn').onclick = async () => {
          if (window.PB_ADMIN_PASSWORD) {
            let confirmPass = getAdminSessionPassword();
            if (confirmPass !== window.PB_ADMIN_PASSWORD) {
              confirmPass = await showPrompt(`Enter Admin Password to delete "${m.machine_name}":`);
              if (confirmPass === window.PB_ADMIN_PASSWORD) setAdminSessionPassword(confirmPass);
            }
            if (confirmPass === null) return;
            if (confirmPass !== window.PB_ADMIN_PASSWORD) return alert('Incorrect Password');
          }
          if (await showConfirm(`Are you sure you want to remove "${m.machine_name}"? This will remove it from all locations and events.`, 'Delete Machine')) {
            await PB_API.deleteMachine(m.id);
            await load();
          }
        };
        list.appendChild(item);
      });
    }

    // Disable button if input is empty OR if an exact match already exists
    const exactMatch = allMachines.find(m => m.machine_name.trim().toLowerCase() === query);
    submitBtn.disabled = !query || !!exactMatch;
    submitBtn.title = exactMatch ? "This machine name already exists in the registry." : "";
  };

  filterInstance = setupLiveFilter(nameInput, allMachines, {
    labelKey: 'machine_name',
    onFilter: onFilterUpdate
  });

  const load = async () => {
    try {
      const data = await PB_API.getMachines();
      // Update array in-place so the filterInstance reference stays valid
      allMachines.length = 0;
      allMachines.push(...data);
      filterInstance.performFilter();
    } catch (err) {
      console.error('Failed to load machine registry:', err);
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    await PB_API.createMachine(name);
    nameInput.value = '';
    await load();
  });

  await load();
}