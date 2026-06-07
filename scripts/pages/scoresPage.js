import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { formatNumber, applyScoreFormatting, getActiveEventId, getActiveLeagueId, setActiveEventId, setActiveLeagueId, setCurrentPlayerId, getCurrentPlayerId, renderThresholdGrid } from '@scripts/utils.js';
import { initTournamentSelector, createSearchableSelect, renderActionSummary } from '@ui/selectors.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { printBlankScoreSheet } from '@ui/printing.js';
import { can, PERMISSIONS } from '@services/auth.js';

/**
 * Initializes the Player Scoring page.
 * 
 * This module handles:
 * 1. Rendering the round-by-round input form based on event target scores.
 * 2. Real-time calculation of bowling results (Marks, Running Total).
 * 3. Player selection and roster filtering.
 * 4. Saving cumulative ball data to the backend.
 * @async
 */
export async function initScoresPage() {
  const roundsInput = document.getElementById('rounds-input');
  const resultsPanel = document.getElementById('results-panel');
  const resultsBody = document.getElementById('results-body');
  const totalScore = document.getElementById('total-score');
  const resultsEmpty = document.getElementById('results-empty');
  const warning = document.getElementById('player-warning');
  const playerSelect = document.getElementById('player-select');
  const playerSelectionCard = document.getElementById('player-selection-card');
  const scoringCard = document.getElementById('scoring-card');
  const resultsCard = document.getElementById('results-card');

  // Fetch leagues and current user once at the start. 
  const [rawLeagues, user] = await Promise.all([
    PB_API.getLeagues(),
    PB_API.getCurrentUser()
  ]);

  // Requirement: Unregistered users only see leagues that have at least one guest player.
  const initialLeagues = !user 
    ? rawLeagues.filter(l => (l.players || []).some(p => !p.userId))
    : rawLeagues;

  // If we land on the scores page with a session/non-standard league active, 
  // we clear it so the selector resets and refreshes to show standard leagues.
  // EXCEPTION: If we have both leagueId and eventId, we are deep-linking from "Let's Bowl".
  const initialLeagueId = getActiveLeagueId();
  let initialEventId = getActiveEventId();

  // The "summary" eventId is a virtual ID used for the Season Summary scoreboard.
  // Scores must be entered for specific events, so we clear it if it persists from navigation.
  if (initialEventId === 'summary') {
    setActiveEventId('');
    initialEventId = '';
  }

  if (initialLeagueId && !initialEventId) {
    const active = initialLeagues.find(l => String(l.id) === String(initialLeagueId));
    if (active && active.type !== 'standard') {
      setActiveLeagueId('');
      setActiveEventId('');
    }
  }

  let playerSearchInstance = null;
  let currentUser = user;
  let activeLeague = null;
  let allPlayersCache = [];
  let machines = [];

  // Selection UI Toggles
  const tournamentSelectorUI = document.getElementById('tournament-selector-ui');
  const tournamentSummary = document.getElementById('tournament-summary');

  const playerSelectorUI = document.getElementById('player-selector-ui');
  const playerSummary = document.getElementById('player-summary');

  const handleTournamentChange = () => {
    tournamentSelectorUI.classList.remove('hidden');
    tournamentSummary.classList.add('hidden');
    playerSelectionCard.classList.add('hidden');
    playerSummary.classList.add('hidden');
    scoringCard.classList.add('hidden');
    resultsCard.classList.add('hidden');
    setCurrentPlayerId('');

    const search = document.getElementById('league-search-global');
    if (search) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
    }
  };

  const handlePlayerChange = () => {
    playerSelectorUI.classList.remove('hidden');
    playerSummary.classList.add('hidden');
    scoringCard.classList.add('hidden');
    resultsCard.classList.add('hidden');
  };

  // Default engine
  let Engine = getScoringEngine('bowling');

  warning.classList.add('hidden');
  playerSelect.disabled = false;

  /**
   * Helper to create a formatted numeric input for pinball scores.
   * @param {number} roundNumber 
   * @param {number} ball 
   * @param {number} machineId 
   * @param {string|number} value 
   * @param {string} placeholder 
   * @returns {HTMLInputElement}
   */
  function createRollInput(roundNumber, ball, machineId, value = '', placeholder = '') {
    const input = document.createElement('input');
    input.placeholder = placeholder || `Ball ${ball} cumulative`;
    input.className = 'roll-input';
    input.value = (value !== '' && value !== undefined) ? formatNumber(value) : '';
    input.dataset.order = roundNumber;
    input.dataset.ball = ball;
    input.dataset.machineId = machineId;
    applyScoreFormatting(input);

    return input;
  }

  /**
   * Constructs the HTML structure for a single round's input row.
   * 
   * @param {Object} round The machine configuration for this round.
   * @param {Object} turnValues Existing scores from the database (if any).
   * @param {boolean} [isLastRound=false] Whether to apply 10th-frame logic.
   * @param {Object} targetPlayer The player being scored.
   * @returns {HTMLElement} The row element.
   */
  async function buildRoundRow(round, turnValues, isLastRound = false, targetPlayer = null) {
    const row = document.createElement('div');
    
    // Centralized Security Logic
    const canUpdateAny = await can(PERMISSIONS.UPDATE_ANY_SCORE);
    
    const isUpdate = !!(turnValues?.ball1 || turnValues?.ball2 || turnValues?.ball3);
    const isStandardLeague = activeLeague?.type === 'standard';
    
    const isSelf = currentUser && String(targetPlayer?.id) === String(currentUser.player_id);
    const isTargetUnregistered = !targetPlayer?.userId;
    
    // Rule: Non-TDs/Admins can only ADD scores, never UPDATE (especially in standard leagues).
    let accessDenied = false;
    let msg = '';

    if (isUpdate && !canUpdateAny) {
        accessDenied = true;
        msg = 'Updates locked';
    } else if (!canUpdateAny) {
        // If they can't manage all, they can only score self or unregistered guests.
        const isAuthorizedToScore = isSelf || isTargetUnregistered;
        if (!isAuthorizedToScore) {
            accessDenied = true;
            msg = 'Guest Only';
        }
    }

    row.className = 'round-row';
    row.style = "display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 8px 12px; margin-bottom: 5px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee;";
    row.dataset.orderNumber = round.orderNumber;

    const bonusHtml = Engine.getBonusTargetHtml(round, isLastRound, formatNumber);

    row.innerHTML = `
      <div class="round-info" style="cursor: pointer; flex: 1; min-width: 200px;">
        <div class="round-label"><b>${Engine.getRoundLabel()} ${round.orderNumber}:</b> ${round.machineName}</div>
        ${Engine.getRowSummaryHtml(round, formatNumber)}
        ${bonusHtml}
        <div class="target-details hidden" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--pb-primary); opacity: 0.8;">
          <div style="font-size: 0.75rem; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; color: var(--pb-primary);">Scoring Thresholds</div>
          ${renderThresholdGrid(Engine.filterThresholds(round.values), formatNumber, Engine, round.value1, round.value2)}
        </div>
      </div>
      <div class="round-inputs-container" style="display: flex; gap: 0.5rem; align-items: center; ${accessDenied ? 'opacity: 0.5; pointer-events: none;' : ''}"></div>
      <button class="save-round-button" ${accessDenied ? 'style="display:none;"' : 'disabled'}>Save</button>
    `;

    if (accessDenied) {
        row.querySelector('.round-inputs-container').insertAdjacentHTML('afterend', `<span style="font-size: 0.7rem; color: #888; text-transform: uppercase;">${msg}</span>`);
    }

    const inputsContainer = row.querySelector('.round-inputs-container');
    const saveBtn = row.querySelector('.save-round-button');
    saveBtn.classList.add('btn-mgmt'); // Apply standardized button style

    row.querySelector('.round-info').addEventListener('click', () => {
      row.querySelector('.target-details').classList.toggle('hidden');
    });

    for (let ball = 1; ball <= 3; ball += 1) {
      const value = turnValues?.[`ball${ball}`] ?? '';
      const placeholder = `Ball ${ball} cumulative`;
      
      // Use round.machineId (master list ID) instead of round.id (Target_Scores row ID)
      // to ensure database foreign key constraints pass.
      const input = createRollInput(round.orderNumber, ball, round.machineId, value, placeholder);
      
      input.addEventListener('input', () => {
        saveBtn.disabled = false;
        saveBtn.classList.add('is-dirty');
      });

      inputsContainer.appendChild(input);
    }

    saveBtn.addEventListener('click', async () => {
      const currentPlayerId = getCurrentPlayerId();
      if (!currentPlayerId) return;

      const ball1 = Number(row.querySelector('[data-ball="1"]').value.replace(/\D/g, '')) || 0;
      const ball2 = Number(row.querySelector('[data-ball="2"]').value.replace(/\D/g, '')) || 0;
      const ball3 = Number(row.querySelector('[data-ball="3"]').value.replace(/\D/g, '')) || 0;

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      await PB_API.saveScore({
        playerId: Number(currentPlayerId),
        orderNumber: Number(round.orderNumber),
        eventId: Number(getActiveEventId()),
        leagueId: Number(getActiveLeagueId()),
        machineId: Number(round.machineId),
        ball1,
        ball2,
        ball3,
      });

      saveBtn.textContent = 'Save';
      saveBtn.classList.remove('is-dirty');
      renderCurrentResults();
    });

    return row;
  }

  /**
   * Populates the player dropdown.
   * If a league is currently selected in the header, only players 
   * assigned to that league's roster are shown. Otherwise, the 
   * entire global player list is displayed.
   */
  async function renderPlayerSelect() {
    try {
      const leagueId = getActiveLeagueId();
      // Fetch all players to ensure we can resolve IDs from URLs even if the 
      // league-specific roster fetch doesn't include a newly added player yet.
      const allPlayers = await PB_API.getPlayers();
      allPlayersCache.length = 0;
      allPlayersCache.push(...allPlayers);

      let selectablePlayers = [];

      if (leagueId) {
        // Fetch the specific league to get the assigned roster
        const league = await PB_API.getLeague(leagueId);
        
        if (league?.participants === 'team') {
          // In a team league, the selectable players are the members of the assigned teams
          const memberMap = new Map();
          (league.teams || []).forEach(team => {
            (team.members || []).forEach(m => memberMap.set(String(m.id), m));
          });
          selectablePlayers = Array.from(memberMap.values());
        } else {
          selectablePlayers = league?.players || [];
        }
      } else {
        selectablePlayers = allPlayers;
      }

      // Requirement: Unregistered users can only select players that are unregistered guests
      if (!currentUser) {
        selectablePlayers = selectablePlayers.filter(p => !p.userId);
      }

      // If a playerId is in the URL, ensure they are at least in the selectable list 
      // for the current session, even if the roster fetch hasn't updated yet.
      const currentPlayerId = getCurrentPlayerId();
      if (currentPlayerId && !selectablePlayers.some(p => String(p.id) === String(currentPlayerId))) {
          const p = allPlayers.find(p => String(p.id) === String(currentPlayerId));
          if (p) selectablePlayers.unshift(p);
      }

      if (!playerSearchInstance) {
        let searchInput = document.getElementById('player-search');
        if (!searchInput) {
          searchInput = document.createElement('input');
          searchInput.id = 'player-search';
          searchInput.type = 'text';
          searchInput.placeholder = 'Type to search player...';
          searchInput.style.width = '100%';
          searchInput.style.marginBottom = '10px';
          searchInput.style.boxSizing = 'border-box';
          if (playerSelect) playerSelect.before(searchInput);
        }

        if (searchInput && playerSelect) {
          playerSearchInstance = createSearchableSelect(searchInput, playerSelect, selectablePlayers, {
            valueKey: 'id',
            labelKey: 'playerName',
            placeholder: selectablePlayers.length === 0 ? 'No players configured' : 'Select a player',
            onSelect: async (val) => {
              if (!val) {
                setCurrentPlayerId('');
              } else {
                setCurrentPlayerId(val);
              }
              await refreshPlayerSelection();
            }
          });
        }
      }

      if (playerSearchInstance) {
        playerSearchInstance.updateOptions('');
      }

      if (currentPlayerId) {
        const player = allPlayersCache.find(p => String(p.id) === String(currentPlayerId));
        if (player && playerSelect) {
          playerSelect.value = currentPlayerId;
          const searchInput = document.getElementById('player-search');
          if (searchInput) searchInput.value = player.playerName;
        return currentPlayerId;
      }
      }
    } catch (err) {
      console.error('Failed to render player selection:', err);
    }
    return null;
  }

  /**
   * Populates the input fields with data retrieved from the API.
   * @param {Array<Object>} scoreRows Raw score data from the database.
   * @param {Object} player The player being scored.
   */
  async function loadScoresIntoForm(scoreRows, player) {
    const scoreMap = scoreRows.reduce((map, row) => {
      map[String(row.orderNumber)] = row;
      return map;
    }, {});
    
    const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

    roundsInput.innerHTML = '';
    for (const round of machines) {
      const isLastRound = round.orderNumber === maxOrder;
      const turnValues = scoreMap[String(round.orderNumber)];

      // Inject last-frame specific hint if defined for this format
      if (isLastRound) {
        const lfHint = Engine.getLastFrameHint?.();
        if (lfHint) {
          const hintDiv = document.createElement('div');
          hintDiv.className = 'hint';
          hintDiv.style = "font-size: 0.75rem; padding: 8px 12px; margin-bottom: 5px; border-left-width: 4px;";
          hintDiv.innerHTML = lfHint;
          roundsInput.appendChild(hintDiv);
        }
      }

      const row = await buildRoundRow(round, turnValues, isLastRound, player);
      roundsInput.appendChild(row);
    }
  }

  /**
   * Handles the state transitions when a new player is selected.
   * Fetches their existing scores and resets the calculation engine.
   */
  async function refreshPlayerSelection() {
    let activePlayerId = await renderPlayerSelect();
    
    // Auto-select logged in user if they are in the roster and no one is selected yet
    if (!activePlayerId && currentUser?.player_id) {
        const isInRoster = allPlayersCache.some(p => String(p.id) === String(currentUser.player_id));
        if (isInRoster) {
            activePlayerId = String(currentUser.player_id);
            setCurrentPlayerId(activePlayerId);
            if (playerSelect) playerSelect.value = activePlayerId;
            // Update search input text if exists
            const search = document.getElementById('player-search');
            const pObj = allPlayersCache.find(p => String(p.id) === activePlayerId);
            if (search && pObj) search.value = pObj.playerName;
        }
    }

    if (!activePlayerId) {
      roundsInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      
      if (playerSelectorUI) {
        playerSelectorUI.classList.remove('hidden');
        playerSummary.classList.add('hidden');
      }
      return;
    }

    const player = allPlayersCache.find(p => String(p.id) === String(activePlayerId));
    playerSelectorUI.classList.add('hidden');

    renderActionSummary(playerSummary, `Player: ${player?.playerName || 'Selected'}`, [
      { text: 'Change', onclick: handlePlayerChange }
    ]);

    warning.classList.add('hidden');
    scoringCard.classList.remove('hidden');
    resultsCard.classList.remove('hidden');
    roundsInput.querySelectorAll('input').forEach((input) => (input.disabled = false));
    
    const scores = await PB_API.getScores(Number(activePlayerId), Number(getActiveEventId()));
    await loadScoresIntoForm(scores, player);
    renderCurrentResults();
  }

  /**
   * Aggregates current input values into a map for the scoring engine.
   * @returns {Object} Map of order_number to ball scores.
   */
  function getScoreMapFromInputs() {
    const scoreMap = {};
    roundsInput.querySelectorAll('.round-row').forEach((row) => {
      const orderNum = Number(row.dataset.orderNumber);
      scoreMap[orderNum] = {
        ball1: Number(row.querySelector('[data-ball="1"]').value.replace(/\D/g, '')) || 0,
        ball2: Number(row.querySelector('[data-ball="2"]').value.replace(/\D/g, '')) || 0,
        ball3: Number(row.querySelector('[data-ball="3"]').value.replace(/\D/g, '')) || 0,
      };
    });
    return scoreMap;
  }

  /**
   * Performs a real-time calculation of the bowling game based on the current 
   * form state and renders the summary table.
   */
  function renderCurrentResults() {
    const scoreMap = getScoreMapFromInputs();
    const { turnResults, totalDisplay } = Engine.calculateTurnResults(machines, scoreMap);

    resultsBody.innerHTML = turnResults
      .map(result => `
          <tr>
            <td>${result.orderNumber}</td>
            <td>${result.machineName}</td>
            <td>${result.displayMark}</td>
            <td>${result.displayRunningTotal}</td>
          </tr>
      `)
      .join('');

    totalScore.textContent = totalDisplay;
    resultsEmpty.classList.add('hidden');
    resultsPanel.classList.remove('hidden');
  }

  /**
   * Core refresh logic triggered when the active event changes.
   * Loads the machine lineup for the specific night.
   * @async
   */
  const refresh = async () => {
    const eventId = getActiveEventId();
    if (!eventId) {
      roundsInput.innerHTML = '';
      tournamentSelectorUI.classList.remove('hidden');
      tournamentSummary.classList.add('hidden');
      playerSelectionCard.classList.add('hidden');
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      return;
    }
    
    // Fetch leagues and machine targets in parallel. User is already fetched at init.
    const [leagues, eventTargets] = await Promise.all([
      PB_API.getLeagues(),
      PB_API.getTargetScores(eventId)
    ]);

    // Map raw database columns to camelCase and the 'values' object expected by the engine
    const machinesNormalized = eventTargets.map(t => ({
      ...t,
      machineId: t.machineId || t.machine_id,
      machineName: t.machineName || t.machine_name,
      orderNumber: t.orderNumber || t.order_number,
      value1: Number(t.value1 || 0),
      value2: Number(t.value2 || 0),
      values: t.values || {
        1: Number(t.score1 || 0), 2: Number(t.score2 || 0), 3: Number(t.score3 || 0), 
        4: Number(t.score4 || 0), 5: Number(t.score5 || 0), 6: Number(t.score6 || 0), 
        7: Number(t.score7 || 0), 8: Number(t.score8 || 0), 9: Number(t.score9 || 0), 10: Number(t.score10 || 0)
      }
    }));

    const league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
    const event = league?.events?.find(e => String(e.id) === String(eventId));

    const isSession = league?.type === 'session';
    const leagueTitle = isSession ? '' : `<div style="font-weight: bold;">League: ${league?.name || 'Unknown'}</div>`;
    const eventTitle = `<div style="font-size: 0.9rem; opacity: 0.8;">Event: ${event?.eventName || 'Event'}</div>`;
    const summaryTitle = `${leagueTitle}${eventTitle}`;

    tournamentSelectorUI.classList.add('hidden');
    renderActionSummary(tournamentSummary, summaryTitle, [
      { text: 'Change', onclick: handleTournamentChange },
      { text: 'Print Blank Score Sheet', onclick: () => printBlankScoreSheet(machines, league?.name, event?.eventName, format), hidden: eventTargets.length === 0 }
    ]);

    activeLeague = league;
    const format = event?.scoringFormat || league?.scoringFormat || 'bowling';
    Engine = getScoringEngine(format);
    applyPreferredTheme(format);

    // Update the scoring section title using the Engine's specific terminology (Frame vs Hole)
    const scoringHeader = scoringCard.querySelector('h2');
    if (scoringHeader) {
      scoringHeader.textContent = `Enter ${Engine.getRoundLabel()} Scores`;
    }

    // Update the general hint text based on the active engine
    const scoringHint = document.getElementById('scoring-hint');
    if (scoringHint) {
      scoringHint.textContent = Engine.getScoringHint();
    }

    machines = machinesNormalized;

    if (machines.length === 0) {
      warning.textContent = 'No target scores have been configured for the selected event.';
      warning.classList.remove('hidden');
      roundsInput.innerHTML = '';
      return;
    }

    // Only reveal the player card once we know we have machines to score
    playerSelectionCard.classList.remove('hidden');
    await refreshPlayerSelection();

    // Update the results table header to use "Frame" (mapping data from order_number)
    const resultsTableHeader = resultsPanel.querySelector('thead tr');
    if (resultsTableHeader) {
      const roundHeader = resultsTableHeader.querySelector('th:first-child');
      if (roundHeader) {
        roundHeader.textContent = Engine.getRoundLabel();
      }
    }
  };

  await initTournamentSelector('.tournament-selector-container', { onRefresh: refresh, existingLeagues: initialLeagues });
}