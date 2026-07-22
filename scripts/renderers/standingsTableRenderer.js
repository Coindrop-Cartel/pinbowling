import { escapeHTML, formatNumber } from '../utils.js';

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

  return `
    <td class="${classes.join(' ')}">
      <div class="standings-mark">${turn.displayMark}</div>
      <div class="standings-round-score">${turn.displayRoundTotal}</div>
    </td>
  `;
}

/**
 * Renders a standings/scoreboard table into header and body elements.
 * Handles event scoreboards (team and individual) and season summaries (standard and baseball).
 *
 * @param {Object} options
 * @param {HTMLElement} options.headerEl - Header element to render columns into
 * @param {HTMLElement} options.bodyEl - Body element to render rows into
 * @param {boolean} options.isSummary - True if rendering season summary, false if event scoreboard
 * @param {Object} options.league - Active league configuration
 * @param {Object} options.event - Active event configuration (optional)
 * @param {boolean} options.isBaseball - True if scoring format is baseball
 * @param {boolean} options.isTeamLeague - True if league participates as teams
 * @param {Array} options.rows - Processed player result rows
 * @param {Array} options.columns - Event columns (for summary) or machine targets (for event scoreboard)
 * @param {Object} options.engine - Scoring engine instance
 * @param {boolean} options.supportsMatchups - True if the format supports head-to-head matchups
 * @param {Object} [options.baseballRecordsMap] - Pre-calculated records map (for baseball)
 * @param {Array} [options.allTeamsData] - All teams database records (for team-based leagues)
 * @param {Object} [options.tvModeManager] - TV Mode Manager instance for display state checks
 * @param {Map} [options.lastScoreState] - Previous score state for change pulse animation
 * @param {Map} [options.currentScoreState] - Current score state for change pulse animation
 */
export function renderStandingsTable({
  headerEl,
  bodyEl,
  isSummary,
  league,
  event,
  isBaseball,
  isTeamLeague,
  rows,
  columns,
  engine,
  supportsMatchups,
  baseballRecordsMap = null,
  allTeamsData = [],
  tvModeManager = null,
  lastScoreState = new Map(),
  currentScoreState = new Map()
}) {
  const isTvMode = tvModeManager?.isTvMode === true;
  const playerLabel = isTeamLeague ? 'Team' : 'Player';

  if (isSummary) {
    // --- SEASON SUMMARY RENDER PATHS ---
    if (isBaseball && !isTeamLeague) {
      // 1. Baseball Season Summary (Individual)
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
        bodyEl.innerHTML = rows.map((res, idx) => {
          const entityName = escapeHTML(res.entity.playerName);
          const rec = res.record || { wins: 0, losses: 0, ties: 0, runDiff: 0, winRate: 0 };
          const diffSign = rec.runDiff > 0 ? '+' : '';
          const winPct = rec.winRate.toFixed(3);

          const eventsHtml = columns.map(e => {
            const eventData = res.eventTotals[e.id];
            if (!eventData || eventData.displayValue === undefined) return `<td class="standings-round">-</td>`;
            return `<td class="standings-round">${eventData.displayValue}</td>`;
          }).join('');

          return `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="player-name-cell">${entityName}</td>
              ${eventsHtml}
              <td class="text-center">${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}</td>
              <td class="text-center">${diffSign}${rec.runDiff}</td>
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
              <td>${idx + 1}</td>
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

        bodyEl.innerHTML = teamResults.map((tr, idx) => {
          const teamHeader = `
            <tr class="team-header">
              <td class="text-center">${idx + 1}</td>
              <td colspan="${columns.length + 1}">${escapeHTML(tr.team.name)}</td>
              <td class="standings-total">${engine.formatTotalScore(tr.teamTotal)}</td>
            </tr>
          `;
          const memberRows = tr.teamMembers.map(res => {
            let rowHasUpdate = false;
            const turnsHtml = res.turnResults.map(t => {
              const scoreKey = `${res.player.id}-${t.orderNumber}`;
              const isNew = lastScoreState.has(scoreKey) && lastScoreState.get(scoreKey) !== currentScoreState.get(scoreKey);
              if (isNew) rowHasUpdate = true;
              return renderTurnCell(t, scoreKey, lastScoreState, currentScoreState, isTvMode);
            }).join('');

            const totalUpdateClass = (isTvMode && rowHasUpdate) ? 'score-just-updated' : '';

            return `
              <tr>
                <td></td>
                <td class="player-name-cell player-name-indent">${escapeHTML(res.player.playerName)}</td>
                ${turnsHtml}
                <td class="standings-total ${totalUpdateClass}">${res.totalDisplay}</td>
              </tr>
            `;
          }).join('');

          return teamHeader + memberRows;
        }).join('');
      } else {
        // 4. Individual scoreboard
        const sortedRows = engine.sortStandings(rows, { baseballRecordsMap });

        bodyEl.innerHTML = sortedRows.map((res, idx) => {
          let rowHasUpdate = false;
          const turnsHtml = res.turnResults.map(t => {
            const scoreKey = `${res.player.id}-${t.orderNumber}`;
            const isNew = lastScoreState.has(scoreKey) && lastScoreState.get(scoreKey) !== currentScoreState.get(scoreKey);
            if (isNew) rowHasUpdate = true;
            return renderTurnCell(t, scoreKey, lastScoreState, currentScoreState, isTvMode);
          }).join('');

          const rec = baseballRecordsMap?.[res.player.id];
          const recordCell = supportsMatchups
            ? `<td class="standings-record text-center">${rec ? `${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}` : '-'}</td>`
            : '';

          const totalUpdateClass = (isTvMode && rowHasUpdate) ? 'score-just-updated' : '';

          return `
            <tr>
              <td>${idx + 1}</td>
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
