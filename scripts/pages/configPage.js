import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { getActiveEventId, getActiveLeagueId, renderPreview, applyScoreFormatting, formatNumber } from '@scripts/utils.js';
import { createSearchableSelect, showPrompt, initReadOnlyTournamentDisplay } from '@ui/uiComponents.js';
import { printMachineScores } from '@ui/printing.js';
import { requireAdmin } from '@services/auth.js';

export async function initConfigPage() {
  const configCard = document.getElementById('config-card');
  const orderInput = document.getElementById('order-number');
  const displayOrder = document.getElementById('display-order');
  const form = document.getElementById('round-form');
  const submitBtn = document.getElementById('save-round-btn');
  const roundsTable = document.getElementById('rounds-table');
  const reorderActions = document.getElementById('reorder-actions');
  const listEmpty = document.getElementById('list-empty');
  let editingMachineId = null;
  const printMachinesBtn = document.getElementById('print-machines-btn');
  let machineSearch;

  const btnEasy = document.getElementById('fill-easy');
  const btnMed = document.getElementById('fill-med');
  const btnHard = document.getElementById('fill-hard');
  let selectedMachineTargets = null;

  const score10Input = document.getElementById('value-10');
  const score1Input = document.getElementById('value-1');
  const previewValues = document.getElementById('preview-values');
  let masterMachines = [];
  let eventTargets = [];
  let currentSuggestedMachines = [];

  let Engine = getScoringEngine('bowling');

  if (printMachinesBtn) {
    printMachinesBtn.addEventListener('click', async () => {
      const eventId = getActiveEventId();
      if (!eventId) return alert('Select an event first.');
      const leagues = await PB_API.getLeagues();
      const league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
      printMachineScores(eventTargets, league?.scoring_format || 'bowling');
    });
  }

  const doneBtn = document.getElementById('done-setup-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      const leagueId = getActiveLeagueId();
      window.location.href = leagueId ? `leagues.php?leagueId=${leagueId}` : 'leagues.php';
    });
  }

  const isCurrentTargetLast = () => {
    const currentOrder = Number(orderInput.value);
    const maxOrder = eventTargets.length > 0 ? Math.max(...eventTargets.map(t => t.order_number)) : 0;
    return currentOrder >= maxOrder;
  };

  document.getElementById('add-target-btn').addEventListener('click', () => {
    resetForm();
    const nextOrder = eventTargets.length > 0 ? Math.max(...eventTargets.map(t => t.order_number)) + 1 : 1;
    orderInput.value = nextOrder;
    displayOrder.textContent = nextOrder;
    configCard.classList.remove('hidden');
    configCard.scrollIntoView({ behavior: 'smooth' });
  });

  const markDirty = () => { if (orderInput.value) submitBtn.disabled = false; };

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
    const match = currentSuggestedMachines.find(m => m.machine_name === machineName);
    selectedMachineTargets = match ? { easy: match.target_easy, med: match.target_med, hard: match.target_hard } : null;
    
    btnEasy.disabled = !selectedMachineTargets?.easy;
    btnMed.disabled = !selectedMachineTargets?.med;
    btnHard.disabled = !selectedMachineTargets?.hard;
  };

  machineSearch = createSearchableSelect(document.getElementById('machine-name'), machineSelect, currentSuggestedMachines, {
    valueKey: 'machine_name',
    labelKey: 'machine_name',
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
        renderPreview(score10Input, score1Input, previewValues, Engine, isCurrentTargetLast());
        markDirty();
      }
    });
  });

  score10Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues, Engine, isCurrentTargetLast()));
  score1Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues, Engine, isCurrentTargetLast()));

  document.getElementById('machine-name').addEventListener('input', (e) => {
    markDirty();
  });

  score10Input.addEventListener('input', markDirty);
  score1Input.addEventListener('input', markDirty);

  async function render() {
    const eventId = getActiveEventId();
    const tbody = roundsTable.querySelector('tbody');
    tbody.innerHTML = '';

    if (!eventId) {
      roundsTable.classList.add('hidden');
      reorderActions.classList.add('hidden');
      listEmpty.classList.remove('hidden');
      listEmpty.textContent = 'Select a league and event to manage target scores.';
      return;
    }

    // Show management actions even if the list is empty (for new setups)
    listEmpty.classList.toggle('hidden', eventTargets.length > 0);
    listEmpty.textContent = 'No targets defined for this event yet.';
    roundsTable.classList.toggle('hidden', eventTargets.length === 0);
    reorderActions.classList.toggle('hidden', eventTargets.length === 0);

    eventTargets.sort((a, b) => a.order_number - b.order_number);
    const maxOrder = eventTargets.length > 0 ? Math.max(...eventTargets.map(t => t.order_number)) : 0;

    eventTargets.forEach((round) => {
      const bonusHtml = Engine.getBonusTargetHtml(round, round.order_number === maxOrder, formatNumber);

      const row = document.createElement('tr');
      row.draggable = true;
      row.dataset.id = round.id;
      row.innerHTML = `
        <td class="drag-handle" style="cursor: grab; color: #888;">☰</td>
        <td>${round.order_number}</td>
        <td>${round.machine_name}</td>
        <td class="targets-cell" style="cursor: pointer;">
          <div class="targets-summary">10: <strong>${formatNumber(round.values[10])}</strong> <small>▾</small></div>
          <div class="score-list hidden" style="margin-top: 5px; font-size: 0.9em;">
            ${Object.entries(round.values)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([key, value]) => `<div>${key}: ${formatNumber(value)}</div>`)
              .join('')}
            ${bonusHtml}
          </div>
        </td>
        <td><button type="button" class="edit-button" data-id="${round.id}">Edit</button></td>
      `;
      row.querySelector('.targets-cell').addEventListener('click', () => {
        row.querySelector('.score-list').classList.toggle('hidden');
      });
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.edit-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const round = eventTargets.find(item => item.id === Number(btn.dataset.id));
        if (!round) return;
        editingMachineId = round.id;
        orderInput.value = round.order_number;
        displayOrder.textContent = round.order_number;
        document.getElementById('machine-name').value = round.machine_name;
        score10Input.value = round.values[10] ? formatNumber(round.values[10]) : '';
        score1Input.value = round.values[1] ? formatNumber(round.values[1]) : '';
        machineSearch.updateOptions(round.machine_name);
        updateQuickFillState(round.machine_name);
        renderPreview(score10Input, score1Input, previewValues, Engine, isCurrentTargetLast());
        configCard.classList.remove('hidden');
        window.scrollTo(0, 0);
      });
    });

    setupDragging(tbody);
  }

  function setupDragging(tbody) {
    let draggedRow = null;
    tbody.addEventListener('dragstart', (e) => {
      draggedRow = e.target.closest('tr');
      e.target.style.opacity = '0.5';
    });
    tbody.addEventListener('dragend', (e) => {
      e.target.style.opacity = '';
    });
    tbody.addEventListener('dragover', (e) => {
      e.preventDefault();
      const overRow = e.target.closest('tr');
      if (overRow && overRow !== draggedRow) {
        const rect = overRow.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) {
          tbody.insertBefore(draggedRow, overRow);
        } else {
          tbody.insertBefore(draggedRow, overRow.nextSibling);
        }
      }
    });
  }

  document.getElementById('save-order-btn').addEventListener('click', async () => {
    const rows = Array.from(roundsTable.querySelectorAll('tbody tr'));
    const updates = rows.map((row, index) => ({
      id: Number(row.dataset.id),
      order_number: index + 1
    }));

    try {
      await PB_API.bulkUpdateTargetOrder(updates);
      await refresh();
    } catch (err) {
      alert('Failed to update order: ' + err.message);
    }
  });

  const refresh = async () => {
    const eventId = getActiveEventId();
    masterMachines = await PB_API.getMachines();
    const leaguesData = await PB_API.getLeagues();
    const league = leaguesData.find(l => String(l.id) === String(getActiveLeagueId()));
    Engine = getScoringEngine(league?.scoring_format || 'bowling');

    // Find the location associated with the current event to filter machine suggestions
    let locationId = null;
    if (eventId) {
      for (const l of leaguesData) {
        const eventMatch = (l.events || []).find(e => String(e.id) === String(eventId));
        if (eventMatch) {
          locationId = eventMatch.location_id;
          break;
        }
      }
    }

    const newData = locationId ? await PB_API.getLocationMachines(locationId) : masterMachines;
    // Update the array in-place so the searchable select component sees the new data
    currentSuggestedMachines.length = 0;
    currentSuggestedMachines.push(...newData);
    currentSuggestedMachines.sort((a, b) => a.machine_name.localeCompare(b.machine_name));
    
    // Clear search text on fresh load/navigation
    document.getElementById('machine-name').value = '';
    machineSearch.updateOptions('');
    updateQuickFillState('');

    eventTargets = eventId ? await PB_API.getTargetScores(eventId) : [];
    await render();
  };

  function resetForm() {
    editingMachineId = null;
    configCard.classList.add('hidden');
    form.reset();
    submitBtn.disabled = true;
    machineSearch.updateOptions('');
    updateQuickFillState('');
    renderPreview(score10Input, score1Input, previewValues, Engine);
  }
  document.getElementById('cancel-config-btn').onclick = resetForm;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const order_number = Number(orderInput.value);
    const machine_name = document.getElementById('machine-name').value.trim();
    const score10 = Number(score10Input.value.replace(/\D/g, ''));
    const score1 = Number(score1Input.value.replace(/\D/g, ''));
    const eventId = getActiveEventId();

    if (!order_number || !machine_name || (!score10 && !score1) || !eventId) return;

    const values = Engine.buildRoundValues(score10, score1);
    if (!await requireAdmin(`Enter Admin Password to save changes for Round ${order_number}:`)) {
      return;
    }

    // --- Resolving Master Machines ---
    // If the machine name entered doesn't exist in the master list, 
    // we create it first to obtain a global 'machine_id'.
    let masterMachine = masterMachines.find(m => m.machine_name.toLowerCase() === machine_name.toLowerCase());
    if (!masterMachine) {
        masterMachine = await PB_API.createMachine(machine_name);
        masterMachines.push(masterMachine);
    }

    const payload = { 
      id: editingMachineId,
      event_id: Number(eventId), 
      machine_id: masterMachine.id, 
      order_number, 
      values 
    };
    console.log('Saving Target Score Payload:', payload);

    try {
      await PB_API.saveTargetScore(payload);
      await refresh();
      resetForm();
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Failed to save: ${err.message}`);
    }
  });

  await initReadOnlyTournamentDisplay(document.querySelector('.tournament-selector-container'), refresh);
}