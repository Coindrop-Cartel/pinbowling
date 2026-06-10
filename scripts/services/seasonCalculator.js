import { groupTargetsByEvent, buildScoreMapFromRows } from '@services/normalizer.js';

/**
 * Calculates season summary rows for a league.
 * Returns rows: [{ entity, eventTotals, totalSeasonPoints, playedTargets }]
 */
export function calculateSeasonSummary({ league, players, events, targetsByEvent, scoresByEventAndPlayer, engine, selectedPlayerIds = [] }) {
  const isTeamLeague = league?.participants === 'team';

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
              const scoreMap = buildScoreMapFromRows(scores);
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
            const scoreMap = buildScoreMapFromRows(scores);
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
              const scoreMap = buildScoreMapFromRows(scores);
              const { total } = engine.calculateTurnResults(eventTargets, scoreMap);
              scoreValue += total;
            }
          });
        } else {
          const playerEventScores = scoresByEventAndPlayer[event.id]?.[entity.id] || [];
          if (playerEventScores.length > 0 && eventTargets.length > 0) {
            hasData = true;
            const scoreMap = buildScoreMapFromRows(playerEventScores);
            const { total } = engine.calculateTurnResults(eventTargets, scoreMap);
            scoreValue = total;
          }
        }
      }

      if (hasData) {
        eventTotals[event.id] = league?.seasonScoring === 'weekly' ? `${scoreValue} pts` : engine.formatTotalScore(scoreValue);
        individualScores.push({ eventId: event.id, value: scoreValue });
      } else {
        eventTotals[event.id] = null;
      }
    });

    // Drop lowest
    const dropCount = Number(league?.dropLowestWeeks || 0);
    let scoresToSum = [...individualScores];
    if (dropCount > 0 && individualScores.length > 0) {
      scoresToSum.sort((a, b) => {
        if (league?.seasonScoring === 'weekly') return b.value - a.value;
        return engine.compareScores(a.value, b.value);
      });
      const numToDrop = Math.min(dropCount, scoresToSum.length);
      const dropped = scoresToSum.splice(-numToDrop);
      dropped.forEach(d => {
        if (eventTotals[d.eventId]) {
          eventTotals[d.eventId] = `<span class="dropped-score">${eventTotals[d.eventId]}</span>`;
        }
      });
    }

    totalSeasonPoints = scoresToSum.reduce((sum, s) => sum + s.value, 0);

    return { entity, eventTotals, totalSeasonPoints, playedTargets: isTeamLeague ? [] : getPlayedTargets(entity.id, normalizedTargetsFlat) };
  });

  rows.sort((a, b) => {
    if (league?.seasonScoring === 'weekly') return b.totalSeasonPoints - a.totalSeasonPoints;
    return engine.compareScores(a.totalSeasonPoints, b.totalSeasonPoints);
  });

  return { rows, isTeamLeague };
}
