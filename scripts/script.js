/**
 * Client-side logic for the PinBowling application.
 * Handles API communication, scoring calculations (mapping pinball to bowling),
 * and dynamic UI rendering across different pages.
 */

/**
 * Attaches real-time locale-aware number formatting to an input field.
 * Prevents non-numeric input and handles cursor positioning.
 * @param {HTMLInputElement} input 
 */
function applyScoreFormatting(input) {
  if (!input) return;
  input.type = 'text';
  input.inputMode = 'numeric';
  input.addEventListener('input', (e) => {
    const cursor = e.target.selectionStart;
    const originalValue = e.target.value;
    let rawValue = originalValue.replace(/\D/g, '');
    
    if (rawValue === '') {
      e.target.value = '';
    } else {
      const formatted = Number(rawValue).toLocaleString();
      e.target.value = formatted;
      const diff = formatted.length - originalValue.length;
      e.target.setSelectionRange(cursor + diff, cursor + diff);
    }
  });
}

/**
 * Renders a preview of calculated pinball-to-pin mapping on the config page.
 * Also displays bonus targets for Frame 10.
 * @param {HTMLInputElement} score10Input 
 * @param {HTMLInputElement} score1Input 
 * @param {HTMLElement} previewValues 
 */
function renderPreview(score10Input, score1Input, previewValues) {
  const score10 = Number(score10Input.value.replace(/\D/g, ''));
  const score1 = Number(score1Input.value.replace(/\D/g, ''));
  const values = BowlingEngine.buildFrameValues(score10, score1);

  if (!values) {
    previewValues.innerHTML = "<div>Enter a 10 score or a 1 score to preview values for 9–2.</div>";
    return;
  }

  let html = Object.entries(values)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([rank, value]) => `<div><strong>${rank}:</strong> ${formatNumber(value)}</div>`)
    .join("");

  const frameSelect = document.getElementById('frame-number');
  if (frameSelect && frameSelect.value === "10" && values[10]) {
    const target1 = Math.round(values[10] * 1.3);
    const target2 = Math.round(target1 * 1.3);
    html += `<br><div><strong>Target 1:</strong> ${formatNumber(target1)}</div>`;
    html += `<div><strong>Target 2:</strong> ${formatNumber(target2)}</div>`;
  }

  previewValues.innerHTML = html;
}

// --- Page Initialization Functions ---

/**
 * Initializes the Machine Configuration page.
 */
