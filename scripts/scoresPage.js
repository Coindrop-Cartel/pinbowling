import { PB_API, setCurrentPlayerId, getCurrentPlayerId } from './api.js';
import { getScoringEngine } from './engine.js';
import { formatNumber, applyScoreFormatting, getActiveEventId, getActiveLeagueId, printBlankScoreSheet } from './utils.js';
import { initTournamentSelector } from './tournamentSelector.js';
import { createSearchableSelect } from './uiComponents.js';

/**
 * Initializes the Player Scoring page.
 */
export async function initScoresPage() {
  const framesInput = document.getElementById('frames-input');
  const resultsPanel = document.getElementById('results-panel');
  const resultsBody = document.getElementById('results-body');
  const totalScore = document.getElementById('total-score');
  const resultsEmpty = document.getElementById('results-empty');
  const warning = document.getElementById('player-warning');
  const playerSelect = document.getElementById('player-select');
  const scoringHeader = document.getElementById('scoring-header');
  const playerSelectionCard = document.getElementById('player-selection-card');
  const scoringCard = document.getElementById('scoring-card');
  const resultsCard = document.getElementById('results-card');

  let playerSearchInstance = null;
  let allPlayersCache = [];
  let machines = [];
  const printSheetBtn = document.getElementById('print-sheet-btn');

  // Prepare for multiple scoring formats; default to bowling for now.
  const Engine = getScoringEngine('bowling');

  // Ensure selection starts empty on page initialization
  setCurrentPlayerId('');
  if (printSheetBtn) {
    printSheetBtn.addEventListener('click', () => {
      printBlankScoreSheet(machines);
    });
  }

  warning.classList.add('hidden');
  playerSelect.disabled = false;

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

  function buildRoundRow(round, turnValues, isLastRound = false) {
    const row = document.createElement('div');
    row.className = 'frame-row';
    row.dataset.order = round.order_number;

    const bonusHtml = Engine.getBonusTargetHtml(round, isLastRound, formatNumber);

    row.innerHTML = `
      <div class="frame-info" style="cursor: pointer;">
        <div class="frame-label">Round ${round.order_number}</div>
        <div class="frame-machine">${round.machine_name}</div>
        <div class="strike-target" style="font-size: 0.8rem; color: #000; margin-top: 4px;">Strike: <b>${formatNumber(round.values[10])}</b></div>
        ${bonusHtml}
        <div class="target-details hidden" style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ccc;">
          <div style="font-size: 0.75rem; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; color: #666;">Scoring Thresholds</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
            ${Object.entries(round.values)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([rank, val]) => `<div style="font-size: 0.8rem;"><b>${rank}:</b> ${formatNumber(val)}</div>`)
              .join('')}
          </div>
        </div>
      </div>
      <div class="frame-inputs-container"></div>
      <button class="save-frame-button" disabled>Save</button>
    `;

    const inputsContainer = row.querySelector('.frame-inputs-container');
    const saveBtn = row.querySelector('.save-frame-button');

    row.querySelector('.frame-info').addEventListener('click', () => {
      row.querySelector('.target-details').classList.toggle('hidden');
    });

    for (let ball = 1; ball <= 3; ball += 1) {
      const value = rollValues?.[`ball${ball}`] ?? '';
      const placeholder = `Ball ${ball} cumulative`;
      
      // Use frame.machine_id (master list ID) instead of frame.id (Target_Scores row ID)
      // to ensure database foreign key constraints pass.
      const input = createRollInput(frame.order_number, ball, frame.machine_id, value, placeholder);
      
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
        order_number: round.order_number,
        eventId: Number(getActiveEventId()),
        machineId: round.machine_id, 
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
    // Fetch the global player registry to ensure consistency with the scoreboard
    const players = await PB_API.getPlayers();
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
        playerSelect.before(searchInput);
      }

      playerSearchInstance = createSearchableSelect(searchInput, playerSelect, allPlayersCache, {
        valueKey: 'id',
        labelKey: 'player_name',
        placeholder: players.length === 0 ? 'No players configured' : 'Select a player',
        onSelect: async (val) => {
          if (!val) {
            setCurrentPlayerId('');
          } else {
            setCurrentPlayerId(val);
          }
          await refreshPlayerSelection();
        }
      });
      playerSearchInstance.updateOptions('');
    } else {
      playerSearchInstance.updateOptions('');
    }

    if (currentPlayerId && players.some((player) => String(player.id) === currentPlayerId)) {
      playerSelect.value = currentPlayerId;
      return currentPlayerId;
    }

    return null;
  }

  function loadScoresIntoForm(scoreRows) {
    const scoreMap = scoreRows.reduce((map, row) => {
      map[String(row.order_number)] = row;
      return map;
    }, {});
    
    const maxOrder = machines.length > 0 ? Math.max(...machines.map(m => m.order_number)) : 0;

    framesInput.innerHTML = '';
    machines.forEach((round) => {
      const turnValues = scoreMap[String(round.order_number)];
      framesInput.appendChild(buildRoundRow(round, turnValues, round.order_number === maxOrder));
    });
  }

  async function refreshPlayerSelection() {
    const activePlayerId = await renderPlayerSelect();
    if (!activePlayerId) {
      framesInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      return;
    }

    warning.classList.add('hidden');
    scoringCard.classList.remove('hidden');
    resultsCard.classList.remove('hidden');
    framesInput.querySelectorAll('input').forEach((input) => (input.disabled = false));
    
    const scores = await PB_API.getScores(Number(activePlayerId), Number(getActiveEventId()));
    loadScoresIntoForm(scores);
    renderCurrentResults();
  }

  function getScoreMapFromInputs() {
    const scoreMap = {};
    framesInput.querySelectorAll('.frame-row').forEach((row) => {
      const orderNum = Number(row.dataset.order);
      scoreMap[orderNum] = {
        ball1: Number(row.querySelector('[data-ball="1"]').value.replace(/\D/g, '')) || 0,
        ball2: Number(row.querySelector('[data-ball="2"]').value.replace(/\D/g, '')) || 0,
        ball3: Number(row.querySelector('[data-ball="3"]').value.replace(/\D/g, '')) || 0,
      };
    });
    return scoreMap;
  }

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
          <td>${result.order}</td>
          <td>${result.machine}</td>
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

  const refresh = async () => {
    const eventId = getActiveEventId();
    if (!eventId) {
      framesInput.innerHTML = '';
      scoringHeader.classList.add('hidden');
      playerSelectionCard.classList.add('hidden');
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      return;
    }
    
    // Reset visibility of lower cards while we load the new event context
    scoringCard.classList.add('hidden');
    resultsCard.classList.add('hidden');

    machines = await PB_API.getTargetScores(eventId);

    scoringHeader.classList.remove('hidden');
    playerSelectionCard.classList.remove('hidden');

    if (machines.length === 0) {
      warning.textContent = 'No target scores have been configured for the selected event.';
      warning.classList.remove('hidden');
      framesInput.innerHTML = '';
      return;
    }
    await refreshPlayerSelection();

    // Update the results table header to use "Frame" (mapping data from order_number)
    const resultsTableHeader = resultsPanel.querySelector('thead tr');
    if (resultsTableHeader) {
      const roundHeader = resultsTableHeader.querySelector('th:first-child');
      if (roundHeader) {
        roundHeader.textContent = 'Round';
      }
    }

  };

  await initTournamentSelector(refresh);
  await refresh();
}