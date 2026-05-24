const CURRENT_PLAYER_KEY = "pinbowling-current-player-id";

function getCurrentPlayerId() {
  return localStorage.getItem(CURRENT_PLAYER_KEY);
}

function setCurrentPlayerId(playerId) {
  if (playerId) {
    localStorage.setItem(CURRENT_PLAYER_KEY, playerId);
  } else {
    localStorage.removeItem(CURRENT_PLAYER_KEY);
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }
  return response.json();
}

async function getMachines() {
  return fetchJSON('api/machines.php');
}

async function createMachine(machine) {
  return fetchJSON('api/machines.php', {
    method: 'POST',
    body: JSON.stringify(machine),
  });
}

async function updateMachine(id, machine) {
  return fetchJSON(`api/machines.php?id=${id}`, {
    method: 'PUT',
    body: JSON.stringify(machine),
  });
}

async function deleteMachine(id) {
  return fetchJSON(`api/machines.php?id=${id}`, {
    method: 'DELETE',
  });
}

async function getPlayers() {
  return fetchJSON('api/players.php');
}

async function createPlayer(player_name) {
  return fetchJSON('api/players.php', {
    method: 'POST',
    body: JSON.stringify({ player_name }),
  });
}

async function getScores(playerId) {
  return fetchJSON(`api/scores.php?playerId=${playerId}`);
}

async function saveScore(score) {
  return fetchJSON('api/scores.php', {
    method: 'POST',
    body: JSON.stringify(score),
  });
}

async function clearScores(playerId) {
  return fetchJSON(`api/scores.php?playerId=${playerId}`, {
    method: 'DELETE',
  });
}

function buildFrameValues(score10, score1) {
  const values = {};

  if (score10 > 0 && score1 > 0) {
    for (let rank = 10; rank >= 1; rank -= 1) {
      const fraction = (rank - 1) / 9;
      values[rank] = Math.round(score1 + (score10 - score1) * fraction);
    }
    return values;
  }

  if (score10 > 0) {
    for (let rank = 10; rank >= 1; rank -= 1) {
      values[rank] = Math.round(score10 * (rank / 10));
    }
    return values;
  }

  if (score1 > 0) {
    for (let rank = 1; rank <= 10; rank += 1) {
      values[rank] = Math.round(score1 * rank);
    }
    return values;
  }

  return null;
}

function renderPreview(score10Input, score1Input, previewValues) {
  const score10 = Number(score10Input.value);
  const score1 = Number(score1Input.value);
  const values = buildFrameValues(score10, score1);

  if (!values) {
    previewValues.innerHTML = "<div>Enter a 10 score or a 1 score to preview values for 9–2.</div>";
    return;
  }

  previewValues.innerHTML = Object.entries(values)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([rank, value]) => `<div><strong>${rank}:</strong> ${value}</div>`)
    .join("");
}

async function initConfigPage() {
  const frameSelect = document.getElementById('frame-number');
  const form = document.getElementById('frame-form');
  const cancelEdit = document.getElementById('cancel-edit');
  const framesTable = document.getElementById('frames-table');
  const listEmpty = document.getElementById('list-empty');
  let editingMachineId = null;

  const score10Input = document.getElementById('value-10');
  const score1Input = document.getElementById('value-1');
  const previewValues = document.getElementById('preview-values');

  for (let i = 1; i <= 10; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = i;
    frameSelect.appendChild(option);
  }

  score10Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues));
  score1Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues));
  renderPreview(score10Input, score1Input, previewValues);

  async function render() {
    const frames = await getMachines();
    const tbody = framesTable.querySelector('tbody');
    tbody.innerHTML = '';

    if (frames.length === 0) {
      framesTable.classList.add('hidden');
      listEmpty.classList.remove('hidden');
      return;
    }

    framesTable.classList.remove('hidden');
    listEmpty.classList.add('hidden');

    frames.forEach((frame) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${frame.frame_number}</td>
        <td>${frame.machine_name}</td>
        <td>${Object.entries(frame.values)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' \u2022 ')}</td>
        <td>
          <button type="button" class="edit-button" data-id="${frame.id}">Edit</button>
          <button type="button" class="delete-button" data-id="${frame.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.edit-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const machineId = Number(button.dataset.id);
        const frame = (await getMachines()).find((item) => item.id === machineId);
        if (!frame) return;
        editingMachineId = machineId;
        frameSelect.value = String(frame.frame_number);
        frameSelect.disabled = true;
        document.getElementById('machine-name').value = frame.machine_name;
        score10Input.value = frame.values[10] || '';
        score1Input.value = frame.values[1] || '';
        renderPreview(score10Input, score1Input, previewValues);
        form.querySelector('button[type="submit"]').textContent = 'Update Frame';
        cancelEdit.classList.remove('hidden');
      });
    });

    tbody.querySelectorAll('.delete-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const machineId = Number(button.dataset.id);
        await deleteMachine(machineId);
        await render();
      });
    });
  }

  await render();

  function resetForm() {
    editingMachineId = null;
    frameSelect.disabled = false;
    form.reset();
    form.querySelector('button[type="submit"]').textContent = 'Add Frame';
    cancelEdit.classList.add('hidden');
    renderPreview(score10Input, score1Input, previewValues);
  }

  cancelEdit.addEventListener('click', resetForm);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const frame_number = Number(frameSelect.value);
    const machine_name = document.getElementById('machine-name').value.trim();
    const score10 = Number(score10Input.value);
    const score1 = Number(score1Input.value);
    if (!frame_number || !machine_name) return;
    if (!score10 && !score1) {
      alert('Please enter a score for 10 or a score for 1.');
      return;
    }

    const values = buildFrameValues(score10, score1);
    if (!values) {
      alert('Unable to calculate frame values. Enter a valid 10 or 1 score.');
      return;
    }

    const payload = { machine_name, frame_number, values };
    if (editingMachineId) {
      await updateMachine(editingMachineId, payload);
    } else {
      await createMachine(payload);
    }

    await render();
    resetForm();
  });
}

