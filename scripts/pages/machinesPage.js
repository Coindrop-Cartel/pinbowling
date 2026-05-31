import { PB_API } from '@services/api.js';
import { setupLiveFilter, showConfirm, showPrompt } from '@ui/uiComponents.js';
import { requireAdmin } from '@services/auth.js';

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
        item.className = 'machine-registry-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '6px 12px';
        item.style.marginBottom = '5px';
        item.style.background = '#f9f9f9';
        item.style.borderRadius = '4px';
        
        item.innerHTML = `
          <span style="font-weight: bold;">${m.machineName}</span>
          <button class="delete-mach-btn" style="padding: 4px 10px; font-size: 0.85rem;">Delete</button>
        `;

        item.querySelector('.delete-mach-btn').onclick = async () => {
          if (!await requireAdmin(`Enter Admin Password to delete "${m.machineName}":`)) {
            return;
          }
          if (await showConfirm(`Are you sure you want to remove "${m.machineName}"? This will remove it from all locations and events.`, 'Delete Machine')) {
            await PB_API.deleteMachine(m.id);
            await load();
          }
        };
        list.appendChild(item);
      });
    }

    // Disable button if input is empty OR if an exact match already exists
    const exactMatch = allMachines.find(m => m.machineName.trim().toLowerCase() === query);
    submitBtn.disabled = !query || !!exactMatch;
    submitBtn.title = exactMatch ? "This machine name already exists in the registry." : "";
  };

  filterInstance = setupLiveFilter(nameInput, allMachines, {
    labelKey: 'machineName',
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