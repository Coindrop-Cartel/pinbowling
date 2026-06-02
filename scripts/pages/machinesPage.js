import { PB_API } from '@services/api.js';
import { setupLiveFilter, showConfirm, showAlert } from '@ui/uiComponents.js';
import { requireAdmin } from '@services/auth.js';
import { navigateTo } from '@scripts/utils.js';
import { ROUTES } from '@scripts/routes.js';

/**
 * Logic for the Global Machine Registry page.
 * 
 * Provides an interface to manage the master list of pinball machines.
 * Includes live filtering, deduplication checks during entry, and 
 * administrative protection for deletions.
 */
export async function initMachinesPage() {
  const currentUser = await PB_API.getCurrentUser();
  const isAdmin = currentUser && currentUser.role === 'admin';
  const isTD = currentUser && currentUser.role === 'td';
  const hasElevatedPrivileges = isAdmin || isTD;

  const machineFormTitle = document.getElementById('machine-form-title');
  const machineForm = document.getElementById('machine-form');
  const editingIdInput = document.getElementById('editing-machine-id');
  const machineNameInput = document.getElementById('machine-name');
  const yearInput = document.getElementById('machine-year');
  const mfgInput = document.getElementById('machine-manufacturer');
  const saveMachineButton = document.getElementById('save-machine-button');
  const cancelEditButton = document.getElementById('cancel-edit-button');
  const machineList = document.getElementById('machines-list');
  const emptyNotice = document.getElementById('machines-list-empty');

  let allMachines = [];
  let filterInstance = null;

  // Setup "Create Machine" toggle
  const metadataRow = yearInput.closest('.form-row').parentElement;
  const actionsRow = saveMachineButton.closest('.form-actions');

  const createToggle = document.createElement('button');
  createToggle.type = 'button';
  createToggle.className = 'secondary';
  createToggle.textContent = 'Create New Machine';
  createToggle.style.marginTop = '10px';
  machineNameInput.after(createToggle);

  if (!hasElevatedPrivileges) {
    createToggle.classList.add('hidden');
    machineForm.closest('.card').classList.add('hidden');
  }

  createToggle.onclick = () => {
    const isHidden = metadataRow.classList.contains('hidden');
    toggleFormVisibility(!isHidden);
    if (isHidden) {
      createToggle.textContent = 'Cancel';
      createToggle.style.marginTop = '0';
      actionsRow.appendChild(createToggle);
    } else {
      createToggle.textContent = 'Create New Machine';
      createToggle.style.marginTop = '10px';
      machineNameInput.after(createToggle);
    }
  };

  function toggleFormVisibility(hide) {
    metadataRow.classList.toggle('hidden', hide);
    actionsRow.classList.toggle('hidden', hide);
  }

  /**
   * Renders the machine registry list based on the current filter text.
   * Also handles the validation of the "Save Machine" button.
   * 
   * @param {Array<Object>} filtered The list of machines matching the query.
   * @param {string} query The search string entered by the user.
   */
  const onFilterUpdate = (filtered, query) => {
    machineList.innerHTML = '';
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
        
        const info = [m.manufacturer, m.year].filter(Boolean).join(', ');
        item.innerHTML = `
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: bold;">${m.machineName}</span>
            ${info ? `<small style="color: #666;">${info}</small>` : ''}
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="edit-mach-btn secondary" style="padding: 4px 10px; font-size: 0.85rem;">Edit</button>
            ${isAdmin ? `<button type="button" class="delete-mach-btn" style="padding: 4px 10px; font-size: 0.85rem;">Delete</button>` : ''}
          </div>
        `;

        item.querySelector('.edit-mach-btn').onclick = () => editMachine(m);
        const deleteBtn = item.querySelector('.delete-mach-btn');
        if (deleteBtn) deleteBtn.onclick = async () => {
          if (await showConfirm(`Are you sure you want to remove "${m.machineName}"? This will remove it from all locations and events.`, 'Delete Machine')) {
            await deleteMachine(m.id);
          }
        };
        machineList.appendChild(item);
      });
    }

    // Logic to prevent duplicate machine names
    const exactMatch = allMachines.find(m => m.machineName.trim().toLowerCase() === query);
    const isEditingThisMachine = exactMatch && String(exactMatch.id) === String(editingIdInput.value);

    // Hide the "Create" toggle if an exact match exists, unless the creation 
    // form is already open (in which case the button serves as "Cancel").
    const isFormOpen = !metadataRow.classList.contains('hidden');
    createToggle.classList.toggle('hidden', !!exactMatch && !isFormOpen);

    saveMachineButton.disabled = !query || (!!exactMatch && !isEditingThisMachine);
    saveMachineButton.title = (exactMatch && !isEditingThisMachine) ? "This machine name already exists in the registry." : "";
  };

  const editMachine = (m) => {
    machineForm.closest('.card').classList.remove('hidden');
    editingIdInput.value = m.id;
    machineNameInput.value = m.machineName;
    yearInput.value = m.year || '';
    mfgInput.value = m.manufacturer || '';
    
    // Lock name for non-privileged users
    machineNameInput.disabled = !hasElevatedPrivileges;

    if (machineFormTitle) machineFormTitle.textContent = `Edit Machine: ${m.machineName}`;
    saveMachineButton.textContent = 'Update Machine';
    cancelEditButton.classList.remove('hidden');

    // Expand fields for editing
    toggleFormVisibility(false);
    createToggle.textContent = 'Cancel';
    createToggle.style.marginTop = '0';
    actionsRow.appendChild(createToggle);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (filterInstance) filterInstance.performFilter();
  };

  const resetForm = () => {
    editingIdInput.value = '';
    machineNameInput.value = '';
    yearInput.value = '';
    mfgInput.value = '';

    machineNameInput.disabled = false;
    if (!hasElevatedPrivileges) {
      machineForm.closest('.card').classList.add('hidden');
    }

    machineForm.reset();
    if (machineFormTitle) machineFormTitle.textContent = 'Add New Machine';
    
    // Collapse creation fields
    toggleFormVisibility(true);
    createToggle.textContent = 'Create New Machine';
    createToggle.style.marginTop = '10px';
    machineNameInput.after(createToggle);

    saveMachineButton.textContent = 'Save Machine';
    cancelEditButton.classList.add('hidden');
    if (filterInstance) filterInstance.performFilter();
  };

  filterInstance = setupLiveFilter(machineNameInput, allMachines, {
    labelKey: 'machineName',
    onFilter: onFilterUpdate
  });

  // Ensure validation and button states are updated when metadata fields change
  yearInput.addEventListener('input', () => filterInstance.performFilter());
  mfgInput.addEventListener('input', () => filterInstance.performFilter());

  async function refresh() {
    try {
      const data = await PB_API.getMachines();
      allMachines.length = 0;
      allMachines.push(...data);
      filterInstance.performFilter();
      resetForm();
    } catch (err) {
      console.error('Failed to load machine registry:', err);
    }
  }

  machineForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = machineNameInput.value.trim();
    const id = editingIdInput.value ? Number(editingIdInput.value) : null;
    if (!name) return;

    // Machines are master records; changing them usually requires admin verification
    if (!await requireAdmin(`Enter Admin Password to ${id ? 'update' : 'create'} machine "${name}":`)) {
      return;
    }

    const payload = { 
      machineName: name,
      year: yearInput.value ? parseInt(yearInput.value, 10) : null,
      manufacturer: mfgInput.value.trim() || null
    };

    try {
      if (id) {
        await PB_API.updateMachine(id, payload); 
      } else {
        await PB_API.createMachine(payload);
      }
      await refresh();
    } catch (err) {
      showAlert('Failed to save machine: ' + err.message);
    }
  });

  async function deleteMachine(id) {
    if (!await requireAdmin(`Enter Admin Password to confirm deletion of the machine:`)) return;
    try {
      await PB_API.deleteMachine(id);
      await refresh();
    } catch (error) {
      showAlert(`Error deleting machine: ${error.message}`);
    }
  }

  cancelEditButton.addEventListener('click', resetForm);

  await refresh();
}