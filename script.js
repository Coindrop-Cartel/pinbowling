const STORAGE_DIR = "storage/";
const CONFIG_FILE_KEY = `${STORAGE_DIR}configuration.txt`;
const PLAYERS_FILE_KEY = `${STORAGE_DIR}players.txt`;
const PLAYER_FILE_PREFIX = `${STORAGE_DIR}player/`;
const CURRENT_PLAYER_KEY = "pinbowling-current-player-id";

function getConfigFile() {
  return JSON.parse(localStorage.getItem(CONFIG_FILE_KEY) || '{"frames":[]}');
}

function saveConfigFile(data) {
  localStorage.setItem(CONFIG_FILE_KEY, JSON.stringify(data));
}

function getFrames() {
  return (getConfigFile().frames || []).slice().sort((a, b) => a.frame - b.frame);
}

function saveFrames(frames) {
  saveConfigFile({ frames: frames.slice().sort((a, b) => a.frame - b.frame) });
}

function getPlayersFile() {
  return JSON.parse(localStorage.getItem(PLAYERS_FILE_KEY) || '{"players":[]}');
}

function savePlayersFile(data) {
  localStorage.setItem(PLAYERS_FILE_KEY, JSON.stringify(data));
}

function getPlayersList() {
  return (getPlayersFile().players || []).slice().sort((a, b) => a.name.localeCompare(b.name));
}

function getPlayerFileKey(playerId) {
  return `${PLAYER_FILE_PREFIX}${playerId}`;
}

function getPlayerScores(playerId) {
  if (!playerId) return {};
  return JSON.parse(localStorage.getItem(getPlayerFileKey(playerId)) || "{}");
}

function savePlayerScores(playerId, rolls) {
  if (!playerId) return;
  localStorage.setItem(getPlayerFileKey(playerId), JSON.stringify(rolls));
}

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

function makeSlug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function makePlayerId(name) {
  const slug = makeSlug(name) || "player";
  return `${slug}-${Date.now()}`;
}

function makePlayerFileName(name, playerId) {
  const slug = makeSlug(name) || "player";
  const unique = playerId.replace(`${slug}-`, "");
  return `${STORAGE_DIR}player/${slug}-${unique}.txt`;
}

function getRolls() {
  return getPlayerScores(getCurrentPlayerId());
}

function saveRolls(rolls) {
  savePlayerScores(getCurrentPlayerId(), rolls);
}

function renderPlayerSelect(playerSelect, playerFileInfo) {
  const players = getPlayersList();
  const currentPlayerId = getCurrentPlayerId();

  playerSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = players.length === 0 ? "No players configured" : "Select a player";
  playerSelect.appendChild(placeholder);

  players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    playerSelect.appendChild(option);
  });

  const selectedPlayer = players.find((player) => player.id === currentPlayerId);
  if (selectedPlayer) {
    playerSelect.value = selectedPlayer.id;
    updatePlayerFileInfo(selectedPlayer, playerFileInfo);
  } else {
    playerSelect.value = "";
    playerFileInfo.classList.add("hidden");
    playerFileInfo.textContent = "";
  }
}

function updatePlayerFileInfo(player, playerFileInfo) {
  if (!player) {
    playerFileInfo.classList.add("hidden");
    playerFileInfo.textContent = "";
    return;
  }
  playerFileInfo.textContent = `Selected player file: ${player.fileName}`;
  playerFileInfo.classList.remove("hidden");
}

