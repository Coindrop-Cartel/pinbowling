import { PB_API } from '@services/api.js';
import { filterLeaguesForUser, filterPlayersForUser, getScoreAccessLevel, can } from '@services/auth.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId, formatNumber, applyScoreFormatting, renderThresholdGrid, setCurrentPlayerId, getCurrentPlayerId } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { createSearchableSelect, renderActionSummary, initTournamentSelector } from '@ui/selectors.js';
import { normalizeScores, normalizeTargets, buildScoreMapFromDOM, buildScoreMapFromRows } from '@services/normalizer.js';
import { applyPreferredTheme } from '@ui/branding.js';
import { printBlankScoreSheet } from '@ui/printing.js';

/**
 * Logic for the Scores page: viewing and editing player scores across events.
 * @module pages/scores
 */

/**
 * Initializes the Scores page: loads score data, renders the score table, and binds editing controls.
 * @async
 * @returns {Promise<void>}
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
  
  let allLeaguesCache = []; // Module-level cache for leagues
  let tournamentSelector = null;
  // Fetch leagues and current user once at the start. 
  const [leaguesFromApi, user] = await Promise.all([
    PB_API.getLeagues(),
    PB_API.getCurrentUser()
  ]);
  allLeaguesCache = leaguesFromApi; // Update the module-level cache
  // Requirement: Unregistered users only see leagues that have at least one guest player.
  // The initialLeagues filtering logic here is now handled by initTournamentSelector.

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
    const active = allLeaguesCache.find(l => String(l.id) === String(initialLeagueId)); // Use the full cache
    if (active && active.type !== 'standard') {
      setActiveLeagueId('');
      initialLeagueId = '';
      setActiveEventId('');
      initialEventId = '';
    }
  }
  let lastEventId = initialEventId;
  let lastLeagueId = initialLeagueId;

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
    
    const playerSearch = document.getElementById('player-search');
    if (playerSearch) playerSearch.value = '';
    if (playerSelect) playerSelect.value = '';

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

    // Clear selection context when manually changing players
    setCurrentPlayerId('');
    const playerSearch = document.getElementById('player-search');
    if (playerSearch) playerSearch.value = '';
    if (playerSelect) playerSelect.value = '';
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
    const row = document.createElement('div'); // Centralized Security Logic
    const { access: accessLevel, reason: msg } = await getScoreAccessLevel(currentUser, targetPlayer, turnValues);
    const isAccessDenied = accessLevel === 'denied';

    row.className = 'round-row';
    row.dataset.orderNumber = round.orderNumber;

    const bonusHtml = Engine.getBonusTargetHtml(round, isLastRound, formatNumber);

    row.innerHTML = `
      <div class="round-info">
        <div class="round-label"><b>${Engine.getRoundLabel()} ${round.orderNumber}:</b> ${round.machineName}</div>
        ${Engine.getRowSummaryHtml(round, formatNumber)}
        ${bonusHtml}
        <div class="target-details hidden">
          <div class="small threshold-heading">Scoring Thresholds</div>
          ${renderThresholdGrid(Engine.filterThresholds(round.values), formatNumber, Engine, round.value1, round.value2)}
        </div>
      </div>
      <div class="round-inputs-container ${isAccessDenied ? 'round-inputs-disabled' : ''}"></div>
      <button class="save-round-button btn-mgmt" ${isAccessDenied ? 'hidden' : ''} disabled>Save</button>
    `;

    if (isAccessDenied) {
      row.querySelector('.round-inputs-container').insertAdjacentHTML('afterend', `<span class="round-msg">${msg}</span>`);
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
        // Use the cached leagues to find the specific league and its roster
        const league = allLeaguesCache.find(l => String(l.id) === String(leagueId));
        
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
      selectablePlayers = filterPlayersForUser(selectablePlayers, currentUser);

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
          searchInput.className = 'search-input-full';
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
        playerSearchInstance.setData(selectablePlayers);
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
    const normalized = normalizeScores(scoreRows || []);
    const scoreMap = normalized.reduce((map, row) => {
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
          hintDiv.className = 'hint small';
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
    return buildScoreMapFromDOM(roundsInput);
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
    const leagueId = getActiveLeagueId();

    if (!eventId) {
      setCurrentPlayerId('');
      const playerSearch = document.getElementById('player-search');
      if (playerSearch) playerSearch.value = '';
      if (playerSelect) playerSelect.value = '';

      roundsInput.innerHTML = '';
      tournamentSelectorUI.classList.remove('hidden');
      tournamentSummary.classList.add('hidden');
      playerSelectionCard.classList.add('hidden');
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      return;
    }
    
    // If the tournament context (league or event) has changed, reset the player 
    // selection to ensure the search box is cleared and we don't carry over 
    // a player context that may not exist in the new roster.
    if (eventId !== lastEventId || leagueId !== lastLeagueId) {
      const playerSearch = document.getElementById('player-search');
      if (playerSearch) playerSearch.value = '';
      if (playerSelect) playerSelect.value = '';
      setCurrentPlayerId('');
      lastEventId = eventId;
      lastLeagueId = leagueId;
    }

    // Fetch leagues and machine targets in parallel. User is already fetched at init.
    const [leagues, eventTargets] = await Promise.all([
      PB_API.getLeagues(),
      PB_API.getTargetScores(eventId)
    ]);
    allLeaguesCache = leagues; // Update the cache with fresh data

    // Refresh the league list in the selector to catch any mid-session roster changes
    if (tournamentSelector) {
      tournamentSelector.setData(allLeaguesCache);
    }

    // Normalize targets into engine-friendly shape
    const machinesNormalized = normalizeTargets(eventTargets);

    const league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
    const event = league?.events?.find(e => String(e.id) === String(eventId));

    const isSession = league?.type === 'session';
    const leagueTitle = isSession ? '' : `<div class="meta-strong">League: ${league?.name || 'Unknown'}</div>`;
    const eventTitle = `<div class="meta-muted">Event: ${event?.eventName || 'Event'}</div>`;
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
      warning.innerHTML = 'This event has not been setup.';
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

  tournamentSelector = await initTournamentSelector('.tournament-selector-container', { 
    onRefresh: refresh, 
    existingLeagues: allLeaguesCache, // Pass the full list of leagues
    currentUser: currentUser // Pass the current user for filtering
  });
}