import { PB_API } from '@services/api.js';
import { getScoringEngine, SCORING_FORMATS } from '@core/engine.js';
import { formatNumber, applyScoreFormatting, renderThresholdGrid, getCookie } from '@scripts/utils.js';
import { 
  createSearchableSelect, 
  showPlayerSelectionDialog, 
  createExpandableRow, 
  setupSortableList,
} from '@ui/uiComponents.js';

export async function initPlayPage() {
  const form = document.getElementById('quick-play-form');
  const locSelect = document.getElementById('qp-location');
  const formatSelect = document.getElementById('qp-format');
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
  let currentSessionFormat = getCookie('pb_preferred_format') || 'bowling';

  // Populate session format dropdown from central list
  if (formatSelect) {
    formatSelect.innerHTML = SCORING_FORMATS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
    formatSelect.value = getCookie('pb_preferred_format') || 'bowling';
  }

  const updateRoundOptions = () => {
    currentSessionFormat = formatSelect?.value || 'bowling';
    const engine = getScoringEngine(currentSessionFormat);
    const roundLabel = engine.getRoundLabel();
    const counts = engine.getRoundCountOptions();

    renderExistingSessions();
    const label = document.querySelector('label[for="qp-frames"]');
    if (label) label.textContent = `Number of ${roundLabel}s`;

    const framesSelect = document.getElementById('qp-frames');
    if (framesSelect) {
      const currentVal = framesSelect.value;
      framesSelect.innerHTML = counts.map(c => 
        `<option value="${c}" ${String(c) === currentVal ? 'selected' : (c === 10 || c === 18 ? 'selected' : '')}>${c} ${roundLabel}s</option>`
      ).join('');
    }
  };

  async function refreshSessionsData() {
    // Fetch only session-type leagues directly from the server
    const sessionLeagues = await PB_API.getLeagues({ type: 'session' });
    const today = new Date().toISOString().split('T')[0];
    
    todayEvents = [];
    sessionLeagues.forEach(league => {
      const matches = (league.events || []).filter(e => e.eventDate === today);
      matches.forEach(event => {
        const format = event.scoringFormat || league.scoringFormat || 'bowling';
        todayEvents.push({ ...event, leagueId: league.id, roster: league.players || [], scoringFormat: format });
      });
    });

    allPlayersCache = await PB_API.getPlayers();
  }

  function renderExistingSessions() {
    if (!sessionsList) return;
    sessionsList.innerHTML = ''; // Clear previous results before re-rendering
    const nameQuery = nameInput.value.toLowerCase().trim();
    const locQuery = Number(locSelect.value);

    const filtered = todayEvents.filter(e => {
      const matchesName = !nameQuery || e.eventName.toLowerCase().includes(nameQuery);
      const matchesLoc = !locQuery || Number(e.locationId) === locQuery;
      const matchesFormat = e.scoringFormat === currentSessionFormat;
      return matchesName && matchesLoc && matchesFormat;
    });

    if (filtered.length === 0) {
      sessionsList.innerHTML = '<div class="notice">No active sessions found for today matching your criteria.</div>';
      return;
    }

    filtered.forEach(event => {
      const row = createExpandableRow(sessionsList, {
        id: event.id,
        format: event.scoringFormat,
        className: 'session-item',
        headerHtml: `
          <div style="flex: 1;"><strong>${event.eventName}</strong><br><small>${event.locationName || 'No Location'} | ${event.eventDate}</small></div>
          <div style="display: flex; gap: 6px;">
            <button class="scoreboard-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Scoreboard</button>
            <button class="join-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Join</button>
            <button class="play-btn secondary" style="padding: 4px 8px; font-size: 0.75rem;">Play</button>
          </div>
        `,
        contentHtml: '', // Sessions do not expand
        onHeaderClick: () => {
          window.location.href = `scores?eventId=${event.id}&leagueId=${event.leagueId}`;
        }
      });

      row.querySelector('.scoreboard-btn').onclick = (e) => {
        e.stopPropagation();
        window.location.href = `standings?eventId=${event.id}&leagueId=${event.leagueId}`;
      };

      row.querySelector('.join-btn').onclick = async (e) => {
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

      row.querySelector('.play-btn').onclick = async (e) => {
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
    });
  }

  let generatedFrames = [];
  let locationsCache = [];
  let currentLocMachines = [];
  let expandedTempId = null; // Tracks which row is expanded for machine selection

  // Batch initial data fetches for smoother loading
  const [locations] = await Promise.all([
    PB_API.getLocations(),
    refreshSessionsData()
  ]);

  locationsCache = locations;
  locationsCache.forEach(loc => {
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

  if (formatSelect) {
    formatSelect.addEventListener('change', updateRoundOptions);
    updateRoundOptions(); // Initial sync
  }

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
  setupSortableList(framesList, {
    itemSelector: '.frame-preview-item',
    onReorder: (tidOrder) => {
      const newArray = tidOrder.map(tid => generatedFrames.find(f => f.tempId === String(tid)));
      generatedFrames = newArray.map((f, i) => ({ ...f, order: i + 1 }));
      
      renderPreview();
    }
  });

  form.onsubmit = (e) => {
    e.preventDefault();
    generatePreview();
  };

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
    currentSessionFormat = formatSelect?.value || 'bowling';
    const engine = getScoringEngine(currentSessionFormat);

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
        const difficultyKey = 'target' + difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
        const baseScore = m[difficultyKey] || 1000000;
        const { value1, value2 } = engine.getInitialValues(baseScore);

        return {
            machineId: Number(m.machineId),
            machineName: m.machineName,
            targets: {
                easy: m.targetEasy || 1000000,
                med: m.targetMed || 2000000,
                hard: m.targetHard || 3000000
            },
            value1,
            value2,
            scaling: globalScaling,
            values: engine.buildRoundValues(value1, value2, globalScaling),
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
      const isExpanded = expandedTempId === frame.tempId;
      const engine = getScoringEngine(currentSessionFormat);

      const headerHtml = `
          <div class="drag-handle" style="cursor: grab; color: var(--pb-primary); opacity: 0.5; padding: 0 4px; font-size: 1.2rem;">☰</div>
          <span style="font-weight: bold; min-width: 30px; text-align: center;">${frame.orderNumber}</span>
          <span style="flex: 1; font-weight: bold;" class="machine-name-display">${frame.machineName}</span>
          <div style="display: flex; align-items: center; gap: 10px;" onclick="event.stopPropagation()">
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 0.7rem; color: var(--pb-primary); opacity: 0.8;">${engine.getHighScoreLabel()}:</label>
              <input type="text" class="score10-input" value="${formatNumber(frame.value1)}" style="width: 85px; padding: 3px; font-size: 0.85rem;">
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <label style="font-size: 0.7rem; color: var(--pb-primary); opacity: 0.8;">${engine.getLowScoreLabel()}:</label>
              <input type="text" class="score1-input" value="${formatNumber(frame.value2)}" style="width: 85px; padding: 3px; font-size: 0.85rem;">
            </div>
          </div>
      `;

      const contentHtml = `
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
          <div class="preview-values-container">${renderThresholdGrid(engine.filterThresholds(frame.values), formatNumber, engine, frame.value1, frame.value2)}</div>
      `;

      const row = createExpandableRow(framesList, {
        id: frame.tempId,
        className: 'frame-preview-item',
        draggable: true,
        headerHtml,
        contentHtml,
        isExpanded,
        onHeaderClick: () => {
          expandedTempId = (expandedTempId === frame.tempId) ? null : frame.tempId;
          renderPreview();
        }
      });

      const s10 = row.querySelector('.score10-input');
      const s1 = row.querySelector('.score1-input');
      applyScoreFormatting(s10);
      applyScoreFormatting(s1);

      // Immediate data updates as user types
      const updateValues = () => {
        frame.value1 = Number(s10.value.replace(/\D/g, '')) || 0;
        frame.value2 = Number(s1.value.replace(/\D/g, '')) || 0;
        frame.values = engine.buildRoundValues(frame.value1, frame.value2, frame.scaling);

        // Update the visual grid without re-rendering the whole row to maintain input focus
        const container = row.querySelector('.preview-values-container');
        if (container) {
            container.innerHTML = renderThresholdGrid(engine.filterThresholds(frame.values), formatNumber, engine, frame.value1, frame.value2);
        }
      };

      s10.oninput = updateValues;
      s1.oninput = updateValues;

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
              const { value1, value2 } = engine.getInitialValues(val);
              frame.value1 = value1;
              frame.value2 = value2;
              s10.value = formatNumber(frame.value1);
              s1.value = formatNumber(frame.value2);
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
        type: 'session',
        scoringFormat: currentSessionFormat
      });

      if (!newLeague || !newLeague.id) {
        throw new Error('Failed to create session league.');
      }

      const qpLeague = newLeague;

      const newEvent = await PB_API.createEvent({
        leagueId: qpLeague.id,
        eventName: eventName,
        eventDate: now.toISOString().split('T')[0],
        locationId: locId,
        scoringFormat: currentSessionFormat
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
            value1: frame.value1,
            value2: frame.value2,
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