import { PB_API } from '@services/api.js';
import { isManagementAuthorized, requireAdmin } from '@services/auth.js';
import { showAlert } from '@ui/dialogs.js';
import { loadPage, getActiveEventId, getActiveLeagueId, renderPreview, formatNumber, applyScoreFormatting, parseFormattedNumber, renderThresholdGrid, escapeHTML } from '@scripts/utils.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { FormatBranding } from '@services/scoringFormatBranding.js';
import { printMachineScores } from '@ui/printing.js';
import { createSearchableSelect, setupSortableList, createExpandableRow, initReadOnlyTournamentDisplay } from '@ui/selectors.js';
import { normalizeTargets } from '@services/normalizer.js';
import { detectScalingFromValues } from '@scripts/utils.js';
import { wireTargetRow } from '@scripts/renderers/targetRowRenderer.js';

/**
 * Logic for configuring events within a league (dates, machines, target scores).
 * @module pages/eventSetup
 */

/**
 * Initializes the Event Setup page: loads league/event data and binds UI controls.
 * @async
 * @returns {Promise<void>}
 */
export async function initEventSetupPage() {
  // Verify authorization before initializing the page logic
  const [authorized, initialLeagues] = await Promise.all([
    isManagementAuthorized(),
    PB_API.leagues.getAll()
  ]);

  if (!authorized) {
    showAlert('Unauthorized: Management access is required to view the setup page.', 'Access Denied');
    loadPage(ROUTE_PATHS.HOME());
    return;
  }

  // Guard: If we are no longer on the Event Setup page, abort initialization
  if (!document.getElementById('round-form')) return;

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
  let activeFormat = ScoringFormats.DEFAULT;
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
  let eventMatch = null;
  let league = null;

  let Engine = getScoringEngine();

  if (printMachinesBtn) {
    printMachinesBtn.addEventListener('click', async () => {
      const eventId = getActiveEventId();
      if (!eventId) return showAlert('Select an event first.');
      const leagues = await PB_API.leagues.getAll();
      const league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
      printMachineScores(eventTargets, ScoringFormats.resolve(league?.scoringFormat));
    });
  }

  const doneBtn = document.getElementById('done-setup-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      loadPage(ROUTE_PATHS.LEAGUES(getActiveLeagueId()));
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

  const getMachineTargets = (machineName, machineId, format) => {
    const locMachine = currentSuggestedMachines.find(m => 
      (machineId && String(m.machineId || m.id) === String(machineId)) || 
      (machineName && m.machineName === machineName)
    );
    
    if (locMachine) {
      const locScores = locMachine.scores?.[format];
      if (locScores && (locScores.targetEasy > 0 || locScores.targetMed > 0 || locScores.targetHard > 0)) {
        return {
          easy: locScores.targetEasy,
          med: locScores.targetMed,
          hard: locScores.targetHard
        };
      }
      if ((!locMachine.scores || locMachine.format === format) && (locMachine.targetEasy > 0 || locMachine.targetMed > 0 || locMachine.targetHard > 0)) {
        return {
          easy: locMachine.targetEasy,
          med: locMachine.targetMed,
          hard: locMachine.targetHard
        };
      }
    }

    const masterMach = masterMachines.find(mm => 
      (machineId && String(mm.id) === String(machineId)) || 
      (machineName && mm.machineName === machineName)
    );
    
    if (masterMach) {
      const masterScores = masterMach.scores?.[format];
      if (masterScores) {
        return {
          easy: masterScores.targetEasy,
          med: masterScores.targetMed,
          hard: masterScores.targetHard
        };
      }
      if ((!masterMach.scores || masterMach.format === format) && (masterMach.targetEasy > 0 || masterMach.targetMed > 0 || masterMach.targetHard > 0)) {
        return {
          easy: masterMach.targetEasy,
          med: masterMach.targetMed,
          hard: masterMach.targetHard
        };
      }
    }

    if (format === 'baseball') {
      return {
        easy: 5000000,
        med: 7500000,
        hard: 10000000
      };
    }

    return null;
  };

  const updateQuickFillState = (machineName) => {
    const format = ScoringFormats.resolve(eventMatch?.scoringFormat || league?.scoringFormat);
    selectedMachineTargets = getMachineTargets(machineName, null, format);
    
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
    const updateScalingUI = () => {
      btnFlat.classList.toggle('btn-standard', currentScaling === 'flat');
      btnFlat.classList.toggle('secondary', currentScaling !== 'flat');
      btnCurved.classList.toggle('btn-standard', currentScaling === 'curved');
      btnCurved.classList.toggle('secondary', currentScaling !== 'curved');
    };

    btnFlat.addEventListener('click', () => {
      currentScaling = 'flat';
      updateScalingUI();
      updatePreviewAndDirty();
    });

    btnCurved.addEventListener('click', () => {
      currentScaling = 'curved';
      updateScalingUI();
      updatePreviewAndDirty();
    });

    updateScalingUI();
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
      let bonusHtml = '';
      if (round.orderNumber === maxOrder) {
        const bonusTargets = Engine.getBonusTargets?.(round);
        if (bonusTargets && (bonusTargets.t1 || bonusTargets.t2)) {
          bonusHtml = `
            <span>Target 1: ${formatNumber(bonusTargets.t1)}</span>
            <span>Target 2: ${formatNumber(bonusTargets.t2)}</span>
          `;
        }
      }
      const isExpanded = expandedTargetId === round.id;
      const branding = FormatBranding.get(activeFormat);


      // Detect scaling from data to sync inline toggles
      const scaling = detectScalingFromValues(round.values);

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
        <div class="flex gap-12 w-100 wrap">
          <div class="flex gap-12 flex-1 min-250 align-center">
            <div class="drag-handle">☰</div>
            <span class="round-number">${round.orderNumber}</span>
            <span class="machine-name-display">${escapeHTML(round.machineName)}</span>
          </div>
          <div class="flex gap-12 wrap justify-end" onclick="event.stopPropagation()">
            <div class="flex gap-6 min-140 flex-1 align-center">
              <label class="small value-label">${branding.value1Label}:</label>
              <input type="text" class="score10-input score-input" value="${formatNumber(round.value1)}">
            </div>
            <div class="flex gap-6 min-140 flex-1 align-center">
              <label class="small value-label">${branding.value2Label}:</label>
              <input type="text" class="score1-input score-input" value="${formatNumber(round.value2)}">
            </div>
          </div>
        </div>
        `,
        contentHtml: `
          <div class="form-row">
            <label class="small">Change Machine</label>
            <input type="text" class="row-machine-search" placeholder="Filter machines...">
            <select class="row-machine-select"></select>
          </div>
          <div class="flex-between mb-10">
            <div class="flex gap-6">
               <button type="button" class="qfill secondary btn-row" data-type="easy">Easy</button>
               <button type="button" class="qfill secondary btn-row" data-type="med">Med</button>
               <button type="button" class="qfill secondary btn-row" data-type="hard">Hard</button>
            </div>
            <div class="flex gap-4">
               <button type="button" class="scaling-btn ${scaling === 'flat' ? 'btn-standard' : 'secondary'} btn-row" data-scale="flat">Flat</button>
               <button type="button" class="scaling-btn ${scaling === 'curved' ? 'btn-standard' : 'secondary'} btn-row" data-scale="curved">Curved</button>
            </div>
          </div>
          <div class="preview-values-container">${renderThresholdGrid(Engine.filterThresholds(round.values), formatNumber, Engine, round.value1, round.value2)}</div>
          ${bonusHtml ? `<div class="target-details">${bonusHtml}</div>` : ''}
        `,
        onHeaderClick: (e) => {
          expandedTargetId = (expandedTargetId === round.id) ? null : round.id;
          render();
        }
      });

      wireTargetRow(row, round, {
        engine: Engine,
        machines: currentSuggestedMachines,
        onUpdate: () => checkListDirty(),
        getMachineTargets: (machineId) => {
          const format = ScoringFormats.resolve(eventMatch?.scoringFormat || league?.scoringFormat);
          return getMachineTargets(null, machineId, format);
        },
        afterSelectMachine: () => render(),
        clearSearchOnFocus: true,
        focusSearchOnExpand: false
      });
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
      await PB_API.machines.saveTarget(payload);
      isListDirty = false;
      originalEventTargets = JSON.parse(JSON.stringify(eventTargets));
      expandedTargetId = null;
      await refresh();
    } catch (err) {
      showAlert('Failed to save changes: ' + err.message);
    }
  });

  const refresh = async () => {
    const eventId = getActiveEventId();
    
    // Batch the initial global data fetches
    const [machines, leaguesData] = await Promise.all([
      PB_API.machines.getAll(),
      PB_API.leagues.getAll()
    ]);

    masterMachines = machines;
    const leagueId = getActiveLeagueId();
    league = leaguesData.find(l => String(l.id) === String(leagueId));
    eventMatch = league?.events?.find(e => String(e.id) === String(eventId));

    const format = eventMatch?.scoringFormat || league?.scoringFormat;
    activeFormat = ScoringFormats.resolve(format);
    Engine = getScoringEngine(format);
    applyPreferredTheme(format);
    score1Input.dataset.allowDecimal = Engine.getValue2AllowsDecimal?.() === true ? 'true' : 'false';

    // Update UI labels based on the scoring format branding
    const branding = FormatBranding.get(activeFormat);
    if (labelHigh) labelHigh.textContent = branding.value1Label;
    if (labelLow) labelLow.textContent = branding.value2Label;

    const defaults = Engine.getInitialValues();
    score10Input.placeholder = `e.g. ${formatNumber(defaults.value1)}`;
    score1Input.placeholder = `e.g. ${formatNumber(defaults.value2)}`;

    const locationId = eventMatch?.locationId;

    const [suggestedData, targets] = await Promise.all([
      locationId ? PB_API.locations.getMachines(locationId) : Promise.resolve(masterMachines),
      eventId ? PB_API.machines.getTargets(eventId) : Promise.resolve([])
    ]);

    // Normalize targets and suggested machines into a consistent shape
    currentSuggestedMachines.length = 0;
    currentSuggestedMachines.push(...(suggestedData || []));
    currentSuggestedMachines.sort((a, b) => (a.machineName || '').localeCompare(b.machineName || ''));
    
    // Clear search text on fresh load/navigation
    document.getElementById('machine-name').value = '';
    machineSearch.updateOptions('');
    updateQuickFillState('');

    isListDirty = false;
    eventTargets = normalizeTargets(targets || []);
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
    const score10 = parseFormattedNumber(score10Input.value);
    const score1 = parseFormattedNumber(score1Input.value, Engine.getValue2AllowsDecimal?.() === true);
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
        masterMachine = await PB_API.machines.create({ machineName });
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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
      await PB_API.machines.saveTarget(payload);
      await refresh();
      resetForm();
    } catch (err) {
      console.error('Save failed:', err);
      showAlert(`Failed to save: ${err.message}`);
    } finally {
      submitBtn.textContent = 'Save';
    }
  });

  // Pass the already-fetched leagues to the display component to avoid a redundant fetch
  await initReadOnlyTournamentDisplay(document.querySelector('.tournament-selector-container'), refresh, initialLeagues);
}
