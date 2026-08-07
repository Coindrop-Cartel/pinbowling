import { escapeHTML, formatNumber } from '../utils.js';

/**
 * Helper to compute standard competition rank numbers for sorted rows.
 * Tied entries share rank numbers, and subsequent ranks skip accordingly (e.g. 1, 2, 2, 4).
 */
export function computeRanks(items, isTie) {
  const ranks = [];
  let currentRank = 1;
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      if (isTie(items[i], items[i - 1])) {
        ranks.push(currentRank);
      } else {
        currentRank = i + 1;
        ranks.push(currentRank);
      }
    } else {
      ranks.push(1);
    }
  }
  return ranks;
}

/**
 * Standardized turn-cell HTML builder with TV-mode change detection pulse.
 */
function renderTurnCell(turn, scoreKey, lastScoreState, currentScoreState, isTvMode) {
  const isNew = lastScoreState.has(scoreKey) && lastScoreState.get(scoreKey) !== currentScoreState.get(scoreKey);
  const classes = [
    'standings-round',
    turn.played ? 'has-score' : 'no-score'
  ];
  if (isTvMode && isNew) {
    classes.push('score-just-updated');
  }

  const markHtml = turn.styleClass
    ? `<span class="${turn.styleClass}">${turn.displayMark}</span>`
    : turn.displayMark;

  return `
    <td class="${classes.join(' ')}">
      <div class="standings-mark">${markHtml}</div>
      <div class="standings-round-score">${turn.displayRoundTotal}</div>
    </td>
  `;
}

/**
 * Renders a standings/scoreboard table into header and body elements.
 */
