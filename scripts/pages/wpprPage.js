/**
 * WPPR Points Estimator Page Controller
 * Handles user interactions, form inputs, dynamic table rendering,
 * completed event import, and calling the WPPR calculation service.
 * 
 * @module pages/wpprPage
 */

import { calculateFullDistribution, calculatePinGolfPGM } from '@services/wpprCalculator.js';
import { PB_API } from '@services/api.js';
import { getScoringEngine } from '@core/engine.js';
import { ScoringFormats } from '@services/scoringFormat.js';
import { normalizeTargets, normalizeScores, groupScoresByPlayer } from '@services/normalizer.js';
import { printWpprResults } from '@ui/printing.js';
import { showConfirm, showAlert } from '@ui/dialogs.js';
import { applyPreferredTheme } from '@ui/branding.js';

let playerState = [];
let loadedEventsMap = new Map();
let lastImportedEventStats = null;
let lastCalculationResult = null;
let allDbPlayersCache = [];

/**
 * Fetches all players from the database and returns a map keyed by lowercase player name.
 */
async function fetchDbPlayersMap() {
  try {
    allDbPlayersCache = await PB_API.players.getAll();
    const mapByName = new Map();
    allDbPlayersCache.forEach(p => {
      if (p.playerName || p.name || p.player_name) {
        const nameKey = String(p.playerName || p.name || p.player_name).trim().toLowerCase();
        mapByName.set(nameKey, p);
      }
    });
    return mapByName;
  } catch (err) {
    console.warn('[WPPR] Failed to fetch database players:', err);
    return new Map();
  }
}

/**
 * Persists updated IFPA ID, rating, or ranking for players back to the database.
 */
async function syncPlayerRatingsToDatabase() {
  if (!playerState || playerState.length === 0) return;

  const dbMap = await fetchDbPlayersMap();

  playerState.forEach(async (player) => {
    const nameKey = (player.name || '').trim().toLowerCase();
    const dbPlayer = (player.dbId ? allDbPlayersCache.find(p => p.id === player.dbId) : null) || dbMap.get(nameKey);

    if (dbPlayer && dbPlayer.id) {
      const newIfpa = player.ifpaId || null;
      const newRating = player.rating > 0 ? player.rating : null;
      const newRanking = player.ranking > 0 ? player.ranking : null;

      const currentIfpa = dbPlayer.ifpaId || null;
      const currentRating = dbPlayer.ifpaRating !== undefined && dbPlayer.ifpaRating !== null ? parseFloat(dbPlayer.ifpaRating) : null;
      const currentRanking = dbPlayer.ifpaRanking !== undefined && dbPlayer.ifpaRanking !== null ? parseInt(dbPlayer.ifpaRanking, 10) : null;

      // Check if values have changed
      const hasChanged = (newIfpa !== currentIfpa) ||
        (newRating !== currentRating) ||
        (newRanking !== currentRanking);

      if (hasChanged && (newIfpa || newRating || newRanking)) {
        try {
          await PB_API.players.update(dbPlayer.id, {
            ifpaId: newIfpa,
            ifpaRating: newRating,
            ifpaRanking: newRanking,
          });
          if (window.PB_DEBUG_MODE) {
            console.log(`[WPPR] Updated player ${dbPlayer.playerName} in DB with rating=${newRating}, ranking=${newRanking}, ifpaId=${newIfpa}`);
          }
        } catch (err) {
          console.warn(`[WPPR] Could not update database for player ${player.name}:`, err);
        }
      }
    }
  });
}

/**
 * Renders the imported event performance & PGM breakdown table.
 */
