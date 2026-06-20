import { groupTargetsByEvent, buildScoreMapFromRows, groupScoresByPlayer, buildBaseballScoreMapForPlayer } from '@services/normalizer.js';

/**
 * Calculate head-to-head win/loss records for baseball format.
 * For each matchup, compares the total runs scored by each player to determine the winner.
 *
 * @param {Object[]} players - Array of player objects (each with `id`).
 * @param {Object[]} events - Array of event objects (each with `id`).
 * @param {Object<number, Object[]>} matchupsByEvent - Baseball matchups keyed by event ID.
 * @param {Object<number, Object<number, Object[]>>} scoresByEventAndPlayer
 *   Nested map of `{ [eventId]: { [playerId]: score[] } }`.
 * @param {Object<number, Object[]>} targetsByEvent - Map of `{ [eventId]: target[] }`.
 * @param {Object} engine - ScoringEngine instance with `calculateTurnResults` and `compareScores`.
 * @returns {Object<number, {wins: number, losses: number, ties: number, winRate: number}>}
 *   Map of playerId to their W-L record and win rate.
 */
export function calculateBaseballRecords(players, events, matchupsByEvent, scoresByEventAndPlayer, targetsByEvent, engine) {
  const records = {};
  players.forEach(p => { records[p.id] = { wins: 0, losses: 0, ties: 0, winRate: 0 }; });

  events.forEach(event => {
    const matchups = matchupsByEvent[event.id] || [];
    const eventTargets = targetsByEvent[event.id] || [];

    matchups.forEach(matchup => {
      const p1Id = Number(matchup.player1_id || matchup.player1Id);
      const p2Id = Number(matchup.player2_id || matchup.player2Id);

      const p1Scores = scoresByEventAndPlayer[event.id]?.[p1Id] || [];
      const p2Scores = scoresByEventAndPlayer[event.id]?.[p2Id] || [];

      if (p1Scores.length === 0 || p2Scores.length === 0) return;

      const eventScoresByPlayer = scoresByEventAndPlayer[event.id] || {};
      const p1ScoreMap = buildBaseballScoreMapForPlayer(p1Id, eventScoresByPlayer, matchups);
      const p2ScoreMap = buildBaseballScoreMapForPlayer(p2Id, eventScoresByPlayer, matchups);

      const { total: p1Total } = engine.calculateTurnResults(eventTargets, p1ScoreMap);
      const { total: p2Total } = engine.calculateTurnResults(eventTargets, p2ScoreMap);

      const cmp = engine.compareScores(p1Total, p2Total);
      if (cmp > 0) {
        // p1 wins (higher is better in baseball — more runs)
        if (records[p1Id]) records[p1Id].wins++;
        if (records[p2Id]) records[p2Id].losses++;
      } else if (cmp < 0) {
        if (records[p1Id]) records[p1Id].losses++;
        if (records[p2Id]) records[p2Id].wins++;
      } else {
        if (records[p1Id]) records[p1Id].ties++;
        if (records[p2Id]) records[p2Id].ties++;
      }
    });
  });

  // Calculate win rate
  Object.values(records).forEach(r => {
    const total = r.wins + r.losses + r.ties;
    r.winRate = total > 0 ? (r.wins + r.ties * 0.5) / total : 0;
  });

  return records;
}

