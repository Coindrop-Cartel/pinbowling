/**
 * Service for building and resolving baseball matchup data.
 *
 * The logic here is extracted from the original `BaseballEngine` so that the
 * engine can remain focused on scoring calculations.  UI and page layers can
 * import these helpers to generate matchup payloads and to resolve inning
 * roles.
 */

import { flattenMatchupEntries } from './normalizer.js';

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
    const topMachine = machines[inning * 2] || machines[0];
    const bottomMachine = machines[inning * 2 + 1] || machines[1] || topMachine;
    const topMachineId = topMachine.machineId || topMachine.id;
    const bottomMachineId = bottomMachine.machineId || bottomMachine.id;

    // Top half: Away team bats, Home team pitches
    for (let slot = 0; slot < awayTeamMembers.length; slot++) {
      const batterMember = awayTeamMembers[slot];
      const pitcherMember = homeTeamMembers[slot] || homeTeamMembers[0];
      matchups.push({
        orderNumber,
        playerId: batterMember.id,
        playerOrder: slot + 1,
        machineId: topMachineId,
        teamId: Number(matchupWrapper.player2Id ?? matchupWrapper.player2_id),
        isTop: true,
        slotIndex: slot,
        playerName: batterMember.playerName,
        opponentName: pitcherMember.playerName,
        opponentId: pitcherMember.id,
        opponentTeamId: Number(matchupWrapper.player1Id ?? matchupWrapper.player1_id),
      });
      orderNumber++;
    }

    // Bottom half: Home team bats, Away team pitches
    for (let slot = 0; slot < homeTeamMembers.length; slot++) {
      const batterMember = homeTeamMembers[slot];
      const pitcherMember = awayTeamMembers[slot] || awayTeamMembers[0];
      matchups.push({
        orderNumber,
        playerId: batterMember.id,
        playerOrder: slot + 1,
        machineId: bottomMachineId,
        teamId: Number(matchupWrapper.player1Id ?? matchupWrapper.player1_id),
        isTop: false,
        slotIndex: slot,
        playerName: batterMember.playerName,
        opponentName: pitcherMember.playerName,
        opponentId: pitcherMember.id,
        opponentTeamId: Number(matchupWrapper.player2Id ?? matchupWrapper.player2_id),
      });
      orderNumber++;
    }
  }

  return matchups;
}

/**
 * Resolve the inning role for a team member on a specific matchup entry.
 *
 * For team baseball, each event_matchup is a half-inning (via roundName like "Top 1").
 * Matchup entries have player_id (the batter assigned by rotation).
 *
 * @param {number|string} playerId The current player's ID.
 * @param {number|string} orderNumber The matchup entry's order number.
 * @param {Array} eventMatchups The event matchup wrappers.
 * @param {Object} [teamContext] Optional team context {allPlayersCache, activeLeague}.
 * @returns {{ matchup: object|null, isPitcher: boolean, opponentName: string, displayRoundNumber: string, role: 'pitcher'|'batter' }}
 */
