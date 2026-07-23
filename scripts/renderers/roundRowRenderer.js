import { formatNumber, applyScoreFormatting, renderThresholdGrid, escapeHTML } from '../utils.js';
import { showAlert } from '../ui/dialogs.js';
import { getScoreAccessLevel } from '../services/auth.js';

/**
 * Helper to create a formatted numeric input for pinball scores.
 */
export function createRollInput(roundNumber, ball, machineId, value = '', placeholder = '', { isOpponent = false } = {}) {
  const input = document.createElement('input');
  input.placeholder = placeholder || `Ball ${ball} cumulative`;
  input.className = isOpponent ? 'roll-input opponent-input' : 'roll-input';
  input.value = (value !== '' && value !== undefined) ? formatNumber(value) : '';
  input.dataset.order = roundNumber;
  input.dataset[isOpponent ? 'opponentBall' : 'ball'] = ball;
  input.dataset.machineId = machineId;
  applyScoreFormatting(input);

  if (isOpponent) {
    input.readOnly = true;
    input.classList.add('roll-input-readonly');
    input.setAttribute('aria-disabled', 'true');
    input.setAttribute('tabindex', '-1');
  }

  return input;
}

/**
 * Constructs the HTML structure for a single round's input row.
 */
export async function buildRoundRow(round, scoreMap, isLastRound = false, targetPlayer = null, roundIndex = 0, {
  currentUser,
  activeLeague,
  machines,
  engine,
  engineContext,
  getCurrentPlayerId,
  saveScoreCallback,
  refreshCallback
} = {}) {
  const row = document.createElement('div');
  
  const turnValues = scoreMap?.[String(round.orderNumber)] || null;
  const opponentScores = scoreMap?.opponent?.[String(round.orderNumber)] || null;
  let isTargetInRoster = false;
  if (activeLeague) {
    if (activeLeague.type === 'session') {
      isTargetInRoster = true;
    } else if (activeLeague.participationType === 'team') {
      isTargetInRoster = (activeLeague.teams || []).some(t => (t.members || []).some(m => String(m.id) === String(targetPlayer?.id)));
    } else {
      isTargetInRoster = (activeLeague.players || []).some(p => String(p.id) === String(targetPlayer?.id));
    }
  } else {
    isTargetInRoster = true;
  }

  const { access: accessLevel, reason: msg, lockedBalls = {} } = await getScoreAccessLevel(currentUser, targetPlayer, turnValues, activeLeague?.type, isTargetInRoster);
  const isAccessDenied = accessLevel === 'denied';

  row.className = 'round-row';
  row.dataset.orderNumber = round.orderNumber;

  // Retrieve data from engine instead of raw HTML
  const summaryData = engine.getRowSummaryData(round);
  let summaryHtml = '';
  if (summaryData) {
    summaryHtml = `<div class="strike-target"><b>${escapeHTML(summaryData.label)}:</b> ${formatNumber(summaryData.value)}`;
    if (summaryData.label2 && summaryData.value2 !== undefined) {
      summaryHtml += ` &nbsp;&nbsp; <b>${escapeHTML(summaryData.label2)}:</b> ${summaryData.value2}`;
    }
    summaryHtml += `</div>`;
  }

  // Bonus targets rendering
  let bonusHtml = '';
  const bonusTargets = engine.getBonusTargets(round);
  if (isLastRound && bonusTargets && bonusTargets.t1) {
    bonusHtml = `
      <div class="bonus-targets">
        <div><b>XX:</b> ${formatNumber(bonusTargets.t1)}</div>
        <div><b>XXX:</b> ${formatNumber(bonusTargets.t2)}</div>
      </div>
    `;
  }

  const rowContext = engine.getRoundRowContext(round, engineContext);
  const displayRoundNumber = rowContext.displayRoundNumber ?? round.orderNumber;
  const displayRoundLabel = rowContext.displayRoundLabel !== undefined ? rowContext.displayRoundLabel : engine.getRoundLabel();
  const isPitcher = rowContext.isPitcher ?? false;
  const hasMatchup = !!rowContext.matchup;
  const role = rowContext.role ?? '';
  const opponentName = rowContext.opponentName ?? '';

  let roleHtml = '';
  if (hasMatchup) {
    roleHtml = `
      <div class="baseball-role-row">
        <span class="role-label ${role === 'pitcher' ? 'pitcher' : 'batter'}">${role === 'pitcher' ? 'Pitcher' : 'Batter'}</span>
        <span class="meta-muted">vs ${escapeHTML(opponentName)}</span>
      </div>
    `;
  }

  const roundTitle = displayRoundLabel ? `${escapeHTML(displayRoundLabel)} ${displayRoundNumber}` : `${displayRoundNumber}`;

  row.innerHTML = `
    <div class="round-info">
      <div class="round-label"><b>${roundTitle}:</b> ${escapeHTML(round.machineName)}</div>
      ${roleHtml}
      ${summaryHtml}
      ${bonusHtml}
    </div>
    <div class="target-details hidden">
      <div class="small threshold-heading">Scoring Thresholds</div>
      ${renderThresholdGrid(engine.filterThresholds(round.values), formatNumber, engine, round.value1, round.value2)}
    </div>
    <div class="round-actions">
      ${hasMatchup && !isPitcher ? `<div class="opponent-inputs-container round-inputs-disabled"><span class="input-role-label pitcher-label">Pitcher:</span></div>` : ''}
      <div class="round-inputs-container ${isAccessDenied ? 'round-inputs-disabled' : ''}">${hasMatchup ? `<span class="input-role-label">${isPitcher ? 'Pitcher:' : 'Batter:'}</span>` : ''}</div>
      ${hasMatchup && isPitcher ? `<div class="opponent-inputs-container round-inputs-disabled"><span class="input-role-label batter-label">Batter:</span></div>` : ''}
      <button class="save-round-button btn-mgmt" ${isAccessDenied ? 'hidden' : ''} disabled>Save</button>
    </div>
    ${isAccessDenied ? `
      <div class="round-status-bar">
        <span class="round-msg">${escapeHTML(msg)}</span>
      </div>
    ` : ''}
  `;

  const inputsContainer = row.querySelector('.round-inputs-container');
  const saveBtn = row.querySelector('.save-round-button');

  row.querySelector('.round-info').addEventListener('click', () => {
    row.querySelector('.target-details').classList.toggle('hidden');
  });
  row.querySelector('.target-details').addEventListener('click', (e) => {
    e.stopPropagation();
    row.querySelector('.target-details').classList.add('hidden');
  });

  for (let ball = 1; ball <= 3; ball += 1) {
    const value = turnValues?.[`ball${ball}`] ?? '';
    const placeholder = `Ball ${ball} cumulative`;
    const isBallLocked = !!lockedBalls[`ball${ball}`];
    
    const input = createRollInput(round.orderNumber, ball, round.machineId, value, placeholder);
    
    if (isBallLocked) {
      input.readOnly = true;
      input.classList.add('ball-locked');
      input.setAttribute('aria-disabled', 'true');
      input.setAttribute('tabindex', '-1');
      input.dataset.savedValue = value;
    }

    input.addEventListener('input', () => {
      saveBtn.disabled = false;
      saveBtn.classList.add('is-dirty');
    });

    inputsContainer.appendChild(input);
  }

  if (hasMatchup) {
    const opponentContainers = row.querySelectorAll('.opponent-inputs-container');
    if (opponentContainers.length > 0) {
      const targetContainerSelector = isPitcher ? '.batter-label' : '.pitcher-label';
      const opponentContainer = Array.from(opponentContainers).find(c => c.querySelector(targetContainerSelector));
      if (opponentContainer) {
        for (let ball = 1; ball <= 3; ball += 1) {
          const oppValue = opponentScores?.[`ball${ball}`];
          const displayValue = (oppValue !== undefined && oppValue !== null && oppValue !== 0) ? oppValue : '';
          const input = createRollInput(round.orderNumber, ball, round.machineId, displayValue, `Ball ${ball}`, { isOpponent: true });
          opponentContainer.appendChild(input);
        }
      }
    }
  }

  saveBtn.addEventListener('click', async () => {
    const currentPlayerId = getCurrentPlayerId();
    if (!currentPlayerId) return;

    const getBallValue = (ballNum) => {
      const input = row.querySelector(`[data-ball="${ballNum}"]`);
      if (input && input.dataset.savedValue !== undefined) {
        return Number(String(input.dataset.savedValue).replace(/\D/g, '')) || 0;
      }
      return Number(input?.value.replace(/\D/g, '')) || 0;
    };

    const ball1 = getBallValue(1);
    const ball2 = getBallValue(2);
    const ball3 = getBallValue(3);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      if (saveScoreCallback) {
        await saveScoreCallback({
          playerId: Number(currentPlayerId),
          orderNumber: Number(round.orderNumber),
          machineId: Number(round.machineId),
          ball1,
          ball2,
          ball3,
        });
      }
      saveBtn.classList.remove('is-dirty');
      if (refreshCallback) {
        await refreshCallback();
      }
    } catch (err) {
      const message = err?.message || String(err);
      showAlert('Failed to save score: ' + message, 'Error');
      saveBtn.disabled = false;
    } finally {
      saveBtn.textContent = 'Save';
    }
  });

  return row;
}