/**
 * Calculates season summary rows for a league.
 *
 * Processes all events for each player (or team), computing per-event totals
 * and an aggregate season score. Supports both cumulative and weekly-points
 * scoring modes, team leagues, and optional lowest-week drops.
 *
 * @param {Object} params - Destructured parameters.
 * @param {Object} params.league - League object with `participants` ('team'|'individual'),
 *   `seasonScoring` ('weekly'|cumulative), `dropLowestWeeks` (number), and `teams` array (for team leagues).
 * @param {Object[]} params.players - Array of player objects (each with `id`).
 * @param {Object[]} params.events - Array of event objects (each with `id`).
 * @param {Object<number, Object[]>} params.targetsByEvent - Map of `{ [eventId]: target[] }` from `groupTargetsByEvent`.
 * @param {Object<number, Object<number, Object[]>>} params.scoresByEventAndPlayer
 *   Nested map of `{ [eventId]: { [playerId]: score[] } }` from `groupScoresByEventAndPlayer`.
 * @param {Object<number, Object[]>} [params.matchupsByEvent={}] - Baseball matchups keyed by event ID.
 * @param {Object} params.engine - ScoringEngine instance with `calculateTurnResults`, `compareScores`, and `formatTotalScore` methods.
 * @param {string[]} [params.selectedPlayerIds=[]] - Array of player IDs to filter the results.
 * @returns {Object} The calculated season summary.
 * @returns {boolean} returns.isTeamLeague - Indicates if the league is team-based.
 * @returns {Array} returns.rows - Sorted summary rows.
 * @returns {Object} returns.rows[].entity - The player or team object.
 * @returns {Object<number, {displayValue: string, isDropped: boolean}|null>} returns.rows[].eventTotals - Totals keyed by event ID.
 * @returns {number} returns.rows[].totalSeasonPoints - Aggregate points after applying drop-weeks.
 */
