import { PB_API } from '@services/api.js';
import { createExpandableRow, setupLiveFilter } from '@ui/selectors.js';
import { showConfirm, showAlert } from '@ui/dialogs.js';
import { requireAdmin } from '@services/auth.js';
import { ROUTES } from '@scripts/routes.js';

/**
 * Logic for managing pinball machines and their target score values.
 * @module pages/machines
 */

/**
 * Initializes the Machines page: loads machines, binds CRUD controls, and renders the machine list.
 * @async
 * @returns {Promise<void>}
 */
export async function initMachinesPage() {
  // Batch initial user check and data fetch
  const [currentUser, machinesData] = await Promise.all([
    PB_API.getCurrentUser(),
    PB_API.getMachines()
  ]);

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
  const machineList = document.getElementById('machines-list');
  const emptyNotice = document.getElementById('machines-list-empty');

  // Populate Year dropdown from 1947 (Humpty Dumpty / Flipper Era) to current year
  if (yearInput) {
    const currentYear = new Date().getFullYear();
    let yearHtml = '<option value="">Year (Optional)</option>';
    for (let y = currentYear; y >= 1947; y--) {
      yearHtml += `<option value="${y}">${y}</option>`;
    }
    yearInput.innerHTML = yearHtml;
  }

  let allMachines = [];
  let filterInstance = null;

  // Setup "Create Machine" toggle
  const metadataRow = document.getElementById('machine-metadata-row');
  const actionsRow = saveMachineButton.closest('.form-actions');

  if (saveMachineButton) saveMachineButton.classList.add('btn-mgmt');

  const createToggle = document.createElement('button');
  createToggle.type = 'button';
  createToggle.className = 'secondary btn-mgmt mt-10';
  createToggle.textContent = 'Create New Machine';
  machineNameInput.after(createToggle);

  if (!hasElevatedPrivileges) {
    createToggle.classList.add('hidden');
    machineForm.closest('.card').classList.add('hidden');
  }

  createToggle.onclick = () => {
    const isHidden = metadataRow.classList.contains('hidden');
    if (isHidden) {
      toggleFormVisibility(false);
      createToggle.textContent = 'Cancel';
      createToggle.classList.replace('mt-10', 'mt-0');
      actionsRow.appendChild(createToggle);
    } else {
      resetForm();
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
        const info = [m.manufacturer, m.year].filter(Boolean).join(', ');
        const headerHtml = `
          <div class="header-bar">
            <div class="flex-1">
              <span class="font-bold">${m.machineName}</span>
              ${info ? `<br><small class="machine-info">${info}</small>` : ''}
            </div>
            <div class="action-buttons">
              <button type="button" class="edit-mach-btn secondary btn-row">Edit</button>
              ${isAdmin ? `<button type="button" class="delete-mach-btn btn-row">Delete</button>` : ''}
            </div>
          </div>
        `;

        const contentHtml = '<div class="content-muted italic">Select Edit to update machine metadata.</div>';

        const row = createExpandableRow(machineList, {
          id: m.id,
          className: 'machine-registry-item',
          headerHtml,
          contentHtml,
          isExpanded: false
        });

        row.querySelector('.edit-mach-btn').onclick = (e) => { e.stopPropagation(); editMachine(m); };
        const deleteBtn = row.querySelector('.delete-mach-btn');
        if (deleteBtn) deleteBtn.onclick = async (e) => {
          e.stopPropagation();
          if (await showConfirm(`Are you sure you want to remove "${m.machineName}"? This will remove it from all locations and events.`, 'Delete Machine')) {
            await deleteMachine(m.id);
          }
        };
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

    // Expand fields for editing
    toggleFormVisibility(false);
    createToggle.textContent = 'Cancel';
    createToggle.classList.replace('mt-10', 'mt-0');
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
    createToggle.classList.replace('mt-0', 'mt-10');
    machineNameInput.after(createToggle);

    saveMachineButton.textContent = 'Save Machine';
    if (filterInstance) filterInstance.performFilter();
  };

  filterInstance = setupLiveFilter(machineNameInput, allMachines, {
    labelKey: 'machineName',
    onFilter: onFilterUpdate
  });

  // Ensure validation and button states are updated when metadata fields change
  yearInput.addEventListener('change', () => filterInstance.performFilter());
  mfgInput.addEventListener('input', () => filterInstance.performFilter());

  async function refresh(data = null) {
    try {
      const machines = data || await PB_API.getMachines();
      allMachines.length = 0;
      allMachines.push(...machines);
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

  // Initial render with batched data
  refresh(machinesData);
}