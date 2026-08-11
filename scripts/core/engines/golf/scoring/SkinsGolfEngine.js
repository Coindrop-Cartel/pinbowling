import { StrokesGolfEngine } from './StrokesGolfEngine.js';
import { formatNumber } from '../../../../utils.js';

/**
 * Implementation of Golf Skins match play variant.
 * Groups of 2 to 4 players compete across a set number of holes (machines).
 * On each hole, stroke scores are calculated. The player with the strictly
 * lowest score wins the skin. If 2 or more players tie for lowest score,
 * the skin carries over to the next hole.
 */
export class SkinsGolfEngine extends StrokesGolfEngine {
  constructor(config = {}, options = {}) {
    super({ format: 'golf_skins', ...config }, { competitionFormat: 'head_to_head', ...options });
  }

  /**
   * Golf Skins supports up to 4 players per matchup group.
   */
  getMaxRosterSize() {
    return 4;
  }

  /**
   * Golf Skins requires Head-to-Head / Match Play context.
   */
  requiresHeadToHead() {
    return true;
  }

  hasHead2HeadScoring() {
    return true;
  }

  allowsTies() {
    return true;
  }

  /**
   * Enriches scoreMap with scores for all players in the Golf Skins group.
   */
  enrichScoreMap(scoreMap, context) {
    if (!context) return scoreMap;
    const scoresByPlayer = context.groupScoresByPlayer?.(context.normalizeScores?.(context.allEventScores || []) || []) || {};
    scoreMap.byPlayer = {};

    Object.entries(scoresByPlayer).forEach(([pId, rows]) => {
      const pMap = {};
      (rows || []).forEach(r => {
        const order = r.orderNumber ?? r.order_number;
        if (order !== undefined) {
          pMap[String(order)] = {
            ball1: Number(r.ball1 || 0),
            ball2: Number(r.ball2 || 0),
            ball3: Number(r.ball3 || 0)
          };
        }
      });
      scoreMap.byPlayer[Number(pId)] = pMap;
    });

    this._attachOpponentScores(scoreMap, context);
    return scoreMap;
  }

  getMatchupDescription(holeCount) {
    return {
      description: 'Golf Skins Match Play: Groups of 2 to 4 players compete on each hole. Lowest stroke score wins the skin. Ties carry over.',
      details: [
        { label: 'Format', value: 'Golf Skins (2-4 Players)' },
        { label: 'Total Holes', value: `${holeCount} Holes` }
      ]
    };
  }

  generateMatchupPayload(players, holeCount, machines) {
    if (!players || players.length < 2) return [];

    const p1 = players[0];
    const p2 = players[1];
    const p3 = players[2] || null;
    const p4 = players[3] || null;

    const payload = [];
    const count = (machines && machines.length) ? machines.length : holeCount;

    for (let orderNumber = 1; orderNumber <= count; orderNumber++) {
      const machineObj = (machines && machines[orderNumber - 1]) || {};
      payload.push({
        orderNumber,
        machineId: Number(machineObj.machineId || machineObj.id || 0),
        player1Id: Number(p1.id || p1.playerId),
        player2Id: Number(p2.id || p2.playerId),
        player3Id: p3 ? Number(p3.id || p3.playerId) : null,
        player4Id: p4 ? Number(p4.id || p4.playerId) : null
      });
    }

    return payload;
  }

