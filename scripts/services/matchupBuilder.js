/**
 * Service for building and resolving baseball matchup data.
 *
 * The logic here is extracted from the original `BaseballEngine` so that the
 * engine can remain focused on scoring calculations.  UI and page layers can
 * import these helpers to generate matchup payloads and to resolve inning
 * roles.
 */

import { flattenMatchupEntries } from './normalizer.js';
import { resolvePlayersForMatchupParticipant } from './playerSelector.js';

/**
 * Build team round-robin matchup entries for team baseball.
 *
 * Each inning has 4 matchup entries (2 per half-inning):
 *   Top half (Away team bats): all matchups on the same machine
 *     Slot 0: Away member 1 (batter) vs Home member 1 (pitcher)
 *     Slot 1: Away member 2 (batter) vs Home member 2 (pitcher)
 *   Bottom half (Home team bats): all matchups on the same machine
 *     Slot 0: Home member 1 (batter) vs Away member 1 (pitcher)
 *     Slot 1: Home member 2 (batter) vs Away member 2 (pitcher)
 *
 * @param {Object} matchupWrapper The event_matchups record with player1Id (home team), player2Id (away team).
 * @param {Object[]} awayTeamMembers Members of the away team [{id, playerName}].
 * @param {Object[]} homeTeamMembers Members of the home team [{id, playerName}].
 * @param {number} inningCount Number of innings.
 * @param {Array<{machineId: number}>} machines Array of machine objects (2 per inning).
 * @returns {Array<{orderNumber: number, playerId: number, playerOrder: number, machineId: number, teamId: number, isTop: boolean, slotIndex: number}>}
 */
