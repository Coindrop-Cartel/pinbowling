import { formatNumber, applyScoreFormatting, renderThresholdGrid, escapeHTML } from '../utils.js';
import { showAlert } from '../ui/dialogs.js';
import { getScoreAccessLevel } from '../services/auth.js';
import { resolvePlayerForBall } from '../services/matchupBuilder.js';

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
    if (targetPlayer?.isTeam) {
      // Team object passed — the team is always registered in the league
      isTargetInRoster = true;
    } else if (activeLeague.type === 'session') {
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

  // Compute display names and team IDs for role labels
  const matchupW = engineContext?.eventMatchups?.[0] || {};
  const homeTeamId = Number(matchupW.player1Id ?? matchupW.player1_id ?? 0);
  const awayTeamId = Number(matchupW.player2Id ?? matchupW.player2_id ?? 0);
  const homeTeamName = matchupW.player1Name || matchupW.player1_name || '';
  const awayTeamName = matchupW.player2Name || matchupW.player2_name || '';

  const defendingTeamId = hasMatchup ? (round.isTop ? homeTeamId : awayTeamId) : 0;
  const battingTeamId = hasMatchup ? (round.isTop ? awayTeamId : homeTeamId) : 0;

  // Access control: team members can enter any scores for their selected team (batter or pitcher).
  // Admins and TDs can enter any scores for any selected team regardless of membership.
  const isTDOrAdmin = engineContext?.isTDOrAdmin ?? false;
  const isTeamMode = engineContext?.isTeamMode;
  const rowPlayerId = round.playerId ? Number(round.playerId) : null;
  const currentPlayerId = engineContext?.getCurrentPlayerId ? Number(engineContext.getCurrentPlayerId()) : null;
  const activeMembers = engineContext?.activeTeamMembers || [];
  const isTeamMember = isTeamMode && currentUser && activeMembers.some(m => String(m.id) === String(currentUser.player_id));
  const canEditSelectedTeam = isTDOrAdmin || isTeamMember || !isTeamMode;

  const isCurrentPlayerRow = !isTeamMode ? (rowPlayerId && currentPlayerId && rowPlayerId === currentPlayerId) : canEditSelectedTeam;
  const effectiveAccessDenied = isAccessDenied || !isCurrentPlayerRow;
  const opponentAccessDenied = isAccessDenied || !isTDOrAdmin;

  const activeLeagueTeams = engineContext?.activeLeague?.teams || [];
  const defendingTeam = activeLeagueTeams.find(t => Number(t.id) === defendingTeamId);
  const defendingMembers = defendingTeam?.members || [];

  const defendingTeamIdStr = String(defendingTeamId);
  const pitcherAssignments = engineContext?.pitcherAssignmentsByTeam?.[defendingTeamIdStr] ||
    (defendingTeamId === Number(engineContext?.getCurrentPlayerId?.()) ? engineContext?.pitcherAssignments : {}) || {};
  const explicitPitcherId = pitcherAssignments[round.orderNumber];

  let defendingPitcherObj = null;
  if (explicitPitcherId) {
    defendingPitcherObj = defendingMembers.find(m => String(m.id) === String(explicitPitcherId));
  }
  if (!defendingPitcherObj && defendingMembers.length > 0) {
    const allRounds = engineContext?.enrichedEntries || [];
    let priorDefendingRounds = 0;
    for (const m of allRounds) {
      if (m.orderNumber >= round.orderNumber) break;
      const mDefendingId = m.isTop ? homeTeamId : awayTeamId;
      if (mDefendingId === defendingTeamId) priorDefendingRounds++;
    }
    defendingPitcherObj = resolvePlayerForBall(defendingMembers, priorDefendingRounds);
  }

  const pitcherPlayerName = defendingPitcherObj?.playerName || defendingPitcherObj?.name || (round.isTop ? homeTeamName : awayTeamName);

  let pitcherDisplayName = '';
  let batterDisplayName = '';

  if (hasMatchup) {
    if (isTeamMode) {
      pitcherDisplayName = pitcherPlayerName;
      batterDisplayName = round.isTop ? awayTeamName : homeTeamName;
    } else {
      const currentId = Number(engineContext?.getCurrentPlayerId?.());
      const currentName = (engineContext?.allPlayersCache || []).find(p => String(p.id) === String(currentId))?.playerName || '';
      if (role === 'pitcher') {
        pitcherDisplayName = currentName;
        batterDisplayName = opponentName;
      } else {
        batterDisplayName = currentName;
        pitcherDisplayName = opponentName;
      }
    }
  }

  let roleHtml = '';
  if (hasMatchup) {
    const roleIsPitcher = role === 'pitcher';
    const displayName = roleIsPitcher ? pitcherDisplayName : batterDisplayName;
    const roleLabel = roleIsPitcher ? 'Pitcher' : 'Batter';
    const displayHtml = displayName ? `: ${escapeHTML(displayName)}` : '';
    roleHtml = `
      <div class="baseball-role-row">
        <span class="role-label ${roleIsPitcher ? 'pitcher' : 'batter'}">${roleLabel}${displayHtml}</span>
      </div>
    `;
  }

  // Compute per-ball player names for team mode
  const playerPerBall = [];
  const ballPlayers = [];
  if (hasMatchup && isTeamMode && round.isTop !== undefined) {
    const battingTeamIdStr = String(battingTeamId);
    let teamBattingOrder = engineContext?.battingOrdersByTeam?.[battingTeamIdStr];
    if (!teamBattingOrder || teamBattingOrder.length === 0) {
      if (battingTeamId === Number(engineContext?.getCurrentPlayerId?.()) && engineContext?.battingOrder?.length) {
        teamBattingOrder = engineContext.battingOrder;
      } else {
        const battingTeam = activeLeagueTeams.find(t => Number(t.id) === battingTeamId);
        teamBattingOrder = battingTeam?.members || [];
      }
    }

    const allRounds = engineContext?.enrichedEntries || [];
    let priorBattingRounds = 0;
    for (const m of allRounds) {
      if (m.orderNumber >= round.orderNumber) break;
      const mBattingTeamId = m.isTop ? awayTeamId : homeTeamId;
      if (mBattingTeamId === battingTeamId) priorBattingRounds++;
    }

    const ballOffset = priorBattingRounds * 3;
    for (let i = 0; i < 3; i++) {
      const player = resolvePlayerForBall(teamBattingOrder, ballOffset + i);
      ballPlayers.push(player);
      playerPerBall.push(player?.playerName || player?.name || '');
    }
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
      ${hasMatchup && !isPitcher ? `<div class="opponent-inputs-container ${opponentAccessDenied ? 'round-inputs-disabled' : ''}"><div class="role-section-header pitcher-label"><span class="role-title">Pitcher:</span> <span class="role-name">${escapeHTML(pitcherDisplayName)}</span></div></div>` : ''}
      <div class="round-inputs-container ${effectiveAccessDenied ? 'round-inputs-disabled' : ''}">
        ${hasMatchup ? `<div class="role-section-header"><span class="role-title">${isPitcher ? 'Pitcher:' : 'Batter:'}</span> <span class="role-name">${isPitcher ? escapeHTML(pitcherDisplayName) : (isTeamMode ? '' : escapeHTML(batterDisplayName))}</span></div>` : ''}
      </div>
      ${hasMatchup && isPitcher ? `<div class="opponent-inputs-container ${opponentAccessDenied ? 'round-inputs-disabled' : ''}"><div class="role-section-header batter-label"><span class="role-title">Batter:</span> <span class="role-name">${isTeamMode ? '' : escapeHTML(batterDisplayName)}</span></div></div>` : ''}
      <button class="save-round-button btn-mgmt" ${effectiveAccessDenied && opponentAccessDenied ? 'hidden' : ''} disabled>Save</button>
    </div>
    ${effectiveAccessDenied && opponentAccessDenied ? `
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
    const placeholder = `Ball ${ball}`;
    const isBallLocked = !!lockedBalls[`ball${ball}`];

    const ballGroup = document.createElement('div');
    ballGroup.className = 'ball-input-group';

    const playerName = !isPitcher ? (playerPerBall[ball - 1] || '') : '';
    if (playerName) {
      const nameEl = document.createElement('div');
      nameEl.className = 'ball-player-name';
      nameEl.textContent = playerName;
      ballGroup.appendChild(nameEl);
    }
    
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

    ballGroup.appendChild(input);
    inputsContainer.appendChild(ballGroup);
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

          const ballGroup = document.createElement('div');
          ballGroup.className = 'ball-input-group';

          const playerName = isPitcher ? (playerPerBall[ball - 1] || '') : '';
          if (playerName) {
            const nameEl = document.createElement('div');
            nameEl.className = 'ball-player-name';
            nameEl.textContent = playerName;
            ballGroup.appendChild(nameEl);
          }

          const input = createRollInput(round.orderNumber, ball, round.machineId, displayValue, `Ball ${ball}`, { isOpponent: true });
          ballGroup.appendChild(input);
          opponentContainer.appendChild(ballGroup);
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
        let ball1PlayerId = null;
        let ball2PlayerId = null;
        let ball3PlayerId = null;

        if (isTeamMode) {
          if (isPitcher) {
            ball1PlayerId = defendingPitcherObj?.id ? Number(defendingPitcherObj.id) : null;
            ball2PlayerId = defendingPitcherObj?.id ? Number(defendingPitcherObj.id) : null;
            ball3PlayerId = defendingPitcherObj?.id ? Number(defendingPitcherObj.id) : null;
          } else {
            ball1PlayerId = ballPlayers[0]?.id ? Number(ballPlayers[0].id) : null;
            ball2PlayerId = ballPlayers[1]?.id ? Number(ballPlayers[1].id) : null;
            ball3PlayerId = ballPlayers[2]?.id ? Number(ballPlayers[2].id) : null;
          }
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
