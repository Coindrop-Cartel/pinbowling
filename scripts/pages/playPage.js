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
  // The container/card for existing sessions
  const sessionsCard = document.getElementById('qp-sessions-card');
  let allPlayersCache = [];
  let todayEvents = [];

  async function refreshSessionsData() {
    // Fetch only session-type leagues directly from the server
    const sessionLeagues = await PB_API.getLeagues({ type: 'session' });
    const today = new Date().toISOString().split('T')[0];
    
    todayEvents = [];
    sessionLeagues.forEach(league => {
      const matches = (league.events || []).filter(e => e.eventDate === today);
      matches.forEach(event => {
        todayEvents.push({ ...event, leagueId: league.id, roster: league.players || [] });
      });
    });

    allPlayersCache = await PB_API.getPlayers();
  }

  function renderExistingSessions() {
    if (!sessionsList) return;
    sessionsList.innerHTML = '';
    
    const nameQuery = nameInput.value.toLowerCase().trim();
    const locQuery = Number(locSelect.value);

    const filtered = todayEvents.filter(e => {
      const matchesName = !nameQuery || e.eventName.toLowerCase().includes(nameQuery);
      const matchesLoc = !locQuery || Number(e.locationId) === locQuery;
      return matchesName && matchesLoc;
    });

    if (filtered.length === 0) {
      sessionsList.innerHTML = '<div class="notice">No active sessions found for today matching your criteria.</div>';
      return;
    }

    sessionsList.innerHTML = '';
    filtered.forEach(event => {
      const div = document.createElement('div');
      div.className = 'session-item';
      div.style = "padding: 12px; cursor: pointer; margin-bottom: 8px; background: #fff; border: 1px solid #ddd; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;";
      div.innerHTML = `
        <div><strong>${event.eventName}</strong><br><small>${event.locationName || 'No Location'} | ${event.eventDate}</small></div>
        <div style="display: flex; gap: 6px;">
          <button class="scoreboard-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Scoreboard</button>
          <button class="join-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Join</button>
          <button class="play-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Play</button>
        </div>
      `;

      div.querySelector('.scoreboard-btn').onclick = (e) => {
        e.stopPropagation();
        window.location.href = `standings?eventId=${event.id}&leagueId=${event.leagueId}`;
      };

      div.querySelector('.join-btn').onclick = async (e) => {
        e.stopPropagation();
        const joinedIds = new Set(event.roster.map(p => p.id));
        const available = allPlayersCache.filter(p => !joinedIds.has(p.id));

        if (available.length === 0) {
          alert('All registered players have already joined this session.');
          return;
        }

        const options = available.map(p => ({ value: p.id, label: p.playerName }));
        const selectedId = await showPlayerSelectionDialog('Play Session', 'Select your name to start playing:', options, 'Play');
        if (selectedId) {
          await PB_API.addLeaguePlayer(event.leagueId, Number(selectedId));
          window.location.href = `scores?eventId=${event.id}&leagueId=${event.leagueId}&playerId=${selectedId}`;
        }
      };

      div.querySelector('.play-btn').onclick = async (e) => {
        e.stopPropagation();
        const roster = event.roster || [];
        
        if (roster.length === 0) {
          alert('No players are assigned to this session yet. Use "Join" to add yourself.');
          return;
        }

        const options = roster.map(p => ({ value: p.id, label: p.playerName }));
        const selectedId = await showPlayerSelectionDialog('Play Session', 'Who is bowling?', options, 'Play');
        if (selectedId) {
          window.location.href = `scores?eventId=${event.id}&leagueId=${event.leagueId}&playerId=${selectedId}`;
        }
      };

      div.onclick = (e) => {
        if (e.target.closest('button')) return;
        window.location.href = `scores?eventId=${event.id}&leagueId=${event.leagueId}`;
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
      
      // When creating, we hide the existing sessions results to focus on the generator
      if (sessionsCard) {
        sessionsCard.classList.toggle('hidden', isHidden);
      }

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
    const globalScaling = document.getElementById('qp-scaling').value;
    const engine = getScoringEngine('bowling');

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

      generatedFrames = selected.map((m, index) => {
        const score10 = m['target' + difficulty.charAt(0).toUpperCase() + difficulty.slice(1)] || 1000000;
        const score1 = Math.floor(score10 / 10);
        return {
            machineId: Number(m.machineId),
            machineName: m.machineName,
            targets: {
                easy: m.targetEasy || 1000000,
                med: m.targetMed || 2000000,
                hard: m.targetHard || 3000000
            },
            score10,
            score1,
            scaling: globalScaling,
            values: engine.buildRoundValues(score10, score1, globalScaling),
            orderNumber: index + 1,
            tempId: Math.random().toString(36).substr(2, 9)
        };
    });

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
      const engine = getScoringEngine('bowling');

      row.style = "margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: #fff;";
      row.innerHTML = `
        <div class="frame-row-header" style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #f9f9f9; cursor: pointer;">
          <div class="drag-handle" style="cursor: grab; color: #888; padding: 0 4px; font-size: 1.2rem;">☰</div>
          <span style="font-weight: bold; min-width: 30px; text-align: center;">${frame.orderNumber}</span>
          <span style="flex: 1; font-weight: bold;" class="machine-name-display">${frame.machineName}</span>
          <div style="display: flex; align-items: center; gap: 10px;" onclick="event.stopPropagation()">
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 0.7rem; color: #666;">10:</label>
              <input type="text" class="score10-input" value="${formatNumber(frame.score10)}" style="width: 85px; padding: 3px; font-size: 0.85rem;">
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 0.7rem; color: #666;">1:</label>
              <input type="text" class="score1-input" value="${formatNumber(frame.score1)}" style="width: 85px; padding: 3px; font-size: 0.85rem;">
            </div>
          </div>
        </div>
        <div class="frame-expansion ${isExpanded ? '' : 'hidden'}" style="padding: 12px 15px; border-top: 1px solid #ddd;">
          <div class="form-row">
            <label style="font-size: 0.85rem;">Change Machine</label>
            <input type="text" class="row-machine-search" placeholder="Filter machines..." style="width: 100%; box-sizing: border-box; margin-bottom: 5px;">
            <select class="row-machine-select" style="width: 100%; box-sizing: border-box;"></select>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <div style="display: flex; gap: 6px;">
               <button type="button" class="qfill secondary" data-type="easy" style="font-size: 0.75rem; padding: 2px 10px;">Easy</button>
               <button type="button" class="qfill secondary" data-type="med" style="font-size: 0.75rem; padding: 2px 10px;">Med</button>
               <button type="button" class="qfill secondary" data-type="hard" style="font-size: 0.75rem; padding: 2px 10px;">Hard</button>
            </div>
            <div style="display: flex; gap: 4px;">
               <button type="button" class="scaling-btn ${frame.scaling === 'flat' ? 'btn-standard' : 'secondary'}" data-scale="flat" style="font-size: 0.7rem; padding: 2px 8px;">Flat</button>
               <button type="button" class="scaling-btn ${frame.scaling === 'curved' ? 'btn-standard' : 'secondary'}" data-scale="curved" style="font-size: 0.7rem; padding: 2px 8px;">Curved</button>
            </div>
          </div>
          <div class="preview-values-grid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; font-size: 0.75rem; background: #f0f0f0; padding: 8px; border-radius: 4px;">
            ${Object.entries(frame.values || {})
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([rank, val]) => `<div><strong>${rank}:</strong> ${formatNumber(val)}</div>`)
              .join('')
            }
          </div>
        </div>
      `;

      const s10 = row.querySelector('.score10-input');
      const s1 = row.querySelector('.score1-input');
      applyScoreFormatting(s10);
      applyScoreFormatting(s1);

      // Immediate data updates as user types
      const updateValues = () => {
        frame.score10 = Number(s10.value.replace(/\D/g, '')) || 0;
        frame.score1 = Number(s1.value.replace(/\D/g, '')) || 0;
        frame.values = engine.buildRoundValues(frame.score10, frame.score1, frame.scaling);

        // Update the visual grid without re-rendering the whole row to maintain input focus
        const grid = row.querySelector('.preview-values-grid');
        if (grid) {
            grid.innerHTML = Object.entries(frame.values || {})
                .sort((a, b) => Number(b[0]) - Number(a[0]))
                .map(([rank, val]) => `<div><strong>${rank}:</strong> ${formatNumber(val)}</div>`)
                .join('');
        }
      };

      s10.oninput = updateValues;
      s1.oninput = updateValues;

      // Expand on click
      row.querySelector('.frame-row-header').onclick = () => {
        expandedTempId = (expandedTempId === frame.tempId) ? null : frame.tempId;
        renderPreview();
      };

      // Searchable Select initialization (only if expanded)
      if (isExpanded) {
        const mSearch = row.querySelector('.row-machine-search');
        const mSelect = row.querySelector('.row-machine-select');
        
        const mSearchInstance = createSearchableSelect(mSearch, mSelect, currentLocMachines, {
          valueKey: 'machineId',
          labelKey: 'machineName',
          placeholder: '-- Select Machine --',
          onSelect: (val) => {
            const match = currentLocMachines.find(m => String(m.machineId) === String(val));
            if (match) {
              frame.machineName = match.machineName;
              frame.machineId = Number(match.machineId);
              frame.targets = { easy: match.targetEasy, med: match.targetMed, hard: match.targetHard };
              updateValues();
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
          btn.onclick = () => {
            const type = btn.dataset.type;
            const val = frame.targets?.[type];
            if (val) {
              frame.score10 = val;
              frame.score1 = Math.floor(val / 10);
              s10.value = formatNumber(frame.score10);
              s1.value = formatNumber(frame.score1);
              updateValues();
              renderPreview();
            }
          };
        });

        // Scaling toggles
        row.querySelectorAll('.scaling-btn').forEach(btn => {
          btn.onclick = () => {
            const newScale = btn.dataset.scale;
            if (frame.scaling !== newScale) {
              frame.scaling = newScale;
              updateValues();
              renderPreview();
            }
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
      const newLeague = await PB_API.createLeague({ 
        name: eventName, 
        startDate: now.toISOString().split('T')[0],
        type: 'session'
      });

      if (!newLeague || !newLeague.id) {
        throw new Error('Failed to create session league.');
      }

      const qpLeague = newLeague;

      const newEvent = await PB_API.createEvent({
        leagueId: qpLeague.id,
        eventName: eventName,
        eventDate: now.toISOString().split('T')[0],
        locationId: locId
      });

      if (!newEvent || !newEvent.id) {
        throw new Error('Failed to create event. Backend did not return an event ID. Check your createEvent endpoint.');
      }

      const event = newEvent;

      const targetPayloads = generatedFrames
        .filter(f => f.machineId)
        .map(frame => {
          return {
            eventId: Number(event.id),
            machineId: Number(frame.machineId),
            orderNumber: frame.orderNumber,
            values: frame.values
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
      if (sessionsCard) sessionsCard.classList.remove('hidden');
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