import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { formatNumber, applyScoreFormatting, getActiveEventId, getActiveLeagueId, setCurrentPlayerId, getCurrentPlayerId, renderThresholdGrid } from '@scripts/utils.js';
import { initTournamentSelector, createSearchableSelect } from '@ui/uiComponents.js';
import { printBlankScoreSheet } from '@ui/printing.js';

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

  let playerSearchInstance = null;
  let allPlayersCache = [];
  let machines = [];
  const printSheetBtn = document.getElementById('print-sheet-btn');

  // Selection UI Toggles
  const tournamentSelectorUI = document.getElementById('tournament-selector-ui');
  const tournamentSummary = document.getElementById('tournament-summary');
  const tournamentSummaryText = document.getElementById('tournament-summary-text');
  const changeTournamentBtn = document.getElementById('change-tournament-btn');

  const playerSelectorUI = document.getElementById('player-selector-ui');
  const playerSummary = document.getElementById('player-summary');
  const playerSummaryText = document.getElementById('player-summary-text');
  const changePlayerBtn = document.getElementById('change-player-btn');

  changeTournamentBtn.onclick = () => {
    tournamentSelectorUI.classList.remove('hidden');
    tournamentSummary.classList.add('hidden');

    // Clear dependent UI to prevent inconsistent states
    playerSelectionCard.classList.add('hidden');
    playerSummary.classList.add('hidden');
    scoringCard.classList.add('hidden');
    resultsCard.classList.add('hidden');

    // Reset active player state
    setCurrentPlayerId('');
  };

  changePlayerBtn.onclick = () => {
    playerSelectorUI.classList.remove('hidden');
    playerSummary.classList.add('hidden');

    // Hide scoring and results until a new player is confirmed
    scoringCard.classList.add('hidden');
    resultsCard.classList.add('hidden');
  };

  // Default engine
  let Engine = getScoringEngine('bowling');

  if (printSheetBtn) {
    printSheetBtn.addEventListener('click', () => {
      printBlankScoreSheet(machines);
    });
  }

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
   * @returns {HTMLElement} The row element.
   */
  function buildRoundRow(round, turnValues, isLastRound = false) {
    const row = document.createElement('div');
    row.className = 'round-row';
    row.style = "display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: 8px 12px; margin-bottom: 5px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee;";
    row.dataset.orderNumber = round.orderNumber;

    const bonusHtml = Engine.getBonusTargetHtml(round, isLastRound, formatNumber);

    row.innerHTML = `
      <div class="round-info" style="cursor: pointer; flex: 1; min-width: 200px;">
        <div class="round-label"><b>${Engine.getRoundLabel()} ${round.orderNumber}:</b> ${round.machineName}</div>
        <div class="strike-target" style="font-size: 0.8rem; color: #000; margin-top: 4px;"><b>${Engine.getPrimaryTargetLabel()}:</b> ${formatNumber(round.value1)}</div>
        ${bonusHtml}
        <div class="target-details hidden" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ccc;">
          <div style="font-size: 0.75rem; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; color: #666;">Scoring Thresholds</div>
          ${renderThresholdGrid(Engine.filterThresholds(round.values), formatNumber, Engine, round.value1, round.value2)}
        </div>
      </div>
      <div class="round-inputs-container" style="display: flex; gap: 0.5rem; align-items: center;"></div>
      <button class="save-round-button" disabled>Save</button>
    `;

    const inputsContainer = row.querySelector('.round-inputs-container');
    const saveBtn = row.querySelector('.save-round-button');

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
      let players = [];

      if (leagueId) {
        // Fetch the specific league to get the assigned roster
        const league = await PB_API.getLeague(leagueId);
        players = league?.players || [];
      } else {
        // Fallback to the global player registry if no league is active
        players = (await PB_API.getPlayers()) || [];
      }

      allPlayersCache.length = 0;
      allPlayersCache.push(...players);

      const currentPlayerId = getCurrentPlayerId();

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
          playerSearchInstance = createSearchableSelect(searchInput, playerSelect, allPlayersCache, {
            valueKey: 'id',
            labelKey: 'playerName',
            placeholder: allPlayersCache.length === 0 ? 'No players configured' : 'Select a player',
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

      if (currentPlayerId && allPlayersCache.some((player) => String(player.id) === String(currentPlayerId))) {
        if (playerSelect) playerSelect.value = currentPlayerId;
        return currentPlayerId;
      }
    } catch (err) {
      console.error('Failed to render player selection:', err);
    }
    return null;
  }

  /**
   * Populates the input fields with data retrieved from the API.
   * @param {Array<Object>} scoreRows Raw score data from the database.
   */
  function loadScoresIntoForm(scoreRows) {
    const scoreMap = scoreRows.reduce((map, row) => {
      map[String(row.orderNumber)] = row;
      return map;
    }, {});
    
    const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.orderNumber)) : 0;

    roundsInput.innerHTML = '';
    machines.forEach((round) => {
      const turnValues = scoreMap[String(round.orderNumber)];
      roundsInput.appendChild(buildRoundRow(round, turnValues, round.orderNumber === maxOrder));
    });
  }

  /**
   * Handles the state transitions when a new player is selected.
   * Fetches their existing scores and resets the calculation engine.
   */
  async function refreshPlayerSelection() {
    const activePlayerId = await renderPlayerSelect();

    if (!activePlayerId) {
      roundsInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      playerSelectorUI.classList.remove('hidden');
      playerSummary.classList.add('hidden');
      return;
    }

    const player = allPlayersCache.find(p => String(p.id) === String(activePlayerId));
    playerSummaryText.textContent = player ? `Player: ${player.playerName}` : 'Player Selected';
    playerSelectorUI.classList.add('hidden');
    playerSummary.classList.remove('hidden');

    warning.classList.add('hidden');
    scoringCard.classList.remove('hidden');
    resultsCard.classList.remove('hidden');
    roundsInput.querySelectorAll('input').forEach((input) => (input.disabled = false));
    
    const scores = await PB_API.getScores(Number(activePlayerId), Number(getActiveEventId()));
    loadScoresIntoForm(scores);
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
    const { turnResults, total: finalTotal } = Engine.calculateTurnResults(machines, scoreMap);
    let runningTotal = 0;
    resultsBody.innerHTML = turnResults
      .map(
        (result) => {
          runningTotal += result.score;
          return `
        <tr>
          <td>${result.orderNumber}</td>
          <td>${result.machineName}</td>
          <td>${result.mark}</td>
          <td>${formatNumber(runningTotal)}</td>
        </tr>
          `;
        })
      .join('');

    totalScore.textContent = formatNumber(finalTotal);
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
    
    // Fetch leagues and machine targets in parallel
    const [leagues, eventTargets] = await Promise.all([
      PB_API.getLeagues(),
      PB_API.getTargetScores(eventId)
    ]);

    const league = leagues.find(l => String(l.id) === String(getActiveLeagueId()));
    const event = league?.events?.find(e => String(e.id) === String(eventId));

    const isSession = league?.type === 'session';
    if (changeTournamentBtn) changeTournamentBtn.classList.toggle('hidden', isSession);

    const leagueLabel = isSession ? '' : `${league?.name} - `;
    tournamentSummaryText.textContent = `${leagueLabel}${event?.eventName || 'Event'}`;

    Engine = getScoringEngine(event?.scoringFormat || league?.scoringFormat || 'bowling');

    machines = eventTargets;

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

  await initTournamentSelector('.tournament-selector-container', { onRefresh: refresh });
}