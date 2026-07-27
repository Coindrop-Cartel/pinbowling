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
  const isSession = activeLeague?.isSession === true;
  if (activeLeague) {
    if (targetPlayer?.isTeam) {
      isTargetInRoster = true;
    } else if (isSession) {
      isTargetInRoster = true;
    } else if (activeLeague.participationType === 'team') {
      isTargetInRoster = (activeLeague.teams || []).some(t => (t.members || []).some(m => String(m.id) === String(targetPlayer?.id)));
    } else {
      isTargetInRoster = (activeLeague.players || []).some(p => String(p.id) === String(targetPlayer?.id));
    }
  } else {
    isTargetInRoster = true;
  }

  const { access: accessLevel, reason: msg, lockedBalls = {} } = await getScoreAccessLevel(currentUser, targetPlayer, turnValues, isSession, isTargetInRoster);
  const isAccessDenied = accessLevel === 'denied';

  row.className = 'round-row';
  row.dataset.orderNumber = round.orderNumber;

  const summaryData = engine.getRowSummaryData(round);
  let summaryHtml = '';
  if (summaryData) {
    summaryHtml = `<div class="strike-target"><b>${escapeHTML(summaryData.label)}:</b> ${formatNumber(summaryData.value)}`;
    if (summaryData.label2 && summaryData.value2 !== undefined) {
      summaryHtml += ` &nbsp;&nbsp; <b>${escapeHTML(summaryData.label2)}:</b> ${summaryData.value2}`;
    }
    summaryHtml += `</div>`;
  }

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
  const sections = rowContext.sections || [];
  const hasMatchup = sections.length > 0;

  const isTDOrAdmin = (engineContext?.isTDOrAdmin || currentUser?.role === 'admin' || currentUser?.role === 'td') ?? false;
  const isTeamMode = engineContext?.isTeamMode;
  const activeMembers = engineContext?.activeTeamMembers || [];
  const isTeamMember = isTeamMode && currentUser && activeMembers.some(m => String(m.id) === String(currentUser.player_id));

  let effectiveAccessDenied = false;
  const opponentAccessDenied = true;
  let statusMsg = msg;

  if (rowContext?.isDisabled || rowContext?.isWalkOff) {
    effectiveAccessDenied = true;
    statusMsg = rowContext.walkOffNotice || '🔒 Walk-off: Home team is leading in the bottom of the last inning. DO NOT PLAY EXTRA BALLS.';
  } else if (isTDOrAdmin) {
    effectiveAccessDenied = false;
  } else {
    effectiveAccessDenied = isAccessDenied || (isTeamMode && !isTeamMember);
  }

  const roundTitle = displayRoundLabel ? `${escapeHTML(displayRoundLabel)} ${displayRoundNumber}` : `${displayRoundNumber}`;

  let sectionsHtml = '';
  if (hasMatchup) {
    sectionsHtml = sections.map(sec => {
      const isDisabled = sec.isActiveParticipant ? effectiveAccessDenied : opponentAccessDenied;
      const containerClass = sec.isActiveParticipant ? 'round-inputs-container' : 'opponent-inputs-container';
      return `
        <div class="participant-section ${sec.key}-section ${containerClass} ${isDisabled ? 'round-inputs-disabled' : ''}">
          ${sec.roleLabel || sec.displayName ? `
            <div class="role-section-header ${sec.key}-label">
              ${sec.roleLabel ? `<span class="role-title">${escapeHTML(sec.roleLabel)}:</span>` : ''}
              ${sec.displayName ? `<span class="role-name">${escapeHTML(sec.displayName)}</span>` : ''}
            </div>
          ` : ''}
          <div class="inputs-row ${sec.key}-row"></div>
        </div>
      `;
    }).join('');
  } else {
    sectionsHtml = `<div class="round-inputs-container ${effectiveAccessDenied ? 'round-inputs-disabled' : ''}"></div>`;
  }

  row.innerHTML = `
    <div class="round-info">
      <div class="round-label"><b>${roundTitle}:</b> ${escapeHTML(round.machineName)}</div>
      ${summaryHtml}
      ${bonusHtml}
    </div>
    <div class="target-details hidden">
      <div class="small threshold-heading">Scoring Thresholds</div>
      ${renderThresholdGrid(engine.filterThresholds(round.values), formatNumber, engine, round.value1, round.value2)}
    </div>
    <div class="round-actions">
      ${sectionsHtml}
      <button class="save-round-button btn-mgmt" ${effectiveAccessDenied ? 'hidden' : ''} disabled>Save</button>
    </div>
    ${effectiveAccessDenied ? `
      <div class="round-status-bar">
        <span class="round-msg">${escapeHTML(statusMsg)}</span>
      </div>
    ` : ''}
  `;

  const saveBtn = row.querySelector('.save-round-button');

  row.querySelector('.round-info').addEventListener('click', () => {
    row.querySelector('.target-details').classList.toggle('hidden');
  });
  row.querySelector('.target-details').addEventListener('click', (e) => {
    e.stopPropagation();
    row.querySelector('.target-details').classList.add('hidden');
  });

  if (hasMatchup) {
    sections.forEach(sec => {
      const sectionRow = row.querySelector(`.${sec.key}-row`);
      if (!sectionRow) return;

      const canEditSection = sec.isActiveParticipant && !effectiveAccessDenied;
      const isBallLockedForSec = sec.isActiveParticipant && !isTDOrAdmin;
      const perBallPlayers = sec.perBallPlayers || [];

      for (let ball = 1; ball <= 3; ball += 1) {
        const value = sec.isActiveParticipant ? turnValues?.[`ball${ball}`] : opponentScores?.[`ball${ball}`];
        const displayValue = (value !== undefined && value !== null && value !== 0) ? value : '';
        const isBallLocked = isBallLockedForSec && !!lockedBalls[`ball${ball}`];

        const ballGroup = document.createElement('div');
        ballGroup.className = 'ball-input-group';

        const pBallObj = perBallPlayers[ball - 1];
        const playerName = pBallObj?.playerName || pBallObj?.name || (typeof pBallObj === 'string' ? pBallObj : '');
        if (playerName) {
          const nameEl = document.createElement('div');
          nameEl.className = 'ball-player-name';
          nameEl.textContent = playerName;
          ballGroup.appendChild(nameEl);
        }

        const input = createRollInput(round.orderNumber, ball, round.machineId, displayValue, `Ball ${ball}`, { isOpponent: !canEditSection });
        input.dataset.sectionKey = sec.key;

        if (isBallLocked) {
          input.readOnly = true;
          input.classList.add('ball-locked');
          input.setAttribute('aria-disabled', 'true');
          input.setAttribute('tabindex', '-1');
          input.dataset.savedValue = displayValue;
        }

        if (canEditSection) {
          input.addEventListener('input', () => {
            saveBtn.disabled = false;
            saveBtn.classList.add('is-dirty');
          });
        }

        ballGroup.appendChild(input);
        sectionRow.appendChild(ballGroup);
      }
    });
  } else {
    // Non-matchup format (Bowling / Golf)
    const inputsContainer = row.querySelector('.round-inputs-container');
    for (let ball = 1; ball <= 3; ball += 1) {
      const value = turnValues?.[`ball${ball}`] ?? '';
      const isBallLocked = !!lockedBalls[`ball${ball}`];

      const ballGroup = document.createElement('div');
      ballGroup.className = 'ball-input-group';

      const input = createRollInput(round.orderNumber, ball, round.machineId, value, `Ball ${ball}`);
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

      ballGroup.appendChild(input);
      inputsContainer.appendChild(ballGroup);
    }
  }

  saveBtn.addEventListener('click', async () => {
    const currentPlayerId = getCurrentPlayerId();
    if (!currentPlayerId) return;

    const activeSec = sections.find(s => s.isActiveParticipant);
    const activeSectionSelector = activeSec ? `.${activeSec.key}-row` : '';
    const getBallValue = (ballNum) => {
      const input = activeSectionSelector
        ? row.querySelector(`${activeSectionSelector} [data-ball="${ballNum}"]`)
        : row.querySelector(`[data-ball="${ballNum}"]`);
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
        let ball1PlayerId = null;
        let ball2PlayerId = null;
        let ball3PlayerId = null;

        if (isTeamMode && activeSec?.perBallPlayers?.length) {
          ball1PlayerId = activeSec.perBallPlayers[0]?.id ? Number(activeSec.perBallPlayers[0].id) : null;
          ball2PlayerId = activeSec.perBallPlayers[1]?.id ? Number(activeSec.perBallPlayers[1].id) : null;
          ball3PlayerId = activeSec.perBallPlayers[2]?.id ? Number(activeSec.perBallPlayers[2].id) : null;
        }

        await saveScoreCallback({
          playerId: Number(currentPlayerId),
          orderNumber: Number(round.orderNumber),
          machineId: Number(round.machineId),
          ball1,
          ball2,
          ball3,
          ball1PlayerId,
          ball2PlayerId,
          ball3PlayerId
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
  const showValueInputs = engine.showValueInputsInPreview ? engine.showValueInputsInPreview() : true;
  
  let headerHtml = '';
  let contentHtml = '';

  if (!showValueInputs) {
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
