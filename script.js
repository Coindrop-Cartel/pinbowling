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

function formatNumber(num) {
  return Number(num).toLocaleString();
}

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

function getFrame10Data(frame, raw1, raw2, raw3) {
  const target1 = Number(frame.values[10] || 0);
  const target2 = Math.round(target1 * 1.3);
  const target3 = Math.round(target2 * 1.3);
  const hit1 = raw1 >= target1;
  const hit2 = raw2 >= target2;
  const hit3 = raw3 >= target3;
  const spare2 = !hit1 && raw2 >= target1;

  const c1 = getPinCount(frame, raw1);
  const c2 = getPinCount(frame, raw2);
  const c3 = getPinCount(frame, raw3);
  const firstPins = hit1 ? 10 : c1;
  const secondPins = hit1 && hit2 ? 10 : spare2 ? 10 : Math.max(0, c2 - c1);
  const thirdPins = hit1 && hit2 && hit3 ? 10 : spare2 && hit3 ? 10 : Math.max(0, c3 - c2);

  let mark = '';
  let score = 0;

  if (hit1) {
    if (hit2) {
      mark = `X X ${hit3 ? 'X' : thirdPins || 0}`;
      score = 20 + thirdPins;
    } else if (hit3) {
      mark = 'X 9/';
      score = 20;
    } else {
      mark = `X ${secondPins || 0} ${thirdPins || 0}`;
      score = 10 + secondPins + thirdPins;
    }
  } else if (spare2) {
    mark = `9/ ${hit3 ? 'X' : thirdPins || 0}`;
    score = 10 + thirdPins;
  } else {
    mark = `${firstPins} ${secondPins || 0}`;
    score = firstPins + secondPins;
  }

  return { frame: frame.frame_number, machine: frame.machine_name, type: 'tenth', mark, first: firstPins, second: secondPins, third: thirdPins, score };
}

function getFrameDataFromValues(frame, raw1, raw2, raw3) {
  if (frame.frame_number === 10) {
    return getFrame10Data(frame, raw1, raw2, raw3);
  }

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
  if (frame.type === 'tenth') return frame.mark;
  if (frame.type === 'strike') return 'X';
  if (frame.type === 'spare2' || frame.type === 'spare3') return `${frame.first}/`;
  return `${frame.first} ${frame.second}`;
}

