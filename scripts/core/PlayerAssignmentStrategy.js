/**
 * PlayerAssignmentStrategy.js
 * Handles calculating Entity scores (Individual vs Team) using the active ScoringEngine.
 */

export class BaseAssignmentStrategy {
  /**
   * Calculates event results for an entity (player or team).
   * 
   * @param {Object} entity - Player or Team object.
   * @param {Array} eventTargets - Machine targets for the event.
   * @param {Object} scoresByPlayer - Map of playerId -> score rows array.
   * @param {Object} engine - Active ScoringEngine instance.
   * @param {Object} [options] - Additional strategy options (e.g. dropLowestPlayer).
   * @returns {{ total: number, turnResults?: Array, hasData: boolean, memberTotals: Array, droppedMemberIds: Array, keptMembers?: Array }}
   */
  calculateEntityEventScore(entity, eventTargets, scoresByPlayer, engine, options = {}) {
    throw new Error('calculateEntityEventScore must be implemented by subclass');
  }

  /**
   * Resolves player role for a specific machine/round in team or individual format.
   * 
   * @param {Object} entity - Player or Team object.
   * @param {number} roundIndex - Zero-based index of the round/machine.
   * @returns {Object} Player info responsible for this round/slot.
   */
  resolveSlotPlayer(entity, roundIndex) {
    return entity;
  }
}

export class IndividualAssignmentStrategy extends BaseAssignmentStrategy {
  calculateEntityEventScore(entity, eventTargets, scoresByPlayer, engine, options = {}) {
    const playerId = entity.id;
    const scores = scoresByPlayer[playerId] || [];
    if (scores.length === 0 || !eventTargets || eventTargets.length === 0) {
      return {
        total: 0,
        turnResults: [],
        hasData: false,
        memberTotals: [{ playerId, total: 0, played: false }],
        droppedMemberIds: []
      };
    }
    const scoreMap = engine.buildPlayerScoreMap
      ? engine.buildPlayerScoreMap(playerId, scores, scoresByPlayer, options.matchups || [])
      : {};

    const { total, turnResults } = engine.calculateTurnResults(eventTargets, scoreMap);

    return {
      total,
      turnResults,
      hasData: true,
      memberTotals: [{ playerId, total, played: true }],
      droppedMemberIds: []
    };
  }

  resolveSlotPlayer(entity) {
    return entity;
  }
}

export class TeamAssignmentStrategy extends BaseAssignmentStrategy {
  calculateEntityEventScore(entity, eventTargets, scoresByPlayer, engine, options = {}) {
    const members = entity.members || [];
    if (members.length === 0 || !eventTargets || eventTargets.length === 0) {
      return { total: 0, turnResults: [], hasData: false, memberTotals: [], droppedMemberIds: [] };
    }

    const memberTotals = [];
    let hasData = false;

    members.forEach(member => {
      const scores = scoresByPlayer[member.id] || [];
      if (scores.length > 0) {
        hasData = true;
        const scoreMap = engine.buildPlayerScoreMap
          ? engine.buildPlayerScoreMap(member.id, scores, scoresByPlayer, options.matchups || [])
          : {};

        const { total, turnResults } = engine.calculateTurnResults(eventTargets, scoreMap);

        memberTotals.push({
          playerId: member.id,
          playerName: member.playerName,
          total,
          turnResults,
          hasData: true
        });
      } else {
        memberTotals.push({
          playerId: member.id,
          playerName: member.playerName,
          total: 0,
          turnResults: [],
          hasData: false
        });
      }
    });

    if (!hasData) {
      return { total: 0, turnResults: [], hasData: false, memberTotals, droppedMemberIds: [] };
    }

    // Sort member scores from best to worst using engine.compareScores
    // Best score is first, worst score is last.
    const sortedMembers = [...memberTotals].filter(m => m.hasData).sort((a, b) => engine.compareScores(a.total, b.total));

    const dropCount = Number(options.dropLowestPlayer || options.dropLowestPlayerScores || 0);
    const numToDrop = Math.min(dropCount, Math.max(0, sortedMembers.length - 1));

    const droppedMembers = sortedMembers.slice(sortedMembers.length - numToDrop);
    const keptMembers = sortedMembers.slice(0, sortedMembers.length - numToDrop);

    const droppedMemberIds = droppedMembers.map(m => m.playerId);
    const total = keptMembers.reduce((sum, m) => sum + (m.total || 0), 0);

    return {
      total,
      hasData: true,
      memberTotals,
      droppedMemberIds,
      keptMembers
    };
  }

  /**
   * Resolves member role for round rotation (e.g. Baseball pitcher/batter).
   * For machines per inning = 2 (Top and Bottom), member changes every inning (every 2 machines).
   */
  resolveSlotPlayer(entity, roundIndex, machinesPerRound = 1) {
    const members = entity.members || [];
    if (members.length === 0) return entity;
    const memberIndex = Math.floor(roundIndex / machinesPerRound) % members.length;
    return members[memberIndex];
  }
}

/**
 * Factory function to get the appropriate PlayerAssignmentStrategy.
 * 
 * @param {string} participationType - 'individual' or 'team'
 * @returns {BaseAssignmentStrategy}
 */
export function getPlayerAssignmentStrategy(participationType = 'individual') {
  if (participationType === 'team') {
    return new TeamAssignmentStrategy();
  }
  return new IndividualAssignmentStrategy();
}
