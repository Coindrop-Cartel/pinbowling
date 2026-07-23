import { 
  groupTargetsByEvent, 
  buildScoreMapFromRows, 
  groupScoresByPlayer, 
  normalizeTargets,
  normalizeScores,
  groupScoresByEventAndPlayer,
  groupMatchupsByEvent 
} from '@services/normalizer.js';
import { getPlayerAssignmentStrategy } from '../core/PlayerAssignmentStrategy.js';
import { getCompetitionFormatStrategy } from '../core/CompetitionFormatStrategy.js';

/**
 * Calculate head-to-head win/loss records for matchup-based formats.
 * For each matchup, compares the total runs scored by each player to determine the winner.
 *
 * @param {Object[]} players - Array of player objects (each with `id`).
 * @param {Object[]} events - Array of event objects (each with `id`).
 * @param {Object<number, Object[]>} matchupsByEvent - Matchups keyed by event ID.
 * @param {Object<number, Object<number, Object[]>>} scoresByEventAndPlayer
 *   Nested map of `{ [eventId]: { [playerId]: score[] } }`.
 * @param {Object<number, Object[]>} targetsByEvent - Map of `{ [eventId]: target[] }`.
 * @param {Object} engine - ScoringEngine instance with `calculateTurnResults` and `compareScores`.
 * @returns {Object<number, {wins: number, losses: number, ties: number, winRate: number}>}
 *   Map of playerId to their W-L record and win rate.
 */
