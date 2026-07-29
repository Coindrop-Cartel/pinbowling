import { PB_API } from '@services/api.js';
import { can, PERMISSIONS, filterPlayersForUser } from '@services/auth.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { getScoringEngine, SCORING_FORMATS } from '@core/engine.js';
import { getCookie, formatNumber, applyScoreFormatting, parseFormattedNumber, loadPage, renderThresholdGrid, escapeHTML } from '@scripts/utils.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { createExpandableRow, setupSortableList, createSearchableSelect } from '@ui/selectors.js';
import { showDialog, showPlayerSelectionDialog, showAlert } from '@ui/dialogs.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { renderPreviewRow } from '@scripts/renderers/roundRowRenderer.js';
import { generateSessionName, selectRandomMachines, getTargetScoreForDifficulty } from '@services/sessionGenerator.js';
import { wireTargetRow } from '@scripts/renderers/targetRowRenderer.js';
import { finalizeSession } from '@services/sessionFinalizer.js';

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
  let currentSessionFormat = ScoringFormats.resolve(getCookie('pb_preferred_format'));

  // Populate session format dropdown from central list
  if (formatSelect) {
    formatSelect.innerHTML = SCORING_FORMATS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
    formatSelect.value = ScoringFormats.resolve(getCookie('pb_preferred_format'));
  }

  const updateRoundOptions = () => {
    currentSessionFormat = ScoringFormats.resolve(formatSelect?.value);
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
    const sessions = await PB_API.sessions.getAll();
    const today = new Date().toISOString().split('T')[0];
    
    todayEvents = [];
    sessions.forEach(session => {
      const matches = (session.events || []).filter(e => e.eventDate === today);
      matches.forEach(event => {
        const format = ScoringFormats.resolve(event.scoringFormat || session.scoringFormat);
        todayEvents.push({ ...event, sessionId: session.id, roster: session.players || [], teams: session.teams || [], participationType: session.participationType || 'individual', scoringFormat: format });
      });
    });

    allPlayersCache = await PB_API.players.getAll();
  }

  function renderExistingSessions() {
    if (!sessionsList) return;
    sessionsList.innerHTML = ''; // Clear previous results before re-rendering
    const nameQuery = nameInput.value.toLowerCase().trim();
    const locQuery = Number(locSelect.value);
    const participationTypeSelect = document.getElementById('qp-participation-type');
    const participationType = participationTypeSelect?.value || 'individual';

    const filtered = todayEvents.filter(e => {
      const matchesName = !nameQuery || e.eventName.toLowerCase().includes(nameQuery);
      const matchesLoc = !locQuery || Number(e.locationId) === locQuery;
      const matchesFormat = e.scoringFormat === currentSessionFormat;
      const matchesParticipation = e.participationType === participationType;
      return matchesName && matchesLoc && matchesFormat && matchesParticipation;
    });

    if (filtered.length === 0) {
      sessionsList.innerHTML = '<div class="notice">No active sessions found for today matching your criteria.</div>';
      return;
    }

    filtered.forEach(event => {
      const engine = getScoringEngine(event.scoringFormat);
      const rosterSize = event.roster?.length || 0;
      const teamsSize = event.teams?.length || 0;
      const isTeamSession = event.participationType === 'team';
      const rosterLabel = isTeamSession ? `Teams: ${teamsSize}` : `Players: ${rosterSize}`;
      const spots = engine.availableSpots(isTeamSession ? teamsSize : rosterSize);
      const showJoin = !isTeamSession && (spots === Infinity || spots > 0);

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
              ${escapeHTML(event.locationName) || 'No Location'} | ${escapeHTML(event.eventDate)} | ${rosterLabel}
            </div>
            <div class="play-action-buttons">
              ${showJoin ? '<button class="join-btn primary btn-row">Join</button>' : ''}
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
        loadPage(ROUTE_PATHS.STANDINGS({ eventId: event.id, sessionId: event.sessionId }));
      };

      const joinSessionAction = async (navigateAfterJoin) => {
        const currentUser = await PB_API.auth.me().catch(err => {
          console.warn("Failed to fetch current user, likely not logged in:", err);
          return null;
        });

        if (isTeamSession) {
          if (navigateAfterJoin) {
            loadPage(ROUTE_PATHS.SCORES({ eventId: event.id, sessionId: event.sessionId, teamId: currentUser?.player_id, playerId: currentUser?.player_id }));
          }
          return;
        }

        const joinedIds = new Set(event.roster.map(p => p.id));
        let selectedId = null;

        if (!navigateAfterJoin) {
          // Join button: always show player selection to add someone new
          const notAlreadyJoined = allPlayersCache.filter(p => !joinedIds.has(p.id));
          const currentSpots = engine.availableSpots(joinedIds.size);
          const available = filterPlayersForUser(notAlreadyJoined, currentUser);
          const usable = currentSpots === Infinity
            ? available
            : available.slice(0, currentSpots);
          const options = usable.map(p => ({ value: p.id, label: p.playerName }));

          if (options.length === 0) {
            showDialog({title: 'Session Full', message: 'No available roster spots remaining for this session format.', confirmText: 'OK' , hideCancel: true });
            return;
          }

          selectedId = await showPlayerSelectionDialog('Join Session', 'Add player to session:', options, 'Add');
        } else {
          // Play button: auto-select the current user, or pick a guest
          if (currentUser?.player_id) {
            selectedId = currentUser.player_id;
          } else {
            const notJoined = allPlayersCache.filter(p => !joinedIds.has(p.id));
            const available = filterPlayersForUser(notJoined, currentUser);
            const options = available.map(p => ({
              value: p.id,
              label: joinedIds.has(p.id) ? p.playerName : `${p.playerName} (Join)`
            }));
            selectedId = await showPlayerSelectionDialog('Play Session', 'Who is playing?', options, 'Play');
          }
        }

        if (selectedId) {
          try {
            if (!joinedIds.has(Number(selectedId))) {
              const maxRoster = engine.getMaxRosterSize();
              if (joinedIds.size >= maxRoster) {
                showDialog({title: 'Session Full', message: `This session has reached its maximum roster size of ${maxRoster} and cannot accept more players.`, confirmText: 'OK' , hideCancel: true });
                return;
              }
              const result = await PB_API.sessions.addPlayer(event.sessionId, Number(selectedId));
              if (result.error) throw new Error(result.error);
              event.roster.push({ id: Number(selectedId) });
            }
            if (navigateAfterJoin) {
              loadPage(ROUTE_PATHS.SCORES({ eventId: event.id, sessionId: event.sessionId, playerId: selectedId }));
            }
          } catch (err) {
            console.error('[Play] Failed to join session:', err);
            const message = err?.message || String(err);
            if (message.includes('Unauthorized') || message.includes('401')) {
              showPlayerSelectionDialog('Access Denied', 'Guests can only join as unregistered players. Please select a guest profile or log in.', [], 'Close');
            } else {
              showAlert('Failed to join session: ' + message);
            }
          }
        }
      };

      row.querySelector('.join-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        joinSessionAction(false);
      });

      row.querySelector('.play-btn').onclick = (e) => {
        e.stopPropagation();
        joinSessionAction(true);
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

  // Guard: If we are no longer on the Play page, abort initialization
  if (!document.getElementById('quick-play-form')) return;

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

  const participationTypeSelect = document.getElementById('qp-participation-type');
  if (participationTypeSelect) {
    participationTypeSelect.addEventListener('change', () => renderExistingSessions());
  }

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
    generatePreview().catch(err => { console.error('[generatePreview]', err); showAlert(err.message); });
  };

  renderExistingSessions();

  async function generatePreview() {
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
    currentSessionFormat = ScoringFormats.resolve(formatSelect?.value);
    const engine = getScoringEngine(currentSessionFormat);

    const locMachines = await PB_API.locations.getMachines(locId);
    currentLocMachines = locMachines;
    
    if (locMachines.length === 0) {
      showAlert('This location has no machines configured.');
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
        const easyTarget = getTargetScoreForDifficulty(m, 'easy', currentSessionFormat);
        const medTarget = getTargetScoreForDifficulty(m, 'med', currentSessionFormat);
        const hardTarget = getTargetScoreForDifficulty(m, 'hard', currentSessionFormat);
        const targets = { easy: easyTarget, med: medTarget, hard: hardTarget };

        const baseScore = targets[difficulty] || medTarget;
        let { value1, value2 } = engine.getInitialValues(baseScore);

        // Apply default value2 for formats that support it (e.g., golf pars)
        if (value2Defaults.length > 0 && value2Defaults[index] !== undefined) {
          value2 = value2Defaults[index];
        }

        return {
            machineId: Number(m.machineId || m.id),
            machineName: m.machineName,
            targets,
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

      const { headerHtml, contentHtml } = renderPreviewRow(
        engine, frame, index, isExpanded,
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
      wireTargetRow(row, frame, {
        engine,
        machines: currentLocMachines,
        onUpdate: () => {},
        onSelectMachine: (f, match) => {
          f.targets = {
            easy: getTargetScoreForDifficulty(match, 'easy', currentSessionFormat),
            med: getTargetScoreForDifficulty(match, 'med', currentSessionFormat),
            hard: getTargetScoreForDifficulty(match, 'hard', currentSessionFormat)
          };
          const baseScore = f.targets.med;
          const { value1, value2 } = engine.getInitialValues(baseScore);
          f.value1 = value1;
          f.value2 = value2;
          f.values = engine.buildRoundValues(f.value1, f.value2, f.scaling || 'curved');
        },
        afterSelectMachine: () => renderPreview(),
        afterQFill: () => renderPreview(),
        afterScalingChange: () => renderPreview(),
        clearSearchOnFocus: false,
        focusSearchOnExpand: true
      });
    });
  }

  finalizeBtn.onclick = async () => {
    finalizeBtn.disabled = true;
    finalizeBtn.textContent = 'Starting Session...';

    try {
      const participationTypeSelect = document.getElementById('qp-participation-type');
      await finalizeSession({
        rawName: nameInput.value.trim(),
        locId: Number(locSelect.value),
        locationsCache,
        currentSessionFormat,
        participationType: participationTypeSelect?.value || 'individual',
        generatedFrames,
        allPlayersCache,
        PB_API,
        showPlayerSelectionDialog
      });
    } catch (err) {
      console.error(err);
      showAlert(err.message);
      finalizeBtn.disabled = false;
      finalizeBtn.textContent = 'Create Session';
    }
  };
}