export function resolveTeamMatchupRole(playerId, orderNumber, eventMatchups, teamContext) {
  const entries = flattenMatchupEntries(eventMatchups);
  if (!entries || entries.length === 0) {
    return { matchup: null, isPitcher: true, opponentName: '', displayRoundNumber: '', role: 'pitcher' };
  }

  const targetEntry = entries.find(m =>
    Number(m.orderNumber ?? m.order_number) === Number(orderNumber)
  );

  if (!targetEntry) {
    return { matchup: null, isPitcher: true, opponentName: '', displayRoundNumber: '', role: 'pitcher' };
  }

  // Get round info from the event_matchup wrapper (has roundName like "Top 1")
  const targetMatchup = eventMatchups.find(em => {
    const emId = Number(em.id ?? em.eventMatchupId ?? em.event_matchup_id);
    const entryEmId = Number(targetEntry.eventMatchupId ?? targetEntry.event_matchup_id);
    return emId === entryEmId;
  }) || eventMatchups[0];

  const roundName = targetMatchup?.roundName ?? targetMatchup?.round_name ?? '';
  const isTop = roundName.toLowerCase().startsWith('top');
  const displayRoundNumber = roundName || (isTop ? 'Top' : 'Bottom');

  // Check if the current player is the batter (entry's player_id matches)
  const entryPlayerId = Number(targetEntry.playerId ?? targetEntry.player_id ?? 0);
  const isBatter = entryPlayerId === Number(playerId);

  // Player is batter if their ID matches, otherwise they're on the pitching team
  const isPitcher = !isBatter;
  const opponentName = '';

  const role = isPitcher ? 'pitcher' : 'batter';

  return { matchup: targetEntry, isPitcher, opponentName, displayRoundNumber, role };
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
    // Home player (player_order 1) on the top machine
    matchups.push({
      orderNumber: inning * 2 + 1,
      playerId: pairing.player1Id,
      playerOrder: 1,
      machineId: topMachine.machineId || topMachine.id,
    });

    // Away player (player_order 2) on the bottom machine
    matchups.push({
      orderNumber: inning * 2 + 2,
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
export function resolveMatchupRole(playerId, roundIdentifier, eventMatchups) {
  const entries = flattenMatchupEntries(eventMatchups);
  if (!eventMatchups || eventMatchups.length === 0 || !entries || entries.length === 0) {
    return { matchup: null, isPitcher: true, opponentName: '', displayRoundNumber: '', role: 'pitcher' };
  }

  const targetMatchup = eventMatchups[0];

  let item = entries.find((m) =>
    Number(m.machineId ?? m.machine_id) === Number(roundIdentifier)
  ) || entries.find((m) =>
    Number(m.orderNumber ?? m.order_number) === Number(roundIdentifier)
  );

  if (!item) {
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
    const topSlot = entries.find(m => Number(m.orderNumber ?? m.order_number) === orderNumber && Number(m.playerOrder ?? m.player_order) === 1);
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

  return { matchup: item, isPitcher, opponentName, displayRoundNumber, role };
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
 * @param {string} [roundName] Optional round_name from event_matchups (e.g. "Top 1", "Bottom 2").
 * @returns {Array} Enriched entries with player info.
 */
export function enrichTeamMatchupEntries(entries, matchupWrapper, awayTeamMembers, homeTeamMembers, roundName) {
  if (!entries?.length) return entries;

  const homeTeamId = Number(matchupWrapper.player1Id ?? matchupWrapper.player1_id);
  const awayTeamId = Number(matchupWrapper.player2Id ?? matchupWrapper.player2_id);

  // Determine isTop from roundName if provided (e.g. "Top 1" → true, "Bottom 2" → false)
  let isTop = true;
  if (roundName) {
    isTop = roundName.toLowerCase().startsWith('top');
  }

  const battingTeamId = isTop ? awayTeamId : homeTeamId;
  const pitchingTeamId = isTop ? homeTeamId : awayTeamId;
  const battingMembers = isTop ? awayTeamMembers : homeTeamMembers;
  const pitchingMembers = isTop ? homeTeamMembers : awayTeamMembers;

  // Build lookup maps for player info
  const allMembers = [...battingMembers, ...pitchingMembers];
  const memberMap = {};
  allMembers.forEach(m => { memberMap[Number(m.id)] = m; });

  const enriched = entries.map((entry, idx) => {
    const batterId = Number(entry.playerId ?? entry.player_id ?? 0);
    const batterMember = memberMap[batterId] || battingMembers[idx] || battingMembers[0];
    const pitcherMember = pitchingMembers[idx] || pitchingMembers[0];

    return {
      ...entry,
      playerId: batterId,
      playerName: entry.playerName ?? entry.player_name ?? batterMember?.playerName ?? batterMember?.player_name ?? '',
      teamId: battingTeamId,
      isTop,
      slotIndex: idx,
      playerOrder: idx + 1,
      opponentTeamId: pitchingTeamId,
      opponentPlayerId: pitcherMember?.id ?? 0,
    };
  });

  return enriched;
}
