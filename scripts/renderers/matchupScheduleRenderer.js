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
 * @param {boolean} [options.isAdmin=false] Whether the current user is admin/TD.
 * @param {Function} [options.onSetupMatchup] Callback with (matchupId, eventId) when Setup is clicked (admin only).
 */
export function renderMatchupSchedule(matchupsList, event, { onPlayMatchup, isAdmin = false, onSetupMatchup }) {
  const matchups = event?.matchups || [];

  if (matchups.length === 0) {
    matchupsList.innerHTML = '<li class="list-item-row" style="padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 4px;">No matchups scheduled for this week.</li>';
    return;
  }

  const isPlayoffs = event?.eventName && event.eventName.startsWith('Playoffs:');

  if (isPlayoffs) {
    _renderPlayoffSchedule(matchupsList, matchups, event, onPlayMatchup, isAdmin, onSetupMatchup);
  } else {
    _renderRegularSchedule(matchupsList, matchups, onPlayMatchup, isAdmin, onSetupMatchup, event);
  }

  // Bind play/view buttons (always navigates to scores)
  matchupsList.querySelectorAll('.play-matchup-btn').forEach(btn => {
    btn.onclick = () => {
      if (onPlayMatchup) onPlayMatchup(Number(btn.dataset.matchupId), Number(btn.dataset.eventId));
    };
  });

  // Bind setup buttons (admin only — opens machine/difficulty editor)
  matchupsList.querySelectorAll('.setup-matchup-btn').forEach(btn => {
    btn.onclick = () => {
      if (onSetupMatchup) onSetupMatchup(Number(btn.dataset.matchupId), Number(btn.dataset.eventId));
    };
  });
}

/**
 * Renders the playoff series schedule with grouped games.
 * @private
 */
