/**
 * CompetitionFormatStrategy.js
 * Handles Competition Format evaluations (Group vs Head-to-Head) for Entities (Individuals or Teams).
 */

import { isHead2Head } from '@services/scoringFormat.js';

export class BaseCompetitionStrategy {
  /**
   * Sorts standings rows based on competition format and engine score comparison.
   * 
   * @param {Array} rows - Array of entity standings rows.
   * @param {Object} engine - Active ScoringEngine instance.
   * @param {Object} [options] - Additional options (e.g. seasonScoring mode).
   * @returns {Array} Sorted rows.
   */
  sortStandings(rows, engine, options = {}) {
    throw new Error('sortStandings must be implemented by subclass');
  }

  /**
   * Evaluates whether two standings rows are tied according to the competition strategy.
   *
   * @param {Object} a Standings row for participant A.
   * @param {Object} b Standings row for participant B.
   * @param {Object} engine Active ScoringEngine instance.
   * @param {Object} [options] Additional options.
   * @returns {boolean} True if a and b are tied.
   */
  isTie(a, b, engine, options = {}) {
    if (a.hasScores !== undefined && b.hasScores !== undefined && a.hasScores !== b.hasScores) {
      return false;
    }
    const scoreA = a.totalSeasonPoints ?? a.total ?? 0;
    const scoreB = b.totalSeasonPoints ?? b.total ?? 0;
    return engine.compareScores(scoreA, scoreB) === 0;
  }

  /**
   * Evaluates matchup records for head-to-head format. Returns null for group format.
   */
  calculateMatchupRecords() {
    return null;
  }
}

export class GroupCompetitionStrategy extends BaseCompetitionStrategy {
  sortStandings(rows, engine, options = {}) {
    if (options.seasonScoring === 'weekly') {
      return [...rows].sort((a, b) => (b.totalSeasonPoints ?? 0) - (a.totalSeasonPoints ?? 0));
    }
    if (engine.handlesSortCompletely()) {
      return rows;
    }
    return [...rows].sort((a, b) => {
      if (a.hasScores !== b.hasScores) return a.hasScores ? -1 : 1;
      return engine.compareScores(
        a.totalSeasonPoints ?? a.total ?? 0,
        b.totalSeasonPoints ?? b.total ?? 0
      );
    });
  }
}

export class HeadToHeadCompetitionStrategy extends BaseCompetitionStrategy {
  /**
   * Evaluates whether two H2H standings rows are tied across all tiebreakers.
   */
  isTie(a, b, engine, options = {}) {
    const recA = a.record || {};
    const recB = b.record || {};
    if (Math.abs((recA.winRate ?? 0) - (recB.winRate ?? 0)) >= 0.001) return false;
    const aAgainstB = recA.headToHead ? recA.headToHead[b.entity?.id] : null;
    const aWins = aAgainstB ? aAgainstB.wins : 0;
    const bAgainstA = recB.headToHead ? recB.headToHead[a.entity?.id] : null;
    const bWins = bAgainstA ? bAgainstA.wins : 0;
    if (aWins !== bWins) return false;
    const diffA = recA.scoreDiff ?? 0;
    const diffB = recB.scoreDiff ?? 0;
    if (diffA !== diffB) return false;
    const scoreA = recA.totalScore ?? 0;
    const scoreB = recB.totalScore ?? 0;
    return scoreA === scoreB;
  }

