import { formatNumber, applyScoreFormatting, renderThresholdGrid, escapeHTML } from '@scripts/utils.js';
import { showAlert } from '@ui/dialogs.js';
import { getScoreAccessLevel } from '@services/auth.js';

/**
 * Helper to create a formatted numeric input for pinball scores.
 * @param {number} roundNumber 
 * @param {number} ball 
 * @param {number} machineId 
 * @param {string|number} value 
 * @param {string} placeholder 
 * @param {Object} [options] Additional options.
 * @param {boolean} [options.isOpponent=false] If true, marks as opponent (read-only) input.
 * @returns {HTMLInputElement}
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
 * @param {Object} round The machine configuration for this round.
 * @param {Object} turnValues Existing scores from the database (if any).
 * @param {boolean} isLastRound Whether to apply 10th-frame logic.
 * @param {Object} targetPlayer The player being scored.
 * @param {Object} opponentScores Opponent's ball scores for this round.
 * @param {number} roundIndex The index of the round.
 * @param {Object} config Options and dependencies.
 * @returns {Promise<HTMLElement>} The row element.
 */
export async function buildRoundRow(round, turnValues, isLastRound = false, targetPlayer = null, opponentScores = null, roundIndex = 0, {
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
  
  let isTargetInRoster = false;
  if (activeLeague) {
    if (activeLeague.type === 'session') {
      isTargetInRoster = true;
    } else if (activeLeague.participants === 'team') {
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

  const bonusHtml = engine.getBonusTargetHtml(round, isLastRound, formatNumber);
  const rowContext = engine.getRoundRowContext(round, engineContext);
  const displayRoundNumber = rowContext.displayRoundNumber ?? round.orderNumber;
  const displayRoundLabel = rowContext.displayRoundLabel ?? engine.getRoundLabel();
  const roleHtml = rowContext.roleHtml ?? '';
  const isPitcher = rowContext.isPitcher ?? false;
  const hasMatchup = !!rowContext.matchup;

  row.innerHTML = `
    <div class="round-info">
      <div class="round-label"><b>${escapeHTML(displayRoundLabel)} ${displayRoundNumber}:</b> ${escapeHTML(round.machineName)}</div>
      ${roleHtml}
      ${engine.getRowSummaryHtml(round, formatNumber)}
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
      // In a baseball matchup, there are two opponent containers (one for pitcher, one for batter)
      // but only one is actually the opponent for the current player in this specific round.
      // We need to find the one that corresponds to the opposite role.
      const isPitcher = rowContext.isPitcher ?? false;
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