  /**
   * Returns round row context displaying all players in the Golf Skins matchup group (2-4 players).
   */
  getRoundRowContext(round, context) {
    const { getCurrentPlayerId } = context || {};
    const matchup = this._resolveActiveMatchup(context) || context?.eventMatchups?.[0] || {};
    const currentPlayerId = Number(getCurrentPlayerId ? getCurrentPlayerId() : 0);

    const players = [];
    const addedIds = new Set();
    const addP = (id, name) => {
      const numId = Number(id);
      if (numId > 0 && !addedIds.has(numId)) {
        addedIds.add(numId);
        players.push({ id: numId, name: name || `Player ${numId}` });
      }
    };

    if (matchup.players && Array.isArray(matchup.players)) {
      matchup.players.forEach(p => addP(p.id || p.player_id, p.name || p.playerName));
    } else {
      ['player1', 'player2', 'player3', 'player4'].forEach((key) => {
        const pId = Number(matchup[`${key}Id`]);
        const pName = matchup[`${key}Name`];
        if (pId > 0) {
          addP(pId, pName);
        }
      });
    }

    const compPlayers = context?.activeCompetition?.players || context?.activeSession?.players || [];
    if (players.length < 2 && compPlayers.length) {
      compPlayers.forEach(p => {
        addP(p.id || p.player_id, p.playerName || p.name);
      });
    }

    if (players.length < 2 && context?.allEventScores?.length) {
      const scoresByP = context.groupScoresByPlayer?.(context.normalizeScores?.(context.allEventScores) || []) || {};
      Object.keys(scoresByP).forEach(pIdStr => {
        const pId = Number(pIdStr);
        if (pId > 0) {
          const pCache = context.allPlayersCache?.find(p => Number(p.id) === pId);
          addP(pId, pCache?.playerName || pCache?.name);
        }
      });
    }

    if (players.length === 0 && currentPlayerId > 0) {
      const me = context?.allPlayersCache?.find(p => Number(p.id) === currentPlayerId);
      addP(currentPlayerId, me?.playerName || me?.name || 'Player 1');
    }

    if (players.length === 0) {
      return {
        matchup: null,
        displayRoundNumber: round.orderNumber ?? 1,
        displayRoundLabel: 'Hole',
        sections: []
      };
    }

    const sections = players.map((p, idx) => {
      const pId = Number(p.id);
      const isActive = pId > 0 && pId === currentPlayerId;
      return {
        key: `player${idx + 1}`,
        roleLabel: `Player ${idx + 1}`,
        displayName: p.name || p.playerName || `Player ${idx + 1}`,
        isActiveParticipant: isActive,
        playerId: pId,
        perBallPlayers: []
      };
    });

    return {
      matchup,
      displayRoundNumber: round.orderNumber ?? 1,
      displayRoundLabel: 'Hole',
      sections,
      isPlayer1: players[0]?.id === currentPlayerId
    };
  }

  /**
   * Calculates Skins results across all players in a matchup group.
   *
   * @param {Array} machines List of hole machine configurations.
   * @param {Object} scoreMapByPlayer Map of playerId -> player's scoreMap (orderNumber -> ball scores).
   * @returns {Object} Skins calculation results including per-hole skins, carryovers, and totals.
   */
  calculateSkinsResults(machines, scoreMapByPlayer = {}) {
    const playerIds = Object.keys(scoreMapByPlayer).map(Number).filter(id => id > 0);
    const skinsWon = {};
    const totalStrokes = {};

    playerIds.forEach(id => {
      skinsWon[id] = 0;
      totalStrokes[id] = 0;
    });

    let currentCarryover = 0;
    const holeResults = [];

    machines.forEach((machine) => {
      const orderStr = String(machine.orderNumber ?? machine.order_number);
      const holeStrokes = {};
      let playedCount = 0;

      playerIds.forEach(id => {
        const entry = scoreMapByPlayer[id]?.[orderStr];
        const hasScores = entry && (Number(entry.ball1) > 0 || Number(entry.ball2) > 0 || Number(entry.ball3) > 0);

        if (hasScores) {
          const turn = this.getTurnDataFromValues(
            machine,
            Number(entry.ball1 || 0),
            Number(entry.ball2 || 0),
            Number(entry.ball3 || 0)
          );
          holeStrokes[id] = turn.score;
          totalStrokes[id] += turn.score;
          playedCount++;
        } else {
          holeStrokes[id] = null;
        }
      });

      if (playedCount < 2) {
        holeResults.push({
          orderNumber: machine.orderNumber,
          machineName: machine.machineName,
          strokes: holeStrokes,
          winnerId: null,
          skinsAwarded: 0,
          carryover: currentCarryover,
          tied: false,
          completed: false
        });
        return;
      }

      const validScores = Object.entries(holeStrokes)
        .filter(([_, score]) => score !== null)
        .map(([id, score]) => ({ id: Number(id), score }));

      const minScore = Math.min(...validScores.map(s => s.score));
      const lowestPlayers = validScores.filter(s => s.score === minScore);

      let winnerId = null;
      let skinsAwarded = 0;

      if (lowestPlayers.length === 1) {
        winnerId = lowestPlayers[0].id;
        skinsAwarded = 1 + currentCarryover;
        skinsWon[winnerId] = (skinsWon[winnerId] || 0) + skinsAwarded;
        currentCarryover = 0;
      } else {
        currentCarryover += 1;
      }

      holeResults.push({
        orderNumber: machine.orderNumber,
        machineName: machine.machineName,
        strokes: holeStrokes,
        winnerId,
        skinsAwarded,
        carryover: currentCarryover,
        tied: lowestPlayers.length > 1,
        completed: true
      });
    });

    return {
      holeResults,
      skinsWon,
      totalStrokes,
      finalCarryover: currentCarryover
    };
  }

  compareScores(a, b) {
    return b - a; // High score wins (total skins)
  }

  formatTotalScore(totalSkins) {
    return `${formatNumber(totalSkins)} Skins`;
  }
}