export function calculateHead2HeadRecords(players, events, matchupsByEvent, scoresByEventAndPlayer, targetsByEvent, engine) {
  const records = {};
  players.forEach(p => { 
    records[p.id] = { 
      wins: 0, 
      losses: 0, 
      ties: 0, 
      winRate: 0,
      runDiff: 0,
      totalRuns: 0,
      headToHead: {}
    }; 
  });

  events.forEach(event => {
    const matchups = matchupsByEvent[event.id] || [];
    matchups.forEach(m => {
      if (m.status !== 'completed') return;

      const p1Id = Number(m.player1Id ?? m.player1_id ?? m.awayPlayerId ?? m.away_player_id);
      const p2Id = Number(m.player2Id ?? m.player2_id ?? m.homePlayerId ?? m.home_player_id);

      // If it's a bye week, ignore for records calculation
      if (!p1Id || !p2Id) return;

      const r1 = Number(m.player1Score ?? m.player1_score ?? m.awayRuns ?? m.away_runs ?? 0);
      const r2 = Number(m.player2Score ?? m.player2_score ?? m.homeRuns ?? m.home_runs ?? 0);

      if (records[p1Id]) {
        records[p1Id].totalRuns += r1;
        records[p1Id].runDiff += (r1 - r2);
      }
      if (records[p2Id]) {
        records[p2Id].totalRuns += r2;
        records[p2Id].runDiff += (r2 - r1);
      }

      if (r1 > r2) {
        if (records[p1Id]) {
          records[p1Id].wins++;
          records[p1Id].headToHead[p2Id] = records[p1Id].headToHead[p2Id] || { wins: 0, losses: 0, ties: 0 };
          records[p1Id].headToHead[p2Id].wins++;
        }
        if (records[p2Id]) {
          records[p2Id].losses++;
          records[p2Id].headToHead[p1Id] = records[p2Id].headToHead[p1Id] || { wins: 0, losses: 0, ties: 0 };
          records[p2Id].headToHead[p1Id].losses++;
        }
      } else if (r2 > r1) {
        if (records[p1Id]) {
          records[p1Id].losses++;
          records[p1Id].headToHead[p2Id] = records[p1Id].headToHead[p2Id] || { wins: 0, losses: 0, ties: 0 };
          records[p1Id].headToHead[p2Id].losses++;
        }
        if (records[p2Id]) {
          records[p2Id].wins++;
          records[p2Id].headToHead[p1Id] = records[p2Id].headToHead[p1Id] || { wins: 0, losses: 0, ties: 0 };
          records[p2Id].headToHead[p1Id].wins++;
        }
      } else {
        if (records[p1Id]) {
          records[p1Id].ties++;
          records[p1Id].headToHead[p2Id] = records[p1Id].headToHead[p2Id] || { wins: 0, losses: 0, ties: 0 };
          records[p1Id].headToHead[p2Id].ties++;
        }
        if (records[p2Id]) {
          records[p2Id].ties++;
          records[p2Id].headToHead[p1Id] = records[p2Id].headToHead[p1Id] || { wins: 0, losses: 0, ties: 0 };
          records[p2Id].headToHead[p1Id].ties++;
        }
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
 * @param {Object} params.league - League object with `participationType` ('team'|'individual'),
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
 */
export function calculateSeasonSummary({ league, players, events, targetsByEvent, scoresByEventAndPlayer, matchupsByEvent = {}, engine, selectedPlayerIds = [] }) {
  const isTeamLeague = league?.participationType === 'team';
  const isH2H = league?.competitionFormat === 'head_to_head' || league?.competitionFormat === 'head2head' || !!engine.getMatchupDescription(1);

  const assignmentStrategy = getPlayerAssignmentStrategy(league?.participationType);
  const competitionStrategy = getCompetitionFormatStrategy(isH2H ? 'head_to_head' : (league?.competitionFormat || 'group'));

  // Options for team calculations (e.g. drop lowest player score per event if configured)
  const assignmentOptions = {
    dropLowestPlayer: league?.dropLowestPlayer || league?.dropLowestPlayerScores || 0,
    matchupsByEvent
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

      const targetEntities = isTeamLeague ? (league.teams || []) : players;
      targetEntities.forEach(entity => {
        const { total, hasData } = assignmentStrategy.calculateEntityEventScore(
          entity, eventTargets, scoresByEventAndPlayer[event.id] || {}, engine, assignmentOptions
        );
        if (hasData) scoreEntities.push({ id: entity.id, total });
      });

      scoreEntities.sort((a, b) => engine.compareScores(a.total, b.total));
      eventPointsMap[event.id] = {};
      const weeklyPointsValue = league?.weeklyPoints ? Number(league.weeklyPoints) : scoreEntities.length;
      const pointSpreadValue = league?.pointSpread ? Number(league.pointSpread) : 1;

      let lastPoints = 0;
      scoreEntities.forEach((entity, idx) => {
        let pts;
        if (idx > 0 && engine.compareScores(entity.total, scoreEntities[idx - 1].total) === 0) {
          pts = lastPoints;
        } else {
          pts = Math.max(0, weeklyPointsValue - idx * pointSpreadValue);
        }
        eventPointsMap[event.id][entity.id] = pts;
        lastPoints = pts;
      });
    });
  }

  const entitiesToMap = isTeamLeague
    ? (league.teams || [])
    : (selectedPlayerIds.length > 0 ? players.filter(p => selectedPlayerIds.includes(String(p.id))) : players);

  const normalizedTargetsFlat = Object.values(targetsByEvent).flat();
  const entityEventTotals = {};

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
        const result = assignmentStrategy.calculateEntityEventScore(
          entity, eventTargets, scoresByEventAndPlayer[event.id] || {}, engine, assignmentOptions
        );
        scoreValue = result.total;
        hasData = result.hasData;
      }

      if (!entityEventTotals[event.id]) entityEventTotals[event.id] = {};
      entityEventTotals[event.id][entity.id] = scoreValue;

      if (hasData) {
        let displayValue;
        if (isH2H) {
          const eventMatchups = matchupsByEvent[event.id] || [];
          const entityMatchup = eventMatchups.find(m => {
            if (m.status !== 'completed') return false;
            const e1 = Number(m.player1Id ?? m.player1_id ?? m.team1Id ?? m.team1_id);
            const e2 = Number(m.player2Id ?? m.player2_id ?? m.team2Id ?? m.team2_id);
            return e1 === entity.id || e2 === entity.id;
          });

          if (entityMatchup) {
            const r1 = Number(entityMatchup.player1Score ?? entityMatchup.player1_score ?? entityMatchup.team1Score ?? 0);
            const r2 = Number(entityMatchup.player2Score ?? entityMatchup.player2_score ?? entityMatchup.team2Score ?? 0);
            const e1 = Number(entityMatchup.player1Id ?? entityMatchup.player1_id ?? entityMatchup.team1Id ?? entityMatchup.team1_id);
            const isEntity1 = e1 === entity.id;
            const scoreA = isEntity1 ? r1 : r2;
            const scoreB = isEntity1 ? r2 : r1;
            const cmp = engine.compareScores(scoreA, scoreB);
            displayValue = cmp < 0 ? 'Win' : (cmp > 0 ? 'Loss' : 'Tie');
          } else {
            displayValue = '-';
          }
        } else {
          displayValue = league?.seasonScoring === 'weekly' ? `${scoreValue} pts` : engine.formatTotalScore(scoreValue);
        }
        eventTotals[event.id] = { displayValue, isDropped: false };
        individualScores.push({ eventId: event.id, value: scoreValue, hasData: true });
      } else {
        eventTotals[event.id] = { displayValue: '-', isDropped: false };
        individualScores.push({ eventId: event.id, value: null, hasData: false });
      }
    });

    // Drop lowest weeks
    const dropCount = Number(league?.dropLowestWeeks || 0);
    let scoresToSum = [...individualScores];
    if (dropCount > 0 && individualScores.length > 0) {
      scoresToSum.sort((a, b) => {
        if (a.hasData && !b.hasData) return -1;
        if (!a.hasData && b.hasData) return 1;
        if (!a.hasData && !b.hasData) return 0;
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

    totalSeasonPoints = scoresToSum.reduce((sum, s) => sum + (s.value || 0), 0);

    return {
      entity,
      eventTotals,
      totalSeasonPoints,
      playedTargets: isTeamLeague ? [] : getPlayedTargets(entity.id, normalizedTargetsFlat)
    };
  });

  // Calculate H2H records if applicable using competition strategy
  const head2headRecords = competitionStrategy.calculateMatchupRecords
    ? competitionStrategy.calculateMatchupRecords(entitiesToMap, events, matchupsByEvent, entityEventTotals, engine)
    : null;

  if (head2headRecords) {
    rows.forEach(row => {
      const rec = head2headRecords[row.entity.id];
      if (rec) {
        row.record = rec;
        row.displayRecord = `${rec.wins}-${rec.losses}${rec.ties > 0 ? `-${rec.ties}` : ''}`;
      }
    });
  }

  // Sort standings via competition strategy
  const sortedRows = competitionStrategy.sortStandings(rows, engine, { seasonScoring: league?.seasonScoring });

  return { rows: sortedRows, isTeamLeague, head2headRecords };
}

/**
 * Fetches and normalizes all targets, scores, and matchups required for season summary calculation.
 *
 * @param {number|string} leagueId - ID of the league
 * @param {Object[]} events - Array of events for the league
 * @param {Object} PB_API - API client wrapper
 * @param {Object} engine - Active scoring engine instance
 * @returns {Promise<{ targetsByEvent: Object, scoresByEventAndPlayer: Object, matchupsByEvent: Object }>}
 */
export async function fetchSeasonData(leagueId, events, PB_API, engine) {
  const [rawScores, allLeagueTargets, leagueMatchupsByEvent] = await Promise.all([
    PB_API.scores.get(null, null, leagueId),
    PB_API.machines.getTargets(null, leagueId),
    engine.getMatchupDescription(1)
      ? Promise.all(events.map(e => PB_API.matchups.get(e.id).catch(() => []))).then(results => groupMatchupsByEvent(results.flat()))
      : Promise.resolve({})
  ]);

  const normalizedLeagueTargets = normalizeTargets(allLeagueTargets);
  const targetsByEvent = groupTargetsByEvent(normalizedLeagueTargets);
  const normalizedScores = normalizeScores(rawScores);
  const scoresByEventAndPlayer = groupScoresByEventAndPlayer(normalizedScores);

  return { targetsByEvent, scoresByEventAndPlayer, matchupsByEvent: leagueMatchupsByEvent };
}