function _renderPlayoffSchedule(matchupsList, matchups, event, onPlayMatchup, isAdmin, onSetupMatchup) {
  const isTeamMode = event?.isTeam || (matchups.length > 0 && matchups[0].team1Id !== null && matchups[0].team1Id !== undefined);

  const seriesMap = {};
  matchups.forEach(m => {
    const sId = m.seriesId || 1;
    seriesMap[sId] = seriesMap[sId] || [];
    seriesMap[sId].push(m);
  });
  
  matchupsList.innerHTML = Object.entries(seriesMap).map(([sId, games]) => {
    games.sort((a, b) => a.gameNumber - b.gameNumber);
    const firstGame = games[0];
    const p1Name = isTeamMode ? firstGame.team1Name : firstGame.player1Name;
    const p2Name = isTeamMode ? firstGame.team2Name : firstGame.player2Name;
    const homeName = escapeHTML(p1Name || 'Home');
    const awayName = escapeHTML(p2Name || 'Away');
    
    let homeWins = 0;
    let awayWins = 0;
    games.forEach(g => {
      const p1Id = isTeamMode ? g.team1Id : g.player1Id;
      const p2Id = isTeamMode ? g.team2Id : g.player2Id;
      if (g.status === 'completed') {
        const wid = g.winnerId ?? g.teamWinnerId;
        if (wid === p1Id) homeWins++;
        else if (wid === p2Id) awayWins++;
      }
    });
    
    const gamesHtml = games.map(g => {
      const p1Id = isTeamMode ? g.team1Id : g.player1Id;
      const p2Id = isTeamMode ? g.team2Id : g.player2Id;
      const p1Score = isTeamMode
        ? Number(g.team1Score ?? 0)
        : Number(g.player1Score ?? 0);
      const p2Score = isTeamMode
        ? Number(g.team2Score ?? 0)
        : Number(g.player2Score ?? 0);
      const wid = g.winnerId ?? g.teamWinnerId;
      const winnerHome = g.status === 'completed' && wid === p1Id;
      const winnerAway = g.status === 'completed' && wid === p2Id;
      
      return `
        <div class="playoff-game-row" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; margin-top: 6px; background: #f9f9f9; border-radius: 4px; border-left: 3px solid #2196f3;">
          <span class="meta-strong" style="font-size: 0.9em;">Game ${g.gameNumber}</span>
          <div class="game-score" style="font-size: 0.9em;">
            ${g.status === 'completed' ? `
              <span class="${winnerAway ? 'font-bold' : ''}">${p2Score}</span> - <span class="${winnerHome ? 'font-bold' : ''}">${p1Score}</span>
            ` : `
              <span class="badge pending" style="background: #fff3e0; color: #e65100; padding: 2px 6px; border-radius: 4px; font-size: 0.8em;">Pending</span>
            `}
          </div>
          <div class="game-actions" style="display: flex; gap: 6px;">
            <button class="play-matchup-btn primary btn-row btn-small" data-matchup-id="${g.id}" data-event-id="${g.eventId}" style="padding: 2px 8px; font-size: 0.85em;">
              ${g.status === 'completed' ? 'View/Edit' : 'Play'}
            </button>
            ${isAdmin && onSetupMatchup ? `
              <button class="setup-matchup-btn secondary btn-row btn-small" data-matchup-id="${g.id}" data-event-id="${g.eventId}" style="padding: 2px 8px; font-size: 0.85em;">Setup</button>
            ` : ''}
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
function _renderRegularSchedule(matchupsList, matchups, onPlayMatchup, isAdmin, onSetupMatchup, event = null) {
  const isTeamMode = event?.isTeam || (matchups.length > 0 && matchups[0].team1Id !== null && matchups[0].team1Id !== undefined);

  const locationGroups = {};
  const locationOrder = [];

  matchups.forEach(m => {
    const locName = m.locationName || m.location_name || event?.locationName || event?.location_name || 'Location Not Specified';
    if (!locationGroups[locName]) {
      locationGroups[locName] = { grouped: {}, groupedOrder: [] };
      locationOrder.push(locName);
    }
    const locGroup = locationGroups[locName];
    const p1Id = isTeamMode ? m.team1Id : m.player1Id;
    const p2Id = isTeamMode ? m.team2Id : m.player2Id;
    const key = `${p1Id ?? 'null'}-${p2Id ?? 'null'}`;
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
      const m = pair[0];
      const p1Id = isTeamMode ? m.team1Id : m.player1Id;
      const p2Id = isTeamMode ? m.team2Id : m.player2Id;
      const isBye = p2Id === null || p2Id === undefined;

      let totalP1Score = 0;
      let totalP2Score = 0;
      let allCompleted = true;
      let anyCompleted = false;
      pair.forEach(g => {
        const p1Score = isTeamMode
          ? Number(g.team1Score ?? 0)
          : Number(g.player1Score ?? 0);
        const p2Score = isTeamMode
          ? Number(g.team2Score ?? 0)
          : Number(g.player2Score ?? 0);
        totalP1Score += p1Score;
        totalP2Score += p2Score;
        if (g.status === 'completed') anyCompleted = true;
        else allCompleted = false;
      });

      const winnerHome = (allCompleted || anyCompleted) && totalP1Score > totalP2Score;
      const winnerAway = (allCompleted || anyCompleted) && totalP2Score > totalP1Score;
      const isCompleted = allCompleted && anyCompleted;
      const hasScores = (totalP1Score > 0 || totalP2Score > 0 || anyCompleted);

      const p1Name = isTeamMode ? (m.team1Name || m.team1_name) : (m.player1Name || m.player1_name);
      const p2Name = isTeamMode ? (m.team2Name || m.team2_name) : (m.player2Name || m.player2_name);

      const awayName = escapeHTML(p2Name || 'BYE');
      const homeName = escapeHTML(p1Name || 'Home');

      return `
        <li class="list-item-row" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff;">
          <div class="matchup-players" style="font-weight: 500;">
            <span class="${winnerAway ? 'font-bold' : ''}" style="${winnerAway ? 'color: #2e7d32;' : ''}">${awayName}</span> 
            <span class="meta-muted" style="margin: 0 8px;">(Away) vs</span> 
            <span class="${winnerHome ? 'font-bold' : ''}" style="${winnerHome ? 'color: #2e7d32;' : ''}">${homeName}</span>
            <span class="meta-muted" style="margin-left: 8px;">(Home)</span>
          </div>
          <div class="matchup-score-badge" style="display: flex; align-items: center; gap: 12px;">
            ${isCompleted ? `
              <span class="badge completed font-bold" style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px;">
                ${totalP2Score} - ${totalP1Score}
              </span>
            ` : hasScores ? `
              <span class="badge pending" style="background: #fff3e0; color: #e65100; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">
                In Progress (${totalP2Score} - ${totalP1Score})
              </span>
            ` : `
              <span class="badge pending" style="background: #f5f5f5; color: #757575; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">
                Pending
              </span>
            `}
            
            <div class="matchup-actions" style="display: flex; gap: 8px;">
              ${!isBye ? `
                <button class="play-matchup-btn primary btn-row btn-small" data-matchup-id="${m.id}" data-event-id="${m.eventId}">
                  ${isCompleted ? 'View/Edit' : 'Play'}
                </button>
              ` : ''}
              ${isAdmin && onSetupMatchup && !isBye ? `
                <button class="setup-matchup-btn secondary btn-row btn-small" data-matchup-id="${m.id}" data-event-id="${m.eventId}">Setup</button>
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
