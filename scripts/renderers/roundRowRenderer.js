import { formatNumber, applyScoreFormatting, renderThresholdGrid, escapeHTML } from '../utils.js';
import { showAlert, showDialog } from '../ui/dialogs.js';
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
    const bonusLabels = engine.getBonusTargetLabels ? engine.getBonusTargetLabels(round) : { label1: 'XX', label2: 'XXX' };
    bonusHtml = `
      <div class="bonus-targets">
        <div><b>${escapeHTML(bonusLabels.label1)}:</b> ${formatNumber(bonusTargets.t1)}</div>
        <div><b>${escapeHTML(bonusLabels.label2)}:</b> ${formatNumber(bonusTargets.t2)}</div>
      </div>
    `;
  }

  const rowContext = engine.getRoundRowContext(round, engineContext);
  const displayRoundNumber = rowContext.displayRoundNumber ?? round.orderNumber;
  const displayRoundLabel = rowContext.displayRoundLabel !== undefined ? rowContext.displayRoundLabel : engine.getRoundLabel();
  const sections = rowContext.sections || [];
  const hasMatchup = sections.length > 0;

  const isLoggedIn = !!currentUser;
  const isTDOrAdmin = isLoggedIn && ((engineContext?.isTDOrAdmin || currentUser?.role === 'admin' || currentUser?.role === 'td') ?? false);
  const isTeamMode = engineContext?.isTeamMode;
  const activeMembers = engineContext?.activeTeamMembers || [];
  const isTeamMember = isTeamMode && isLoggedIn && activeMembers.some(m => String(m.id) === String(currentUser.player_id));
  const hasUnlinkedGuestMember = isTeamMode && isLoggedIn && activeMembers.some(m => !m.userId);

  let effectiveAccessDenied = false;
  const opponentAccessDenied = true;
  let statusMsg = msg;

  if (rowContext?.isWalkOff) {
    effectiveAccessDenied = false;
    statusMsg = rowContext.walkOffNotice || 'Walk-off: Home team is leading in the bottom of the last inning. No need to play extra balls. Save this round to complete the game.';
  } else if (rowContext?.isDisabled) {
    effectiveAccessDenied = true;
    statusMsg = 'This round is locked.';
  } else if (isTDOrAdmin || (isTeamMode && (isTeamMember || hasUnlinkedGuestMember))) {
    effectiveAccessDenied = false;
  } else {
    effectiveAccessDenied = isAccessDenied || !isLoggedIn || (isTeamMode && !isTeamMember);
    if (!statusMsg) {
      if (!isLoggedIn) {
        statusMsg = 'Login required to record scores.';
      } else if (isTeamMode && !isTeamMember) {
        statusMsg = 'Spectator Mode: Only team members can record scores.';
      }
    }
  }

  const roundTitle = displayRoundLabel ? `${escapeHTML(displayRoundLabel)} ${displayRoundNumber}` : `${displayRoundNumber}`;

  let sectionsHtml = '';
  if (hasMatchup) {
    const isAllScoresMode = Boolean(engineContext?.isAllScoresMode);
    sectionsHtml = sections.map(sec => {
      const canEditSec = (sec.isActiveParticipant || isAllScoresMode) && !effectiveAccessDenied;
      const isDisabled = !canEditSec;
      const containerClass = canEditSec ? 'round-inputs-container' : 'opponent-inputs-container';
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
      <button type="button" class="save-round-button btn-mgmt" ${effectiveAccessDenied ? 'hidden' : ''} disabled>Save</button>
    </div>
    ${effectiveAccessDenied || rowContext?.isWalkOff ? `
      <div class="round-status-bar">
        <span class="round-msg">${escapeHTML(statusMsg)}</span>
      </div>
    ` : ''}
  `;

  const saveBtn = row.querySelector('.save-round-button');
  const hasSavedScoreInRound = sections.some(sec => {
    const secId = Number(sec.teamId ?? sec.playerId ?? 0);
    const orderStr = String(round.orderNumber);
    const secScoreRow = isTeamMode
      ? (scoreMap?.byTeam?.[secId]?.[orderStr] || scoreMap?.byTeam?.[String(secId)]?.[orderStr])
      : (scoreMap?.byPlayer?.[secId]?.[orderStr] || scoreMap?.byPlayer?.[String(secId)]?.[orderStr]);
    return Boolean(secScoreRow);
  });

  if (rowContext?.isWalkOff && !hasSavedScoreInRound) {
    saveBtn.disabled = false;
  }

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

      const isAllScoresMode = Boolean(engineContext?.isAllScoresMode);
      const canEditSection = (sec.isActiveParticipant || isAllScoresMode) && !effectiveAccessDenied;
      const isBallLockedForSec = sec.isActiveParticipant && !isTDOrAdmin;
      const perBallPlayers = sec.perBallPlayers || [];

      const maxBalls = typeof engine.getMaxBallsPerRound === 'function' ? engine.getMaxBallsPerRound() : 3;

      for (let ball = 1; ball <= maxBalls; ball += 1) {
        const secId = Number(sec.teamId ?? sec.playerId ?? 0);
        const orderStr = String(round.orderNumber);

        // Direct lookup by participant ID in byTeam or byPlayer map
        const secScoreRow = isTeamMode
          ? (scoreMap?.byTeam?.[secId]?.[orderStr] || scoreMap?.byTeam?.[String(secId)]?.[orderStr])
          : (scoreMap?.byPlayer?.[secId]?.[orderStr] || scoreMap?.byPlayer?.[String(secId)]?.[orderStr]);

        const value = secScoreRow ? secScoreRow[`ball${ball}`] : undefined;
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
        input.dataset.playerId = sec.playerId;
        input.dataset.isActiveParticipant = sec.isActiveParticipant ? 'true' : 'false';

        if (isBallLocked) {
          input.readOnly = true;
          input.classList.add('ball-locked');
          input.setAttribute('aria-disabled', 'true');
          input.setAttribute('tabindex', '-1');
          input.dataset.savedValue = displayValue;
        }

        if (canEditSection) {
          input.addEventListener('input', () => {
            delete input.dataset.savedValue;
            saveBtn.disabled = false;
            saveBtn.classList.add('is-dirty');
          });
        }

        ballGroup.appendChild(input);
        sectionRow.appendChild(ballGroup);
      }
    });
  } else {
    // Non-matchup format (Bowling / Golf / Home Run Derby)
    const maxBalls = typeof engine.getMaxBallsPerRound === 'function' ? engine.getMaxBallsPerRound() : 3;
    const inputsContainer = row.querySelector('.round-inputs-container');
    for (let ball = 1; ball <= maxBalls; ball += 1) {
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
        delete input.dataset.savedValue;
        saveBtn.disabled = false;
        saveBtn.classList.add('is-dirty');
      });

      ballGroup.appendChild(input);
      inputsContainer.appendChild(ballGroup);
    }
  }

  saveBtn.addEventListener('click', async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!saveScoreCallback || saveBtn.disabled) return;
    const currentPlayerId = getCurrentPlayerId() || (typeof engineContext?.getActiveTeamId === 'function' ? engineContext.getActiveTeamId() : null);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      if (saveScoreCallback) {
        const isAllScoresMode = Boolean(engineContext?.isAllScoresMode) || String(currentPlayerId) === 'all';
        const sectionsToSave = (sections && sections.length > 0)
          ? sections.filter(sec => (sec.isActiveParticipant || isAllScoresMode) && !effectiveAccessDenied)
          : [null];

        for (const sec of sectionsToSave) {
          const secSelector = sec ? `.${sec.key}-row` : '';
          const getSecBallValue = (ballNum) => {
            const input = secSelector
              ? row.querySelector(`${secSelector} [data-ball="${ballNum}"]`)
              : row.querySelector(`[data-ball="${ballNum}"]`);
            if (!input) return 0;
            const valStr = input.value !== undefined && input.value !== null && input.value.trim() !== ''
              ? input.value
              : (input.dataset.savedValue ?? '');
            return Number(String(valStr).replace(/\D/g, '')) || 0;
          };

          const ball1 = getSecBallValue(1);
          const ball2 = getSecBallValue(2);
          const ball3 = getSecBallValue(3);

          // If in multi-section view (e.g. All Teams/Players or dual row) and this section has no non-zero scores and no dirty inputs, skip saving empty 0-scores
          if (sectionsToSave.length > 1 && ball1 === 0 && ball2 === 0 && ball3 === 0) {
            const secRow = secSelector ? row.querySelector(secSelector) : row;
            const isDirty = secRow?.querySelector('.is-dirty');
            if (!isDirty) continue;
          }

          let ball1PlayerId = null;
          let ball2PlayerId = null;
          let ball3PlayerId = null;

          if (isTeamMode && sec?.perBallPlayers?.length) {
            ball1PlayerId = sec.perBallPlayers[0]?.id ? Number(sec.perBallPlayers[0].id) : null;
            ball2PlayerId = sec.perBallPlayers[1]?.id ? Number(sec.perBallPlayers[1].id) : null;
            ball3PlayerId = sec.perBallPlayers[2]?.id ? Number(sec.perBallPlayers[2].id) : null;
          }

          let targetSecPlayerId = sec?.playerId ? Number(sec.playerId) : Number(currentPlayerId);
          if (isNaN(targetSecPlayerId) && sec?.key) {
            const keyIdx = sec.key === 'player1' ? 1 : (sec.key === 'player2' ? 2 : (sec.key === 'player3' ? 3 : 4));
            const wrapper = engineContext?.eventMatchups?.[0] || {};
            targetSecPlayerId = Number(wrapper[`player${keyIdx}Id`] ?? wrapper[`player${keyIdx}_id`] ?? wrapper[`team${keyIdx}Id`] ?? 0);
          }

          const savePayload = {
            teamId: targetSecPlayerId,
            playerId: targetSecPlayerId,
            orderNumber: Number(round.orderNumber),
            machineId: Number(round.machineId),
            ball1,
            ball2,
            ball3,
            ball1PlayerId,
            ball2PlayerId,
            ball3PlayerId
          };
          if (window.PB_DEBUG_MODE) console.log('[RoundRow] Calling saveScoreCallback with:', JSON.stringify(savePayload));
          await saveScoreCallback(savePayload);
        }
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
