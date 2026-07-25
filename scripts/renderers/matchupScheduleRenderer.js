import { escapeHTML } from '@scripts/utils.js';

/**
 * Renders the head-to-head matchup schedule for a given event.
 * Handles both regular season and playoff series layouts.
 * @module renderers/matchupScheduleRenderer
 */

/**
 * Renders the matchup schedule list for a head-to-head event.
 * For playoff events, groups matchups by series and shows game-by-game results.
 * For regular season events, shows a flat list of matchups with status badges.
 *
 * @param {HTMLElement} matchupsList The container element for the matchup list items.
 * @param {Object} event The event object (with .matchups and .eventName).
 * @param {Object} options
 * @param {Function} options.onPlayMatchup Callback with (matchupId, eventId) when a Play/View button is clicked.
 */
export function renderMatchupSchedule(matchupsList, event, { onPlayMatchup }) {
  const matchups = event?.matchups || [];

  if (matchups.length === 0) {
    matchupsList.innerHTML = '<li class="list-item-row" style="padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">No matchups scheduled for this week.</li>';
    return;
  }

  const isPlayoffs = event?.eventName && event.eventName.startsWith('Playoffs:');

  if (isPlayoffs) {
    _renderPlayoffSchedule(matchupsList, matchups, event, onPlayMatchup);
  } else {
    _renderRegularSchedule(matchupsList, matchups, onPlayMatchup, event);
  }

  // Bind play/view buttons
  matchupsList.querySelectorAll('.play-matchup-btn').forEach(btn => {
    btn.onclick = () => {
      if (onPlayMatchup) onPlayMatchup(Number(btn.dataset.matchupId), Number(btn.dataset.eventId));
    };
  });
}

/**
 * Renders the playoff series schedule with grouped games.
 * @private
 */
