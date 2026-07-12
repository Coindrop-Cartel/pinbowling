import { PB_API } from '@services/api.js';
import { createExpandableRow, setupLiveFilter } from '@ui/selectors.js';
import { showConfirm, showAlert } from '@ui/dialogs.js';
import { requireAdmin } from '@services/auth.js';
import { escapeHTML, formatNumber, applyScoreFormatting } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';

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
    PB_API.auth.me(),
    PB_API.machines.getAll()
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

  const baselineScoresRow = document.getElementById('machine-baseline-scores-row');
  const baselineFormatSelect = document.getElementById('baseline-format');
  const baselineEasyInput = document.getElementById('baseline-easy');
  const baselineMedInput = document.getElementById('baseline-med');
  const baselineHardInput = document.getElementById('baseline-hard');

  let editingScores = {}; // Keyed by format: { targetEasy, targetMed, targetHard }

  // Apply real-time formatting to baseline score inputs
  if (baselineEasyInput) applyScoreFormatting(baselineEasyInput);
  if (baselineMedInput) applyScoreFormatting(baselineMedInput);
  if (baselineHardInput) applyScoreFormatting(baselineHardInput);

  /**
   * Updates the labels, placeholders, and values for the baseline scores based on the selected format.
   * @param {string} fmt 
   */
  const updateBaselineFieldsForFormat = (fmt) => {
    const eng = getScoringEngine(fmt);
    const defs = eng.getInitialValues();
    const v1Label = eng.getValue1Label();
    const fmtScores = editingScores[fmt] || {};

    if (baselineEasyInput) {
      baselineEasyInput.closest('.form-row').querySelector('label').textContent = `${v1Label}: Easy`;
      baselineEasyInput.placeholder = `e.g. ${formatNumber(defs.value1)}`;
      baselineEasyInput.value = fmtScores.targetEasy != null && fmtScores.targetEasy !== 0 ? formatNumber(fmtScores.targetEasy) : '';
      applyScoreFormatting(baselineEasyInput);
    }
    if (baselineMedInput) {
      baselineMedInput.closest('.form-row').querySelector('label').textContent = `${v1Label}: Medium`;
      baselineMedInput.placeholder = `e.g. ${formatNumber(defs.value1 * 2)}`;
      baselineMedInput.value = fmtScores.targetMed != null && fmtScores.targetMed !== 0 ? formatNumber(fmtScores.targetMed) : '';
      applyScoreFormatting(baselineMedInput);
    }
    if (baselineHardInput) {
      baselineHardInput.closest('.form-row').querySelector('label').textContent = `${v1Label}: Hard`;
      baselineHardInput.placeholder = `e.g. ${formatNumber(defs.value1 * 3)}`;
      baselineHardInput.value = fmtScores.targetHard != null && fmtScores.targetHard !== 0 ? formatNumber(fmtScores.targetHard) : '';
      applyScoreFormatting(baselineHardInput);
    }
  };

  if (baselineFormatSelect) {
    baselineFormatSelect.addEventListener('change', (e) => {
      const oldFmt = baselineFormatSelect.dataset.prevFormat || 'bowling';
      editingScores[oldFmt] = {
        targetEasy: Number(baselineEasyInput.value.replace(/\D/g, '')) || 0,
        targetMed: Number(baselineMedInput.value.replace(/\D/g, '')) || 0,
        targetHard: Number(baselineHardInput.value.replace(/\D/g, '')) || 0,
      };

      const newFmt = e.target.value;
      baselineFormatSelect.dataset.prevFormat = newFmt;
      updateBaselineFieldsForFormat(newFmt);
    });
  }

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
  let expandedMachineId = null;

  const metadataRow = document.getElementById('machine-metadata-row');
  const actionsRow = saveMachineButton?.closest('.form-actions');

  if (saveMachineButton) saveMachineButton.classList.add('btn-mgmt');

  const createToggle = document.createElement('button');
  createToggle.type = 'button';
  createToggle.className = 'secondary btn-mgmt mt-10';
  createToggle.textContent = 'Create New Machine';
  machineNameInput.after(createToggle);

  if (!hasElevatedPrivileges) {
    if (createToggle) createToggle.classList.add('hidden');
    const formCard = machineForm?.closest('.card');
    if (formCard) formCard.classList.add('hidden');
  }

  createToggle.onclick = () => {
    const isHidden = metadataRow.classList.contains('hidden');
    if (isHidden) {
      toggleFormVisibility(false);
      createToggle.textContent = 'Cancel';
      createToggle.classList.replace('mt-10', 'mt-0');
      actionsRow.appendChild(createToggle);
      
      // Initialize format details
      editingScores = {};
      if (baselineFormatSelect) {
        baselineFormatSelect.value = 'bowling';
        baselineFormatSelect.dataset.prevFormat = 'bowling';
        updateBaselineFieldsForFormat('bowling');
      }
    } else {
      resetForm();
    }
  };

  function toggleFormVisibility(hide) {
    metadataRow.classList.toggle('hidden', hide);
    if (baselineScoresRow) baselineScoresRow.classList.toggle('hidden', hide);
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
              <span class="font-bold">${escapeHTML(m.machineName)}</span>
              ${info ? `<br><small class="machine-info">${escapeHTML(info)}</small>` : ''}
            </div>
          </div>
        `;

        const scoreFormats = Object.keys(m.scores || {});
        const scoreLines = scoreFormats.length > 0
          ? scoreFormats.map(f => {
              const s = m.scores[f];
              return `<small>${f.charAt(0).toUpperCase() + f.slice(1)}: E: ${formatNumber(s.targetEasy)} | M: ${formatNumber(s.targetMed)} | H: ${formatNumber(s.targetHard)}</small>`;
            }).join('<br>')
          : `<small class="text-muted">No baseline target scores set.</small>`;

        const contentHtml = `
          <div class="content-muted-col">
            <div class="mb-10">
              <strong>Baseline Target Scores:</strong><br>
              ${scoreLines}
            </div>
            <div class="small-action-buttons">
              ${hasElevatedPrivileges ? `<button type="button" class="edit-mach-btn secondary btn-row">Edit</button>` : ''}
              ${isAdmin ? `<button type="button" class="delete-mach-btn btn-row">Delete</button>` : ''}
            </div>
          </div>
        `;

        const isExpanded = String(m.id) === String(expandedMachineId);

        const row = createExpandableRow(machineList, {
          id: m.id,
          className: 'machine-registry-item',
          headerHtml,
          contentHtml,
          isExpanded,
          onHeaderClick: () => {
            expandedMachineId = (expandedMachineId === m.id) ? null : m.id;
            filterInstance.performFilter();
          }
        });

        const editBtn = row.querySelector('.edit-mach-btn');
        if (editBtn) editBtn.onclick = (e) => { e.stopPropagation(); editMachine(m); };
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

    // Load existing scores and initialize the baseline fields
    editingScores = m.scores && !Array.isArray(m.scores) ? JSON.parse(JSON.stringify(m.scores)) : {};
    if (baselineFormatSelect) {
      baselineFormatSelect.value = 'bowling';
      baselineFormatSelect.dataset.prevFormat = 'bowling';
      updateBaselineFieldsForFormat('bowling');
    }

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

    editingScores = {};
    if (baselineEasyInput) baselineEasyInput.value = '';
    if (baselineMedInput) baselineMedInput.value = '';
    if (baselineHardInput) baselineHardInput.value = '';

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
      const machines = data || await PB_API.machines.getAll();
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

    // Save current baseline inputs to local cache first
    if (baselineFormatSelect) {
      const currentFmt = baselineFormatSelect.value;
      editingScores[currentFmt] = {
        targetEasy: Number(baselineEasyInput.value.replace(/\D/g, '')) || 0,
        targetMed: Number(baselineMedInput.value.replace(/\D/g, '')) || 0,
        targetHard: Number(baselineHardInput.value.replace(/\D/g, '')) || 0,
      };
    }

    const payload = { 
      machineName: name,
      year: yearInput.value ? parseInt(yearInput.value, 10) : null,
      manufacturer: mfgInput.value.trim() || null,
      scores: editingScores
    };

    saveMachineButton.disabled = true;
    saveMachineButton.textContent = 'Saving...';

    try {
      if (id) {
        await PB_API.machines.update(id, payload); 
      } else {
        await PB_API.machines.create(payload);
      }
      await refresh();
    } catch (err) {
      showAlert('Failed to save machine: ' + err.message);
    } finally {
      saveMachineButton.disabled = false;
      saveMachineButton.textContent = id ? 'Update Machine' : 'Save Machine';
    }
  });

  async function deleteMachine(id) {
    if (!await requireAdmin(`Enter Admin Password to confirm deletion of the machine:`)) return;
    try {
      await PB_API.machines.delete(id);
      await refresh();
    } catch (error) {
      showAlert(`Error deleting machine: ${error.message}`);
    }
  }

  // Initial render with batched data
  refresh(machinesData);
}