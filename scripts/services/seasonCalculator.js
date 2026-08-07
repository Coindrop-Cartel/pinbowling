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
import { isHead2Head } from './scoringFormat.js';

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
  const isH2H = isHead2Head(league?.competitionFormat) || engine?.requiresHeadToHead?.() === true;

  // Use engine's strategies if available, otherwise fall back to standalone strategies
  const assignmentStrategy = engine.calculateEntityEventScore
    ? null  // engine delegates internally
    : getPlayerAssignmentStrategy(league?.participationType);
  const competitionStrategy = engine.getCompetitionStrategy
    ? null  // engine delegates internally
    : getCompetitionFormatStrategy(isH2H ? 'head2head' : (league?.competitionFormat || 'group'));

  // Helper to calculate entity score (engine method or standalone strategy)
  const calcEntityScore = (entity, eventTargets, playerScores, opts) => {
    if (engine.calculateEntityEventScore) {
      return engine.calculateEntityEventScore(entity, eventTargets, playerScores, opts);
    }
    return assignmentStrategy.calculateEntityEventScore(entity, eventTargets, playerScores, engine, opts);
  };

  // Helper to get competition strategy
  const getCompetition = () => {
    if (engine.getCompetitionStrategy) {
      return engine.getCompetitionStrategy();
    }
    return competitionStrategy;
  };

  // Options for entity-level calculations (e.g. drop lowest player score per event for teams)
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
        const { total, hasData } = calcEntityScore(
          entity, eventTargets, scoresByEventAndPlayer[event.id] || {}, assignmentOptions
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

  // Pre-build per-event entity-to-matchup lookup map for O(1) access if H2H
  const entityMatchupMapByEvent = {};
  if (isH2H) {
    events.forEach(e => {
      const map = {};
      const eventMatchups = matchupsByEvent[e.id] || [];
      eventMatchups.forEach(m => {
        const e1 = isTeamLeague ? Number(m.team1Id ?? m.team1_id) : Number(m.player1Id ?? m.player1_id);
        const e2 = isTeamLeague ? Number(m.team2Id ?? m.team2_id) : Number(m.player2Id ?? m.player2_id);
        if (e1) map[e1] = m;
        if (e2) map[e2] = m;
      });
      entityMatchupMapByEvent[e.id] = map;
    });
  }

  const rows = entitiesToMap.map(entity => {
    const eventTotals = {};
    const individualScores = [];
    let totalSeasonPoints = 0;

    events.forEach(event => {
      const eventTargets = targetsByEvent[event.id] || [];
      let scoreValue = 0;
      let hasData = false;

      if (league?.seasonScoring === 'weekly') {
        const pts = eventPointsMap[event.id]?.[entity.id] || 0;
        scoreValue = pts;
        hasData = pts > 0;
      } else {
        const result = calcEntityScore(
          entity, eventTargets, scoresByEventAndPlayer[event.id] || {}, assignmentOptions
        );
        scoreValue = result.total;
        hasData = result.hasData;
      }

      const entityMatchup = isH2H ? entityMatchupMapByEvent[event.id]?.[entity.id] : null;

      if (entityMatchup && entityMatchup.status === 'completed') {
        hasData = true;
      }

      if (!entityEventTotals[event.id]) entityEventTotals[event.id] = {};
      entityEventTotals[event.id][entity.id] = scoreValue;

      if (hasData) {
        let displayValue;
        if (isH2H) {
          if (entityMatchup) {
            const e1 = isTeamLeague
              ? Number(entityMatchup.team1Id ?? entityMatchup.team1_id)
              : Number(entityMatchup.player1Id ?? entityMatchup.player1_id);
            const e2 = isTeamLeague
              ? Number(entityMatchup.team2Id ?? entityMatchup.team2_id)
              : Number(entityMatchup.player2Id ?? entityMatchup.player2_id);

            if (!e1 || !e2) {
              displayValue = 'BYE';
            } else {
              const r1 = isTeamLeague
                ? Number(entityMatchup.team1Score ?? entityMatchup.team1_score ?? 0)
                : Number(entityMatchup.player1Score ?? entityMatchup.player1_score ?? 0);
              const r2 = isTeamLeague
                ? Number(entityMatchup.team2Score ?? entityMatchup.team2_score ?? 0)
                : Number(entityMatchup.player2Score ?? entityMatchup.player2_score ?? 0);
              const isEntity1 = e1 === entity.id;
              const scoreA = isEntity1 ? r1 : r2;
              const scoreB = isEntity1 ? r2 : r1;
              const cmp = engine.compareScores(scoreA, scoreB);

              displayValue = cmp < 0 ? 'W' : (cmp > 0 ? 'L' : 'T');
            }
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

  // Calculate H2H records via the competition strategy (engine-delegated or standalone)
  const compStrategy = getCompetition();
  const head2headRecords = compStrategy.calculateMatchupRecords
    ? compStrategy.calculateMatchupRecords(entitiesToMap, events, matchupsByEvent, entityEventTotals, engine)
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

  // Sort standings via engine (which delegates to competition strategy, or use standalone)
  const sortedRows = engine.sortStandings
    ? engine.sortStandings(rows, { seasonScoring: league?.seasonScoring, head2headRecordsMap: head2headRecords })
    : compStrategy.sortStandings(rows, engine, { seasonScoring: league?.seasonScoring });

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
export async function fetchSeasonData(leagueId, events, PB_API, engine, isTeamLeague = false) {
  const fetchMatchups = isTeamLeague
    ? e => PB_API.teamMatchups.get(e.id).catch(() => [])
    : e => PB_API.matchups.get(e.id).catch(() => []);

  const [rawScores, allLeagueTargets, leagueMatchupsByEvent] = await Promise.all([
    PB_API.scores.get(null, null, leagueId),
    PB_API.machines.getTargets(null, leagueId),
    engine.getMatchupDescription(1)
      ? Promise.all(events.map(fetchMatchups)).then(results => groupMatchupsByEvent(results.flat()))
      : Promise.resolve({})
  ]);

  const normalizedLeagueTargets = normalizeTargets(allLeagueTargets);
  const targetsByEvent = groupTargetsByEvent(normalizedLeagueTargets);
  const normalizedScores = normalizeScores(rawScores);
  const scoresByEventAndPlayer = groupScoresByEventAndPlayer(normalizedScores);

  return { targetsByEvent, scoresByEventAndPlayer, matchupsByEvent: leagueMatchupsByEvent };
}