export function renderStandingsTable({
  headerEl,
  bodyEl,
  isSummary,
  league,
  event,
  isTeamLeague,
  rows,
  columns,
  engine,
  supportsMatchups,
  head2headRecordsMap = {},
  allTeamsData = [],
  matchupScoreMap = {},
  teamResultMap = {},
  tvModeManager = null,
  lastScoreState = new Map(),
  currentScoreState = new Map()
}) {
  const playerLabel = isTeamLeague ? 'Team' : 'Player';
  const isTvMode = tvModeManager?.isTvMode === true || (tvModeManager && typeof tvModeManager.isTvModeActive === 'function' ? tvModeManager.isTvModeActive() : false);
  const finalMatchupScoreMap = (matchupScoreMap && Object.keys(matchupScoreMap).length > 0) ? matchupScoreMap : (event?.matchupScoreMap || {});
  const finalTeamResultMap = (teamResultMap && Object.keys(teamResultMap).length > 0) ? teamResultMap : (event?.teamResultMap || {});

  if (isSummary) {
    // --- SEASON SUMMARY RENDER PATHS ---
    if (supportsMatchups) {
      // 1. Head-to-Head / Baseball Season Summary
      if (headerEl) {
        headerEl.innerHTML = `
          <tr>
            <th class="text-center">#</th>
            <th class="text-left">${playerLabel}</th>
            ${columns.map((e, i) => `<th class="text-center">W${i + 1}</th>`).join('')}
            <th class="text-center">Record</th>
            <th class="text-center">Diff</th>
            <th class="text-center">Win %</th>
          </tr>
        `;
      }
      if (bodyEl) {
        const ranks = computeRanks(rows, (a, b) => engine.isTie(a, b));

        bodyEl.innerHTML = rows.map((res, idx) => {
          const entityName = isTeamLeague ? escapeHTML(res.entity.name) : escapeHTML(res.entity.playerName);
          const rec = res.record || { wins: 0, losses: 0, ties: 0, scoreDiff: 0, winRate: 0 };
          const diffVal = rec.scoreDiff ?? 0;
          const diffSign = diffVal > 0 ? '+' : '';
          const winPct = (rec.winRate ?? 0).toFixed(3);

          const eventsHtml = columns.map(e => {
            const eventData = res.eventTotals[e.id];
            if (!eventData || eventData.displayValue === undefined) return `<td class="standings-round">-</td>`;
            return `<td class="standings-round">${eventData.displayValue}</td>`;
          }).join('');

          return `
            <tr>
              <td class="text-center">${ranks[idx]}</td>
              <td class="player-name-cell">${entityName}</td>
              ${eventsHtml}
              <td class="text-center">${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}</td>
              <td class="text-center">${diffSign}${diffVal}</td>
              <td class="standings-total text-center">${winPct}</td>
            </tr>
          `;
        }).join('');
      }
    } else {
      // 2. Standard/Team Season Summary
      if (headerEl) {
        headerEl.innerHTML = `
          <tr>
            <th class="text-center">#</th>
            <th class="text-center">${playerLabel}</th>
            ${columns.map((e, i) => `<th class="text-center">${i + 1}</th>`).join('')}
            ${supportsMatchups ? '<th class="text-center">W-L</th>' : ''}
            <th class="text-center">Total</th>
          </tr>
        `;
      }
      if (bodyEl) {
        const isSeasonTie = (a, b) => (a.totalSeasonPoints ?? 0) === (b.totalSeasonPoints ?? 0);
        const ranks = computeRanks(rows, isSeasonTie);

        bodyEl.innerHTML = rows.map((res, idx) => {
          const entityName = isTeamLeague ? escapeHTML(res.entity.name) : escapeHTML(res.entity.playerName);

          const eventsHtml = columns.map(e => {
            const eventData = res.eventTotals[e.id];
            if (!eventData || eventData.displayValue === undefined) return `<td class="standings-round">-</td>`;
            const spanClass = eventData.isDropped ? ' class="dropped-score"' : '';
            return `<td class="standings-round"><span${spanClass}>${eventData.displayValue}</span></td>`;
          }).join('');

          const totalDisplay = league?.seasonScoring === 'weekly'
            ? `${res.totalSeasonPoints} pts`
            : engine.formatTotalScore(res.totalSeasonPoints);

          const recordCell = supportsMatchups && res.displayRecord
            ? `<td class="standings-record text-center">${res.displayRecord}</td>`
            : (supportsMatchups ? '<td class="standings-record text-center">-</td>' : '');

          return `
            <tr>
              <td class="text-center">${ranks[idx]}</td>
              <td class="player-name-cell">${entityName}</td>
              ${eventsHtml}
              ${recordCell}
              <td class="standings-total">${totalDisplay}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } else {
    // --- EVENT SCOREBOARD RENDER PATHS ---
    if (headerEl) {
      if (supportsMatchups) {
        headerEl.innerHTML = `
          <tr>
            <th class="text-center">#</th>
            <th class="text-center">${playerLabel}</th>
            <th class="text-center">Result</th>
            <th class="text-center">Score</th>
            <th class="text-center">W-L</th>
          </tr>
        `;
      } else {
        headerEl.innerHTML = `
          <tr>
            <th class="text-center">#</th>
            <th class="text-center">${playerLabel}</th>
            ${columns.map(m => `<th class="text-center">${m.orderNumber}</th>`).join('')}
            ${supportsMatchups ? '<th class="text-center">W-L</th>' : ''}
            <th class="text-center">Total</th>
          </tr>
        `;
      }
    }

    if (bodyEl) {
      if (isTeamLeague) {
        // 3. Team scoreboard
        const leagueTeamIds = new Set((league.teams || []).map(t => t.id));
        const teams = allTeamsData.filter(t => leagueTeamIds.has(t.id));

        const teamResults = teams.map(team => {
          const memberIds = new Set(team.members.map(m => m.id));
          const teamMembers = rows.filter(r => memberIds.has(r.player.id));
          const teamTotal = teamMembers.reduce((sum, m) => sum + m.total, 0);
          return { team, teamMembers, teamTotal };
        }).sort((a, b) => engine.compareScores(a.teamTotal, b.teamTotal));

        const isTeamTie = (a, b) => engine.compareScores(a.teamTotal, b.teamTotal) === 0;
        const ranks = computeRanks(teamResults, isTeamTie);

        if (supportsMatchups) {
          bodyEl.innerHTML = teamResults.map((tr, idx) => {
            const rec = head2headRecordsMap?.[tr.team.id];
            const recordStr = rec ? `${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}` : '-';
            const resultDisplay = finalTeamResultMap?.[tr.team.id] || '-';
            const scoreDisplay = finalMatchupScoreMap[tr.team.id] || '-';
          return `
              <tr class="team-header">
                <td class="text-center">${ranks[idx]}</td>
                <td class="player-name-cell">${escapeHTML(tr.team.name)}</td>
                <td class="text-center">${resultDisplay}</td>
                <td class="standings-total text-center">${scoreDisplay}</td>
                <td class="text-center">${recordStr}</td>
              </tr>
            `;
          }).join('');
        } else {
          const colspan = columns.length + 1;
          bodyEl.innerHTML = teamResults.map((tr, idx) => {
            return `
              <tr class="team-header">
                <td class="text-center">${ranks[idx]}</td>
                <td colspan="${colspan}">${escapeHTML(tr.team.name)}</td>
                <td class="standings-total">${engine.formatTotalScore(tr.teamTotal)}</td>
              </tr>
            `;
          }).join('');
        }
      } else if (supportsMatchups) {
        const sortedRows = engine.sortStandings(rows, { head2headRecordsMap });
        const ranks = computeRanks(sortedRows, (a, b) => engine.isTie(a, b, { head2headRecordsMap }));

        bodyEl.innerHTML = sortedRows.map((res, idx) => {
          const rec = head2headRecordsMap?.[res.player.id];
          const recordStr = rec ? `${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}` : '-';
          const resultDisplay = res.result || '-';
          const scoreDisplay = finalMatchupScoreMap[res.player.id] || (res.total !== undefined && res.total !== null ? String(res.total) : '-');

          return `
            <tr>
              <td class="text-center">${ranks[idx]}</td>
              <td class="player-name-cell">${escapeHTML(res.player.playerName)}</td>
              <td class="text-center">${resultDisplay}</td>
              <td class="standings-total text-center">${scoreDisplay}</td>
              <td class="text-center">${recordStr}</td>
            </tr>
          `;
        }).join('');
      } else {
        // 4b. Standard individual scoreboard
        const sortedRows = engine.sortStandings(rows, { head2headRecordsMap });
        const isEventTie = (a, b) => {
          if (a.hasScores !== b.hasScores) return false;
          if (!a.hasScores && !b.hasScores) return true;
          return engine.compareScores(a.total, b.total) === 0;
        };
        const ranks = computeRanks(sortedRows, isEventTie);

        bodyEl.innerHTML = sortedRows.map((res, idx) => {
          let rowHasUpdate = false;
          const turnsHtml = res.turnResults.map(t => {
            const scoreKey = `${res.player.id}-${t.orderNumber}`;
            const isNew = lastScoreState.has(scoreKey) && lastScoreState.get(scoreKey) !== currentScoreState.get(scoreKey);
            if (isNew) rowHasUpdate = true;
            return renderTurnCell(t, scoreKey, lastScoreState, currentScoreState, isTvMode);
          }).join('');

          const rec = head2headRecordsMap?.[res.player.id];
          const recordCell = supportsMatchups
            ? `<td class="standings-record text-center">${rec ? `${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}` : '-'}</td>`
            : '';

          const totalUpdateClass = (isTvMode && rowHasUpdate) ? 'score-just-updated' : '';

          return `
            <tr>
              <td class="text-center">${ranks[idx]}</td>
              <td class="player-name-cell">${escapeHTML(res.player.playerName)}</td>
              ${turnsHtml}
              ${recordCell}
              <td class="standings-total ${totalUpdateClass}">${res.totalDisplay}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }
}