export function buildTeamRoundRobinMatchups(matchupWrapper, awayTeamMembers, homeTeamMembers, inningCount, machines) {
  if (!awayTeamMembers?.length || !homeTeamMembers?.length || inningCount < 1) return [];

  const matchups = [];
  let orderNumber = 1;

  for (let inning = 0; inning < inningCount; inning++) {
    // Each half-inning uses exactly 1 machine.
    // Batter rotation (Ball 1 → Batter 1, Ball 2 → Batter 2, Ball 3 → Batter 1 …)
    // is handled at scoring time by the batting order — not by creating separate rows per batter.
    const topMachine = machines[inning] || machines[inning % machines.length] || machines[0];
    const bottomMachine = machines[(inningCount + inning) % machines.length] || machines[0];
    const topMachineId = topMachine.machineId || topMachine.id;
    const bottomMachineId = bottomMachine.machineId || bottomMachine.id;

    // Top half: Away team bats, Home team pitches — 1 matchup row for the whole half-inning
    matchups.push({
      orderNumber,
      playerId: awayTeamMembers[0].id,   // lead-off batter (Ball 1)
      player1Id: Number(matchupWrapper.team1Id),  // home (pitching team)
      player2Id: Number(matchupWrapper.team2Id),  // away (batting team)
      playerOrder: 1,
      machineId: topMachineId,
      teamId: Number(matchupWrapper.team2Id),
      isTop: true,
      inning: inning + 1,
      roundName: `Top ${inning + 1}`,
      playerName: awayTeamMembers[0].playerName,
      opponentTeamId: Number(matchupWrapper.team1Id),
    });
    orderNumber++;

    // Bottom half: Home team bats, Away team pitches — 1 matchup row for the whole half-inning
    matchups.push({
      orderNumber,
      playerId: homeTeamMembers[0].id,   // lead-off batter (Ball 1)
      player1Id: Number(matchupWrapper.team1Id),  // home (batting team)
      player2Id: Number(matchupWrapper.team2Id),  // away (pitching team)
      playerOrder: 1,
      machineId: bottomMachineId,
      teamId: Number(matchupWrapper.team1Id),
      isTop: false,
      inning: inning + 1,
      roundName: `Bottom ${inning + 1}`,
      playerName: homeTeamMembers[0].playerName,
      opponentTeamId: Number(matchupWrapper.team2Id),
    });
    orderNumber++;
  }

  return matchups;
}

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

    // Each inning has 2 machines: top (even index) and bottom (odd index)
    const topMachine = machines[inning * 2] || machines[0];
    const bottomMachine = machines[inning * 2 + 1] || machines[1] || topMachine;

    // Each half-inning gets a unique order_number (1, 2, 3, 4, …) so that
    // two rows per inning don't collide on the (event_matchup_id, order_number) UNIQUE key.
    // Home player (player_order 1) pitches on top machine, away player (player_order 2) bats
    matchups.push({
      orderNumber: inning * 2 + 1,
      playerId: pairing.player1Id,
      player1Id: pairing.player1Id,
      player2Id: pairing.player2Id,
      playerOrder: 1,
      machineId: topMachine.machineId || topMachine.id,
    });

    // Away player (player_order 2) pitches on bottom machine, home player (player_order 1) bats
    matchups.push({
      orderNumber: inning * 2 + 2,
      playerId: pairing.player2Id,
      player1Id: pairing.player2Id,
      player2Id: pairing.player1Id,
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
 * @returns {{ matchup: object|null, isPlayer1: boolean, isTop: boolean, opponentName: string, displayRoundNumber: string }}
 */
export function resolveMatchupRole(playerId, roundIdentifier, eventMatchups, teamContext = {}) {
  const entries = flattenMatchupEntries(eventMatchups);
  if (!eventMatchups || eventMatchups.length === 0 || !entries || entries.length === 0) {
    return { matchup: null, isPlayer1: true, isTop: true, opponentName: '', displayRoundNumber: '' };
  }

  const targetMatchup = eventMatchups[0];

  let item = entries.find((m) =>
    Number(m.machineId ?? m.machine_id) === Number(roundIdentifier)
  ) || entries.find((m) =>
    Number(m.orderNumber ?? m.order_number) === Number(roundIdentifier)
  );

  if (!item) {
    return { matchup: null, isPlayer1: true, isTop: true, opponentName: '', displayRoundNumber: '' };
  }

  const p1Id = targetMatchup.player1Id;
  const p2Id = targetMatchup.player2Id;

  let isPlayer1 = false;
  let isPlayer2 = false;
  let opponentName = '';

  const { allPlayersCache = [], activeLeague } = teamContext;
  const leagues = activeLeague ? [activeLeague] : [];
  const isTeamMode = activeLeague?.participationType === 'team' || (targetMatchup.team1Id !== undefined && targetMatchup.team1Id !== null);

  const p1Players = resolvePlayersForMatchupParticipant(p1Id, targetMatchup.player1Name, allPlayersCache, leagues, isTeamMode);
  const p2Players = resolvePlayersForMatchupParticipant(p2Id, targetMatchup.player2Name, allPlayersCache, leagues, isTeamMode);

  const isInP1 = p1Players.some(p => String(p.id) === String(playerId)) || String(playerId) === String(p1Id);
  const isInP2 = p2Players.some(p => String(p.id) === String(playerId)) || String(playerId) === String(p2Id);

  if (isInP1 || isInP2) {
    isPlayer1 = isInP1;
    isPlayer2 = isInP2;
    const p1Name = p1Players[0]?.playerName || targetMatchup.player1Name || targetMatchup.player1_name || 'Home';
    const p2Name = p2Players[0]?.playerName || targetMatchup.player2Name || targetMatchup.player2_name || 'Away';
    opponentName = isPlayer1 ? p2Name : (isPlayer2 ? p1Name : '');
  } else {
    const orderNum = Number(item.orderNumber ?? item.order_number);
    const mySlot = entries.find(m =>
      (Number(m.orderNumber ?? m.order_number) === orderNum) &&
      Number(m.playerId ?? m.player_id) === Number(playerId)
    ) || item;
    const oppSlot = entries.find(m =>
      (Number(m.orderNumber ?? m.order_number) === orderNum) &&
      Number(m.playerId ?? m.player_id) !== Number(playerId)
    );
    isPlayer1 = Number(mySlot.playerOrder ?? mySlot.player_order) === 1;
    isPlayer2 = Number(mySlot.playerOrder ?? mySlot.player_order) === 2;
    opponentName = oppSlot ? (oppSlot.playerName ?? oppSlot.player_name) : '';
  }

  const orderNumber = Number(item.orderNumber ?? item.order_number);
  let isTop = true;
  let inningNumber = orderNumber;

  if (item.playerOrder !== undefined || item.player_order !== undefined) {
    inningNumber = orderNumber;
    const pOrder = Number(item.playerOrder ?? item.player_order);
    isTop = (pOrder === 1);
  } else {
    inningNumber = Math.ceil(orderNumber / 2);
    isTop = (orderNumber % 2 !== 0);
  }

  const displayRoundNumber = `${isTop ? 'Top' : 'Bottom'} of ${inningNumber}`;

  return { matchup: item, isPlayer1, isTop, opponentName, displayRoundNumber };
}



/**
 * Resolve the inning role for a team member on a specific matchup entry.
 *
 * @param {number|string} playerId The current player's ID.
 * @param {number|string} orderNumber The matchup entry's order number.
 * @param {Array} eventMatchups The event matchup wrappers.
 * @param {Object} [teamContext] Optional team context {allPlayersCache, activeLeague}.
 * @returns {{ matchup: object|null, isPlayer1: boolean, isTop: boolean, opponentName: string, displayRoundNumber: string }}
 */
export function resolveTeamMatchupRole(playerId, orderNumber, eventMatchups, teamContext) {
  const entries = flattenMatchupEntries(eventMatchups);
  if (!entries || entries.length === 0) {
    return { matchup: null, isPlayer1: true, isTop: true, opponentName: '', displayRoundNumber: '' };
  }

  const targetEntry = entries.find(m =>
    Number(m.orderNumber ?? m.order_number) === Number(orderNumber)
  ) || entries[Number(orderNumber) - 1] || null;

  if (!targetEntry) {
    return { matchup: null, isPlayer1: true, isTop: true, opponentName: '', displayRoundNumber: '' };
  }

  const targetMatchup = eventMatchups.find(em => {
    const emId = Number(em.id ?? em.eventMatchupId ?? em.event_matchup_id);
    const entryEmId = Number(targetEntry.eventMatchupId ?? targetEntry.event_matchup_id);
    return emId === entryEmId;
  }) || eventMatchups[0];

  const isTop = (Number(orderNumber) % 2 !== 0);
  const inningNumber = Math.ceil(Number(orderNumber) / 2);
  const displayRoundNumber = `${isTop ? 'Top' : 'Bottom'} ${inningNumber}`;

  const homeTeamId = Number(targetMatchup?.team1Id ?? 0);
  const selectedTeamId = Number(playerId);
  const isPlayer1 = selectedTeamId === homeTeamId;
  const opponentName = '';

  return { matchup: targetEntry, isPlayer1, isTop, opponentName, displayRoundNumber };
}

/**
 * Enrich server-created matchup entries with player info for team baseball.
 *
 * Server-created entries now include player_id and player_name (the batter
 * assigned by the rotation). This function adds derived fields like isTop,
 * teamId, opponentId, and opponentName based on the half-inning context.
 *
 * @param {Array} entries Raw matchup entries from the server (with player_id, player_name).
 * @param {Object} matchupWrapper The event_matchups record with player1Id (home team), player2Id (away team).
 * @param {Object[]} awayTeamMembers Members of the away team [{id, playerName}].
 * @param {Object[]} homeTeamMembers Members of the home team [{id, playerName}].
 * @returns {Array} Enriched entries with player info.
 */
export function enrichTeamMatchupEntries(entries, matchupWrapper, awayTeamMembers, homeTeamMembers, roundName) {
  if (!entries?.length) return entries;

  const wrapperHomeTeamId = Number(matchupWrapper.team1Id);
  const wrapperAwayTeamId = Number(matchupWrapper.team2Id);

  const allMembersMap = {};
  awayTeamMembers.forEach(m => { allMembersMap[Number(m.id)] = m; });
  homeTeamMembers.forEach(m => { allMembersMap[Number(m.id)] = m; });

  const halfMatch = roundName?.match(/^(Top|Bottom)\s+\d+$/i);
  const derivedIsTop = halfMatch ? halfMatch[1] === 'Top' : undefined;

  const enriched = entries.map((entry, idx) => {
    const orderNum = Number(entry.orderNumber ?? entry.order_number ?? (idx + 1));
    const entryTeam1Id = Number(entry.team1Id ?? entry.team1_id ?? 0);
    const isTop = derivedIsTop ?? (entryTeam1Id === wrapperHomeTeamId ? true : (entryTeam1Id === wrapperAwayTeamId ? false : orderNum % 2 === 1));

    const entryTeam2Id = Number(entry.team2Id ?? entry.team2_id ?? 0);

    const pitchingTeamId = entryTeam1Id;
    const battingTeamId = entryTeam2Id;
    const battingMembers = battingTeamId === wrapperAwayTeamId ? awayTeamMembers : homeTeamMembers;
    const pitchingMembers = pitchingTeamId === wrapperHomeTeamId ? homeTeamMembers : awayTeamMembers;

    const batterId = Number(entry.playerId ?? entry.player_id ?? 0);
    const batterMember = allMembersMap[batterId] || battingMembers[idx] || battingMembers[0];
    const pitcherMember = pitchingMembers[idx] || pitchingMembers[0];

    return {
      ...entry,
      playerId: batterId,
      playerName: entry.playerName ?? entry.player_name ?? batterMember?.playerName ?? '',
      teamId: battingTeamId,
      isTop,
      slotIndex: idx,
      playerOrder: orderNum,
      opponentTeamId: pitchingTeamId,
      opponentPlayerId: pitcherMember?.id ?? 0,
    };
  });

  return enriched;
}

/**
 * Resolves the player for a specific ball index from a team's rotation sequence.
 *
 * @param {Array<{id: number, playerName: string}>} rotationSequence Ordered list of team players.
 * @param {number} ballIndex 0-indexed ball number (0 = Ball 1, 1 = Ball 2, etc.).
 * @returns {{ id: number, playerName: string }} Player object for the given ball.
 */
export function resolvePlayerForBall(rotationSequence = [], ballIndex = 0) {
  if (!rotationSequence || rotationSequence.length === 0) {
    return { id: 0, playerName: 'Unassigned Player' };
  }
  const idx = Math.abs(ballIndex) % rotationSequence.length;
  return rotationSequence[idx];
}

/**
 * Validates that role assignments are equally distributed across team members.
 *
 * @param {Array<{id: number, playerName: string}>} members Team members.
 * @param {Object<string|number, number>} roleAssignments Map of `{ [machineOrder/round]: playerId }`.
 * @returns {{ valid: boolean, counts: Object<number, number>, minCount: number, maxCount: number, message: string }}
 */
export function validateRoleWorkload(members = [], roleAssignments = {}, roleName = 'Pitching') {
  if (!members || members.length === 0) {
    return { valid: true, counts: {}, minCount: 0, maxCount: 0, message: '' };
  }

  const counts = {};
  members.forEach(m => { counts[Number(m.id)] = 0; });

  const assignedValues = Object.values(roleAssignments).map(v => Number(v)).filter(v => Boolean(v));
  assignedValues.forEach(pId => {
    if (counts[pId] !== undefined) {
      counts[pId]++;
    }
  });

  const countList = Object.values(counts);
  const minCount = countList.length > 0 ? Math.min(...countList) : 0;
  const maxCount = countList.length > 0 ? Math.max(...countList) : 0;
  const diff = maxCount - minCount;

  const valid = diff <= 1;
  let message = '';
  if (!valid) {
    message = `${roleName} workload is uneven! Max assigned: ${maxCount}, Min assigned: ${minCount}. Please balance assignments across team members.`;
  }

  return { valid, counts, minCount, maxCount, message };
}

/** Alias for validateRoleWorkload */
export const validatePitcherWorkload = validateRoleWorkload;
