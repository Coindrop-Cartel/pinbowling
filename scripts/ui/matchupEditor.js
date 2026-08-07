import { showDialog, showAlert } from '@ui/dialogs.js';
import { PB_API } from '@services/api.js';
import { escapeHTML } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { getTargetScoreForDifficulty } from '@services/targetResolver.js';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Compute target_scores values from a baseline and multiplier.
 */
function computeScoreValues(value1, value2) {
  const values = {};
  for (let rank = 1; rank <= 10; rank++) {
    values[rank] = Math.round(value1 * Math.pow(value2, rank - 1));
  }
  return values;
}

/**
 * Open a modal to edit machine assignments and difficulty for a matchup.
 *
 * @param {Object} options
 * @param {number} options.matchupId - eventMatchupId or teamEventMatchupId
 * @param {number} options.eventId
 * @param {boolean} options.isTeam - team mode vs individual
 * @param {Function} options.onSaved - called after successful save
 */
export async function openMatchupEditor({ matchupId, eventId, isTeam, onSaved, format }) {
  const [entriesData, machineData, eventTargets] = await Promise.all([
    isTeam ? PB_API.teamMatchups.get(eventId, matchupId) : PB_API.matchups.get(eventId, matchupId),
    PB_API.machines.getAll(),
    PB_API.machines.getTargets(eventId, null, null, matchupId),
  ]);

  const entries = entriesData?.entries || [];
  if (entries.length === 0) {
    showAlert('No entries found for this matchup.', 'Edit Matchup');
    return;
  }

  const allMachines = Array.isArray(machineData) ? machineData : [];
  if (allMachines.length === 0) {
    showAlert('No machines found in the system.', 'Edit Matchup');
    return;
  }

  const targetsByKey = {};
  (eventTargets || []).forEach(t => {
    targetsByKey[`${t.machineId}-${t.orderNumber}`] = t;
  });

  let currentEntries = entries.map(e => ({
    id: e.id,
    orderNumber: e.orderNumber ?? e.order_number ?? 0,
    machineId: e.machineId ?? e.machine_id ?? null,
    machineName: e.machineName ?? e.machine_name ?? '',
    difficulty: 'medium',
  }));

  currentEntries.sort((a, b) => a.orderNumber - b.orderNumber);

  const engine = getScoringEngine(format);
  const diffDefaults = engine?.getFormatDefaults?.() || { easy: 25000000, medium: 50000000, hard: 100000000 };
  const easyMedMid = (Number(diffDefaults.easy) + Number(diffDefaults.medium)) / 2;
  const medHardMid = (Number(diffDefaults.medium) + Number(diffDefaults.hard)) / 2;

  for (const entry of currentEntries) {
    const key = `${entry.machineId}-${entry.orderNumber}`;
    const ts = targetsByKey[key];
    if (ts) {
      const v1 = Number(ts.value1 ?? diffDefaults.medium);
      if (v1 <= easyMedMid) entry.difficulty = 'easy';
      else if (v1 >= medHardMid) entry.difficulty = 'hard';
      else entry.difficulty = 'medium';
    }
  }

  const container = document.createElement('div');
  container.style.cssText = 'max-height: 60vh; overflow-y: auto; margin-top: 12px;';

  function render() {
    container.innerHTML = currentEntries.map((entry, idx) => {
      const machineOptions = allMachines.map(m =>
        `<option value="${m.id}" ${Number(m.id) === Number(entry.machineId) ? 'selected' : ''}>${escapeHTML(m.machineName || m.name || 'Machine #' + m.id)}</option>`
      ).join('');

      const diffButtons = DIFFICULTIES.map(d =>
        `<button type="button" class="btn-row btn-small diff-btn ${entry.difficulty === d ? 'primary' : 'secondary'}" data-idx="${idx}" data-diff="${d}" style="padding: 2px 10px;">${d.charAt(0).toUpperCase() + d.slice(1)}</button>`
      ).join('');

      const swapUp = idx > 0
        ? `<button type="button" class="btn-row btn-small secondary swap-btn" data-idx="${idx}" data-dir="up" style="padding: 2px 8px;" title="Swap with previous">▲</button>`
        : '';
      const swapDown = idx < currentEntries.length - 1
        ? `<button type="button" class="btn-row btn-small secondary swap-btn" data-idx="${idx}" data-dir="down" style="padding: 2px 8px;" title="Swap with next">▼</button>`
        : '';

      return `
        <div class="entry-row" style="padding: 8px; margin-bottom: 8px; background: #f9f9f9; border-radius: 4px; border: 1px solid #e0e0e0;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 600; min-width: 30px; color: #555;">#${entry.orderNumber}</span>
            <select class="input-standard machine-select" data-idx="${idx}" style="flex: 1; padding: 4px 6px;">${machineOptions}</select>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
            <div class="diff-group" style="display: flex; gap: 4px;">${diffButtons}</div>
            <div style="display: flex; gap: 4px; margin-left: auto;">${swapUp}${swapDown}</div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.machine-select').forEach(sel => {
      sel.onchange = () => {
        const idx = Number(sel.dataset.idx);
        currentEntries[idx].machineId = Number(sel.value);
      };
    });

    container.querySelectorAll('.diff-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        const diff = btn.dataset.diff;
        currentEntries[idx].difficulty = diff;
        render();
      };
    });

    container.querySelectorAll('.swap-btn').forEach(btn => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.idx);
        const dir = btn.dataset.dir;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= currentEntries.length) return;
        const tempMachineId = currentEntries[idx].machineId;
        const tempDifficulty = currentEntries[idx].difficulty;
        currentEntries[idx].machineId = currentEntries[swapIdx].machineId;
        currentEntries[idx].difficulty = currentEntries[swapIdx].difficulty;
        currentEntries[swapIdx].machineId = tempMachineId;
        currentEntries[swapIdx].difficulty = tempDifficulty;
        render();
      };
    });
  }

  render();

  const result = await showDialog({
    title: 'Edit Matchup Layout',
    message: 'Change machines and target difficulty per round.',
    confirmText: 'Save Changes',
    cancelText: 'Cancel',
    customElement: container,
    onReady: ({ confirmBtn }) => {
      confirmBtn.textContent = 'Saving...';
      confirmBtn.disabled = true;
      setTimeout(() => {
        confirmBtn.textContent = 'Save Changes';
        confirmBtn.disabled = false;
      }, 100);
    }
  });

  if (result !== true) return;

  try {
    const editData = currentEntries.map(e => ({
      eventMatchupId: matchupId,
      orderNumber: e.orderNumber,
      machineId: e.machineId,
      machine_id: e.machineId,
      order_number: e.orderNumber,
    }));

    const teamEditData = currentEntries.map(e => ({
      teamEventMatchupId: matchupId,
      orderNumber: e.orderNumber,
      machineId: e.machineId,
      order_number: e.orderNumber,
      machine_id: e.machineId,
    }));

    if (isTeam) {
      await PB_API.teamMatchups.save(teamEditData);
    } else {
      await PB_API.matchups.save(editData);
    }

    const targetUpdates = [];
    const engine = getScoringEngine(format);
    const multiplier = Number(engine?.getFormatDefaults?.().multiplier ?? 1.5);
    for (const entry of currentEntries) {
      const machine = allMachines.find(m => Number(m.id) === Number(entry.machineId));

      // Resolve the baseline for the matchup's actual scoring format + difficulty,
      // using per-machine data when available and carrying the engine's default base.
      const targetVal = getTargetScoreForDifficulty(machine, format, entry.difficulty);

      const values = computeScoreValues(targetVal, multiplier);
      targetUpdates.push({
        eventId,
        machineId: entry.machineId,
        orderNumber: entry.orderNumber,
        value1: targetVal,
        value2: multiplier,
        values,
      });
    }

    if (targetUpdates.length > 0) {
      await PB_API.machines.saveTarget(targetUpdates, matchupId);
    }

    if (onSaved) onSaved();
    showAlert('Matchup layout updated successfully.', 'Saved');
  } catch (err) {
    console.error(err);
    showAlert(err.message || 'Failed to save changes.', 'Error');
  }
}