/**
 * Renders the preview row HTML for a frame in session setup.
 */
export function renderPreviewRow(engine, frame, index, isExpanded, formatNumber, escapeHTML, renderThresholdGrid) {
  const previewData = engine.getPreviewRowData(frame);
  const displayLabel = engine.getRoundDisplayLabel(index);
  
  let headerHtml = '';
  let contentHtml = '';

  if (engine.constructor.name === 'BaseballEngine') {
    headerHtml = `
      <div class="flex gap-12 w-100 wrap matchup-inning">
        <div class="flex gap-12 flex-1 min-250 align-center">
          <div class="drag-handle">☰</div>
          <span class="round-number">${displayLabel}</span>
          <span class="machine-name-display">${escapeHTML(frame.machineName)}</span>
        </div>
      </div>
    `;
  } else {
    headerHtml = `
      <div class="flex gap-12 w-100 wrap">
        <div class="flex gap-12 flex-1 min-250 align-center">
          <div class="drag-handle">☰</div>
          <span class="round-number">${displayLabel}</span>
          <span class="machine-name-display">${escapeHTML(frame.machineName)}</span>
        </div>
        <div class="flex gap-12 wrap justify-end" onclick="event.stopPropagation()">
          <div class="flex gap-6 min-140 flex-1 align-center">
            <label class="small value-label">${engine.getValue1Label()}:</label>
            <input type="text" class="score10-input score-input" value="${formatNumber(frame.value1)}">
          </div>
          <div class="flex gap-6 min-140 flex-1 align-center">
            <label class="small value-label">${engine.getValue2Label()}:</label>
            <input type="text" class="score1-input score-input" value="${formatNumber(frame.value2)}">
          </div>
        </div>
      </div>
    `;
  }

  contentHtml = `
    <div class="form-row">
      <label class="small">Change Machine</label>
      <input type="text" class="row-machine-search" placeholder="Filter machines...">
      <select class="row-machine-select"></select>
    </div>
    <div class="flex-between mb-10">
      <div class="flex gap-6">
         <button type="button" class="qfill secondary btn-row" data-type="easy">Easy</button>
         <button type="button" class="qfill secondary btn-row" data-type="med">Med</button>
         <button type="button" class="qfill secondary btn-row" data-type="hard">Hard</button>
      </div>
      <div class="flex gap-4">
         <button type="button" class="scaling-btn ${frame.scaling === 'flat' ? 'btn-standard' : 'secondary'} btn-row" data-scale="flat">Flat</button>
         <button type="button" class="scaling-btn ${frame.scaling === 'curved' ? 'btn-standard' : 'secondary'} btn-row" data-scale="curved">Curved</button>
      </div>
    </div>
    <div class="preview-values-container">${renderThresholdGrid(engine.filterThresholds(frame.values), formatNumber, engine, frame.value1, frame.value2)}</div>
  `;

  return { headerHtml, contentHtml };
}