async function initConfigPage() {
  const frameSelect = document.getElementById('frame-number');
  const form = document.getElementById('frame-form');
  const submitBtn = form.querySelector('button[type="submit"]');
  const framesTable = document.getElementById('frames-table');
  const listEmpty = document.getElementById('list-empty');
  let editingMachineId = null;
  const printMachinesBtn = document.getElementById('print-machines-btn');

  const score10Input = document.getElementById('value-10');
  const score1Input = document.getElementById('value-1');
  const previewValues = document.getElementById('preview-values');

  for (let i = 1; i <= 10; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = i;
    frameSelect.appendChild(option);
  }

  if (printMachinesBtn) {
    printMachinesBtn.addEventListener('click', async () => {
      const machines = await PB_API.getMachines();
      printMachineScores(machines);
    });
  }

  submitBtn.textContent = 'Update';
  submitBtn.disabled = true;

  const markDirty = () => {
    if (frameSelect.value) submitBtn.disabled = false;
  };

  applyScoreFormatting(score10Input);
  applyScoreFormatting(score1Input);

  score10Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues));
  score1Input.addEventListener('input', () => renderPreview(score10Input, score1Input, previewValues));
  renderPreview(score10Input, score1Input, previewValues);

  document.getElementById('machine-name').addEventListener('input', markDirty);
  score10Input.addEventListener('input', markDirty);
  score1Input.addEventListener('input', markDirty);

  frameSelect.addEventListener('change', async () => {
    const selectedFrameNumber = Number(frameSelect.value);
    if (!selectedFrameNumber) {
      resetForm();
      return;
    }

    const machines = await PB_API.getMachines();
    const existingFrame = machines.find((m) => m.frame_number === selectedFrameNumber);

    if (existingFrame) {
      editingMachineId = existingFrame.id;
      document.getElementById('machine-name').value = existingFrame.machine_name;
      score10Input.value = existingFrame.values[10] ? formatNumber(existingFrame.values[10]) : '';
      score1Input.value = existingFrame.values[1] ? formatNumber(existingFrame.values[1]) : '';
      renderPreview(score10Input, score1Input, previewValues);
      submitBtn.disabled = true;
    } else {
      // Placeholder mode for new frame setup
      editingMachineId = null;
      document.getElementById('machine-name').value = '';
      score10Input.value = '';
      score1Input.value = '';
      renderPreview(score10Input, score1Input, previewValues);
      submitBtn.disabled = true;
    }
  });


  async function render() {
    const frames = await PB_API.getMachines();
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
      let extraTargets = '';
      if (frame.frame_number === 10) {
        const t1 = Math.round(frame.values[10] * 1.3);
        const t2 = Math.round(t1 * 1.3);
        extraTargets = `<div style="margin-top: 8px; padding-top: 4px; border-top: 1px solid #eee; font-weight: bold;">Target 1: ${formatNumber(t1)}<br>Target 2: ${formatNumber(t2)}</div>`;
      }
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${frame.frame_number}</td>
        <td>${frame.machine_name}</td>
        <td><div class="score-list">${Object.entries(frame.values)
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .map(([key, value]) => `<div>${key}: ${formatNumber(value)}</div>`)
          .join('')}</div>${extraTargets}</td>
        <td>
          <button type="button" class="edit-button" data-id="${frame.id}">Edit</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    tbody.querySelectorAll('.edit-button').forEach((button) => {
      button.addEventListener('click', async () => {
        const machineId = Number(button.dataset.id);
        const frame = (await PB_API.getMachines()).find((item) => item.id === machineId);
        if (!frame) return;
        editingMachineId = machineId;
        frameSelect.value = String(frame.frame_number);
        frameSelect.disabled = false;
        document.getElementById('machine-name').value = frame.machine_name;
        score10Input.value = frame.values[10] ? formatNumber(frame.values[10]) : '';
        score1Input.value = frame.values[1] ? formatNumber(frame.values[1]) : '';
        renderPreview(score10Input, score1Input, previewValues);
        submitBtn.disabled = true;
        window.scrollTo(0, 0);
      });
    });
  }

  await render();

  function resetForm() {
    editingMachineId = null;
    frameSelect.disabled = false;
    form.reset();
    submitBtn.disabled = true;
    renderPreview(score10Input, score1Input, previewValues);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const frame_number = Number(frameSelect.value);
    const machine_name = document.getElementById('machine-name').value.trim();
    const score10 = Number(score10Input.value.replace(/\D/g, ''));
    const score1 = Number(score1Input.value.replace(/\D/g, ''));
    if (!frame_number || !machine_name) return;
    if (!score10 && !score1) {
      alert('Please enter a score for 10 or a score for 1.');
      return;
    }

    const values = BowlingEngine.buildFrameValues(score10, score1);
    if (!values) {
      alert('Unable to calculate frame values. Enter a valid 10 or 1 score.');
      return;
    }

    const confirmation = prompt(`Enter Admin Password to save changes for Frame ${frame_number}:`);
    if (confirmation !== ADMIN_PASSWORD) {
      if (confirmation !== null) alert('Incorrect Admin Password.');
      return;
    }

    const payload = { machine_name, frame_number, values };
    if (editingMachineId) {
      await PB_API.updateMachine(editingMachineId, payload);
    } else {
      await PB_API.createMachine(payload);
    }

    await render();
    resetForm();
  });
}

/**
 * Initializes the Player Management page.
 */
async function initPlayersPage() {
  const playerSelect = document.getElementById('player-select');
  const addPlayerButton = document.getElementById('add-player-button');
  const deletePlayerButton = document.getElementById('delete-player-button');
  const newPlayerName = document.getElementById('new-player-name');
  const playerList = document.getElementById('player-list');

  async function refresh() {
    const players = await PB_API.getPlayers();
    
    // Update delete dropdown
    playerSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = players.length === 0 ? 'No players registered' : 'Select player to delete';
    playerSelect.appendChild(placeholder);

    players.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.player_name;
      playerSelect.appendChild(opt);
    });

    // Update alphabetical list
    playerList.innerHTML = '';
    if (players.length === 0) {
      playerList.innerHTML = '<li>No players registered yet.</li>';
    } else {
      players.forEach(p => {
        const li = document.createElement('li');
        li.style.padding = '8px 0';
        li.style.borderBottom = '1px solid #000';
        li.textContent = p.player_name; // Safe from XSS
        playerList.appendChild(li);
      });
      if (playerList.lastElementChild) playerList.lastElementChild.style.borderBottom = 'none';
    }
    
    deletePlayerButton.disabled = players.length === 0;
  }

  addPlayerButton.addEventListener('click', async () => {
    const name = newPlayerName.value.trim();
    if (!name) return;
    await PB_API.createPlayer(name);
    newPlayerName.value = '';
    await refresh();
  });

  deletePlayerButton.addEventListener('click', async () => {
    const selectedId = playerSelect.value;
    if (!selectedId) {
      alert('Select a player to delete.');
      return;
    }
    const player = (await PB_API.getPlayers()).find(p => String(p.id) === selectedId);
    if (!player) return;
    
    const confirmation = prompt(`Enter Admin Password to confirm deletion of ${player.player_name}:`);
    if (confirmation !== ADMIN_PASSWORD) {
      if (confirmation !== null) alert('Incorrect Admin Password.');
      return;
    }

    await PB_API.deletePlayer(selectedId);
    await refresh();
  });

  await refresh();
}

