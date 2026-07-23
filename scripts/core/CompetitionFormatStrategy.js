/**
 * CompetitionFormatStrategy.js
 * Handles Competition Format evaluations (Group vs Head-to-Head) for Entities (Individuals or Teams).
 */

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
   * Evaluates matchup records for head-to-head format. Returns null for group format.
   */
  calculateMatchupRecords() {
    return null;
  }
}

export class GroupCompetitionStrategy extends BaseCompetitionStrategy {
  sortStandings(rows, engine, options = {}) {
    return [...rows].sort((a, b) => {
      if (options.seasonScoring === 'weekly') {
        return b.totalSeasonPoints - a.totalSeasonPoints;
      }
      return engine.compareScores(a.totalSeasonPoints, b.totalSeasonPoints);
    });
  }
}

export class HeadToHeadCompetitionStrategy extends BaseCompetitionStrategy {
  /**
   * Calculates head-to-head win/loss records for matchup-based formats.
   * Handles entities (Individual Players or Teams).
   *
   * @param {Array} entities - Array of entity objects (players or teams).
   * @param {Array} events - Array of event objects.
   * @param {Object} matchupsByEvent - Matchups keyed by event ID.
   * @param {Object} entityEventTotals - Map of eventId -> entityId -> score total.
   * @param {Object} engine - Active ScoringEngine instance.
   * @returns {Object<number, {wins: number, losses: number, ties: number, winRate: number, scoreDiff: number, runDiff: number, totalScore: number, totalRuns: number, headToHead: Object}>}
   */
  calculateMatchupRecords(entities, events, matchupsByEvent, entityEventTotals, engine) {
    const records = {};
    entities.forEach(entity => {
      records[entity.id] = {
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        scoreDiff: 0,
        runDiff: 0,
        totalScore: 0,
        totalRuns: 0,
        headToHead: {}
      };
    });

    events.forEach(event => {
      const matchups = matchupsByEvent[event.id] || [];
      matchups.forEach(m => {
        if (m.status !== 'completed') return;

        const e1Id = Number(m.player1Id ?? m.player1_id ?? m.team1Id ?? m.team1_id ?? m.awayPlayerId ?? m.away_player_id);
        const e2Id = Number(m.player2Id ?? m.player2_id ?? m.team2Id ?? m.team2_id ?? m.homePlayerId ?? m.home_player_id);

        if (!e1Id || !e2Id) return; // Bye week

        // Read direct matchup scores first (runs or points)
        const r1 = Number(m.player1Score ?? m.player1_score ?? m.awayRuns ?? m.away_runs ?? entityEventTotals?.[event.id]?.[e1Id] ?? 0);
        const r2 = Number(m.player2Score ?? m.player2_score ?? m.homeRuns ?? m.home_runs ?? entityEventTotals?.[event.id]?.[e2Id] ?? 0);

        if (records[e1Id]) {
          records[e1Id].totalScore += r1;
          records[e1Id].totalRuns += r1;
          records[e1Id].scoreDiff += (r1 - r2);
          records[e1Id].runDiff += (r1 - r2);
        }
        if (records[e2Id]) {
          records[e2Id].totalScore += r2;
          records[e2Id].totalRuns += r2;
          records[e2Id].scoreDiff += (r2 - r1);
          records[e2Id].runDiff += (r2 - r1);
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
    return [...rows].sort((a, b) => {
      // 1. Sort by Win Rate
      if (a.record && b.record) {
        const rateDiff = b.record.winRate - a.record.winRate;
        if (Math.abs(rateDiff) > 0.001) return rateDiff;

        // 2. Direct H2H tiebreaker
        const aAgainstB = a.record.headToHead[b.entity.id];
        const aWins = aAgainstB ? aAgainstB.wins : 0;
        const bAgainstA = b.record.headToHead[a.entity.id];
        const bWins = bAgainstA ? bAgainstA.wins : 0;
        if (aWins !== bWins) {
          return bWins - aWins;
        }

        // 3. Score differential (higher scoreDiff / runDiff is better)
        const scoreDiffDiff = (b.record.scoreDiff ?? b.record.runDiff ?? 0) - (a.record.scoreDiff ?? a.record.runDiff ?? 0);
        if (scoreDiffDiff !== 0) return scoreDiffDiff;

        // 4. Total score (higher total score)
        const totalRunsDiff = (b.record.totalRuns ?? b.record.totalScore ?? 0) - (a.record.totalRuns ?? a.record.totalScore ?? 0);
        if (totalRunsDiff !== 0) return totalRunsDiff;
      }

      if (options.seasonScoring === 'weekly') {
        return b.totalSeasonPoints - a.totalSeasonPoints;
      }
      return engine.compareScores(a.totalSeasonPoints, b.totalSeasonPoints);
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
  if (competitionFormat === 'head_to_head' || competitionFormat === 'head2head') {
    return new HeadToHeadCompetitionStrategy();
  }
  return new GroupCompetitionStrategy();
}
