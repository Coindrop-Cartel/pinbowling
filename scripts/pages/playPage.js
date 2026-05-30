import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { formatNumber, applyScoreFormatting } from '@scripts/utils.js';
import { createSearchableSelect } from '@ui/uiComponents.js';

export async function initPlayPage() {
  const form = document.getElementById('quick-play-form');
  const locSelect = document.getElementById('qp-location');
  const generateBtn = document.getElementById('generate-qp-btn');
  
  const previewSection = document.getElementById('qp-preview-section');
  const framesList = document.getElementById('qp-frames-list');
  const finalizeBtn = document.getElementById('finalize-qp-btn');

  let generatedFrames = [];
  let locationsCache = [];
  let currentLocMachines = [];
  let expandedTempId = null; // Tracks which row is expanded for machine selection

  const locations = await PB_API.getLocations();
  locationsCache = locations;
  locations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = `${loc.name}${loc.city ? ` (${loc.city})` : ''}`;
    locSelect.appendChild(opt);
  });

  // Prepopulate Session Name when location changes if name is empty
  locSelect.addEventListener('change', () => {
    const nameInput = document.getElementById('qp-event-name');
    if (!nameInput.value.trim() && locSelect.value) {
      const loc = locationsCache.find(l => l.id === Number(locSelect.value));
      if (loc) {
        const date = new Date().toLocaleDateString();
        nameInput.value = `${loc.name} - ${date}`;
      }
    }
  });

  // Initialize dragging listeners on the container once
  setupDragging(framesList);

  form.onsubmit = (e) => {
    e.preventDefault();
    generatePreview();
  };

  function generatePreview() {
    const nameInput = document.getElementById('qp-event-name');
    const locId = Number(locSelect.value);

    // Fallback prepopulation if name is still empty
    if (!nameInput.value.trim()) {
      const location = locationsCache.find(l => l.id === locId);
      const date = new Date().toLocaleDateString();
      nameInput.value = `${location ? location.name : 'Quick Play'} - ${date}`;
    }

    const frameCount = Number(document.getElementById('qp-frames').value);
    const difficulty = document.getElementById('qp-difficulty').value;

    const location = locationsCache.find(l => l.id === locId);
    const locMachines = location?.machines || [];
    currentLocMachines = locMachines;
    
    if (locMachines.length === 0) {
      alert('This location has no machines configured.');
      return;
    }

    // Pick random machines
    const shuffled = [...locMachines].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, frameCount);
    while (selected.length < frameCount) {
      selected.push(locMachines[Math.floor(Math.random() * locMachines.length)]);
    }

    generatedFrames = selected.map((m, index) => ({
      machine_id: Number(m.machine_id),
      machine_name: m.machine_name,
      targets: {
        easy: m.target_easy,
        med: m.target_med,
        hard: m.target_hard
      },
      score10: m[`target_${difficulty}`] || 1000000,
      score1: Math.floor((m[`target_${difficulty}`] || 1000000) / 10),
      order: index + 1,
      tempId: Math.random().toString(36).substr(2, 9)
    }));

    renderPreview();
    previewSection.classList.remove('hidden');
    previewSection.scrollIntoView({ behavior: 'smooth' });
  }

  function renderPreview() {
    framesList.innerHTML = '';
    generatedFrames.forEach((frame, index) => {
      const row = document.createElement('div');
      row.className = 'frame-preview-item';
      row.draggable = true;
      row.dataset.tempId = frame.tempId;
      const isExpanded = expandedTempId === frame.tempId;

      row.style = "margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: #fff;";
      row.innerHTML = `
        <div class="frame-row-header" style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #f9f9f9; cursor: pointer;">
          <div class="drag-handle" style="cursor: grab; color: #888; padding: 0 4px; font-size: 1.2rem;">☰</div>
          <span style="font-weight: bold; min-width: 30px; text-align: center;">${frame.order}</span>
          <span style="flex: 1; font-weight: bold;" class="machine-name-display">${frame.machine_name}</span>
          <div style="display: flex; align-items: center; gap: 10px;" onclick="event.stopPropagation()">
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 0.7rem; color: #666;">10:</label>
              <input type="text" class="score10-input" value="${formatNumber(frame.score10)}" style="width: 85px; padding: 3px; font-size: 0.85rem;">
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 0.7rem; color: #666;">1:</label>
              <input type="text" class="score1-input" value="${formatNumber(frame.score1)}" style="width: 85px; padding: 3px; font-size: 0.85rem;">
            </div>
            <button type="button" class="row-save-btn secondary" style="padding: 3px 8px; font-size: 0.75rem;">Save</button>
          </div>
        </div>
        <div class="frame-expansion ${isExpanded ? '' : 'hidden'}" style="padding: 12px 15px; border-top: 1px solid #ddd;">
          <div class="form-row">
            <label style="font-size: 0.85rem;">Change Machine</label>
            <input type="text" class="row-machine-search" placeholder="Filter machines..." style="width: 100%; box-sizing: border-box; margin-bottom: 5px;">
            <select class="row-machine-select" style="width: 100%; box-sizing: border-box;"></select>
          </div>
          <div style="display: flex; gap: 6px;">
             <button type="button" class="qfill" data-type="easy" style="font-size: 0.75rem; padding: 2px 10px;">Easy</button>
             <button type="button" class="qfill" data-type="med" style="font-size: 0.75rem; padding: 2px 10px;">Med</button>
             <button type="button" class="qfill" data-type="hard" style="font-size: 0.75rem; padding: 2px 10px;">Hard</button>
          </div>
        </div>
      `;

      const s10 = row.querySelector('.score10-input');
      const s1 = row.querySelector('.score1-input');
      applyScoreFormatting(s10);
      applyScoreFormatting(s1);

      // Immediate data updates as user types
      s10.oninput = () => { frame.score10 = Number(s10.value.replace(/\D/g, '')) || 0; };
      s1.oninput = () => { frame.score1 = Number(s1.value.replace(/\D/g, '')) || 0; };

      // Expand on click
      row.querySelector('.frame-row-header').onclick = () => {
        expandedTempId = (expandedTempId === frame.tempId) ? null : frame.tempId;
        renderPreview();
      };

      row.querySelector('.row-save-btn').onclick = (e) => {
        e.stopPropagation();
        expandedTempId = null;
        // Update local state only. 
        // The database is updated in bulk after the 'Finalize' button is clicked.
        // If your code at line 274 was calling PB_API.saveTargetScore, remove it.
        renderPreview();
      };

      // Searchable Select initialization (only if expanded)
      if (isExpanded) {
        const mSearch = row.querySelector('.row-machine-search');
        const mSelect = row.querySelector('.row-machine-select');
        
        const mSearchInstance = createSearchableSelect(mSearch, mSelect, currentLocMachines, {
          valueKey: 'machine_id',
          labelKey: 'machine_name',
          placeholder: '-- Select Machine --',
          onSelect: (val) => {
            const match = currentLocMachines.find(m => String(m.machine_id) === String(val));
            if (match) {
              frame.machine_name = match.machine_name;
              frame.machine_id = Number(match.machine_id);
              frame.targets = { easy: match.target_easy, med: match.target_med, hard: match.target_hard };
              renderPreview(); 
            }
          }
        });

        // To prevent the blank dropdown, clear the search and force an update
        // so the full list of machines at this location is visible immediately.
        mSearch.value = ''; 
        mSearchInstance.updateOptions('');
        mSearch.addEventListener('focus', (e) => e.target.select());
        setTimeout(() => mSearch.focus(), 50);

        // Difficulty fills
        row.querySelectorAll('.qfill').forEach(btn => {
          const type = btn.dataset.type;
          const val = frame.targets?.[type];
          if (!val) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
          } else {
            btn.onclick = () => {
              frame.score10 = val;
              frame.score1 = Math.floor(val / 10);
              s10.value = formatNumber(frame.score10);
              s1.value = formatNumber(frame.score1);
            };
          }
        });
      }

      framesList.appendChild(row);
    });
  }

  /**
   * Implements drag-and-drop reordering for frames.
   * Matches the behavior found in configPage.js for tournament setup.
   */
  function setupDragging(container) {
    let draggedItem = null;

    container.addEventListener('dragstart', (e) => {
      draggedItem = e.target.closest('.frame-preview-item');
      if (draggedItem) draggedItem.style.opacity = '0.5';
    });

    container.addEventListener('dragend', (e) => {
      if (draggedItem) draggedItem.style.opacity = '';
      
      // Update the data array to match the new DOM order
      const tidOrder = Array.from(container.querySelectorAll('.frame-preview-item'))
        .map(el => el.dataset.tempId);
      
      const newArray = tidOrder.map(tid => generatedFrames.find(f => f.tempId === tid));
      generatedFrames = newArray.map((f, i) => ({ ...f, order: i + 1 }));
      
      renderPreview();
    });

    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      const overItem = e.target.closest('.frame-preview-item');
      if (overItem && overItem !== draggedItem) {
        const rect = overItem.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) container.insertBefore(draggedItem, overItem);
        else container.insertBefore(draggedItem, overItem.nextSibling);
      }
    });
  }

  finalizeBtn.onclick = async () => {
    const eventName = document.getElementById('qp-event-name').value.trim();
    const locId = Number(locSelect.value);

    finalizeBtn.disabled = true;
    finalizeBtn.textContent = 'Starting Session...';

    try {
      const leagues = await PB_API.getLeagues();
      let qpLeague = leagues.find(l => l.name === 'Quick Play Sessions');
      if (!qpLeague) {
        const newLeague = await PB_API.createLeague({ 
          name: 'Quick Play Sessions', 
          start_date: new Date().toISOString().split('T')[0] 
        });
        if (!newLeague || !newLeague.id) {
          throw new Error('Failed to create "Quick Play" league. Backend did not return a league ID.');
        }
        qpLeague = newLeague;
      }

      const newEvent = await PB_API.createEvent({
        league_id: qpLeague.id,
        event_name: eventName,
        event_date: new Date().toISOString().split('T')[0],
        location_id: locId
      });

      if (!newEvent || !newEvent.id) {
        throw new Error('Failed to create event. Backend did not return an event ID. Check your createEvent endpoint.');
      }

      const event = newEvent;

      const engine = getScoringEngine('bowling');

      for (const frame of generatedFrames) {
        if (!frame.machine_id) {
          console.warn(`Frame ${frame.order} is missing a machine selection.`);
          continue;
        }

        const values = engine.buildRoundValues(frame.score10, frame.score1);

        await PB_API.saveTargetScore({
          event_id: Number(event.id),
          machine_id: Number(frame.machine_id),
          order_number: frame.order,
          values: values
        });
      }

      window.location.href = `scores.php?eventId=${event.id}&leagueId=${qpLeague.id}`;
    } catch (err) {
      console.error(err);
      alert(err.message);
      finalizeBtn.disabled = false;
      finalizeBtn.textContent = 'Finalize & Start Bowling';
    }
  };
}