  /**
   * Calculates head-to-head win/loss records for matchup-based formats.
   * Handles entities (Individual Players or Teams).
   *
   * @param {Array} entities - Array of entity objects (players or teams).
   * @param {Array} events - Array of event objects.
   * @param {Object} matchupsByEvent - Matchups keyed by event ID.
   * @param {Object} entityEventTotals - Map of eventId -> entityId -> score total.
   * @param {Object} engine - Active ScoringEngine instance.
   * @returns {Object<number, {wins: number, losses: number, ties: number, winRate: number, scoreDiff: number, totalScore: number, headToHead: Object}>}
   */
  calculateMatchupRecords(entities, events, matchupsByEvent, entityEventTotals, engine, options = {}) {
    const records = {};
    entities.forEach(entity => {
      records[entity.id] = {
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        scoreDiff: 0,
        totalScore: 0,
        headToHead: {}
      };
    });

    events.forEach(event => {
      const matchups = matchupsByEvent[event.id] || [];
      const isTeamMode = options?.participationType === 'team' || (matchups.length > 0 && matchups[0].team1Id !== null && matchups[0].team1Id !== undefined);
      matchups.forEach(m => {
        const e1Id = isTeamMode
          ? Number(m.team1Id ?? m.team1_id)
          : Number(m.player1Id ?? m.player1_id);
        const e2Id = isTeamMode
          ? Number(m.team2Id ?? m.team2_id)
          : Number(m.player2Id ?? m.player2_id);

        if (!e1Id || !e2Id) return; // Bye week

        const score1 = isTeamMode
          ? Number(m.team1Score ?? m.team1_score ?? 0)
          : Number(m.player1Score ?? m.player1_score ?? 0);
        const score2 = isTeamMode
          ? Number(m.team2Score ?? m.team2_score ?? 0)
          : Number(m.player2Score ?? m.player2_score ?? 0);

        const eventScore1 = entityEventTotals?.[event.id]?.[e1Id] !== undefined ? Number(entityEventTotals[event.id][e1Id]) : null;
        const eventScore2 = entityEventTotals?.[event.id]?.[e2Id] !== undefined ? Number(entityEventTotals[event.id][e2Id]) : null;

        const r1 = (score1 > 0 || score2 > 0 || eventScore1 === null) ? score1 : eventScore1;
        const r2 = (score1 > 0 || score2 > 0 || eventScore2 === null) ? score2 : eventScore2;

        const isMatchupDone = m.status === 'completed' || m.winnerId || m.teamWinnerId || score1 > 0 || score2 > 0 || (eventScore1 !== null && eventScore2 !== null);
        if (!isMatchupDone) return;

        if (records[e1Id]) {
          records[e1Id].totalScore += r1;
          records[e1Id].scoreDiff += (r1 - r2);
        }
        if (records[e2Id]) {
          records[e2Id].totalScore += r2;
          records[e2Id].scoreDiff += (r2 - r1);
        }

        // Determine winner using engine.compareScores(r1, r2)
        // cmp < 0 => r1 is better (e.g. Golf: 30 vs 36 -> 30 - 36 = -6 < 0 => e1 won)
        // cmp > 0 => r2 is better
        // cmp === 0 => tie
        const cmp = engine.compareScores(r1, r2);

        if (cmp < 0) { // e1 won
          if (records[e1Id]) {
            records[e1Id].wins++;
            records[e1Id].headToHead[e2Id] = records[e1Id].headToHead[e2Id] || { wins: 0, losses: 0, ties: 0 };
            records[e1Id].headToHead[e2Id].wins++;
          }
          if (records[e2Id]) {
            records[e2Id].losses++;
            records[e2Id].headToHead[e1Id] = records[e2Id].headToHead[e1Id] || { wins: 0, losses: 0, ties: 0 };
            records[e2Id].headToHead[e1Id].losses++;
          }
        } else if (cmp > 0) { // e2 won
          if (records[e1Id]) {
            records[e1Id].losses++;
            records[e1Id].headToHead[e2Id] = records[e1Id].headToHead[e2Id] || { wins: 0, losses: 0, ties: 0 };
            records[e1Id].headToHead[e2Id].losses++;
          }
          if (records[e2Id]) {
            records[e2Id].wins++;
            records[e2Id].headToHead[e1Id] = records[e2Id].headToHead[e1Id] || { wins: 0, losses: 0, ties: 0 };
            records[e2Id].headToHead[e1Id].wins++;
          }
        } else { // tie
          if (records[e1Id]) {
            records[e1Id].ties++;
            records[e1Id].headToHead[e2Id] = records[e1Id].headToHead[e2Id] || { wins: 0, losses: 0, ties: 0 };
            records[e1Id].headToHead[e2Id].ties++;
          }
          if (records[e2Id]) {
            records[e2Id].ties++;
            records[e2Id].headToHead[e1Id] = records[e2Id].headToHead[e1Id] || { wins: 0, losses: 0, ties: 0 };
            records[e2Id].headToHead[e1Id].ties++;
          }
        }
      });
    });

    // Calculate win rates
    Object.values(records).forEach(r => {
      const totalGames = r.wins + r.losses + r.ties;
      r.winRate = totalGames > 0 ? (r.wins + r.ties * 0.5) / totalGames : 0;
    });

    return records;
  }

  sortStandings(rows, engine, options = {}) {
    const map = options.head2headRecordsMap;
    return [...rows].sort((a, b) => {
      const entityAId = a.entity?.id ?? a.player?.id ?? a.id;
      const entityBId = b.entity?.id ?? b.player?.id ?? b.id;
      const recA = a.record || (map ? map[entityAId] : null);
      const recB = b.record || (map ? map[entityBId] : null);

      // 1. Sort by Win Rate
      if (recA && recB) {
        const rateDiff = recB.winRate - recA.winRate;
        if (Math.abs(rateDiff) > 0.001) return rateDiff;

        // 2. Direct H2H tiebreaker
        const aAgainstB = recA.headToHead ? recA.headToHead[entityBId] : null;
        const aWins = aAgainstB ? aAgainstB.wins : 0;
        const bAgainstA = recB.headToHead ? recB.headToHead[entityAId] : null;
        const bWins = bAgainstA ? bAgainstA.wins : 0;
        if (aWins !== bWins) {
          return bWins - aWins;
        }

        // 3. Score differential (higher scoreDiff is better)
        const scoreDiffDiff = (recB.scoreDiff ?? 0) - (recA.scoreDiff ?? 0);
        if (scoreDiffDiff !== 0) return scoreDiffDiff;

        // 4. Total score (higher total score)
        const totalScoreDiff = (recB.totalScore ?? 0) - (recA.totalScore ?? 0);
        if (totalScoreDiff !== 0) return totalScoreDiff;
      }

      if (a.hasScores !== undefined && b.hasScores !== undefined && a.hasScores !== b.hasScores) {
        return a.hasScores ? -1 : 1;
      }
      const scoreA = a.totalSeasonPoints ?? a.total ?? 0;
      const scoreB = b.totalSeasonPoints ?? b.total ?? 0;
      if (options.seasonScoring === 'weekly') {
        return scoreB - scoreA;
      }
      return engine.compareScores(scoreA, scoreB);
    });
  }
}

/**
 * Factory function to get the appropriate CompetitionFormatStrategy.
 * 
 * @param {string} competitionFormat - 'group' or 'head_to_head' / 'head2head'
 * @returns {BaseCompetitionStrategy}
 */
export function getCompetitionFormatStrategy(competitionFormat = 'group') {
  if (isHead2Head(competitionFormat)) {
    return new HeadToHeadCompetitionStrategy();
  }
  return new GroupCompetitionStrategy();
}