function renderEventStatsTable() {
  const card = document.getElementById('wppr-event-stats-card');
  const table = card?.querySelector('table');
  const tbody = document.getElementById('wppr-event-stats-tbody');
  if (!card || !tbody || !table) return;

  if (!lastImportedEventStats || !lastImportedEventStats.players || lastImportedEventStats.players.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');

  const { format, numHoles, players } = lastImportedEventStats;
  const isGolf = format === ScoringFormats.GOLF;

  // Render table header dynamically according to format (Pin-Golf vs Pin-Bowling)
  const existingThead = table.querySelector('thead');
  if (existingThead) {
    existingThead.innerHTML = `
      <tr>
        <th style="width: 50px;" class="text-center">Pos.</th>
        <th>Player Name</th>
        <th class="text-right">${isGolf ? 'Total Score (Strokes)' : 'Total Score'}</th>
        <th class="text-center">${isGolf ? 'Strokes Played' : 'Pins Left'}</th>
        <th class="text-center">${isGolf ? 'Avg / Hole' : 'Avg / Frame'}</th>
        <th class="text-center">${isGolf ? '1' : 'X'}</th>
        <th class="text-center">${isGolf ? '2' : '9/'}</th>
        <th class="text-center">${isGolf ? '3' : 'Spares'}</th>
        <th class="text-center">Opens</th>
      </tr>
    `;
  }

  tbody.innerHTML = '';

  players.forEach((p, idx) => {
    const tr = document.createElement('tr');
    const avg = numHoles > 0 ? (p.ballsPlayed / numHoles).toFixed(2) : '0.00';
    tr.innerHTML = `
      <td class="text-center font-bold">${idx + 1}</td>
      <td><strong>${escapeAttr(p.name)}</strong></td>
      <td class="text-right font-bold">${p.total}</td>
      <td class="text-center">${p.ballsPlayed}</td>
      <td class="text-center">${avg}</td>
      <td class="text-center">${p.ball1Count ?? p.strikes ?? 0}</td>
      <td class="text-center">${p.ball2Count ?? p.spares ?? 0}</td>
      <td class="text-center">${p.ball3Count ?? 0}</td>
      <td class="text-center">${p.opens ?? 0}</td>
    `;
    tbody.appendChild(tr);
  });
}



let isUserTDOrAdmin = false;

/**
 * Saves a single player row's updated IFPA details to the database.
 */
async function savePlayerRowToDatabase(idx) {
  if (!isUserTDOrAdmin) {
    await showAlert('Only Tournament Directors and Admins can save changes to player ratings and rankings.', 'Permission Denied');
    return;
  }

  const player = playerState[idx];
  if (!player) return;

  const dbMap = await fetchDbPlayersMap();
  const nameKey = (player.name || '').trim().toLowerCase();
  const dbPlayer = (player.dbId ? allDbPlayersCache.find(p => p.id === player.dbId) : null) || dbMap.get(nameKey);

  if (dbPlayer && dbPlayer.id) {
    const newIfpa = player.ifpaId || null;
    const newRating = player.rating > 0 ? player.rating : null;
    const newRanking = player.ranking > 0 ? player.ranking : null;

    try {
      await PB_API.players.update(dbPlayer.id, {
        ifpaId: newIfpa,
        ifpaRating: newRating,
        ifpaRanking: newRanking,
      });
      dbPlayer.ifpaId = newIfpa;
      dbPlayer.ifpaRating = newRating;
      dbPlayer.ifpaRanking = newRanking;
    } catch (err) {
      console.warn(`[WPPR] Failed to update player ${player.name} in DB:`, err);
      showAlert(`Failed to update IFPA details for ${player.name}.`, 'Database Error');
    }
  }
}

/**
 * Renders the player input rows table with read-only names and editable IFPA ID, Rank, & Rating fields.
 */
function renderInputRows() {
  const tbody = document.getElementById('wppr-players-tbody');
  const table = document.getElementById('wppr-players-input-table');
  const countBadge = document.getElementById('wppr-player-count-badge');
  if (!tbody) return;

  const saveTh = table?.querySelector('th.col-save');
  if (saveTh) {
    saveTh.classList.toggle('hidden', !isUserTDOrAdmin);
  }

  tbody.innerHTML = '';
  if (countBadge) countBadge.textContent = playerState.length;

  if (playerState.length === 0) {
    const colspan = isUserTDOrAdmin ? 6 : 5;
    tbody.innerHTML = `
      <tr>
        <td colspan="${colspan}" class="text-center text-muted pad-15">
          No event selected yet. Select a completed Pin-Golf or Pin-Bowling event above to load players and calculate WPPR points.
        </td>
      </tr>
    `;
    return;
  }

  playerState.forEach((player, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.index = idx;
    if (player.dbId) tr.dataset.dbId = player.dbId;

    const readonlyAttr = isUserTDOrAdmin ? '' : 'readonly disabled';

    tr.innerHTML = `
      <td class="text-center font-bold">${idx + 1}</td>
      <td>
        <strong>${escapeAttr(player.name)}</strong>
      </td>
      <td>
        <input type="text" class="form-control player-input-ifpaid" data-field="ifpaId" value="${escapeAttr(player.ifpaId || '')}" placeholder="e.g. 88590" ${readonlyAttr} />
      </td>
      <td>
        <input type="number" step="1" min="1" class="form-control player-input-ranking" data-field="ranking" value="${player.ranking || ''}" placeholder="Rank" ${readonlyAttr} />
      </td>
      <td>
        <input type="number" step="0.01" min="0" class="form-control player-input-rating" data-field="rating" value="${player.rating || ''}" placeholder="Rating" ${readonlyAttr} />
      </td>
      ${isUserTDOrAdmin ? `
      <td class="text-center">
        <button type="button" class="btn-save-row btn-standard secondary btn-small flex-align-center justify-center" title="Save IFPA details to database and recalculate" disabled>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
        </button>
      </td>
      ` : ''}
    `;

    if (isUserTDOrAdmin) {
      const saveBtn = tr.querySelector('.btn-save-row');
      const inputs = tr.querySelectorAll('input');

      inputs.forEach(input => {
        input.addEventListener('input', () => {
          if (saveBtn) {
            saveBtn.disabled = false;
          }
        });
      });

      saveBtn?.addEventListener('click', async () => {
        saveBtn.disabled = true;

        syncStateFromInputs();
        await savePlayerRowToDatabase(idx);

        runCalculation();
      });
    }

    tbody.appendChild(tr);
  });
}

/**
 * Utility helper to safely escape strings for HTML attributes.
 */
function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Synchronizes inputs back into the playerState array.
 */
function syncStateFromInputs() {
  const tbody = document.getElementById('wppr-players-tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr[data-index]');
  const updated = [];

  rows.forEach((tr, idx) => {
    const ifpaInput = tr.querySelector('[data-field="ifpaId"]');
    const ratingInput = tr.querySelector('[data-field="rating"]');
    const rankingInput = tr.querySelector('[data-field="ranking"]');

    updated.push({
      ...playerState[idx],
      dbId: tr.dataset.dbId ? parseInt(tr.dataset.dbId, 10) : (playerState[idx]?.dbId || null),
      name: playerState[idx]?.name || 'Player',
      ifpaId: ifpaInput?.value.trim() || '',
      rating: parseFloat(ratingInput?.value) || 0,
      ranking: parseInt(rankingInput?.value, 10) || 0,
    });
  });

  playerState = updated;
}

/**
 * Loads completed Pin-Golf and Pin-Bowling events for the event selector dropdown.
 */
async function loadCompletedEvents() {
  const select = document.getElementById('wppr-event-select');
  if (!select) return;

  try {
    const leagues = await PB_API.leagues.getAll();
    select.innerHTML = '<option value="">-- Select Completed Event --</option>';
    loadedEventsMap.clear();

    const allowedFormats = [ScoringFormats.GOLF, ScoringFormats.BOWLING];

    leagues.forEach(league => {
      const lFormat = ScoringFormats.resolve(league.scoringFormat);
      // Filter strictly for standard Strokes-based Pin-Golf or Pin-Bowling format leagues
      if (allowedFormats.includes(lFormat)) {
        const events = league.events || [];
        events.forEach(ev => {
          // Include all events (or completed ones)
          const key = `${league.id}_${ev.id}`;
          loadedEventsMap.set(key, { league, event: ev });

          const option = document.createElement('option');
          option.value = key;
          const statusBadge = ev.status === 'completed' ? ' [Completed]' : '';
          option.textContent = `${league.name || 'League'} - ${ev.eventName || 'Event'}${statusBadge}`;
          select.appendChild(option);
        });
      }
    });
  } catch (err) {
    console.error('[WPPR] Failed to load leagues/events:', err);
  }
}

/**
 * Handles selection of a completed event, importing its standings & players,
 * and auto-calculating TGP % via Pin-Golf PGM rules.
 */
async function handleEventImport(eventKey) {
  if (!eventKey || !loadedEventsMap.has(eventKey)) return;

  const { league, event } = loadedEventsMap.get(eventKey);
  const eventId = Number(event.id);

  try {
    const [rawScores, rawMachines] = await Promise.all([
      PB_API.scores.get(null, eventId),
      PB_API.machines.getTargets(eventId),
    ]);

    const format = ScoringFormats.resolve(event.scoringFormat || league.scoringFormat);
    applyPreferredTheme(format);
    const Engine = getScoringEngine(format);

    const allEventScores = normalizeScores(rawScores);
    const machines = normalizeTargets(rawMachines);
    const scoresByPlayer = groupScoresByPlayer(allEventScores);
    const leaguePlayers = league.players || [];

    // Calculate score totals and balls/strokes played for each player
    const playerStandings = [];
    let totalBallsPlayedSum = 0;

    leaguePlayers.forEach(player => {
      const pId = Number(player.id);
      const scores = scoresByPlayer[pId] || [];

      // Check if player actually participated and entered scores in this event
      const hasScores = scores.length > 0 && scores.some(s => Number(s.ball1) > 0 || Number(s.ball2) > 0 || Number(s.ball3) > 0 || s.isManual);
      if (!hasScores) return; // Exclude players who didn't play this week

      const scoreMap = Engine.buildPlayerScoreMap(pId, scores, scoresByPlayer);
      const { turnResults, total } = Engine.calculateTurnResults(machines, scoreMap);

      // Count actual balls/strokes played per frame for PGM calculation
      let playerBalls = 0;
      let ball1Count = 0;
      let ball2Count = 0;
      let ball3Count = 0;
      let opens = 0;

      turnResults.forEach(turn => {
        let strokes = 3;

        if (format === ScoringFormats.GOLF) {
          strokes = typeof turn.score === 'number' && turn.score > 0 ? turn.score : 4;
          if (strokes === 1) ball1Count++;
          else if (strokes === 2) ball2Count++;
          else if (strokes === 3) ball3Count++;
          else opens++;
        } else {
          // Pin-Bowling Format: Map marks and open frame pin counts to golf-equivalent difficulty strokes
          if (turn.type === 'strike') {
            strokes = 1;
            ball1Count++;
          } else if (turn.type === 'spare2') {
            strokes = 2;
            ball2Count++;
          } else if (turn.type === 'spare3') {
            strokes = 3;
            ball3Count++;
          } else {
            // Open frame (target missed by ball 3):
            // 9 pins -> 4, 8 pins -> 5, 7 pins -> 6, 6 pins -> 7, 5 pins -> 8, 4 pins -> 9, <=3 pins -> 10
            const pins = (typeof turn.first === 'number' && typeof turn.second === 'number')
              ? Math.min(9, turn.first + turn.second)
              : (typeof turn.score === 'number' ? Math.min(9, turn.score) : 0);
            strokes = Math.min(10, Math.max(4, 13 - pins));
            opens++;
          }
        }
        playerBalls += strokes;
      });
      totalBallsPlayedSum += playerBalls;

      playerStandings.push({
        id: pId,
        name: player.playerName || player.name || player.player_name || 'Player',
        ifpaId: player.ifpa_id || player.ifpaId || '',
        total,
        ballsPlayed: playerBalls,
        ball1Count,
        ball2Count,
        ball3Count,
        opens,
      });
    });

    if (playerStandings.length === 0) {
      await showAlert('No scores found for the selected event.', 'Import Event');
      return;
    }

    // Sort players using Engine.compareScores (handles High-Score-First for Bowling and Low-Score-First for Golf)
    playerStandings.sort((a, b) => Engine.compareScores(a.total, b.total));

    // Calculate PGM and TGP %
    const numHoles = machines.length || 10;
    const avgBallsPlayed = totalBallsPlayedSum / playerStandings.length;

    const pgmResult = calculatePinGolfPGM(numHoles, avgBallsPlayed);

    // Save for rendering the event stats table
    lastImportedEventStats = {
      format,
      numHoles,
      players: playerStandings,
    };

    // Update TGP input field with auto-calculated TGP %
    const tgpInput = document.getElementById('wppr-tgp-input');
    if (tgpInput) {
      tgpInput.value = pgmResult.tgpPercent;
    }

    // Show PGM explanation banner
    const pgmBanner = document.getElementById('wppr-pgm-banner');
    const pgmLabel = document.getElementById('wppr-pgm-label');
    const pgmText = document.getElementById('wppr-pgm-text');
    if (pgmBanner && pgmText) {
      const isGolf = format === ScoringFormats.GOLF;
      const unitLabel = isGolf ? 'Holes' : 'Frames';
      const metricLabel = isGolf ? 'Avg Strokes' : 'Avg Pins Left';
      const perUnitLabel = isGolf ? 'Course Avg' : 'Frame Avg';
      const formatLabel = isGolf ? 'Pin-Golf' : 'Pin-Bowling';
      if (pgmLabel) pgmLabel.textContent = `${formatLabel} PGM Calculation:`;
      pgmText.textContent = `${numHoles} ${unitLabel} Played | ${metricLabel}: ${pgmResult.avgScore} | ${perUnitLabel}: ${pgmResult.courseAverage} | PGM: ${pgmResult.pgm} => Auto-set TGP to ${pgmResult.tgpPercent}%`;
      pgmBanner.classList.remove('hidden');
    }

    // Fetch database players map to pull rating & ranking from Users/Players DB table
    const dbMap = await fetchDbPlayersMap();

    // Map standings to playerState with database rating & ranking
    playerState = playerStandings.map(p => {
      const nameKey = p.name.trim().toLowerCase();
      const dbPlayer = (p.id ? allDbPlayersCache.find(dp => dp.id === p.id) : null) || dbMap.get(nameKey);

      return {
        dbId: dbPlayer?.id || p.id || null,
        name: p.name,
        ifpaId: dbPlayer?.ifpaId || p.ifpaId || '',
        rating: dbPlayer?.ifpaRating ? parseFloat(dbPlayer.ifpaRating) : 0,
        ranking: dbPlayer?.ifpaRanking ? parseInt(dbPlayer.ifpaRanking, 10) : 0,
        total: p.total,
      };
    });

    renderInputRows();
    runCalculation();
  } catch (err) {
    console.error('[WPPR] Error importing event:', err);
    await showAlert('Failed to load standings for selected event.', 'Import Error');
  }
}

/**
 * Executes the WPPR calculations and updates the results DOM.
 */
function runCalculation() {
  syncStateFromInputs();

  if (playerState.length === 0) {
    return;
  }

  const tgpInput = document.getElementById('wppr-tgp-input');
  const boosterSelect = document.getElementById('wppr-booster-select');

  const tgpPercent = parseFloat(tgpInput?.value) || 100;
  const eventBooster = parseFloat(boosterSelect?.value) || 1.0;

  const result = calculateFullDistribution({
    players: playerState,
    tgpPercent,
    eventBooster,
  });

  renderResults(result);
}

/**
 * Displays the calculation results in the UI.
 * 
 * @param {Object} result - WPPR calculation result object.
 */
function renderResults(result) {
  const section = document.getElementById('wppr-results-section');
  if (!section) return;

  lastCalculationResult = result;
  section.classList.remove('hidden');

  // 1. Render Summary Stats
  document.getElementById('wppr-val-1st').textContent = result.wpprValue.firstPlaceValue.toFixed(2);
  document.getElementById('wppr-val-base').textContent = result.wpprValue.baseValue.toFixed(2);
  document.getElementById('wppr-val-rating-tva').textContent = result.wpprValue.ratingTVA.toFixed(2);
  document.getElementById('wppr-val-ranking-tva').textContent = result.wpprValue.rankingTVA.toFixed(2);
  document.getElementById('wppr-val-tgp').textContent = `${result.tgpPercent}%`;
  document.getElementById('wppr-val-booster').textContent = `${Math.round(result.eventBooster * 100)}%`;

  // Render Event Performance & PGM Breakdown Table if event is imported
  renderEventStatsTable();

  // 2. Render WPPR Distribution Table
  const distTbody = document.getElementById('wppr-distribution-tbody');
  if (distTbody) {
    distTbody.innerHTML = '';
    result.distribution.forEach((item) => {
      const player = playerState[item.position - 1];
      const playerName = player ? player.name : `Player ${item.position}`;
      const isWinner = item.position === 1;

      const tr = document.createElement('tr');
      if (isWinner) tr.classList.add('winner-row');
      tr.innerHTML = `
        <td class="text-center font-bold">${item.isTie ? `T-${item.position}` : item.position}</td>
        <td><strong>${escapeAttr(playerName)}</strong></td>
        <td>${item.linear.toFixed(2)}</td>
        <td>${item.dynamic.toFixed(2)}</td>
        <td class="font-bold highlight-cell">${item.total.toFixed(2)}</td>
      `;
      distTbody.appendChild(tr);
    });
  }

  // 3. Render Player Contributions Table
  const contribTbody = document.getElementById('wppr-contributions-tbody');
  if (contribTbody) {
    contribTbody.innerHTML = '';
    result.contributions.forEach((player) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeAttr(player.name)}</strong></td>
        <td>${player.ifpaId ? `#${player.ifpaId}` : '-'}</td>
        <td>${player.ranking > 0 ? `#${player.ranking}` : '-'}</td>
        <td>${player.rating > 0 ? player.rating.toFixed(2) : '-'}</td>
        <td>${player.baseContribution.toFixed(2)}</td>
        <td>${player.ratingContribution.toFixed(2)}</td>
        <td>${player.rankingContribution.toFixed(2)}</td>
        <td class="font-bold">${player.totalContribution.toFixed(2)}</td>
      `;
      contribTbody.appendChild(tr);
    });
  }

  // Scroll smoothly to results
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Initializes the WPPR Estimator page.
 */
export async function initWpprPage() {
  const container = document.getElementById('wppr-calculator');
  if (!container) return;

  const currentUser = await PB_API.auth.me().catch(() => null);
  isUserTDOrAdmin = !!(currentUser && (currentUser.role === 'admin' || currentUser.role === 'td'));

  playerState = [];
  lastImportedEventStats = null;
  lastCalculationResult = null;

  await fetchDbPlayersMap();
  renderInputRows();
  await loadCompletedEvents();

  // Event Select Change Listener
  document.getElementById('wppr-event-select')?.addEventListener('change', (e) => {
    const eventKey = e.target.value;
    if (eventKey) {
      handleEventImport(eventKey);
    }
  });

  // Auto-recalculate when TGP % or Booster inputs change
  document.getElementById('wppr-tgp-input')?.addEventListener('input', () => {
    if (playerState.length > 0) runCalculation();
  });
  document.getElementById('wppr-booster-select')?.addEventListener('change', () => {
    if (playerState.length > 0) runCalculation();
  });

  // Print Report Button
  document.getElementById('wppr-print-btn')?.addEventListener('click', async () => {
    if (!lastCalculationResult) {
      await showAlert('Please select an event to calculate WPPR Points first before printing.', 'Print Report');
      return;
    }

    const eventSelect = document.getElementById('wppr-event-select');
    const selectedOption = eventSelect && eventSelect.selectedIndex >= 0 ? eventSelect.options[eventSelect.selectedIndex] : null;
    const eventTitle = selectedOption && selectedOption.value ? selectedOption.textContent.trim() : 'WPPR Tournament Estimation';

    const pgmBanner = document.getElementById('wppr-pgm-banner');
    const pgmText = pgmBanner && !pgmBanner.classList.contains('hidden')
      ? document.getElementById('wppr-pgm-text')?.textContent || ''
      : '';

    printWpprResults({
      eventTitle,
      summary: {
        firstPlaceWPPR: lastCalculationResult.wpprValue.firstPlaceValue.toFixed(2),
        baseValue: lastCalculationResult.wpprValue.baseValue.toFixed(2),
        ratingTVA: lastCalculationResult.wpprValue.ratingTVA.toFixed(2),
        rankingTVA: lastCalculationResult.wpprValue.rankingTVA.toFixed(2),
        tgp: `${lastCalculationResult.tgpPercent}%`,
        booster: `${Math.round(lastCalculationResult.eventBooster * 100)}%`,
      },
      pgmBannerText: pgmText,
      eventStats: lastImportedEventStats,
      distribution: lastCalculationResult.distribution,
      contributions: lastCalculationResult.contributions,
      playerState,
    });
  });

  // Auto-calculate if data is present
  if (playerState.length > 0) {
    runCalculation();
  }
}
