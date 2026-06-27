import { PB_API } from '@services/api.js';
import { can, PERMISSIONS, filterPlayersForUser } from '@services/auth.js';
import { getScoringEngine, SCORING_FORMATS } from '@core/engine.js';
import { getCookie, formatNumber, applyScoreFormatting, parseFormattedNumber, loadPage, renderThresholdGrid, escapeHTML } from '@scripts/utils.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { createExpandableRow, setupSortableList, createSearchableSelect } from '@ui/selectors.js';
import { showDialog, showPlayerSelectionDialog } from '@ui/dialogs.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { generateSessionName, selectRandomMachines, getTargetScoreForDifficulty } from '@services/sessionGenerator.js';

/**
 * Logic for the Play page where players enter their scores for the current session.
 * @module pages/play
 */

/**
 * Initializes the Play page: loads session data, renders machine/score entry UI, and binds submission controls.
 * @async
 * @returns {Promise<void>}
 */
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
    applyPreferredTheme(currentSessionFormat);

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
    const sessionLeagues = await PB_API.leagues.getAll({ type: 'session' });
    const today = new Date().toISOString().split('T')[0];
    
    todayEvents = [];
    sessionLeagues.forEach(league => {
      const matches = (league.events || []).filter(e => e.eventDate === today);
      matches.forEach(event => {
        const format = event.scoringFormat || league.scoringFormat || 'bowling';
        todayEvents.push({ ...event, leagueId: league.id, roster: league.players || [], scoringFormat: format });
      });
    });

    allPlayersCache = await PB_API.players.getAll();
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
        className: 'session-item',
        format: event.scoringFormat,
        headerHtml: `
          <div class="session-item-header">
            <div class="flex-center gap-8">
              <strong>${escapeHTML(event.eventName)}</strong>
            </div>
            <div class="session-stats">
              ${escapeHTML(event.locationName) || 'No Location'} | ${escapeHTML(event.eventDate)} | Players: ${event.roster?.length || 0}
            </div>
            <div class="play-action-buttons">
              <button class="play-btn secondary btn-row">Play</button>
              <button class="scoreboard-btn secondary btn-row">Scoreboard</button>
            </div>
          </div>
        `,
        contentHtml: '',
        onHeaderClick: () => loadPage(ROUTE_PATHS.SCORES({ eventId: event.id, leagueId: event.leagueId }))
      });

      row.querySelector('.scoreboard-btn').onclick = (e) => {
        e.stopPropagation();
        loadPage(ROUTE_PATHS.STANDINGS({ eventId: event.id, leagueId: event.leagueId }));
      };

      row.querySelector('.play-btn').onclick = async (e) => {
        e.stopPropagation();
        
        const currentUser = await PB_API.auth.me().catch(err => {
          console.warn("Failed to fetch current user, likely not logged in:", err);
          return null;
        });
        const joinedIds = new Set(event.roster.map(p => p.id));
        let selectedId = null;

        if (currentUser?.player_id) {
            selectedId = currentUser.player_id;
        } else {
            // For guests, show players from the cache. We filter to non-users to prevent 
            // guest sessions from hijacking registered accounts.
            const available = filterPlayersForUser(allPlayersCache, currentUser);
            const options = available.map(p => ({ 
              value: p.id, 
              label: joinedIds.has(p.id) ? p.playerName : `${p.playerName} (Join)` 
            }));
            selectedId = await showPlayerSelectionDialog('Play Session', 'Who is playing?', options, 'Play');
        }

        if (selectedId) {
          try {
            // If the selected player isn't in the league yet, join them automatically
            if (!joinedIds.has(Number(selectedId))) {
              const engine = getScoringEngine(event.scoringFormat);
              const maxRoster = engine.getMaxRosterSize();
              // Enforce roster limit for formats with player constraints (e.g., baseball)
              if (joinedIds.size >= maxRoster) {
                showDialog({title: 'Session Full', message: `This session has reached its maximum roster size of ${maxRoster} and cannot accept more players.`, confirmText: 'OK' , hideCancel: true });
                return;
              }
              const result = await PB_API.leagues.addPlayer(event.leagueId, Number(selectedId));
              if (result.error) throw new Error(result.error);
            }
            loadPage(ROUTE_PATHS.SCORES({ eventId: event.id, leagueId: event.leagueId, playerId: selectedId }));
          } catch (err) {
            console.error('[Play] Failed to join session:', err);
            const message = err?.message || String(err);
            if (message.includes('Unauthorized') || message.includes('401')) {
              showPlayerSelectionDialog('Access Denied', 'Guests can only join as unregistered players. Please select a guest profile or log in.', [], 'Close');
            } else {
              alert('Failed to join session: ' + message);
            }
          }
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
    PB_API.locations.getAll(),
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

  // Hide session generator for unregistered users
  const canCreate = await can(PERMISSIONS.CREATE_SESSION);
  if (!canCreate && createToggleBtn) {
    createToggleBtn.classList.add('hidden');
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
    const finalNamePreview = generateSessionName(rawName, locName, date, time);

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

    const machinesPerRound = engine.getMachinesPerRound();
    const totalMachinesNeeded = frameCount * machinesPerRound;
    
    // Pick random machines
    const selected = selectRandomMachines(locMachines, totalMachinesNeeded);
    while (selected.length < totalMachinesNeeded) {
      selected.push(locMachines[Math.floor(Math.random() * locMachines.length)]);
    }

    // Generate default value2 settings for the format (e.g., par values for golf)
    const value2Defaults = engine.generateValue2Defaults(frameCount);

      generatedFrames = selected.map((m, index) => {
        const baseScore = getTargetScoreForDifficulty(m, difficulty);
        let { value1, value2 } = engine.getInitialValues(baseScore);

        // Apply default value2 for formats that support it (e.g., golf pars)
        if (value2Defaults.length > 0 && value2Defaults[index] !== undefined) {
          value2 = value2Defaults[index];
        }

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
            scores: {},
            tempId: Math.random().toString(36).substr(2, 9)
        };
    });

    renderPreview();
    renderMatchupPreview();
    previewSection.classList.remove('hidden');
    
    previewSection.scrollIntoView({ behavior: 'smooth' });
  }

  function renderMatchupPreview() {
    const matchupContainer = document.getElementById('qp-matchups-preview');
    if (!matchupContainer) return;

    const engine = getScoringEngine(currentSessionFormat);
    const matchupInfo = engine.getMatchupDescription(generatedFrames.length);

    if (!matchupInfo) {
      matchupContainer.classList.add('hidden');
      return;
    }

    matchupContainer.classList.remove('hidden');
    matchupContainer.innerHTML = `
      <div class="card matchup-preview-card">
        <h3>Head-to-Head Matchups</h3>
        <p class="text-muted">${escapeHTML(matchupInfo.description)}</p>
        <div class="matchup-preview-grid">
          ${matchupInfo.details.map(d => `
            <div class="matchup-info">
              <span class="matchup-label">${escapeHTML(d.label)}:</span>
              <span>${escapeHTML(d.value)}</span>
            </div>
          `).join('')}
          <div class="matchup-info">
            <span class="matchup-label">Machines:</span>
            <span>${generatedFrames.filter(f => f.machineId).length} selected</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderPreview() {
    framesList.innerHTML = '';
    generatedFrames.forEach((frame, index) => {
      const isExpanded = expandedTempId === frame.tempId;
      const engine = getScoringEngine(currentSessionFormat);

      const { headerHtml, contentHtml } = engine.getPreviewRowHtml(
        frame, index, isExpanded, expandedTempId,
        formatNumber, escapeHTML, renderThresholdGrid
      );

      const row = createExpandableRow(framesList, {
        id: frame.tempId,
        className: 'frame-preview-item',
        draggable: true,
        headerHtml,
        contentHtml,
        isExpanded,
        onMoveUp: frame.orderNumber > 1 ? () => {
          const idx = generatedFrames.indexOf(frame);
          if (idx > 0) {
            [generatedFrames[idx], generatedFrames[idx - 1]] = [generatedFrames[idx - 1], generatedFrames[idx]];
            generatedFrames.forEach((f, i) => f.orderNumber = i + 1);
            renderPreview();
          }
        } : null,
        onMoveDown: frame.orderNumber < generatedFrames.length ? () => {
          const idx = generatedFrames.indexOf(frame);
          if (idx < generatedFrames.length - 1) {
            [generatedFrames[idx], generatedFrames[idx + 1]] = [generatedFrames[idx + 1], generatedFrames[idx]];
            generatedFrames.forEach((f, i) => f.orderNumber = i + 1);
            renderPreview();
          }
        } : null,
        onHeaderClick: () => {
          expandedTempId = (expandedTempId === frame.tempId) ? null : frame.tempId;
          renderPreview();
        }
      });
      const s10 = row.querySelector('.score10-input');
      const s1 = row.querySelector('.score1-input');
      if (s1) s1.dataset.allowDecimal = engine.getValue2AllowsDecimal?.() === true ? 'true' : 'false';
      if (s10) applyScoreFormatting(s10);
      if (s1) applyScoreFormatting(s1);

      // Immediate data updates as user types
      const updateValues = () => {
        if (s10) frame.value1 = parseFormattedNumber(s10.value);
        if (s1) frame.value2 = parseFormattedNumber(s1.value, engine.getValue2AllowsDecimal?.() === true);
        frame.values = engine.buildRoundValues(frame.value1, frame.value2, frame.scaling);

        // Update the visual grid without re-rendering the whole row to maintain input focus
        const container = row.querySelector('.preview-values-container');
        if (container) {
            container.innerHTML = renderThresholdGrid(engine.filterThresholds(frame.values), formatNumber, engine, frame.value1, frame.value2);
        }
      };

      if (s10) s10.oninput = updateValues;
      if (s1) s1.oninput = updateValues;

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
              if (s10) s10.value = formatNumber(frame.value1);
              if (s1) s1.value = formatNumber(frame.value2);
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

    const eventName = generateSessionName(rawName, locName, date, time);

    finalizeBtn.disabled = true;
    finalizeBtn.textContent = 'Starting Session...';

    try {
      const newLeague = await PB_API.leagues.create({ 
        name: eventName, 
        startDate: now.toISOString().split('T')[0],
        type: 'session',
        scoringFormat: currentSessionFormat
      });

      if (!newLeague || !newLeague.id) {
        throw new Error('Failed to create session league.');
      }

      const qpLeague = newLeague;

      const newEvent = await PB_API.events.create({
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
        await PB_API.machines.saveTarget(targetPayloads);
      }

      // Redirect to the scoring page for the new session.
      // If the user has a player profile, auto-join them and pre-select them.
      const currentUser = await PB_API.auth.me();
      if (currentUser?.player_id) {
        await PB_API.leagues.addPlayer(qpLeague.id, currentUser.player_id);
      }

      // Generate matchups for formats that use them (e.g., baseball head-to-head)
      const engine = getScoringEngine(currentSessionFormat);
      const matchupInfo = engine.getMatchupDescription(generatedFrames.length);
      if (matchupInfo) {
        const leagueData = await PB_API.leagues.get(qpLeague.id);
        const roster = leagueData?.players || [];

        if (roster.length < 2 && allPlayersCache.length > 0) {
          const opponentOptions = allPlayersCache
            .filter(p => !roster.some(r => r.id === p.id))
            .map(p => ({ value: p.id, label: p.playerName }));

          if (opponentOptions.length > 0) {
            const opponentId = await showPlayerSelectionDialog(
              'Select Opponent',
              'This format requires at least 2 players. Choose an opponent:',
              opponentOptions,
              'Add & Continue'
            );
            if (opponentId) {
              await PB_API.leagues.addPlayer(qpLeague.id, Number(opponentId));
              roster.push({ id: Number(opponentId) });
            }
          }
        }

        const updatedLeague = roster.length >= 2 ? { players: roster } : await PB_API.leagues.get(qpLeague.id);
        const finalRoster = updatedLeague?.players || [];

        if (finalRoster.length >= 2) {
          const inningCount = generatedFrames.length / engine.getMachinesPerRound();
          const machines = generatedFrames.map(f => ({ machineId: f.machineId }));
          const matchups = engine.generateMatchupPayload(finalRoster, inningCount, machines);

          if (matchups.length > 0) {
            await PB_API.matchups.save(matchups.map(m => ({
              ...m,
              eventId: Number(event.id)
            })));
          }
        }
      }

      loadPage(ROUTE_PATHS.SCORES({ eventId: event.id, leagueId: qpLeague.id, playerId: currentUser?.player_id }));

    } catch (err) {
      console.error(err);
      alert(err.message);
      finalizeBtn.disabled = false;
      finalizeBtn.textContent = 'Create Session';
    }
  };
}