function initConfigPage() {
  const frameSelect = document.getElementById("frame-number");
  const form = document.getElementById("frame-form");
  const cancelEdit = document.getElementById("cancel-edit");
  const framesTable = document.getElementById("frames-table");
  const listEmpty = document.getElementById("list-empty");
  let editingFrame = null;

  const score10Input = document.getElementById("value-10");
  const score1Input = document.getElementById("value-1");
  const previewValues = document.getElementById("preview-values");

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

  function renderPreview() {
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

  for (let i = 1; i <= 10; i += 1) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = i;
    frameSelect.appendChild(option);
  }

  score10Input.addEventListener("input", renderPreview);
  score1Input.addEventListener("input", renderPreview);
  renderPreview();

  function render() {
    const frames = getFrames();
    const tbody = framesTable.querySelector("tbody");
    tbody.innerHTML = "";

    if (frames.length === 0) {
      framesTable.classList.add("hidden");
      listEmpty.classList.remove("hidden");
      return;
    }

    framesTable.classList.remove("hidden");
    listEmpty.classList.add("hidden");

    frames.forEach((frame) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${frame.frame}</td>
        <td>${frame.machine}</td>
        <td>${Object.entries(frame.values)
          .map(([key, value]) => `${key}: ${value}`)
          .join(" \u2022 ")}</td>
        <td>
          <button type="button" class="edit-button" data-frame="${frame.frame}">Edit</button>
          <button type="button" class="delete-button" data-frame="${frame.frame}">Delete</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    framesTable.querySelectorAll(".edit-button").forEach((button) => {
      button.addEventListener("click", () => {
        const frameNumber = Number(button.dataset.frame);
        const frame = getFrames().find((item) => item.frame === frameNumber);
        if (!frame) return;
        editingFrame = frameNumber;
        frameSelect.value = String(frame.frame);
        frameSelect.disabled = true;
        document.getElementById("machine-name").value = frame.machine;
        score10Input.value = frame.values[10] || "";
        score1Input.value = frame.values[1] || "";
        renderPreview();
        form.querySelector("button[type='submit']").textContent = "Update Frame";
        cancelEdit.classList.remove("hidden");
      });
    });

    framesTable.querySelectorAll(".delete-button").forEach((button) => {
      button.addEventListener("click", () => {
        const frameNumber = Number(button.dataset.frame);
        const updated = getFrames().filter((item) => item.frame !== frameNumber);
        saveFrames(updated);
        render();
      });
    });
  }

  render();

  function resetForm() {
    editingFrame = null;
    frameSelect.disabled = false;
    form.reset();
    form.querySelector("button[type='submit']").textContent = "Add Frame";
    cancelEdit.classList.add("hidden");
    renderPreview();
  }

  cancelEdit.addEventListener("click", resetForm);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const frame = Number(frameSelect.value);
    const machine = document.getElementById("machine-name").value.trim();
    const score10 = Number(score10Input.value);
    const score1 = Number(score1Input.value);
    if (!frame || !machine) return;
    if (!score10 && !score1) {
      alert("Please enter a score for 10 or a score for 1.");
      return;
    }

    const values = buildFrameValues(score10, score1);
    if (!values) {
      alert("Unable to calculate frame values. Enter a valid 10 or 1 score.");
      return;
    }

    const frames = getFrames();
    const existingIndex = frames.findIndex((item) => item.frame === frame);

    if (editingFrame !== null && existingIndex >= 0) {
      frames[existingIndex] = { frame, machine, values };
    } else if (existingIndex >= 0) {
      alert("That frame already exists. Edit it instead.");
      return;
    } else {
      frames.push({ frame, machine, values });
    }

    saveFrames(frames);
    render();
    resetForm();
  });
}