function calculateFrameResults(machines, scoreMap) {
  const frameData = machines.map((frame) => {
    const entry = scoreMap[String(frame.frame_number)] || { ball1: 0, ball2: 0, ball3: 0 };
    return getFrameDataFromValues(frame, Number(entry.ball1), Number(entry.ball2), Number(entry.ball3));
  });

  let total = 0;
  const results = frameData.map((frame, index) => {
    let frameScore = frame.score;
    if (frame.type === 'strike') {
      const [next1, next2] = getNextBallValues(index, 2, frameData);
      frameScore = 10 + next1 + next2;
    } else if (frame.type === 'spare2' || frame.type === 'spare3') {
      const [next1] = getNextBallValues(index, 1, frameData);
      frameScore = 10 + next1;
    }
    total += frameScore;
    return { frame: frame.frame, machine: frame.machine, mark: formatMark(frame), score: frameScore };
  });

  return { frameResults: results, total };
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

  frameSelect.addEventListener('change', async () => {
    if (editingMachineId) return; // Don't auto-populate when manually editing
    const selectedFrameNumber = Number(frameSelect.value);
    if (!selectedFrameNumber) {
      resetForm();
      return;
    }

    const machines = await getMachines();
    const existingFrame = machines.find((m) => m.frame_number === selectedFrameNumber);

    if (existingFrame) {
      editingMachineId = existingFrame.id;
      document.getElementById('machine-name').value = existingFrame.machine_name;
      score10Input.value = existingFrame.values[10] || '';
      score1Input.value = existingFrame.values[1] || '';
      renderPreview(score10Input, score1Input, previewValues);
      form.querySelector('button[type="submit"]').textContent = 'Update Frame';
      cancelEdit.classList.remove('hidden');
    } else {
      resetForm();
    }
  });


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
        <td><div class="score-list">${Object.entries(frame.values)
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([key, value]) => `<div>${key}: ${formatNumber(value)}</div>`)
          .join('')}</div></td>
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
        window.scrollTo(0, 0);
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
  const resultsPanel = document.getElementById('results-panel');
  const resultsBody = document.getElementById('results-body');
  const totalScore = document.getElementById('total-score');
  const resultsEmpty = document.getElementById('results-empty');
  const warning = document.getElementById('player-warning');
  const playerSelect = document.getElementById('player-select');
  const addPlayerButton = document.getElementById('add-player-button');
  const deletePlayerButton = document.getElementById('delete-player-button');
  const newPlayerName = document.getElementById('new-player-name');
  const playerFileInfo = document.getElementById('player-file-info');
  let currentPlayers = [];

  const machines = await getMachines();
  if (machines.length === 0) {
    warning.textContent = 'Please configure frames first on the configuration page.';
    warning.classList.remove('hidden');
    framesInput.innerHTML = '';
    calculateButton.disabled = true;
    playerSelect.disabled = true;
    addPlayerButton.disabled = true;
    deletePlayerButton.disabled = true;
    return;
  }

  warning.classList.add('hidden');
  playerSelect.disabled = false;
  addPlayerButton.disabled = false;

  function createRollInput(frameNumber, ball, machineId, value = '', placeholder = '') {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.placeholder = placeholder || `Ball ${ball} cumulative`;
    input.className = 'roll-input';
    input.value = value !== undefined ? value : '';
    input.dataset.frame = frameNumber;
    input.dataset.ball = ball;
    input.dataset.machineId = machineId;

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
        ${frame.frame_number === 10 ? '<div class="frame-note">Frame 10 uses bonus targets: Ball 2 = 1.3×, Ball 3 = 1.3²×</div>' : ''}
      </div>
    `;

    for (let ball = 1; ball <= 3; ball += 1) {
      const value = rollValues?.[`ball${ball}`] ?? '';
      const placeholder = frame.frame_number === 10
        ? ball === 1
          ? 'Ball 1 score'
          : ball === 2
            ? 'Ball 2 target (×1.3)'
            : 'Ball 3 target (×1.3²)'
        : `Ball ${ball} cumulative`;
      row.appendChild(createRollInput(frame.frame_number, ball, frame.id, value, placeholder));
    }

    return row;
  }

  async function renderPlayerSelect() {
    const players = await getPlayers();
    currentPlayers = players;
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
      deletePlayerButton.disabled = false;
      return String(players[0].id);
    }
    deletePlayerButton.disabled = true;

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

  async function deletePlayerById(playerId) {
    return fetchJSON(`api/players.php?id=${playerId}`, {
      method: 'DELETE',
    });
  }

  async function refreshPlayerSelection() {
    const activePlayerId = await renderPlayerSelect();
    if (!activePlayerId) {
      warning.textContent = 'Please add and select a player before entering scores.';
      warning.classList.remove('hidden');
      calculateButton.disabled = true;
      deletePlayerButton.disabled = true;
      framesInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      return;
    }

    warning.classList.add('hidden');
    calculateButton.disabled = false;
    deletePlayerButton.disabled = false;
    framesInput.querySelectorAll('input').forEach((input) => (input.disabled = false));

    const scores = await getScores(Number(activePlayerId));
    loadScoresIntoForm(scores);
    renderCurrentResults();
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

  deletePlayerButton.addEventListener('click', async () => {
    const selectedId = playerSelect.value;
    if (!selectedId) {
      alert('Select a player to delete.');
      return;
    }

    const selectedPlayer = currentPlayers.find((player) => String(player.id) === selectedId);
    if (!selectedPlayer) {
      alert('Selected player not found.');
      return;
    }

    const confirmation = prompt(`Type the player name to confirm deletion of ${selectedPlayer.player_name}:`);
    if (confirmation !== selectedPlayer.player_name) {
      alert('Player deletion cancelled. The name did not match.');
      return;
    }

    await deletePlayerById(Number(selectedId));
    setCurrentPlayerId('');
    await refreshPlayerSelection();
    alert(`Player ${selectedPlayer.player_name} has been deleted.`);
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

  function getScoreMapFromInputs() {
    const scoreMap = {};
    framesInput.querySelectorAll('.frame-row').forEach((row) => {
      const frameNumber = Number(row.dataset.frame);
      scoreMap[frameNumber] = {
        ball1: Number(row.querySelector('[data-ball="1"]').value) || 0,
        ball2: Number(row.querySelector('[data-ball="2"]').value) || 0,
        ball3: Number(row.querySelector('[data-ball="3"]').value) || 0,
      };
    });
    return scoreMap;
  }

  function renderCurrentResults() {
    const scoreMap = getScoreMapFromInputs();
    const { frameResults, total } = calculateFrameResults(machines, scoreMap);
    resultsBody.innerHTML = frameResults
      .map(
        (result) => `
        <tr>
          <td>${result.frame}</td>
          <td>${result.machine}</td>
          <td>${result.mark}</td>
          <td>${formatNumber(result.score)}</td>
        </tr>
      `
      )
      .join('');

    totalScore.textContent = formatNumber(total);
    resultsEmpty.classList.add('hidden');
    resultsPanel.classList.remove('hidden');
  }

  async function saveAllScores(playerId) {
    const rows = Array.from(framesInput.querySelectorAll('.frame-row'));
    for (const row of rows) {
      const frameNumberValue = Number(row.dataset.frame);
      const ball1 = Number(row.querySelector('[data-ball="1"]').value) || 0;
      const ball2 = Number(row.querySelector('[data-ball="2"]').value) || 0;
      const ball3 = Number(row.querySelector('[data-ball="3"]').value) || 0;
      const machineIdValue = Number(row.querySelector('[data-machine-id]').dataset.machineId || row.querySelector('input').dataset.machineId);
      await saveScore({
        playerId: Number(playerId),
        frame: frameNumberValue,
        machineId: machineIdValue,
        ball1,
        ball2,
        ball3,
      });
    }
  }

  calculateButton.addEventListener('click', async () => {
    const currentPlayerId = getCurrentPlayerId();
    if (!currentPlayerId) {
      alert('Select a player before updating scores.');
      return;
    }
    await saveAllScores(Number(currentPlayerId));
    await refreshPlayerSelection();
  });

  await refreshPlayerSelection();
}

async function initStandingsPage() {
  const standingsHeader = document.getElementById('standings-header');
  const standingsBody = document.getElementById('standings-body');
  const standingsEmpty = document.getElementById('standings-empty');
  const standingsWrapper = document.getElementById('standings-wrapper');
  if (!standingsBody) return;

  const players = await getPlayers();
  const machines = await getMachines();

  if (players.length === 0 || machines.length === 0) {
    standingsBody.innerHTML = '';
    standingsWrapper.classList.add('hidden');
    standingsEmpty.classList.remove('hidden');
    return;
  }

  // Build table header with frame numbers
  const frameHeaders = machines.map((m) => `<th>Frame ${m.frame_number}</th>`).join('');
  standingsHeader.innerHTML = `
    <tr>
      <th>Player</th>
      ${frameHeaders}
      <th>Total</th>
    </tr>
  `;

  const standingsRows = await Promise.all(players.map(async (player) => {
    const scores = await getScores(player.id);
    const scoreMap = scores.reduce((map, row) => {
      map[String(row.frame)] = {
        ball1: Number(row.ball1),
        ball2: Number(row.ball2),
        ball3: Number(row.ball3),
      };
      return map;
    }, {});

    // Track which frames have actual score data entered
    const framesWithScores = new Set();
    scores.forEach((row) => {
      const hasData = Number(row.ball1) > 0 || Number(row.ball2) > 0 || Number(row.ball3) > 0;
      if (hasData) {
        framesWithScores.add(row.frame);
      }
    });

    const { frameResults, total } = calculateFrameResults(machines, scoreMap);
    return { player, frameResults, total, framesWithScores };
  }));

  standingsRows.sort((a, b) => b.total - a.total);
  standingsBody.innerHTML = standingsRows
    .map((result, index) => `
      <tr>
        <td>${index + 1}. ${result.player.player_name}</td>
        ${result.frameResults.map((frame) => {
          const hasScore = result.framesWithScores.has(frame.frame);
          return `
            <td class="standings-frame ${hasScore ? 'has-score' : 'no-score'}">
              <div class="standings-mark">${hasScore ? frame.mark : '−'}</div>
              <div class="standings-frame-score">${hasScore ? formatNumber(frame.score) : ''}</div>
            </td>
          `;
        }).join('')}
        <td class="standings-total">${formatNumber(result.total)}</td>
      </tr>
    `)
    .join('');

  standingsEmpty.classList.add('hidden');
  standingsWrapper.classList.remove('hidden');
}

function ready() {
  if (document.getElementById('frame-form')) {
    initConfigPage();
  }
  if (document.getElementById('player-form')) {
    initPlayerPage();
  }
  if (document.getElementById('standings-body')) {
    initStandingsPage();
  }
}

document.addEventListener('DOMContentLoaded', ready);
