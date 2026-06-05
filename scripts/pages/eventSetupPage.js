import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { getActiveEventId, getActiveLeagueId, renderPreview, applyScoreFormatting, formatNumber, renderThresholdGrid } from '@scripts/utils.js';
import { createSearchableSelect, initReadOnlyTournamentDisplay, createExpandableRow, setupSortableList } from '@ui/selectors.js';
import { showPrompt, showAlert } from '@ui/dialogs.js';
import { printMachineScores } from '@ui/printing.js';
import { requireAdmin, isManagementAuthorized } from '@services/auth.js';
import {navigateTo} from '@scripts/utils.js';
import { ROUTES } from '@scripts/routes.js';

export async function initEventSetupPage() {
  // Verify authorization before initializing the page logic
  const [authorized, initialLeagues] = await Promise.all([
    isManagementAuthorized(),
    PB_API.getLeagues()
  ]);

  if (!authorized) {
    showAlert('Unauthorized: Management access is required to view the setup page.', 'Access Denied');
    navigateTo(ROUTES.HOME);
    return;
  }

  const configCard = document.getElementById('config-card');
  const orderInput = document.getElementById('order-number');
  const displayOrder = document.getElementById('display-order');
  const form = document.getElementById('round-form');
  const submitBtn = document.getElementById('save-round-btn');
  const roundsList = document.getElementById('rounds-list');
  const reorderActions = document.getElementById('reorder-actions');
  const listEmpty = document.getElementById('list-empty');

  // Apply standardized button sizes
  if (submitBtn) submitBtn.classList.add('btn-mgmt');
  document.getElementById('add-target-btn')?.classList.add('btn-mgmt');
  document.getElementById('done-setup-btn')?.classList.add('btn-mgmt');
  document.getElementById('save-order-btn')?.classList.add('btn-mgmt');
  document.getElementById('cancel-order-btn')?.classList.add('btn-mgmt');

  let editingMachineId = null;
  let expandedTargetId = null;
  let isListDirty = false;
  let originalEventTargets = [];
  const printMachinesBtn = document.getElementById('print-machines-btn');
  let machineSearch;

  const btnEasy = document.getElementById('fill-easy');
  const btnMed = document.getElementById('fill-med');
  const btnHard = document.getElementById('fill-hard');
  const btnFlat = document.getElementById('scaling-flat');
  const btnCurved = document.getElementById('scaling-curved');
  let currentScaling = 'curved'; // Default state

  let selectedMachineTargets = null;

  const score10Input = document.getElementById('value-10');
  const score1Input = document.getElementById('value-1');
  const labelHigh = document.querySelector('label[for="value-10"]');
  const labelLow = document.querySelector('label[for="value-1"]');

  const previewValues = document.getElementById('preview-values');
  let masterMachines = [];
  let eventTargets = [];
  let currentSuggestedMachines = [];

  let Engine = getScoringEngine();

  if (printMachinesBtn) {
    printMachinesBtn.addEventListener('click', async () => {
      const eventId = getActiveEventId();
      if (!eventId) return alert('Select an event first.');
      const leagues = await PB_API.getLeagues();
      const league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
      printMachineScores(eventTargets, league?.scoringFormat || 'bowling');
    });
  }

  const doneBtn = document.getElementById('done-setup-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      navigateTo(ROUTES.LEAGUES(getActiveLeagueId()));
    });
  }

  const isCurrentTargetLast = () => {
    const currentOrder = Number(orderInput.value);
    const maxOrder = eventTargets.length > 0 ? Math.max(...eventTargets.map(t => t.orderNumber)) : 0;
    return currentOrder >= maxOrder;
  };

  document.getElementById('add-target-btn').addEventListener('click', () => {
    resetForm();
    const nextOrder = eventTargets.length > 0 ? Math.max(...eventTargets.map(t => t.orderNumber)) + 1 : 1;
    orderInput.value = nextOrder;
    displayOrder.textContent = nextOrder;
    updatePreviewAndDirty();
    configCard.classList.remove('hidden');
    configCard.scrollIntoView({ behavior: 'smooth' });
  });

  const markDirty = () => { if (orderInput.value) submitBtn.disabled = false; };

  const updatePreviewAndDirty = () => {
    renderPreview(score10Input, score1Input, previewValues, Engine, isCurrentTargetLast(), currentScaling);
    markDirty();
  };

  document.getElementById('cancel-order-btn').onclick = () => {
    // Rollback to the snapshot we took on page load or last successful save
    eventTargets = JSON.parse(JSON.stringify(originalEventTargets));
    isListDirty = false;
    render();
    reorderActions.classList.add('hidden');
  };

  if (score10Input) applyScoreFormatting(score10Input);
  if (score1Input) applyScoreFormatting(score1Input);

  // Helps mobile users: tapping the field selects all text so they can 
  // immediately see the full suggestion list or replace the value.
  document.getElementById('machine-name').addEventListener('focus', (e) => e.target.select());

  // Ensure the machine-select dropdown exists to provide the dual-field interaction.
  let machineSelect = document.getElementById('machine-select');
  if (!machineSelect) {
    const nameInput = document.getElementById('machine-name');
    machineSelect = document.createElement('select');
    machineSelect.id = 'machine-select';
    nameInput.after(machineSelect);
  }

  const updateQuickFillState = (machineName) => {
    const match = currentSuggestedMachines.find(m => m.machineName === machineName);
    selectedMachineTargets = match ? { easy: match.targetEasy, med: match.targetMed, hard: match.targetHard } : null;
    
    btnEasy.disabled = !selectedMachineTargets?.easy;
    btnMed.disabled = !selectedMachineTargets?.med;
    btnHard.disabled = !selectedMachineTargets?.hard;
  };

  machineSearch = createSearchableSelect(document.getElementById('machine-name'), machineSelect, currentSuggestedMachines, {
    valueKey: 'machineName',
    labelKey: 'machineName',
    placeholder: '-- Choose machine --',
    onSelect: (val) => {
      updateQuickFillState(val);
      markDirty();
    }
  });

  [btnEasy, btnMed, btnHard].forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.id.replace('fill-', '');
      const val = selectedMachineTargets?.[type];
      if (val) {
        score10Input.value = formatNumber(val);
        updatePreviewAndDirty();
      }
    });
  });

  if (btnFlat && btnCurved) {
    window.updateScalingUI = () => {
      btnFlat.classList.toggle('btn-standard', currentScaling === 'flat');
      btnFlat.classList.toggle('secondary', currentScaling !== 'flat');
      btnCurved.classList.toggle('btn-standard', currentScaling === 'curved');
      btnCurved.classList.toggle('secondary', currentScaling !== 'curved');
    };

    btnFlat.addEventListener('click', () => {
      currentScaling = 'flat';
      window.updateScalingUI();
      updatePreviewAndDirty();
    });

    btnCurved.addEventListener('click', () => {
      currentScaling = 'curved';
      window.updateScalingUI();
      updatePreviewAndDirty();
    });

    window.updateScalingUI();
  }

  score10Input.addEventListener('input', updatePreviewAndDirty);
  score1Input.addEventListener('input', updatePreviewAndDirty);
  document.getElementById('machine-name').addEventListener('input', markDirty);

  // Initialize dragging listeners on the container once
  setupSortableList(roundsList, {
    itemSelector: '.round-item',
    onReorder: (ids) => {
      // Map the new DOM order back to our data array
      const newOrder = ids.map(id => eventTargets.find(t => String(t.id) === String(id)));
      eventTargets = newOrder.map((target, idx) => ({ ...target, orderNumber: idx + 1 }));
      checkListDirty();
      render();
    }
  });

  // Helper to compare current state with original for "Dirty" check
  function checkListDirty() {
    // Create a normalized version of the objects to avoid false positives from key ordering
    const normalize = (arr) => arr.map(t => ({
      machineId: Number(t.machineId),
      orderNumber: Number(t.orderNumber),
      v1: t.value1,
      v2: t.value2
    }));

    const current = JSON.stringify(normalize(eventTargets));
    const original = JSON.stringify(normalize(originalEventTargets));
    isListDirty = current !== original;
    
    reorderActions.classList.toggle('hidden', !isListDirty);
    const saveBtn = document.getElementById('save-order-btn');
    if (saveBtn) saveBtn.disabled = !isListDirty;
  }

  async function render() {
    const eventId = getActiveEventId();
    roundsList.innerHTML = '';

    if (!eventId) {
      roundsList.classList.add('hidden');
      reorderActions.classList.add('hidden');
      listEmpty.classList.remove('hidden');
      listEmpty.textContent = 'Select a league and event to manage target scores.';
      return;
    }

    // Show management actions even if the list is empty (for new setups)
    listEmpty.classList.toggle('hidden', eventTargets.length > 0);
    listEmpty.textContent = 'No targets defined for this event yet.';
    roundsList.classList.toggle('hidden', eventTargets.length === 0);
    checkListDirty(); // Ensure buttons show/hide based on current state

    eventTargets.sort((a, b) => a.orderNumber - b.orderNumber);
    const maxOrder = eventTargets.length > 0 ? Math.max(...eventTargets.map(t => t.orderNumber)) : 0;

    eventTargets.forEach((round) => {
      const bonusHtml = Engine.getBonusTargetHtml(round, round.orderNumber === maxOrder, formatNumber);
      const isExpanded = expandedTargetId === round.id;

      // Detect scaling from data to sync inline toggles
      const gapStart = (round.values[2] || 0) - (round.values[1] || 0);
      const gapEnd = (round.values[10] || 0) - (round.values[9] || 0);
      const scaling = (gapEnd > gapStart * 1.5) ? 'curved' : 'flat';

      const row = createExpandableRow(roundsList, {
        id: round.id,
        className: 'round-item',
        draggable: true,
        isExpanded,
        onMoveUp: round.orderNumber > 1 ? () => {
          const idx = eventTargets.indexOf(round);
          if (idx > 0) {
            [eventTargets[idx], eventTargets[idx - 1]] = [eventTargets[idx - 1], eventTargets[idx]];
            eventTargets.forEach((t, i) => t.orderNumber = i + 1);
            checkListDirty();
            render();
          }
        } : null,
        onMoveDown: round.orderNumber < maxOrder ? () => {
          const idx = eventTargets.indexOf(round);
          if (idx < eventTargets.length - 1) {
            [eventTargets[idx], eventTargets[idx + 1]] = [eventTargets[idx + 1], eventTargets[idx]];
            eventTargets.forEach((t, i) => t.orderNumber = i + 1);
            checkListDirty();
            render();
          }
        } : null,
        headerHtml: `
        <div style="display: flex; align-items: center; gap: 12px; width: 100%; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 250px;">
            <div class="drag-handle" style="cursor: grab; color: var(--pb-primary); opacity: 0.5; padding: 0 4px; font-size: 1.2rem;">☰</div>
            <span style="font-weight: bold; min-width: 30px; text-align: center;">${round.orderNumber}</span>
            <span style="flex: 1; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" class="machine-name-display">${round.machineName}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-left: auto;" onclick="event.stopPropagation()">
            <div style="display: flex; align-items: center; gap: 6px; min-width: 140px; flex: 1;">
              <label style="font-size: 0.7rem; color: var(--pb-primary); opacity: 0.8; font-weight: bold; white-space: nowrap;">${Engine.getValue1Label()}:</label>
              <input type="text" class="score10-input" value="${formatNumber(round.value1)}" style="flex: 1; width: 100%; padding: 3px; font-size: 0.85rem; border: 1px solid #ddd; border-radius: 3px;">
            </div>
            <div style="display: flex; align-items: center; gap: 6px; min-width: 140px; flex: 1;">
              <label style="font-size: 0.7rem; color: var(--pb-primary); opacity: 0.8; font-weight: bold; white-space: nowrap;">${Engine.getValue2Label()}:</label>
              <input type="text" class="score1-input" value="${formatNumber(round.value2)}" style="flex: 1; width: 100%; padding: 3px; font-size: 0.85rem; border: 1px solid #ddd; border-radius: 3px;">
            </div>
          </div>
        </div>
        `,
        contentHtml: `
          <div class="form-row">
            <label style="font-size: 0.85rem;">Change Machine</label>
            <input type="text" class="row-machine-search" placeholder="Filter machines..." style="width: 100%; box-sizing: border-box; margin-bottom: 5px;">
            <select class="row-machine-select" style="width: 100%; box-sizing: border-box;"></select>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; gap: 6px;">
               <button type="button" class="qfill secondary btn-row" data-type="easy">Easy</button>
               <button type="button" class="qfill secondary btn-row" data-type="med">Med</button>
               <button type="button" class="qfill secondary btn-row" data-type="hard">Hard</button>
            </div>
            <div style="display: flex; gap: 4px;">
               <button type="button" class="scaling-btn ${scaling === 'flat' ? 'btn-standard' : 'secondary'} btn-row" data-scale="flat">Flat</button>
               <button type="button" class="scaling-btn ${scaling === 'curved' ? 'btn-standard' : 'secondary'} btn-row" data-scale="curved">Curved</button>
            </div>
          </div>
          <div class="preview-values-container">${renderThresholdGrid(Engine.filterThresholds(round.values), formatNumber, Engine, round.value1, round.value2)}</div>
          ${bonusHtml ? `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ddd;">${bonusHtml}</div>` : ''}
        `,
        onHeaderClick: (e) => {
          expandedTargetId = (expandedTargetId === round.id) ? null : round.id;
          render();
        }
      });

      const s10 = row.querySelector('.score10-input');
      const s1 = row.querySelector('.score1-input');
      applyScoreFormatting(s10);
      applyScoreFormatting(s1);

      const updateValues = () => {
        round.value1 = Number(s10.value.replace(/\D/g, '')) || 0;
        round.value2 = Number(s1.value.replace(/\D/g, '')) || 0;

        const currentScaling = row.querySelector('.scaling-btn.btn-standard').dataset.scale;
        round.values = Engine.buildRoundValues(round.value1, round.value2, currentScaling);
        
        const container = row.querySelector('.preview-values-container');
        if (container) container.innerHTML = renderThresholdGrid(Engine.filterThresholds(round.values), formatNumber, Engine, round.value1, round.value2);
        
        checkListDirty();
      };

      s10.oninput = updateValues;
      s1.oninput = updateValues;

      if (isExpanded) {
        const mSearch = row.querySelector('.row-machine-search');
        const mSelect = row.querySelector('.row-machine-select');
        
        const mSearchInstance = createSearchableSelect(mSearch, mSelect, currentSuggestedMachines, {
          valueKey: 'machineId',
          labelKey: 'machineName',
          placeholder: '-- Select Machine --',
          onSelect: (val) => {
            const match = currentSuggestedMachines.find(m => String(m.machineId) === String(val));
            if (match) {
              round.machineName = match.machineName;
              round.machineId = Number(match.machineId);
              updateValues();
              checkListDirty();
              render();
            }
          }
        });

        // Ensure dropdown populates immediately on focus
        mSearch.value = '';
        mSearchInstance.updateOptions('');
        mSearch.addEventListener('focus', (e) => e.target.select());

        row.querySelectorAll('.qfill').forEach(btn => {
          btn.onclick = () => {
            const type = btn.dataset.type;
            const match = currentSuggestedMachines.find(m => String(m.id) === String(round.machineId));
            const val = match ? match['target' + type.charAt(0).toUpperCase() + type.slice(1)] : null;
            if (val) {
              s10.value = formatNumber(val);
              s1.value = formatNumber(Math.floor(val / 10));
              updateValues();
              checkListDirty();
            }
          };
        });

        row.querySelectorAll('.scaling-btn').forEach(btn => {
          btn.onclick = () => {
            row.querySelectorAll('.scaling-btn').forEach(b => b.classList.replace('btn-standard', 'secondary'));
            btn.classList.replace('secondary', 'btn-standard');
            updateValues();
            checkListDirty();
          }
        });
      }
    });
  }

  document.getElementById('save-order-btn').addEventListener('click', async () => {
    const rows = Array.from(roundsList.querySelectorAll('.round-item'));
    const eventId = Number(getActiveEventId());

    // Prepare payload, converting temporary IDs to null for the API to treat as new inserts
    const payload = eventTargets.map((round, index) => {
      return {
        id: String(round.id).startsWith('temp_') ? null : round.id,
        eventId: eventId,
        machineId: round.machineId,
        orderNumber: index + 1,
        value1: round.value1,
        value2: round.value2,
        values: round.values
      };
    });

    try {
      await PB_API.saveTargetScore(payload);
      isListDirty = false;
      originalEventTargets = JSON.parse(JSON.stringify(eventTargets));
      expandedTargetId = null;
      await refresh();
    } catch (err) {
      alert('Failed to save changes: ' + err.message);
    }
  });

  const refresh = async () => {
    const eventId = getActiveEventId();
    
    // Batch the initial global data fetches
    const [machines, leaguesData] = await Promise.all([
      PB_API.getMachines(),
      PB_API.getLeagues()
    ]);

    masterMachines = machines;
    const leagueId = getActiveLeagueId();
    const league = leaguesData.find(l => String(l.id) === String(leagueId));
    const eventMatch = league?.events?.find(e => String(e.id) === String(eventId));

    const format = eventMatch?.scoringFormat || league?.scoringFormat;
    Engine = getScoringEngine(format);

    // Update UI labels based on the scoring engine
    if (labelHigh) labelHigh.textContent = Engine.getValue1Label();
    if (labelLow) labelLow.textContent = Engine.getValue2Label();

    const defaults = Engine.getInitialValues();
    score10Input.placeholder = `e.g. ${formatNumber(defaults.value1)}`;
    score1Input.placeholder = `e.g. ${formatNumber(defaults.value2)}`;

    const locationId = eventMatch?.locationId;

    const [suggestedData, targets] = await Promise.all([
      locationId ? PB_API.getLocationMachines(locationId) : Promise.resolve(masterMachines),
      eventId ? PB_API.getTargetScores(eventId) : Promise.resolve([])
    ]);

    // Update the array in-place so the searchable select component sees the new data
    currentSuggestedMachines.length = 0;
    currentSuggestedMachines.push(...suggestedData);
    currentSuggestedMachines.sort((a, b) => a.machineName.localeCompare(b.machineName));
    
    // Clear search text on fresh load/navigation
    document.getElementById('machine-name').value = '';
    machineSearch.updateOptions('');
    updateQuickFillState('');

    isListDirty = false;
    eventTargets = targets;
    originalEventTargets = JSON.parse(JSON.stringify(eventTargets));
    await render();
  };

  function resetForm() {
    editingMachineId = null;
    configCard.classList.add('hidden');
    form.reset();
    submitBtn.disabled = true;
    machineSearch.updateOptions('');
    updateQuickFillState('');

    const defaults = Engine.getInitialValues();
    score10Input.value = formatNumber(defaults.value1);
    score1Input.value = formatNumber(defaults.value2);
    score10Input.placeholder = `e.g. ${formatNumber(defaults.value1)}`;
    score1Input.placeholder = `e.g. ${formatNumber(defaults.value2)}`;

    currentScaling = 'curved';
    if (btnFlat && btnCurved) {
      btnFlat.classList.replace('btn-standard', 'secondary');
      btnCurved.classList.replace('secondary', 'btn-standard');
    }

    renderPreview(score10Input, score1Input, previewValues, Engine, isCurrentTargetLast(), currentScaling);
  }
  document.getElementById('cancel-config-btn').onclick = resetForm;

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const orderNumber = Number(orderInput.value);
    const machineName = document.getElementById('machine-name').value.trim();
    const score10 = Number(score10Input.value.replace(/\D/g, ''));
    const score1 = Number(score1Input.value.replace(/\D/g, ''));
    const eventId = getActiveEventId();

    if (!orderNumber || !machineName || (!score10 && !score1) || !eventId) return;

    if (!await requireAdmin(`Enter Admin Password to save target for "${machineName}":`)) {
      return;
    }

    const values = Engine.buildRoundValues(score10, score1, currentScaling);

    // --- Resolving Master Machines ---
    // If the machine name entered doesn't exist in the master list, 
    // we create it first to obtain a global 'machine_id'.
    let masterMachine = masterMachines.find(m => m.machineName.toLowerCase() === machineName.toLowerCase());
    if (!masterMachine) {
        masterMachine = await PB_API.createMachine(machineName);
        masterMachines.push(masterMachine);
    }

    const payload = { 
      id: editingMachineId,
      eventId: Number(eventId), 
      machineId: masterMachine.id, 
      orderNumber, 
      value1: score10,
      value2: score1,
      values 
    };

    try {
      await PB_API.saveTargetScore(payload);
      await refresh();
      resetForm();
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Failed to save: ${err.message}`);
    }
  });

  // Pass the already-fetched leagues to the display component to avoid a redundant fetch
  await initReadOnlyTournamentDisplay(document.querySelector('.tournament-selector-container'), refresh, initialLeagues);
}