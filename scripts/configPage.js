import { PB_API } from './api.js';
import { BowlingEngine } from './engine.js';
import { getActiveEventId, renderPreview, applyScoreFormatting, formatNumber, printMachineScores } from './utils.js';
import { createSearchableSelect } from './uiComponents.js';
import { initReadOnlyTournamentDisplay } from './uiComponents.js';

export async function initConfigPage() {
  const configCard = document.getElementById('config-card');
  const orderInput = document.getElementById('order-number');
  const displayOrder = document.getElementById('display-order');
  const form = document.getElementById('frame-form');
  const submitBtn = form.querySelector('button[type="submit"]');
  const framesTable = document.getElementById('frames-table');
  const reorderActions = document.getElementById('reorder-actions');
  const listEmpty = document.getElementById('list-empty');
  let editingMachineId = null;
  const printMachinesBtn = document.getElementById('print-machines-btn');
  let machineSearch;

  const score10Input = document.getElementById('value-10');
  const score1Input = document.getElementById('value-1');
  const previewValues = document.getElementById('preview-values');
  let masterMachines = [];
  let eventTargets = [];
  let currentSuggestedMachines = [];

  if (printMachinesBtn) {
    printMachinesBtn.addEventListener('click', async () => {
      const eventId = getActiveEventId();
      if (!eventId) return alert('Select an event first.');
      printMachineScores(eventTargets);
    });
  }

  const doneBtn = document.getElementById('done-setup-btn');
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      window.location.href = 'leagues.php';
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

  applyScoreFormatting(score10Input);
  applyScoreFormatting(score1Input);

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

  machineSearch = createSearchableSelect(document.getElementById('machine-name'), machineSelect, currentSuggestedMachines, {
    valueKey: 'machine_name',
    labelKey: 'machine_name',
    placeholder: '-- Choose machine --',
    onSelect: () => markDirty()
  });

  score10Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues, BowlingEngine, isCurrentTargetLast()));
  score1Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues, BowlingEngine, isCurrentTargetLast()));

  document.getElementById('machine-name').addEventListener('input', (e) => {
    markDirty();
  });

  score10Input.addEventListener('input', markDirty);
  score1Input.addEventListener('input', markDirty);

  async function render() {
    const eventId = getActiveEventId();
    const tbody = framesTable.querySelector('tbody');
    tbody.innerHTML = '';

    if (!eventId || eventTargets.length === 0) {
      framesTable.classList.add('hidden');
      reorderActions.classList.add('hidden');
      listEmpty.classList.remove('hidden');
      listEmpty.textContent = eventId ? 'No targets defined for this event.' : 'Select a league and event to manage target scores.';
      return;
    }

    framesTable.classList.remove('hidden');
    reorderActions.classList.remove('hidden');
    listEmpty.classList.add('hidden');

    eventTargets.sort((a, b) => a.order_number - b.order_number);

    eventTargets.forEach((frame) => {
      const row = document.createElement('tr');
      row.draggable = true;
      row.dataset.id = frame.id;
      row.innerHTML = `
        <td class="drag-handle" style="cursor: grab; color: #888;">☰</td>
        <td>${frame.order_number}</td>
        <td>${frame.machine_name}</td>
        <td class="targets-cell" style="cursor: pointer;">
          <div class="targets-summary">10: <strong>${formatNumber(frame.values[10])}</strong> <small>▾</small></div>
          <div class="score-list hidden" style="margin-top: 5px; font-size: 0.9em;">
            ${Object.entries(frame.values)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([key, value]) => `<div>${key}: ${formatNumber(value)}</div>`)
              .join('')}
          </div>
        </td>
        <td><button type="button" class="edit-button" data-id="${frame.id}">Edit</button></td>
      `;
      row.querySelector('.targets-cell').addEventListener('click', () => {
        row.querySelector('.score-list').classList.toggle('hidden');
      });
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.edit-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const frame = eventTargets.find(item => item.id === Number(btn.dataset.id));
        if (!frame) return;
        editingMachineId = frame.id;
        orderInput.value = frame.order_number;
        displayOrder.textContent = frame.order_number;
        document.getElementById('machine-name').value = frame.machine_name;
        score10Input.value = frame.values[10] ? formatNumber(frame.values[10]) : '';
        score1Input.value = frame.values[1] ? formatNumber(frame.values[1]) : '';
        machineSearch.updateOptions(frame.machine_name);
        renderPreview(score10Input, score1Input, previewValues, BowlingEngine, isCurrentTargetLast());
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
    const rows = Array.from(framesTable.querySelectorAll('tbody tr'));
    const newOrder = rows.map((row, index) => ({
      id: Number(row.dataset.id),
      order_number: index + 1
    }));

    try {
      await Promise.all(newOrder.map(item => PB_API.saveTargetScore({ id: item.id, order_number: item.order_number })));
      await refresh();
    } catch (err) {
      alert('Failed to update order: ' + err.message);
    }
  });

  const refresh = async () => {
    const eventId = getActiveEventId();
    masterMachines = await PB_API.getMachines();

    // Find the location associated with the current event to filter machine suggestions
    let locationId = null;
    if (eventId) {
      const leagues = await PB_API.getLeagues();
      for (const league of leagues) {
        const event = (league.events || []).find(e => String(e.id) === String(eventId));
        if (event) {
          locationId = event.location_id;
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

    eventTargets = eventId ? await PB_API.getTargetScores(eventId) : [];
    await render();
  };

  function resetForm() {
    editingMachineId = null;
    configCard.classList.add('hidden');
    form.reset();
    submitBtn.disabled = true;
    machineSearch.updateOptions('');
    renderPreview(score10Input, score1Input, previewValues, BowlingEngine);
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

    const values = BowlingEngine.buildFrameValues(score10, score1);
    if (window.PB_ADMIN_PASSWORD) {
      const confirmation = prompt(`Enter Admin Password to save changes for Target ${order_number}:`);
      if (confirmation === null) { // User cancelled
        alert('Admin action cancelled.');
        return;
      } else if (confirmation !== window.PB_ADMIN_PASSWORD) { // Incorrect password
        alert('Incorrect Admin Password.');
        return;
      }
    }

    // --- Resolving Master Machines ---
    // If the machine name entered doesn't exist in the master list, 
    // we create it first to obtain a global 'machine_id'.
    let masterMachine = masterMachines.find(m => m.machine_name.toLowerCase() === machine_name.toLowerCase());
    if (!masterMachine) {
        masterMachine = await PB_API.createMachine(machine_name);
        masterMachines.push(masterMachine);
    }

    await PB_API.saveTargetScore({ 
      id: editingMachineId,
      event_id: Number(eventId), 
      machine_id: masterMachine.id, 
      order_number, 
      values 
    });
    await refresh();
    resetForm();
  });

  await initReadOnlyTournamentDisplay(document.querySelector('.tournament-selector-container'), refresh);
  await refresh();
}