function _renderPlayoffSchedule(matchupsList, matchups, event, onPlayMatchup) {
  const seriesMap = {};
  matchups.forEach(m => {
    const sId = m.seriesId || 1;
    seriesMap[sId] = seriesMap[sId] || [];
    seriesMap[sId].push(m);
  });
  
  matchupsList.innerHTML = Object.entries(seriesMap).map(([sId, games]) => {
    games.sort((a, b) => a.gameNumber - b.gameNumber);
    const firstGame = games[0];
    const homeName = escapeHTML(firstGame.player1Name);
    const awayName = escapeHTML(firstGame.player2Name);
    
    let homeWins = 0;
    let awayWins = 0;
    games.forEach(g => {
      if (g.status === 'completed') {
        if (g.winnerId === g.player1Id) homeWins++;
        else if (g.winnerId === g.player2Id) awayWins++;
      }
    });
    
    const gamesHtml = games.map(g => {
      const winnerHome = g.status === 'completed' && g.winnerId === g.player1Id;
      const winnerAway = g.status === 'completed' && g.winnerId === g.player2Id;
      
      return `
        <div class="playoff-game-row" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; margin-top: 6px; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #2196f3;">
          <span class="meta-strong" style="font-size: 0.9em;">Game ${g.gameNumber}</span>
          <div class="game-score" style="font-size: 0.9em;">
            ${g.status === 'completed' ? `
              <span class="${winnerAway ? 'font-bold' : ''}">${g.player2Score}</span> - <span class="${winnerHome ? 'font-bold' : ''}">${g.player1Score}</span>
            ` : `
              <span class="badge pending" style="background: #fff3e0; color: #e65100; padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">Pending</span>
            `}
          </div>
          <div class="game-actions" style="display: flex; gap: 6px;">
            <button class="play-matchup-btn primary btn-row btn-small" data-matchup-id="${g.id}" data-event-id="${g.eventId}" style="padding: 2px 8px; font-size: 0.85em;">
              ${g.status === 'completed' ? 'View/Edit' : 'Play'}
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <li class="list-item-row playoff-series-card" style="display: block; padding: 15px; margin-bottom: 12px; border: 1px solid #2196f3; border-radius: 6px; background: #fff;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #ddd; padding-bottom: 8px; margin-bottom: 8px;">
          <span class="meta-strong" style="color: #1976d2; font-size: 1.05em;">Series ${sId} - ${escapeHTML(event.eventName.replace('Playoffs: ', ''))}</span>
          <span class="badge completed font-bold" style="background: #e3f2fd; color: #0d47a1; padding: 4px 8px; border-radius: 4px; font-size: 0.9em;">
            ${awayName} (${awayWins}) vs ${homeName} (${homeWins})
          </span>
        </div>
        <div class="series-games-list">
          ${gamesHtml}
        </div>
      </li>
    `;
  }).join('');
}

/**
 * Renders the regular season matchup schedule.
 * @private
 */
function _renderRegularSchedule(matchupsList, matchups, onPlayMatchup, event = null) {
  // Group matchups by location, then by (player1Id, player2Id) pair.
  const locationGroups = {};
  const locationOrder = [];

  matchups.forEach(m => {
    const locName = m.locationName || m.location_name || event?.locationName || event?.location_name || 'Location Not Specified';
    if (!locationGroups[locName]) {
      locationGroups[locName] = { grouped: {}, groupedOrder: [] };
      locationOrder.push(locName);
    }
    const locGroup = locationGroups[locName];
    const key = `${m.player1Id ?? 'null'}-${m.player2Id ?? 'null'}`;
    if (!locGroup.grouped[key]) {
      locGroup.grouped[key] = [];
      locGroup.groupedOrder.push(key);
    }
    locGroup.grouped[key].push(m);
  });

  matchupsList.innerHTML = locationOrder.map(locName => {
    const { grouped, groupedOrder } = locationGroups[locName];
    const matchupsHtml = groupedOrder.map(key => {
      const pair = grouped[key];
      const m = pair[0]; // Use first matchup for names, id, status
      const isBye = m.player2Id === null;

      // Aggregate scores across all half-innings in the group
      let totalP1Score = 0;
      let totalP2Score = 0;
      let allCompleted = true;
      let anyCompleted = false;
      pair.forEach(g => {
        totalP1Score += Number(g.player1Score ?? 0);
        totalP2Score += Number(g.player2Score ?? 0);
        if (g.status === 'completed') anyCompleted = true;
        else allCompleted = false;
      });

      const winnerHome = allCompleted && anyCompleted && totalP1Score > totalP2Score;
      const winnerAway = allCompleted && anyCompleted && totalP2Score > totalP1Score;
      const isCompleted = allCompleted && anyCompleted;

      return `
        <li class="list-item-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff;">
          <div class="matchup-players" style="font-weight: 500;">
            <span class="${winnerAway ? 'font-bold' : ''}" style="${winnerAway ? 'color: #2e7d32;' : ''}">${escapeHTML(m.player2Name || 'BYE')}</span> 
            <span class="meta-muted" style="margin: 0 8px;">(Away) vs</span> 
            <span class="${winnerHome ? 'font-bold' : ''}" style="${winnerHome ? 'color: #2e7d32;' : ''}">${escapeHTML(m.player1Name)}</span>
            <span class="meta-muted" style="margin-left: 8px;">(Home)</span>
          </div>
          <div class="matchup-score-badge" style="display: flex; align-items: center; gap: 12px;">
            ${isCompleted ? `
              <span class="badge completed font-bold" style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px;">
                ${totalP2Score} - ${totalP1Score}
              </span>
            ` : `
              <span class="badge pending" style="background: #fff3e0; color: #e65100; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">
                Pending
              </span>
            `}
            
            <div class="matchup-actions" style="display: flex; gap: 8px;">
              ${!isBye ? `
                <button class="play-matchup-btn primary btn-row btn-small" data-matchup-id="${m.id}" data-event-id="${m.eventId}">
                  ${isCompleted ? 'View/Edit' : 'Play'}
                </button>
              ` : ''}
            </div>
          </div>
        </li>
      `;
    }).join('');

    return `
      <div class="location-matchup-group mb-15">
        <h4 style="margin: 0 0 8px 0; color: #212121; font-size: 1.05em; font-weight: 600; border-bottom: 2px solid #e0e0e0; padding-bottom: 4px;">
          ${escapeHTML(locName)}
        </h4>
        <ul class="matchup-group-list" style="list-style: none; padding: 0; margin: 0;">
          ${matchupsHtml}
        </ul>
      </div>
    `;
  }).join('');
}
