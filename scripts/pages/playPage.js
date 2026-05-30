import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { formatNumber, applyScoreFormatting } from '@scripts/utils.js';

export async function initPlayPage() {
  const form = document.getElementById('quick-play-form');
  const locSelect = document.getElementById('qp-location');
  const generateBtn = document.getElementById('generate-qp-btn');
  const previewSection = document.getElementById('qp-preview-section');
  const framesList = document.getElementById('qp-frames-list');
  const finalizeBtn = document.getElementById('finalize-qp-btn');

  let generatedFrames = [];
  let locationsCache = [];

  const locations = await PB_API.getLocations();
  locationsCache = locations;
  locations.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = `${loc.name}${loc.city ? ` (${loc.city})` : ''}`;
    locSelect.appendChild(opt);
  });

  // Initialize dragging listeners on the container once
  setupDragging(framesList);

  form.onsubmit = (e) => {
    e.preventDefault();
    generatePreview();
  };

  function generatePreview() {
    const locId = Number(locSelect.value);
    const frameCount = Number(document.getElementById('qp-frames').value);
    const difficulty = document.getElementById('qp-difficulty').value;

    const location = locationsCache.find(l => l.id === locId);
    const locMachines = location?.machines || [];

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
      machine_id: m.machine_id,
      machine_name: m.machine_name,
      strike_score: m[`target_${difficulty}`] || 1000000,
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
      row.style = "display: flex; align-items: center; gap: 10px; margin-bottom: 8px; background: #f9f9f9; padding: 10px; border-radius: 4px; border: 1px solid #ddd;";
      row.innerHTML = `
        <div class="drag-handle" style="cursor: grab; color: #888; padding: 0 8px; font-size: 1.2rem;">☰</div>
        <span style="font-weight: bold; min-width: 70px;">Frame ${frame.order}</span>
        <span style="flex: 1;">${frame.machine_name}</span>
        <div style="display: flex; align-items: center; gap: 5px;">
          <label style="font-size: 0.8rem;">Strike Target:</label>
          <input type="text" class="strike-input" value="${formatNumber(frame.strike_score)}" style="width: 120px; padding: 4px;">
        </div>
        <button type="button" class="remove-btn" style="padding: 4px 8px; font-size: 0.8rem;">&times;</button>
      `;

      const input = row.querySelector('.strike-input');
      applyScoreFormatting(input);
      input.oninput = () => {
        frame.strike_score = Number(input.value.replace(/\D/g, '')) || 0;
      };

      row.querySelector('.remove-btn').onclick = () => {
        generatedFrames = generatedFrames.filter(f => f.tempId !== frame.tempId);
        generatedFrames.forEach((f, i) => f.order = i + 1); // Re-index
        renderPreview();
      };

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
        qpLeague = await PB_API.createLeague({ 
          name: 'Quick Play Sessions', 
          start_date: new Date().toISOString().split('T')[0] 
        });
      }

      const event = await PB_API.createEvent({
        league_id: qpLeague.id,
        event_name: eventName,
        event_date: new Date().toISOString().split('T')[0],
        location_id: locId
      });

      const engine = getScoringEngine('bowling');

      for (const frame of generatedFrames) {
        const values = engine.buildRoundValues(frame.strike_score, Math.floor(frame.strike_score / 10));

        await PB_API.addTargetScore({
          event_id: event.id,
          machine_id: frame.machine_id,
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