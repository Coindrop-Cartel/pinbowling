import { PB_API, setCurrentPlayerId, getCurrentPlayerId } from './api.js';
import { BowlingEngine } from './engine.js';
import { formatNumber, applyScoreFormatting, getActiveEventId, getActiveLeagueId, printBlankScoreSheet } from './utils.js';
import { initTournamentSelector } from './tournamentSelector.js';

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
  const playerFileInfo = document.getElementById('player-file-info');
  const scoringHeader = document.getElementById('scoring-header');
  const playerSelectionCard = document.getElementById('player-selection-card');
  const scoringCard = document.getElementById('scoring-card');
  const resultsCard = document.getElementById('results-card');

  let machines = [];
  const printSheetBtn = document.getElementById('print-sheet-btn');

  // Ensure selection starts empty on page initialization
  setCurrentPlayerId('');
  if (printSheetBtn) {
    printSheetBtn.addEventListener('click', () => {
      printBlankScoreSheet(machines);
    });
  }

  warning.classList.add('hidden');
  playerSelect.disabled = false;

  function createRollInput(frameNumber, ball, machineId, value = '', placeholder = '') {
    const input = document.createElement('input');
    input.placeholder = placeholder || `Ball ${ball} cumulative`;
    input.className = 'roll-input';
    input.value = (value !== '' && value !== undefined) ? formatNumber(value) : '';
    input.dataset.frame = frameNumber;
    input.dataset.ball = ball;
    input.dataset.machineId = machineId;
    applyScoreFormatting(input);

    return input;
  }

  function buildFrameRow(frame, rollValues) {
    const row = document.createElement('div');
    row.className = 'frame-row';
    row.dataset.frame = frame.frame_number;

    let extraTargets = '';
    if (frame.frame_number === 10) {
      const t1 = Math.round(frame.values[10] * 1.3);
      const t2 = Math.round(t1 * 1.3);
      extraTargets = `
          <div class="strike-target" style="font-size: 0.8rem; color: #000; margin-top: 2px;">Target 1: <b>${formatNumber(t1)}</b></div>
          <div class="strike-target" style="font-size: 0.8rem; color: #000; margin-top: 2px;">Target 2: <b>${formatNumber(t2)}</b></div>
      `;
    }

    row.innerHTML = `
      <div class="frame-info">
        <div class="frame-label">Frame ${frame.frame_number}</div>
        <div class="frame-machine">${frame.machine_name}</div>
        <div class="strike-target" style="font-size: 0.8rem; color: #000; margin-top: 4px;">Strike: <b>${formatNumber(frame.values[10])}</b></div>
        ${extraTargets}
      </div>
      <div class="frame-inputs-container"></div>
      <button class="save-frame-button" disabled>Save</button>
    `;

    const inputsContainer = row.querySelector('.frame-inputs-container');
    const saveBtn = row.querySelector('.save-frame-button');

    for (let ball = 1; ball <= 3; ball += 1) {
      const value = rollValues?.[`ball${ball}`] ?? '';
      const placeholder = `Ball ${ball} cumulative`;
      
      // Use frame.machine_id (master list ID) instead of frame.id (Target_Scores row ID)
      // to ensure database foreign key constraints pass.
      const input = createRollInput(frame.frame_number, ball, frame.machine_id, value, placeholder);
      
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
        frame: frame.frame_number,
        eventId: Number(getActiveEventId()),
        machineId: frame.machine_id, 
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

    const currentPlayerId = getCurrentPlayerId();

    playerSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = players.length === 0 ? 'No players configured' : 'Select a player';
    playerSelect.appendChild(placeholder);

    players.forEach((player) => {
      const option = document.createElement('option');
      option.value = String(player.id);
      option.textContent = player.player_name;
      playerSelect.appendChild(option);
    });

    if (currentPlayerId && players.some((player) => String(player.id) === currentPlayerId)) {
      playerSelect.value = currentPlayerId;
      const selectedPlayer = players.find((player) => String(player.id) === currentPlayerId);
      updatePlayerFileInfo(selectedPlayer);
      return currentPlayerId;
    }

    updatePlayerFileInfo(null);
    return null;
  }

  function updatePlayerFileInfo(player) {
    if (!player) {
      playerFileInfo.classList.add('hidden');
      return;
    }
    playerFileInfo.textContent = `Selected player: ${player.player_name}`;
    playerFileInfo.classList.remove('hidden');
  }

  function loadScoresIntoForm(scoreRows) {
    const scoreMap = scoreRows.reduce((map, row) => {
      map[String(row.frame)] = row;
      return map;
    }, {});

    framesInput.innerHTML = '';
    machines.forEach((frame) => {
      const rollValues = scoreMap[String(frame.frame_number)];
      framesInput.appendChild(buildFrameRow(frame, rollValues));
    });
  }

  async function refreshPlayerSelection() {
    const activePlayerId = await renderPlayerSelect();
    if (!activePlayerId) {
      framesInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      scoringCard.classList.add('hidden');
      resultsCard.classList.add('hidden');
      resultsPanel.classList.add('hidden');
      resultsEmpty.classList.add('hidden');
      return;
    }

    warning.classList.add('hidden');
    scoringCard.classList.remove('hidden');
    resultsCard.classList.remove('hidden');
    resultsPanel.classList.remove('hidden');
    framesInput.querySelectorAll('input').forEach((input) => (input.disabled = false));
    
    const scores = await PB_API.getScores(Number(activePlayerId), Number(getActiveEventId()));
    loadScoresIntoForm(scores);
    renderCurrentResults();
  }

  playerSelect.addEventListener('change', async () => {
    const selectedId = playerSelect.value;
    if (!selectedId) {
      setCurrentPlayerId('');
    } else {
      setCurrentPlayerId(selectedId);
    }
    await refreshPlayerSelection();
  });

  function getScoreMapFromInputs() {
    const scoreMap = {};
    framesInput.querySelectorAll('.frame-row').forEach((row) => {
      const frameNumber = Number(row.dataset.frame);
      scoreMap[frameNumber] = {
        ball1: Number(row.querySelector('[data-ball="1"]').value.replace(/\D/g, '')) || 0,
        ball2: Number(row.querySelector('[data-ball="2"]').value.replace(/\D/g, '')) || 0,
        ball3: Number(row.querySelector('[data-ball="3"]').value.replace(/\D/g, '')) || 0,
      };
    });
    return scoreMap;
  }

  function renderCurrentResults() {
    const scoreMap = getScoreMapFromInputs();
    const { frameResults, total: finalTotal } = BowlingEngine.calculateFrameResults(machines, scoreMap);
    let runningTotal = 0;
    resultsBody.innerHTML = frameResults
      .map(
        (result) => {
          runningTotal += result.score;
          return `
        <tr>
          <td>${result.frame}</td>
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
      resultsPanel.classList.add('hidden');
      return;
    }

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
  };

  await initTournamentSelector(refresh);
  await refresh();
}