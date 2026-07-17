/**
 * Service for building and resolving baseball matchup data.
 *
 * The logic here is extracted from the original `BaseballEngine` so that the
 * engine can remain focused on scoring calculations.  UI and page layers can
 * import these helpers to generate matchup payloads and to resolve inning
 * roles.
 */

import { flattenMatchupInnings } from './normalizer.js';

/**
 * Build a round‑robin matchup payload for a baseball session.
 *
 * @param {Array<{id: number, playerName?: string}>} players
 * @param {number} inningCount
 * @param {Array<{machineId: number}>} machines
 * @returns {Array<{orderNumber: number, playerId: number, playerOrder: number, machineId: number}>}
 */
export function buildRoundRobinMatchups(players, inningCount, machines) {
  if (!players || players.length < 2 || inningCount < 1) return [];

  // Build all unique pairings (round‑robin)
  const pairings = [];
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairings.push({ player1Id: players[i].id, player2Id: players[j].id });
    }
  }

  const matchups = [];
  for (let inning = 0; inning < inningCount; inning++) {
    const pairing = pairings[inning % pairings.length];
    const orderNumber = inning + 1;

    // Each inning has 2 machines: top (even index) and bottom (odd index)
    const topMachine = machines[inning * 2] || machines[0];
    const bottomMachine = machines[inning * 2 + 1] || machines[1] || topMachine;

    // Home player (player_order 1) on the top machine
    matchups.push({
      orderNumber,
      playerId: pairing.player1Id,
      playerOrder: 1,
      machineId: topMachine.machineId || topMachine.id,
    });

    // Away player (player_order 2) on the bottom machine
    matchups.push({
      orderNumber,
      playerId: pairing.player2Id,
      playerOrder: 2,
      machineId: bottomMachine.machineId || bottomMachine.id,
    });
  }

  return matchups;
}

/**
 * Resolve the inning role for a player on a specific machine.
 *
 * @param {number|string} playerId
 * @param {number|string} machineId
 * @param {Array} eventMatchups
 * @returns {{ matchup: object|null, isPitcher: boolean, opponentName: string, displayRoundNumber: string, role: 'pitcher'|'batter' }}
 */
export function resolveInningRole(playerId, machineId, eventMatchups) {
  const innings = flattenMatchupInnings(eventMatchups);
  const machineMatch = innings.find(
    (m) => Number(m.machineId ?? m.machine_id) === Number(machineId)
  );
  const inningOrderNumber = machineMatch
    ? Number(machineMatch.orderNumber ?? machineMatch.order_number)
    : null;

  const matchup = inningOrderNumber !== null
    ? innings.find(
        (m) =>
          Number(m.orderNumber ?? m.order_number) === inningOrderNumber &&
          Number(m.playerId ?? m.player_id) === Number(playerId)
      )
    : null;

  const sibling = inningOrderNumber !== null
    ? innings.find(
        (m) =>
          Number(m.orderNumber ?? m.order_number) === inningOrderNumber &&
          Number(m.playerId ?? m.player_id) !== Number(playerId)
      )
    : null;

  const topMatchup = innings.find(
    (m) =>
      Number(m.orderNumber ?? m.order_number) === inningOrderNumber &&
      Number(m.playerOrder ?? m.player_order) === 1
  );
  const isTop = topMatchup
    ? Number(topMatchup.machineId ?? topMatchup.machine_id) === Number(machineId)
    : true;
  const isHome = matchup ? Number(matchup.playerOrder ?? matchup.player_order) === 1 : true;
  const isPitcher = isHome ? isTop : !isTop;
  const opponentName = sibling ? (sibling.playerName ?? sibling.player_name) : '';
  const displayRoundNumber = matchup
    ? `${isTop ? 'Top' : 'Bottom'} of ${Number(matchup.orderNumber ?? matchup.order_number)}`
    : '';
  const role = isPitcher ? 'pitcher' : 'batter';
  return { matchup, isPitcher, opponentName, displayRoundNumber, role };
}