/**
 * Generates a printable PDF-like score sheet for manual tracking.
 * @param {Array} machines 
 */
function printBlankScoreSheet(machines) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print the score sheet.');
    return;
  }

  const framesHtml = machines
    .map((m) => `
      <div style="border: 2px solid #000; margin-bottom: 8px; padding: 8px 12px; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px;">
          <span style="font-size: 1rem; font-weight: bold;">Frame ${m.frame_number}</span>
          <span style="font-size: 0.95rem;">Game: <strong>${m.machine_name}</strong></span>
          <span style="font-size: 0.85rem;">Target: <strong>${Number(m.values[10]).toLocaleString()}</strong></span>
        </div>
        <div style="display: flex; gap: 20px;">
          <div style="flex: 1;"><div style="font-size: 0.7rem; color: #000; text-transform: uppercase;">Ball 1</div><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
          <div style="flex: 1;"><div style="font-size: 0.7rem; color: #000; text-transform: uppercase;">Ball 2</div><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
          <div style="flex: 1;"><div style="font-size: 0.7rem; color: #000; text-transform: uppercase;">Ball 3</div><div style="border-bottom: 1px solid #000; height: 20px;"></div></div>
        </div>
      </div>
    `)
    .join('');

  const html = `
    <html>
      <head>
        <title>PinBowling - Blank Score Sheet</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; line-height: 1.2; color: #000; }
          h1 { margin: 0 0 4px 0; font-size: 1.5rem; }
          .header-info { margin-bottom: 12px; border-bottom: 2px solid #000; padding-bottom: 6px; }
          p { margin: 4px 0; font-size: 0.95rem; }
          @media print { 
            body { padding: 0; margin: 0; } 
            @page { margin: 0.5cm; }
          }
        </style>
      </head>
      <body>
        <div class="header-info">
          <h1>PinBowling Score Sheet</h1>
          <p>Player: ____________________________________ &nbsp;&nbsp;&nbsp; Date: _______________</p>
        </div>
        ${framesHtml}
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

/**
 * Generates large printable signs showing target scores for each machine.
 * @param {Array} machines 
 */
function printMachineScores(machines) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print.');
    return;
  }

  const pagesHtml = machines
    .map((m) => {
      const ranks = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      const scoresHtml = ranks.map((rank) => {
        const formatted = formatNumber(m.values[rank] || 0);
        // Dynamically adjust font size based on number length
        let fontSize = '2.5rem';
        if (formatted.length > 9) fontSize = '1.4rem';
        else if (formatted.length > 7) fontSize = '1.8rem';
        else if (formatted.length > 5) fontSize = '2.1rem';

        return `
          <div style="border: 3px solid #000; position: relative; height: 120px; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; min-width: 0; box-sizing: border-box;">
            <div style="position: absolute; top: 0; right: 0; border-left: 3px solid #000; border-bottom: 3px solid #000; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem; background: #f0f0f0; z-index: 1;">${rank}</div>
            <div style="font-size: ${fontSize}; font-weight: bold; text-align: center; width: 100%; padding: 0 5px; box-sizing: border-box; white-space: nowrap;">${formatted}</div>
          </div>
        `;
      }).join('');

      let extraTargets = '';
      if (m.frame_number === 10) {
        const t1 = Math.round(m.values[10] * 1.3);
        const t2 = Math.round(t1 * 1.3);
        extraTargets = `
          <div style="margin-top: 40px; display: flex; justify-content: space-around; width: 100%; font-size: 2.2rem; font-weight: bold; border-top: 4px dashed #000; padding-top: 20px;">
            <div>Target 1: ${formatNumber(t1)}</div>
            <div>Target 2: ${formatNumber(t2)}</div>
          </div>
        `;
      }

      return `
        <div class="page" style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; padding: 40px; box-sizing: border-box;">
          <div style="border: 6px solid #000; padding: 50px; width: 100%; max-width: 1100px; background: #fff; box-shadow: none;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 40px; border-bottom: 6px solid #000; padding-bottom: 15px;">
              <h1 style="margin: 0; font-size: 4rem; text-transform: uppercase;">Frame ${m.frame_number}</h1>
              <h2 style="margin: 0; font-size: 4rem;">${m.machine_name}</h2>
            </div>
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 20px;">
              ${scoresHtml}
            </div>
            ${extraTargets}
          </div>
        </div>
      `;
    })
    .join('');

  const html = `
    <html>
      <head>
        <title>PinBowling - Machine Score Signs</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; color: #000; background: #fff; }
          @page { size: landscape; margin: 0; }
          @media print {
            .page { height: 100vh; overflow: hidden; page-break-after: always; zoom: 85%; }
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 250);
}