async function initPlayerPage() {
  const framesInput = document.getElementById('frames-input');
  const calculateButton = document.getElementById('calculate-button');
  const clearButton = document.getElementById('clear-rolls');
  const resultsPanel = document.getElementById('results-panel');
  const resultsBody = document.getElementById('results-body');
  const totalScore = document.getElementById('total-score');
  const resultsEmpty = document.getElementById('results-empty');
  const warning = document.getElementById('player-warning');
  const playerSelect = document.getElementById('player-select');
  const addPlayerButton = document.getElementById('add-player-button');
  const newPlayerName = document.getElementById('new-player-name');
  const playerFileInfo = document.getElementById('player-file-info');

  const machines = await getMachines();
  if (machines.length === 0) {
    warning.textContent = 'Please configure frames first on the configuration page.';
    warning.classList.remove('hidden');
    framesInput.innerHTML = '';
    calculateButton.disabled = true;
    clearButton.disabled = true;
    playerSelect.disabled = true;
    addPlayerButton.disabled = true;
    return;
  }

  warning.classList.add('hidden');
  playerSelect.disabled = false;
  addPlayerButton.disabled = false;

  function createRollInput(frameNumber, ball, machineId, value = '') {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.placeholder = `Ball ${ball} cumulative`;
    input.className = 'roll-input';
    input.value = value !== undefined ? value : '';
    input.dataset.frame = frameNumber;
    input.dataset.ball = ball;
    input.dataset.machineId = machineId;

    input.addEventListener('input', async () => {
      const selectedPlayerId = getCurrentPlayerId();
      if (!selectedPlayerId) return;
      const row = input.closest('.frame-row');
      if (!row) return;
      const ball1 = Number(row.querySelector('[data-ball="1"]').value) || 0;
      const ball2 = Number(row.querySelector('[data-ball="2"]').value) || 0;
      const ball3 = Number(row.querySelector('[data-ball="3"]').value) || 0;
      const frameNumberValue = Number(input.dataset.frame);
      const machineIdValue = Number(input.dataset.machineId);

      await saveScore({
        playerId: Number(selectedPlayerId),
        frame: frameNumberValue,
        machineId: machineIdValue,
        ball1,
        ball2,
        ball3,
      });
    });

    return input;
  }

  function buildFrameRow(frame, rollValues) {
    const row = document.createElement('div');
    row.className = 'frame-row';
    row.dataset.frame = frame.frame_number;
    row.innerHTML = `
      <div>
        <div class="frame-label">Frame ${frame.frame_number}</div>
        <div class="frame-machine">${frame.machine_name}</div>
      </div>
    `;

    for (let ball = 1; ball <= 3; ball += 1) {
      const value = rollValues?.[`ball${ball}`] ?? '';
      row.appendChild(createRollInput(frame.frame_number, ball, frame.id, value));
    }

    return row;
  }

  async function renderPlayerSelect() {
    const players = await getPlayers();
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

    if (players.length > 0) {
      playerSelect.value = String(players[0].id);
      setCurrentPlayerId(players[0].id);
      updatePlayerFileInfo(players[0]);
      return String(players[0].id);
    }

    updatePlayerFileInfo(null);
    return null;
  }

  function updatePlayerFileInfo(player) {
    if (!player) {
      playerFileInfo.textContent = 'Add a player to begin tracking scores.';
      playerFileInfo.classList.remove('hidden');
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
      warning.textContent = 'Please add and select a player before entering scores.';
      warning.classList.remove('hidden');
      calculateButton.disabled = true;
      clearButton.disabled = true;
      framesInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      return;
    }

    warning.classList.add('hidden');
    calculateButton.disabled = false;
    clearButton.disabled = false;
    framesInput.querySelectorAll('input').forEach((input) => (input.disabled = false));

    const scores = await getScores(Number(activePlayerId));
    loadScoresIntoForm(scores);
  }

  addPlayerButton.addEventListener('click', async () => {
    const name = newPlayerName.value.trim();
    if (!name) {
      alert('Enter a player name to add.');
      return;
    }

    const player = await createPlayer(name);
    setCurrentPlayerId(player.id);
    newPlayerName.value = '';
    await refreshPlayerSelection();
  });

  playerSelect.addEventListener('change', async () => {
    const selectedId = playerSelect.value;
    if (!selectedId) {
      setCurrentPlayerId('');
    } else {
      setCurrentPlayerId(selectedId);
    }
    await refreshPlayerSelection();
  });

  clearButton.addEventListener('click', async () => {
    const currentPlayerId = getCurrentPlayerId();
    if (!currentPlayerId) return;
    await clearScores(Number(currentPlayerId));
    await refreshPlayerSelection();
    resultsPanel.classList.add('hidden');
    resultsEmpty.classList.remove('hidden');
  });

  function getPinCount(frame, rawScore) {
    if (!frame || typeof rawScore !== 'number' || rawScore <= 0) return 0;
    const thresholds = Object.entries(frame.values)
      .map(([rank, score]) => ({ rank: Number(rank), score: Number(score) }))
      .sort((a, b) => a.score - b.score);
    let pins = 0;
    for (const threshold of thresholds) {
      if (rawScore >= threshold.score) {
        pins = Math.max(pins, threshold.rank);
      }
    }
    return pins;
  }

  function getFrameData(frame) {
    const row = framesInput.querySelector(`.frame-row[data-frame="${frame.frame_number}"]`);
    const raw1 = Number(row?.querySelector('[data-ball="1"]').value || 0);
    const raw2 = Number(row?.querySelector('[data-ball="2"]').value || 0);
    const raw3 = Number(row?.querySelector('[data-ball="3"]').value || 0);
    const c1 = getPinCount(frame, raw1);
    const c2 = getPinCount(frame, raw2);
    const c3 = getPinCount(frame, raw3);

    let type;
    let first = 0;
    let second = 0;
    let score = 0;

    if (c1 >= 10) {
      type = 'strike';
      first = 10;
      second = 0;
      score = 10;
    } else if (c2 >= 10) {
      type = 'spare2';
      first = c1;
      second = 10 - c1;
      score = 10;
    } else if (c3 >= 10) {
      type = 'spare3';
      first = c2;
      second = 10 - c2;
      score = 10;
    } else {
      type = 'open';
      first = c2;
      second = Math.max(0, c3 - c2);
      score = first + second;
    }

    return { frame: frame.frame_number, machine: frame.machine_name, type, first, second, score };
  }

  function getNextBallValues(frameIndex, count, frameData) {
    const values = [];
    for (let current = frameIndex + 1; current < frameData.length && values.length < count; current += 1) {
      const next = frameData[current];
      if (next.type === 'strike') {
        values.push(10);
      } else {
        values.push(next.first, next.second);
      }
    }
    while (values.length < count) values.push(0);
    return values.slice(0, count);
  }

  function formatMark(frame) {
    if (frame.type === 'strike') return 'X';
    if (frame.type === 'spare2' || frame.type === 'spare3') return `${frame.first}/`;
    return `${frame.first} ${frame.second}`;
  }

  function calculate() {
    const frameData = machines.map(getFrameData);
    const frameResults = [];
    let total = 0;

    frameData.forEach((frame, index) => {
      let frameScore = frame.score;
      if (frame.type === 'strike') {
        const [next1, next2] = getNextBallValues(index, 2, frameData);
        frameScore = 10 + next1 + next2;
      } else if (frame.type === 'spare2' || frame.type === 'spare3') {
        const [next1] = getNextBallValues(index, 1, frameData);
        frameScore = 10 + next1;
      }
      total += frameScore;
      frameResults.push({ frame: frame.frame, machine: frame.machine, mark: formatMark(frame), score: frameScore });
    });

    resultsBody.innerHTML = frameResults
      .map(
        (result) => `
        <tr>
          <td>${result.frame}</td>
          <td>${result.machine}</td>
          <td>${result.mark}</td>
          <td>${result.score}</td>
        </tr>
      `
      )
      .join('');

    totalScore.textContent = total;
    resultsEmpty.classList.add('hidden');
    resultsPanel.classList.remove('hidden');
  }

  calculateButton.addEventListener('click', calculate);

  await refreshPlayerSelection();
}

function ready() {
  if (document.getElementById('frame-form')) {
    initConfigPage();
  }
  if (document.getElementById('player-form')) {
    initPlayerPage();
  }
}

document.addEventListener('DOMContentLoaded', ready);