export function calculateSeasonSummary({ league, players, events, targetsByEvent, scoresByEventAndPlayer, matchupsByEvent = {}, engine, selectedPlayerIds = [] }) {
  const isTeamLeague = league?.participants === 'team';
  const isBaseball = league?.scoringFormat === 'baseball';

  const getScoreMapForPlayer = (eventId, playerId, scores) => {
    if (!isBaseball) return buildScoreMapFromRows(scores);
    const scoresByPlayer = groupScoresByPlayer(Object.values(scoresByEventAndPlayer[eventId] || {}).flat());
    return buildBaseballScoreMapForPlayer(playerId, scoresByPlayer, matchupsByEvent[eventId] || []);
  };

  // Helper: which targets a player touched across the league
  const getPlayedTargets = (playerId, normalizedTargets) => {
    return (normalizedTargets || []).filter(target => {
      const playerScores = scoresByEventAndPlayer[target.eventId]?.[playerId] || [];
      return playerScores.some(s => Number(s.orderNumber) === Number(target.orderNumber));
    });
  };

  // Pre-calc weekly points if needed
  const eventPointsMap = {};
  if (league?.seasonScoring === 'weekly') {
    events.forEach(event => {
      const eventTargets = targetsByEvent[event.id] || [];
      const scoreEntities = [];

      if (isTeamLeague) {
        (league.teams || []).forEach(team => {
          let teamEventTotal = 0;
          let hasData = false;
          (team.members || []).forEach(m => {
            const scores = scoresByEventAndPlayer[event.id]?.[m.id] || [];
            if (scores.length > 0) {
              hasData = true;
              const scoreMap = getScoreMapForPlayer(event.id, m.id, scores);
              const { total } = engine.calculateTurnResults(eventTargets, scoreMap);
              teamEventTotal += total;
            }
          });
          if (hasData) scoreEntities.push({ id: team.id, total: teamEventTotal });
        });
      } else {
        players.forEach(p => {
          const scores = scoresByEventAndPlayer[event.id]?.[p.id] || [];
          if (scores.length > 0) {
            const scoreMap = getScoreMapForPlayer(event.id, p.id, scores);
            const { total } = engine.calculateTurnResults(eventTargets, scoreMap);
            scoreEntities.push({ id: p.id, total });
          }
        });
      }

      scoreEntities.sort((a, b) => engine.compareScores(a.total, b.total));
      eventPointsMap[event.id] = {};
      scoreEntities.forEach((entity, idx) => {
        eventPointsMap[event.id][entity.id] = scoreEntities.length - idx;
      });
    });
  }

  const entitiesToMap = isTeamLeague ? (league.teams || []) : (selectedPlayerIds.length > 0 ? players.filter(p => selectedPlayerIds.includes(String(p.id))) : players);

  const normalizedTargetsFlat = Object.values(targetsByEvent).flat();

  const rows = entitiesToMap.map(entity => {
    let totalSeasonPoints = 0;
    const eventTotals = {};
    const individualScores = [];

    events.forEach(event => {
      const eventTargets = targetsByEvent[event.id] || [];
      let scoreValue = 0;
      let hasData = false;

      if (league?.seasonScoring === 'weekly') {
        const pts = eventPointsMap[event.id]?.[entity.id] || 0;
        scoreValue = pts;
        hasData = pts > 0;
      } else {
        if (isTeamLeague) {
          (entity.members || []).forEach(m => {
            const scores = scoresByEventAndPlayer[event.id]?.[m.id] || [];
            if (scores.length > 0) {
              hasData = true;
              const scoreMap = getScoreMapForPlayer(event.id, m.id, scores);
              const { total } = engine.calculateTurnResults(eventTargets, scoreMap);
              scoreValue += total;
            }
          });
        } else {
          const playerEventScores = scoresByEventAndPlayer[event.id]?.[entity.id] || [];
          if (playerEventScores.length > 0 && eventTargets.length > 0) {
            hasData = true;
            const scoreMap = getScoreMapForPlayer(event.id, entity.id, playerEventScores);
            const { total } = engine.calculateTurnResults(eventTargets, scoreMap);
            scoreValue = total;
          }
        }
      }

      if (hasData) {
        const displayValue = league?.seasonScoring === 'weekly' ? `${scoreValue} pts` : engine.formatTotalScore(scoreValue);
        eventTotals[event.id] = { displayValue, isDropped: false };
        individualScores.push({ eventId: event.id, value: scoreValue });
      } else {
        eventTotals[event.id] = null;
      }
    });

    // Drop lowest
    const dropCount = Number(league?.dropLowestWeeks || 0);
    let scoresToSum = [...individualScores]; // Create a mutable copy for sorting and splicing
    if (dropCount > 0 && individualScores.length > 0) {
      scoresToSum.sort((a, b) => {
        if (league?.seasonScoring === 'weekly') return b.value - a.value;
        return engine.compareScores(a.value, b.value);
      });
      const numToDrop = Math.min(dropCount, scoresToSum.length);
      const dropped = scoresToSum.splice(-numToDrop);
      dropped.forEach(d => {
        if (eventTotals[d.eventId]) {
          eventTotals[d.eventId].isDropped = true;
        }
      });
    }

    totalSeasonPoints = scoresToSum.reduce((sum, s) => sum + s.value, 0);

    return { entity, eventTotals, totalSeasonPoints, playedTargets: isTeamLeague ? [] : getPlayedTargets(entity.id, normalizedTargetsFlat) };
  });

  // For baseball, calculate head-to-head W-L records and attach to rows
  let baseballRecords = null;
  if (isBaseball && !isTeamLeague) {
    baseballRecords = calculateBaseballRecords(players, events, matchupsByEvent, scoresByEventAndPlayer, targetsByEvent, engine);
    rows.forEach(row => {
      const rec = baseballRecords[row.entity.id];
      if (rec) {
        row.record = rec;
        row.displayRecord = `${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}`;
      }
    });
  }

  rows.sort((a, b) => {
    // For baseball, sort by win rate first, then by total runs as tiebreaker
    if (isBaseball && a.record && b.record) {
      const rateDiff = b.record.winRate - a.record.winRate;
      if (Math.abs(rateDiff) > 0.001) return rateDiff;
    }
    if (league?.seasonScoring === 'weekly') return b.totalSeasonPoints - a.totalSeasonPoints;
    return engine.compareScores(a.totalSeasonPoints, b.totalSeasonPoints);
  });

  return { rows, isTeamLeague, baseballRecords };
}
