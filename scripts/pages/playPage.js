import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { formatNumber, applyScoreFormatting } from '@scripts/utils.js';
import { createSearchableSelect, showPlayerSelectionDialog } from '@ui/uiComponents.js';

export async function initPlayPage() {
  const form = document.getElementById('quick-play-form');
  const locSelect = document.getElementById('qp-location');
  const nameInput = document.getElementById('qp-event-name');
  const generateBtn = document.getElementById('generate-qp-btn');
  const createToggleBtn = document.getElementById('create-new-toggle');
  const generatorOptions = document.getElementById('qp-generator-options');

  const setupFields = document.getElementById('qp-setup-fields');
  const setupSummary = document.getElementById('qp-setup-summary');
  const summaryText = document.getElementById('qp-summary-text');
  
  const previewSection = document.getElementById('qp-preview-section');
  const framesList = document.getElementById('qp-frames-list');
  const finalizeBtn = document.getElementById('finalize-qp-btn');
  
  const sessionsList = document.getElementById('qp-sessions-list');
  let allPlayersCache = [];
  let todayEvents = [];
  let qpLeague = null;

  async function refreshSessionsData() {
    const leagues = await PB_API.getLeagues();
    qpLeague = leagues.find(l => l.name === 'Quick Play Sessions');
    const today = new Date().toISOString().split('T')[0];
    todayEvents = qpLeague ? (qpLeague.events || []).filter(e => e.event_date === today) : [];
    allPlayersCache = await PB_API.getPlayers();
  }

  function renderExistingSessions() {
    if (!sessionsList) return;
    sessionsList.innerHTML = '';
    
    const nameQuery = nameInput.value.toLowerCase().trim();
    const locQuery = Number(locSelect.value);

    // Only show the results list if the user has started interacting
    if (!nameQuery && !locQuery) return;
    
    const filtered = todayEvents.filter(e => {
      const matchesName = !nameQuery || e.event_name.toLowerCase().includes(nameQuery);
      const matchesLoc = !locQuery || Number(e.location_id) === locQuery;
      return matchesName && matchesLoc;
    });

    if (filtered.length === 0) return;

    sessionsList.innerHTML = '<p class="hint" style="margin-bottom: 8px;">Found existing sessions for today:</p>';
    filtered.forEach(event => {
      const div = document.createElement('div');
      div.className = 'league-registry-item';
      div.style = "padding: 12px; cursor: pointer; margin-bottom: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;";
      div.innerHTML = `
        <div><strong>${event.event_name}</strong><br><small>${event.location_name || 'No Location'} | ${event.event_date}</small></div>
        <div style="display: flex; gap: 6px;">
          <button class="scoreboard-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Scoreboard</button>
          <button class="join-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Join</button>
          <button class="play-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Play</button>
        </div>
      `;

      div.querySelector('.scoreboard-btn').onclick = (e) => {
        e.stopPropagation();
        window.location.href = `standings?eventId=${event.id}&leagueId=${qpLeague.id}`;
      };

      div.querySelector('.join-btn').onclick = async (e) => {
        e.stopPropagation();
        const options = allPlayersCache.map(p => ({ value: p.id, label: p.player_name }));
        const selectedId = await showPlayerSelectionDialog('Join Session', 'Select your name to add yourself to this session:', options);
        if (selectedId) {
          await PB_API.addLeaguePlayer(qpLeague.id, Number(selectedId));
          window.location.href = `scores?eventId=${event.id}&leagueId=${qpLeague.id}&playerId=${selectedId}`;
        }
      };

      div.querySelector('.play-btn').onclick = async (e) => {
        e.stopPropagation();
        // We need the specific roster for this league
        const leagues = await PB_API.getLeagues();
        const currentLeague = leagues.find(l => l.id === qpLeague.id);
        const roster = currentLeague?.players || [];
        
        if (roster.length === 0) {
          alert('No players are assigned to this session yet. Use "Join" to add yourself.');
          return;
        }

        const options = roster.map(p => ({ value: p.id, label: p.player_name }));
        const selectedId = await showPlayerSelectionDialog('Play Session', 'Who is bowling?', options);
        if (selectedId) {
          window.location.href = `scores?eventId=${event.id}&leagueId=${qpLeague.id}&playerId=${selectedId}`;
        }
      };

      div.onclick = (e) => {
        if (e.target.closest('button')) return;
        window.location.href = `scores?eventId=${event.id}&leagueId=${qpLeague.id}`;
      };
      sessionsList.appendChild(div);
    });
  }

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
  if (locSelect) locSelect.addEventListener('change', () => {
    renderExistingSessions();
  });

  if (nameInput) nameInput.oninput = () => renderExistingSessions();

  if (createToggleBtn && generatorOptions && generateBtn) {
    createToggleBtn.onclick = () => {
      const isHidden = generatorOptions.classList.contains('hidden');
      generatorOptions.classList.toggle('hidden', !isHidden);
      generateBtn.classList.toggle('hidden', !isHidden);
      createToggleBtn.textContent = isHidden ? 'Cancel' : 'Create New Session';
      if (sessionsList) sessionsList.classList.toggle('hidden', isHidden); // Hide existing matches when creating

      // If we are canceling the creation flow, hide the preview section as well
      if (!isHidden && previewSection) {
        previewSection.classList.add('hidden');
      }
    };
  }

  const changeBtn = document.getElementById('qp-change-setup-btn');
  if (changeBtn) {
    changeBtn.onclick = () => {
      if (setupFields) setupFields.classList.remove('hidden');
      if (setupSummary) setupSummary.classList.add('hidden');
    };
  }

  // Initialize dragging listeners on the container once
  setupDragging(framesList);

  form.onsubmit = (e) => {
    e.preventDefault();
    generatePreview();
  };

  await refreshSessionsData();
  renderExistingSessions();

  function generatePreview() {
    const locId = Number(locSelect.value);
    const location = locationsCache.find(l => l.id === locId);
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const locName = location ? location.name : 'No Location';

    const rawName = nameInput.value.trim();
    const finalNamePreview = rawName 
      ? `${rawName} - ${locName} - ${date} - ${time}`
      : `${locName} - ${date} - ${time}`;

    // Show minimized header
    if (summaryText) {
      summaryText.innerHTML = `<strong>${finalNamePreview}</strong>`;
    }
    if (setupFields) setupFields.classList.add('hidden');
    if (setupSummary) setupSummary.classList.remove('hidden');
    if (generateBtn) generateBtn.textContent = 'Update Lineup';

    const frameCount = Number(document.getElementById('qp-frames').value);
    const difficulty = document.getElementById('qp-difficulty').value;

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
    const rawName = nameInput.value.trim();
    const locId = Number(locSelect.value);
    const location = locationsCache.find(l => l.id === locId);
    const locName = location ? location.name : 'Unknown Location';
    
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const eventName = rawName 
      ? `${rawName} - ${locName} - ${date} - ${time}`
      : `${locName} - ${date} - ${time}`;

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
        event_date: now.toISOString().split('T')[0],
        location_id: locId
      });

      if (!newEvent || !newEvent.id) {
        throw new Error('Failed to create event. Backend did not return an event ID. Check your createEvent endpoint.');
      }

      const event = newEvent;

      const engine = getScoringEngine('bowling');

      const targetPayloads = generatedFrames
        .filter(f => f.machine_id)
        .map(frame => {
          const values = engine.buildRoundValues(frame.score10, frame.score1);
          return {
            event_id: Number(event.id),
            machine_id: Number(frame.machine_id),
            order_number: frame.order,
            values: values
          };
        });

      if (targetPayloads.length > 0) {
        // Sending all targets in a single request prevents 403 Forbidden 
        // errors caused by server-side rate-limiting or flood protection.
        await PB_API.saveTargetScore(targetPayloads);
      }

      // Instead of redirecting, refresh the data and show the updated list
      await refreshSessionsData();
      renderExistingSessions();
      
      // Reset UI to initial state
      if (nameInput) nameInput.value = '';
      if (previewSection) previewSection.classList.add('hidden');
      if (setupFields) setupFields.classList.remove('hidden');
      if (setupSummary) setupSummary.classList.add('hidden');
      if (generatorOptions) generatorOptions.classList.add('hidden');
      if (generateBtn) generateBtn.classList.add('hidden');
      if (createToggleBtn) createToggleBtn.textContent = 'Create New Session';
      finalizeBtn.disabled = false;
      finalizeBtn.textContent = 'Create Session';

    } catch (err) {
      console.error(err);
      alert(err.message);
      finalizeBtn.disabled = false;
      finalizeBtn.textContent = 'Create Session';
    }
  };
}