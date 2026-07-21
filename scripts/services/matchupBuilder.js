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
export function resolveInningRole(playerId, roundIdentifier, eventMatchups) {
  const innings = flattenMatchupInnings(eventMatchups);
  if (!eventMatchups || eventMatchups.length === 0 || !innings || innings.length === 0) {
    return { matchup: null, isPitcher: true, opponentName: '', displayRoundNumber: '', role: 'pitcher' };
  }

  const targetMatchup = eventMatchups[0];

  let slot = innings.find((m) =>
    Number(m.machineId ?? m.machine_id) === Number(roundIdentifier)
  ) || innings.find((m) =>
    Number(m.orderNumber ?? m.order_number) === Number(roundIdentifier)
  );

  if (!slot) {
    return { matchup: null, isPitcher: true, opponentName: '', displayRoundNumber: '', role: 'pitcher' };
  }

  const p1Id = targetMatchup.player1Id ?? targetMatchup.player1_id;
  const p2Id = targetMatchup.player2Id ?? targetMatchup.player2_id;

  let isPlayer1 = false;
  let isPlayer2 = false;
  let opponentName = '';

  if (p1Id !== undefined && p2Id !== undefined) {
    isPlayer1 = Number(playerId) === Number(p1Id);
    isPlayer2 = Number(playerId) === Number(p2Id);
    const p1Name = targetMatchup.player1Name ?? targetMatchup.player1_name ?? 'Home';
    const p2Name = targetMatchup.player2Name ?? targetMatchup.player2_name ?? 'Away';
    opponentName = isPlayer1 ? p2Name : (isPlayer2 ? p1Name : '');
  } else {
    const orderNum = Number(slot.orderNumber ?? slot.order_number);
    const mySlot = innings.find(m =>
      (Number(m.orderNumber ?? m.order_number) === orderNum) &&
      Number(m.playerId ?? m.player_id) === Number(playerId)
    ) || slot;
    const oppSlot = innings.find(m =>
      (Number(m.orderNumber ?? m.order_number) === orderNum) &&
      Number(m.playerId ?? m.player_id) !== Number(playerId)
    );
    isPlayer1 = Number(mySlot.playerOrder ?? mySlot.player_order) === 1;
    isPlayer2 = Number(mySlot.playerOrder ?? mySlot.player_order) === 2;
    opponentName = oppSlot ? (oppSlot.playerName ?? oppSlot.player_name) : '';
  }

  const orderNumber = Number(slot.orderNumber ?? slot.order_number);
  let isTop = true;
  let inningNumber = orderNumber;

  if (slot.playerOrder !== undefined || slot.player_order !== undefined) {
    inningNumber = orderNumber;
    const topSlot = innings.find(m => Number(m.orderNumber ?? m.order_number) === orderNumber && Number(m.playerOrder ?? m.player_order) === 1);
    isTop = topSlot ? (Number(topSlot.machineId ?? topSlot.machine_id) === Number(roundIdentifier)) : true;
  } else {
    inningNumber = Math.ceil(orderNumber / 2);
    isTop = (orderNumber % 2 !== 0);
  }

  let isPitcher = false;
  if (isPlayer1) {
    isPitcher = isTop;
  } else if (isPlayer2) {
    isPitcher = !isTop;
  } else {
    isPitcher = isTop;
  }

  const displayRoundNumber = `${isTop ? 'Top' : 'Bottom'} of ${inningNumber}`;
  const role = isPitcher ? 'pitcher' : 'batter';

  return { matchup: slot, isPitcher, opponentName, displayRoundNumber, role };
}
