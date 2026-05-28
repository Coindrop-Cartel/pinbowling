import { PB_API } from './api.js';
import { BowlingEngine } from './engine.js';
import { getActiveEventId, renderPreview, applyScoreFormatting, formatNumber, printMachineScores } from './utils.js';
import { initTournamentSelector } from './tournamentSelector.js';

export async function initConfigPage() {
  const frameSelect = document.getElementById('frame-number');
  const form = document.getElementById('frame-form');
  const submitBtn = form.querySelector('button[type="submit"]');
  const framesTable = document.getElementById('frames-table');
  const listEmpty = document.getElementById('list-empty');
  let editingMachineId = null;
  const printMachinesBtn = document.getElementById('print-machines-btn');

  const score10Input = document.getElementById('value-10');
  const score1Input = document.getElementById('value-1');
  const previewValues = document.getElementById('preview-values');
  let masterMachines = [];
  let eventTargets = [];
  let currentSuggestedMachines = [];

  for (let i = 1; i <= 10; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = i;
    frameSelect.appendChild(option);
  }

  if (printMachinesBtn) {
    printMachinesBtn.addEventListener('click', async () => {
      const eventId = getActiveEventId();
      if (!eventId) return alert('Select an event first.');
      printMachineScores(eventTargets);
    });
  }

  const markDirty = () => { if (frameSelect.value) submitBtn.disabled = false; };

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

  function updateMachineSelect(filterText = '') {
    const select = document.getElementById('machine-select');
    if (!select) return;
    
    const filter = filterText.toLowerCase();
    select.innerHTML = '<option value="">-- Choose machine --</option>';
    
    currentSuggestedMachines.forEach(m => {
      if (m.machine_name.toLowerCase().includes(filter)) {
        const opt = document.createElement('option');
        opt.value = m.machine_name;
        opt.textContent = m.machine_name;
        if (m.machine_name === filterText) opt.selected = true;
        select.appendChild(opt);
      }
    });
  }

  score10Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues, BowlingEngine));
  score1Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues, BowlingEngine));

  document.getElementById('machine-name').addEventListener('input', (e) => {
    updateMachineSelect(e.target.value);
    markDirty();
  });

  machineSelect.addEventListener('change', () => {
    if (machineSelect.value) {
      document.getElementById('machine-name').value = machineSelect.value;
      updateMachineSelect(machineSelect.value);
      markDirty();
    }
  });

  score10Input.addEventListener('input', markDirty);
  score1Input.addEventListener('input', markDirty);

  frameSelect.addEventListener('change', () => {
    const selectedFrameNumber = Number(frameSelect.value);
    if (!selectedFrameNumber) { resetForm(); return; }

    const existingFrame = eventTargets.find((m) => m.frame_number === selectedFrameNumber);
    if (existingFrame) {
      editingMachineId = existingFrame.id;
      document.getElementById('machine-name').value = existingFrame.machine_name;
      score10Input.value = existingFrame.values[10] ? formatNumber(existingFrame.values[10]) : '';
      score1Input.value = existingFrame.values[1] ? formatNumber(existingFrame.values[1]) : '';
    } else {
      editingMachineId = null;
      document.getElementById('machine-name').value = '';
      score10Input.value = '';
      score1Input.value = '';
    }
    updateMachineSelect(document.getElementById('machine-name').value);
    renderPreview(score10Input, score1Input, previewValues, BowlingEngine);
    submitBtn.disabled = true;
  });

  async function render() {
    const eventId = getActiveEventId();
    const tbody = framesTable.querySelector('tbody');
    tbody.innerHTML = '';

    if (!eventId || eventTargets.length === 0) {
      framesTable.classList.add('hidden');
      listEmpty.classList.remove('hidden');
      listEmpty.textContent = eventId ? 'No frames configured for this event.' : 'Select a league and event to manage target scores.';
      return;
    }

    framesTable.classList.remove('hidden');
    listEmpty.classList.add('hidden');

    eventTargets.forEach((frame) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${frame.frame_number}</td>
        <td>${frame.machine_name}</td>
        <td><div class="score-list">${Object.entries(frame.values)
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([key, value]) => `<div>${key}: ${formatNumber(value)}</div>`)
          .join('')}</div></td>
        <td><button type="button" class="edit-button" data-id="${frame.id}">Edit</button></td>
      `;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.edit-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const frame = eventTargets.find(item => item.id === Number(btn.dataset.id));
        if (!frame) return;
        editingMachineId = frame.id;
        frameSelect.value = String(frame.frame_number);
        document.getElementById('machine-name').value = frame.machine_name;
        score10Input.value = frame.values[10] ? formatNumber(frame.values[10]) : '';
        score1Input.value = frame.values[1] ? formatNumber(frame.values[1]) : '';
        updateMachineSelect(frame.machine_name);
        renderPreview(score10Input, score1Input, previewValues, BowlingEngine);
        window.scrollTo(0, 0);
      });
    });
  }

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

    currentSuggestedMachines = locationId ? await PB_API.getLocationMachines(locationId) : masterMachines;
    currentSuggestedMachines.sort((a, b) => a.machine_name.localeCompare(b.machine_name));
    updateMachineSelect(document.getElementById('machine-name').value);

    eventTargets = eventId ? await PB_API.getTargetScores(eventId) : [];
    await render();
  };

  function resetForm() {
    editingMachineId = null;
    form.reset();
    submitBtn.disabled = true;
    updateMachineSelect('');
    renderPreview(score10Input, score1Input, previewValues, BowlingEngine);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const frame_number = Number(frameSelect.value);
    const machine_name = document.getElementById('machine-name').value.trim();
    const score10 = Number(score10Input.value.replace(/\D/g, ''));
    const score1 = Number(score1Input.value.replace(/\D/g, ''));
    const eventId = getActiveEventId();

    if (!frame_number || !machine_name || (!score10 && !score1) || !eventId) return;

    const values = BowlingEngine.buildFrameValues(score10, score1);
    if (window.PB_ADMIN_PASSWORD) {
      const confirmation = prompt(`Enter Admin Password to save changes for Frame ${frame_number}:`);
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
      frame_number, 
      values 
    });
    await refresh();
    resetForm();
  });

  await initTournamentSelector(refresh);
  await refresh();
}