/**
 * Initializes the Player Scoring page.
 */
async function initScoresPage() {
  const framesInput = document.getElementById('frames-input');
  const resultsPanel = document.getElementById('results-panel');
  const resultsBody = document.getElementById('results-body');
  const totalScore = document.getElementById('total-score');
  const resultsEmpty = document.getElementById('results-empty');
  const warning = document.getElementById('player-warning');
  const playerSelect = document.getElementById('player-select');
  const playerFileInfo = document.getElementById('player-file-info');

  const printSheetBtn = document.getElementById('print-sheet-btn');

  // Ensure selection starts empty on page initialization
  setCurrentPlayerId('');

  const machines = await PB_API.getMachines();
  if (machines.length === 0) {
    warning.textContent = 'Please configure frames first on the configuration page.';
    warning.classList.remove('hidden');
    framesInput.innerHTML = '';
    playerSelect.disabled = true;
    return;
  }

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
      
      const input = createRollInput(frame.frame_number, ball, frame.id, value, placeholder);
      
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
        machineId: frame.id,
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

  async function renderPlayerSelect() {
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
      warning.textContent = 'Please select a player before entering scores.';
      warning.classList.remove('hidden');
      framesInput.querySelectorAll('input').forEach((input) => (input.disabled = true));
      return;
    }

    warning.classList.add('hidden');
    framesInput.querySelectorAll('input').forEach((input) => (input.disabled = false));

    const scores = await PB_API.getScores(Number(activePlayerId));
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

  await refreshPlayerSelection();
}

/**
 * Initializes the Standings/Leaderboard page.
 */
async function initStandingsPage() {
  const standingsHeader = document.getElementById('standings-header');
  const standingsBody = document.getElementById('standings-body');
  const standingsEmpty = document.getElementById('standings-empty');
  const standingsWrapper = document.getElementById('standings-wrapper');
  if (!standingsBody) return;

  const players = await PB_API.getPlayers();
  const machines = await PB_API.getMachines();

  if (players.length === 0 || machines.length === 0) {
    standingsBody.innerHTML = '';
    standingsWrapper.classList.add('hidden');
    standingsEmpty.classList.remove('hidden');
    return;
  }

  // Build table header with frame numbers
  const frameHeaders = machines.map((m) => `<th style="min-width: 80px;">Frame ${m.frame_number}</th>`).join('');
  standingsHeader.innerHTML = `
    <tr>
      <th>#</th>
      <th>Player</th>
      ${frameHeaders}
      <th>Total</th>
    </tr>
  `;

  const standingsRows = await Promise.all(players.map(async (player) => {
    const scores = await PB_API.getScores(player.id);
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

    const { frameResults, total } = BowlingEngine.calculateFrameResults(machines, scoreMap);
    return { player, frameResults, total, framesWithScores };
  }));

  standingsRows.sort((a, b) => b.total - a.total);
  standingsBody.innerHTML = standingsRows
    .map((result, index) => `
      <tr>
        <td style="text-align: center;">${index + 1}</td>
        <td class="player-name-cell"></td>
        ${result.frameResults.map((frame) => {
          const hasScore = result.framesWithScores.has(frame.frame);
          return `
            <td class="standings-frame ${hasScore ? 'has-score' : 'no-score'}" style="white-space: nowrap; padding: 0 10px;">
              <div class="standings-mark">${hasScore ? frame.mark : '−'}</div>
              <div class="standings-frame-score">${hasScore ? formatNumber(frame.score) : ''}</div>
            </td>
          `;
        }).join('')}
        <td class="standings-total">${formatNumber(result.total)}</td>
      </tr>
    `)
    .join('');

  // Securely inject player names to prevent XSS
  standingsBody.querySelectorAll('.player-name-cell').forEach((cell, i) => {
    cell.textContent = standingsRows[i].player.player_name;
  });

  standingsEmpty.classList.add('hidden');
  standingsWrapper.classList.remove('hidden');
}

/**
 * Sets the 'active' class on the navigation item matching the current URL.
 */
function initNavigation() {
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item').forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });
}

/**
 * Main entry point. Identifies which page is currently loaded 
 * and runs the appropriate initialization logic.
 */
function ready() {
  initNavigation();
  if (document.getElementById('frame-form')) {
    initConfigPage();
  }
  if (document.getElementById('player-list')) {
    initPlayersPage();
  }
  if (document.getElementById('player-form')) {
    initScoresPage();
  }
  if (document.getElementById('standings-body')) {
    initStandingsPage();
  }
}

document.addEventListener('DOMContentLoaded', ready);