function initPlayerPage() {
  const framesInput = document.getElementById("frames-input");
  const calculateButton = document.getElementById("calculate-button");
  const clearButton = document.getElementById("clear-rolls");
  const resultsPanel = document.getElementById("results-panel");
  const resultsBody = document.getElementById("results-body");
  const totalScore = document.getElementById("total-score");
  const resultsEmpty = document.getElementById("results-empty");
  const warning = document.getElementById("player-warning");
  const playerSelect = document.getElementById("player-select");
  const addPlayerButton = document.getElementById("add-player-button");
  const newPlayerName = document.getElementById("new-player-name");
  const playerFileInfo = document.getElementById("player-file-info");

  const frames = getFrames();
  if (frames.length === 0) {
    warning.textContent = "Please configure frames first on the configuration page.";
    warning.classList.remove("hidden");
    framesInput.innerHTML = "";
    calculateButton.disabled = true;
    clearButton.disabled = true;
    playerSelect.disabled = true;
    addPlayerButton.disabled = true;
    return;
  }

  function createRollInput(frame, ball, value = "") {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "1";
    input.placeholder = `Ball ${ball} cumulative`;
    input.className = "roll-input";
    input.value = value !== undefined ? value : "";
    input.dataset.frame = frame;
    input.dataset.ball = ball;
    input.addEventListener("input", () => {
      const selectedPlayerId = getCurrentPlayerId();
      if (!selectedPlayerId) return;

      const updatedRolls = getPlayerScores(selectedPlayerId);
      updatedRolls[`f${frame}b${ball}`] = Number(input.value) || 0;
      savePlayerScores(selectedPlayerId, updatedRolls);
    });
    return input;
  }

  function loadPlayerScores(playerId) {
    const playerRolls = getPlayerScores(playerId);
    framesInput.querySelectorAll("input").forEach((input) => {
      const frame = Number(input.dataset.frame);
      const ball = Number(input.dataset.ball);
      const key = `f${frame}b${ball}`;
      input.value = playerRolls[key] !== undefined ? playerRolls[key] : "";
    });
  }

  framesInput.innerHTML = "";
  frames.forEach((frame) => {
    const row = document.createElement("div");
    row.className = "frame-row";
    row.innerHTML = `
      <div>
        <div class="frame-label">Frame ${frame.frame}</div>
        <div class="frame-machine">${frame.machine}</div>
      </div>
    `;
    for (let ball = 1; ball <= 3; ball += 1) {
      row.appendChild(createRollInput(frame.frame, ball));
    }
    framesInput.appendChild(row);
  });

  function refreshPlayerSelection() {
    const players = getPlayersList();
    renderPlayerSelect(playerSelect, playerFileInfo);
    const selectedId = getCurrentPlayerId();
    const hasSelected = players.some((player) => player.id === selectedId);

    if (!hasSelected) {
      if (players.length > 0) {
        setCurrentPlayerId(players[0].id);
      } else {
        setCurrentPlayerId("");
      }
    }

    const activePlayerId = getCurrentPlayerId();
    if (!activePlayerId) {
      warning.textContent = "Please add and select a player before entering scores.";
      warning.classList.remove("hidden");
      calculateButton.disabled = true;
      clearButton.disabled = true;
      framesInput.querySelectorAll("input").forEach((input) => (input.disabled = true));
      return;
    }

    warning.classList.add("hidden");
    calculateButton.disabled = false;
    clearButton.disabled = false;
    framesInput.querySelectorAll("input").forEach((input) => (input.disabled = false));
    loadPlayerScores(activePlayerId);
  }

  function getPinCount(frame, rawScore) {
    if (!frame || typeof rawScore !== "number" || rawScore <= 0) return 0;
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
    const rolls = getRolls();
    const raw1 = Number(rolls[`f${frame.frame}b1`] || 0);
    const raw2 = Number(rolls[`f${frame.frame}b2`] || 0);
    const raw3 = Number(rolls[`f${frame.frame}b3`] || 0);
    const c1 = getPinCount(frame, raw1);
    const c2 = getPinCount(frame, raw2);
    const c3 = getPinCount(frame, raw3);

    let type;
    let first = 0;
    let second = 0;
    let score = 0;

    if (c1 >= 10) {
      type = "strike";
      first = 10;
      second = 0;
      score = 10;
    } else if (c2 >= 10) {
      type = "spare2";
      first = c1;
      second = 10 - c1;
      score = 10;
    } else if (c3 >= 10) {
      type = "spare3";
      first = c2;
      second = 10 - c2;
      score = 10;
    } else {
      type = "open";
      first = c2;
      second = Math.max(0, c3 - c2);
      score = first + second;
    }

    return { frame: frame.frame, machine: frame.machine, type, first, second, score };
  }

  function getNextBallValues(frameIndex, count, frameData) {
    const values = [];
    for (let current = frameIndex + 1; current < frameData.length && values.length < count; current += 1) {
      const next = frameData[current];
      if (next.type === "strike") {
        values.push(10);
      } else {
        values.push(next.first, next.second);
      }
    }
    while (values.length < count) values.push(0);
    return values.slice(0, count);
  }

  function formatMark(frame) {
    if (frame.type === "strike") return "X";
    if (frame.type === "spare2" || frame.type === "spare3") return `${frame.first}/`;
    return `${frame.first} ${frame.second}`;
  }

  function calculate() {
    const frameData = frames.map(getFrameData);
    const frameResults = [];
    let total = 0;

    frameData.forEach((frame, index) => {
      let frameScore = frame.score;

      if (frame.type === "strike") {
        const [next1, next2] = getNextBallValues(index, 2, frameData);
        frameScore = 10 + next1 + next2;
      } else if (frame.type === "spare2" || frame.type === "spare3") {
        const [next1] = getNextBallValues(index, 1, frameData);
        frameScore = 10 + next1;
      }

      total += frameScore;
      frameResults.push({
        frame: frame.frame,
        machine: frame.machine,
        mark: formatMark(frame),
        score: frameScore,
      });
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
      .join("");

    totalScore.textContent = total;
    resultsEmpty.classList.add("hidden");
    resultsPanel.classList.remove("hidden");
  }

  calculateButton.addEventListener("click", calculate);

  clearButton.addEventListener("click", () => {
    const selectedPlayerId = getCurrentPlayerId();
    if (selectedPlayerId) {
      localStorage.removeItem(getPlayerFileKey(selectedPlayerId));
    }
    framesInput.querySelectorAll("input").forEach((input) => {
      input.value = "";
    });
    resultsPanel.classList.add("hidden");
    resultsEmpty.classList.remove("hidden");
  });

  addPlayerButton.addEventListener("click", () => {
    const name = newPlayerName.value.trim();
    if (!name) {
      alert("Enter a player name to add.");
      return;
    }

    const players = getPlayersList();
    const existing = players.find((player) => player.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setCurrentPlayerId(existing.id);
      refreshPlayerSelection();
      newPlayerName.value = "";
      return;
    }

    const id = makePlayerId(name);
    const fileName = makePlayerFileName(name, id);
    const updatedPlayers = players.concat({ id, name, fileName });
    savePlayersFile({ players: updatedPlayers });
    setCurrentPlayerId(id);
    refreshPlayerSelection();
    newPlayerName.value = "";
  });

  playerSelect.addEventListener("change", () => {
    const selectedId = playerSelect.value;
    if (!selectedId) {
      setCurrentPlayerId("");
      refreshPlayerSelection();
      return;
    }
    setCurrentPlayerId(selectedId);
    refreshPlayerSelection();
  });

  function refreshPlayerSelection() {
    const players = getPlayersList();
    renderPlayerSelect(playerSelect, playerFileInfo);
    const selectedId = getCurrentPlayerId();
    const activePlayer = players.find((player) => player.id === selectedId);

    if (!activePlayer) {
      if (players.length > 0) {
        setCurrentPlayerId(players[0].id);
      } else {
        setCurrentPlayerId("");
      }
    }

    const activePlayerId = getCurrentPlayerId();
    if (!activePlayerId) {
      warning.textContent = "Please add and select a player before entering scores.";
      warning.classList.remove("hidden");
      calculateButton.disabled = true;
      clearButton.disabled = true;
      framesInput.querySelectorAll("input").forEach((input) => (input.disabled = true));
      return;
    }

    warning.classList.add("hidden");
    calculateButton.disabled = false;
    clearButton.disabled = false;
    framesInput.querySelectorAll("input").forEach((input) => (input.disabled = false));
    loadPlayerScores(activePlayerId);
  }

  refreshPlayerSelection();
}

function ready() {
  if (document.getElementById("frame-form")) {
    initConfigPage();
  }
  if (document.getElementById("player-form")) {
    initPlayerPage();
  }
}

document.addEventListener("DOMContentLoaded", ready);
