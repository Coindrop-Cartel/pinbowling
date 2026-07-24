import { describe, test, expect } from 'vitest';
import {
  buildRoundRobinMatchups,
  resolveMatchupRole,
  buildTeamRoundRobinMatchups,
  resolveTeamMatchupRole,
  enrichTeamMatchupEntries,
} from '@services/matchupBuilder.js';

// ── Shared Fixtures ──────────────────────────────────────────────────

const makeMachine = (id) => ({ machineId: id, id });
const makePlayer = (id, name) => ({ id, playerName: name });

const awayTeam = { id: 100, name: 'Team A' };
const homeTeam = { id: 200, name: 'Team B' };
const awayMembers = [makePlayer(1, 'Alice'), makePlayer(2, 'Bob')];
const homeMembers = [makePlayer(3, 'Charlie'), makePlayer(4, 'Dave')];

const makeMatchupWrapper = () => ({
  player1Id: homeTeam.id,
  player1Name: homeTeam.name,
  player2Id: awayTeam.id,
  player2Name: awayTeam.name,
});

// ── buildRoundRobinMatchups ───────────────────────────────────────────

describe('buildRoundRobinMatchups', () => {
  test('returns empty array when fewer than 2 players', () => {
    expect(buildRoundRobinMatchups([], 2, [makeMachine(1)])).toEqual([]);
    expect(buildRoundRobinMatchups([makePlayer(1, 'A')], 2, [makeMachine(1)])).toEqual([]);
  });

  test('returns empty array when inningCount < 1', () => {
    expect(buildRoundRobinMatchups([makePlayer(1, 'A'), makePlayer(2, 'B')], 0, [makeMachine(1)])).toEqual([]);
  });

  test('generates 2 entries per inning (top and bottom)', () => {
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildRoundRobinMatchups([makePlayer(1, 'A'), makePlayer(2, 'B')], 2, machines);
    expect(result).toHaveLength(4);
    expect(result[0].orderNumber).toBe(1);
    expect(result[1].orderNumber).toBe(2);
    expect(result[2].orderNumber).toBe(3);
    expect(result[3].orderNumber).toBe(4);
  });

  test('assigns correct machine IDs for top and bottom', () => {
    const machines = [makeMachine(10), makeMachine(11), makeMachine(12), makeMachine(13)];
    const result = buildRoundRobinMatchups([makePlayer(1, 'A'), makePlayer(2, 'B')], 2, machines);
    expect(result[0].machineId).toBe(10);
    expect(result[1].machineId).toBe(11);
    expect(result[2].machineId).toBe(12);
    expect(result[3].machineId).toBe(13);
  });

  test('cycles through pairings when innings exceed unique pairings', () => {
    const players = [makePlayer(1, 'A'), makePlayer(2, 'B'), makePlayer(3, 'C')];
    const machines = [makeMachine(10), makeMachine(11), makeMachine(12), makeMachine(13), makeMachine(14), makeMachine(15)];
    const result = buildRoundRobinMatchups(players, 4, machines);
    // 3 unique pairings, 4 innings -> inning 4 cycles back to pairing 0
    expect(result).toHaveLength(8);
    expect(result[0].playerId).toBe(result[6].playerId); // Same pairing cycles
  });

  test('assigns playerOrder 1 for home (top) and 2 for away (bottom)', () => {
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildRoundRobinMatchups([makePlayer(1, 'A'), makePlayer(2, 'B')], 1, machines);
    expect(result[0].playerOrder).toBe(1);
    expect(result[1].playerOrder).toBe(2);
  });
});

// ── resolveMatchupRole ───────────────────────────────────────────────

describe('resolveMatchupRole', () => {
  test('returns default when no matchups', () => {
    const result = resolveMatchupRole(1, 10, []);
    expect(result.matchup).toBeNull();
    expect(result.isPitcher).toBe(true);
    expect(result.role).toBe('pitcher');
  });

  test('resolves Player 1 as pitcher on top machine', () => {
    const eventMatchups = [{
      player1Id: 1, player1Name: 'Alice',
      player2Id: 2, player2Name: 'Bob',
      entries: [
        { orderNumber: 1, machineId: 10, playerOrder: 1 },
        { orderNumber: 2, machineId: 11, playerOrder: 2 },
      ]
    }];
    const result = resolveMatchupRole(1, 10, eventMatchups);
    expect(result.isPitcher).toBe(true);
    expect(result.opponentName).toBe('Bob');
    expect(result.role).toBe('pitcher');
  });

  test('resolves Player 2 as batter on bottom machine', () => {
    const eventMatchups = [{
      player1Id: 1, player1Name: 'Alice',
      player2Id: 2, player2Name: 'Bob',
      entries: [
        { orderNumber: 1, machineId: 10, playerOrder: 1 },
        { orderNumber: 2, machineId: 11, playerOrder: 2 },
      ]
    }];
    const result = resolveMatchupRole(2, 11, eventMatchups);
    expect(result.isPitcher).toBe(false);
    expect(result.opponentName).toBe('Alice');
    expect(result.role).toBe('batter');
  });

  test('returns empty when no matching entry found', () => {
    const eventMatchups = [{
      player1Id: 1, player1Name: 'Alice',
      player2Id: 2, player2Name: 'Bob',
      entries: [{ orderNumber: 1, machineId: 10 }]
    }];
    const result = resolveMatchupRole(1, 999, eventMatchups);
    expect(result.matchup).toBeNull();
  });
});

// ── buildTeamRoundRobinMatchups ──────────────────────────────────────

describe('buildTeamRoundRobinMatchups', () => {
  test('returns empty array when teams are missing', () => {
    expect(buildTeamRoundRobinMatchups(makeMatchupWrapper(), [], homeMembers, 2, [makeMachine(1), makeMachine(2)])).toEqual([]);
    expect(buildTeamRoundRobinMatchups(makeMatchupWrapper(), awayMembers, [], 2, [makeMachine(1), makeMachine(2)])).toEqual([]);
  });

  test('returns empty array when inningCount < 1', () => {
    expect(buildTeamRoundRobinMatchups(makeMatchupWrapper(), awayMembers, homeMembers, 0, [makeMachine(1)])).toEqual([]);
  });

  test('generates 4 entries per inning (2 per half-inning)', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    expect(result).toHaveLength(4);
  });

  test('generates correct total for multiple innings', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11), makeMachine(12), makeMachine(13)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 2, machines);
    expect(result).toHaveLength(8);
  });

  test('top half entries use the same machine', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    const topEntries = result.filter(e => e.isTop);
    expect(topEntries).toHaveLength(2);
    expect(topEntries[0].machineId).toBe(10);
    expect(topEntries[1].machineId).toBe(10);
  });

  test('bottom half entries use the same machine', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    const bottomEntries = result.filter(e => !e.isTop);
    expect(bottomEntries).toHaveLength(2);
    expect(bottomEntries[0].machineId).toBe(11);
    expect(bottomEntries[1].machineId).toBe(11);
  });

  test('top half: away team members are batters, home team members are pitchers', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    const topEntries = result.filter(e => e.isTop);

    expect(topEntries[0].playerId).toBe(1); // Alice (away) batter
    expect(topEntries[0].opponentId).toBe(3); // Charlie (home) pitcher
    expect(topEntries[0].playerName).toBe('Alice');
    expect(topEntries[0].opponentName).toBe('Charlie');

    expect(topEntries[1].playerId).toBe(2); // Bob (away) batter
    expect(topEntries[1].opponentId).toBe(4); // Dave (home) pitcher
    expect(topEntries[1].playerName).toBe('Bob');
    expect(topEntries[1].opponentName).toBe('Dave');
  });

  test('bottom half: home team members are batters, away team members are pitchers', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    const bottomEntries = result.filter(e => !e.isTop);

    expect(bottomEntries[0].playerId).toBe(3); // Charlie (home) batter
    expect(bottomEntries[0].opponentId).toBe(1); // Alice (away) pitcher
    expect(bottomEntries[0].playerName).toBe('Charlie');
    expect(bottomEntries[0].opponentName).toBe('Alice');

    expect(bottomEntries[1].playerId).toBe(4); // Dave (home) batter
    expect(bottomEntries[1].opponentId).toBe(2); // Bob (away) pitcher
    expect(bottomEntries[1].playerName).toBe('Dave');
    expect(bottomEntries[1].opponentName).toBe('Bob');
  });

  test('team IDs are set correctly', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);

    // Top half: away team bats
    expect(result[0].teamId).toBe(awayTeam.id);
    expect(result[0].opponentTeamId).toBe(homeTeam.id);
    // Bottom half: home team bats
    expect(result[2].teamId).toBe(homeTeam.id);
    expect(result[2].opponentTeamId).toBe(awayTeam.id);
  });

  test('orderNumbers are sequential starting from 1', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    expect(result.map(e => e.orderNumber)).toEqual([1, 2, 3, 4]);
  });

  test('handles uneven team sizes (3 vs 2)', () => {
    const wrapper = makeMatchupWrapper();
    const bigAway = [makePlayer(1, 'Alice'), makePlayer(2, 'Bob'), makePlayer(5, 'Eve')];
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, bigAway, homeMembers, 1, machines);
    // 3 away members -> 3 top entries; 2 home members -> 2 bottom entries
    expect(result).toHaveLength(5);
    expect(result.filter(e => e.isTop)).toHaveLength(3);
    expect(result.filter(e => !e.isTop)).toHaveLength(2);
  });

  test('falls back to first member when slot exceeds team size', () => {
    const wrapper = makeMatchupWrapper();
    const smallAway = [makePlayer(1, 'Alice')];
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, smallAway, homeMembers, 1, machines);
    const topEntries = result.filter(e => e.isTop);
    // Only 1 away member -> 1 top entry, opponent should be home member 0 (Charlie)
    expect(topEntries).toHaveLength(1);
    expect(topEntries[0].opponentId).toBe(3);
  });

  test('uses snake_case field names from matchupWrapper', () => {
    const wrapper = { player1_id: homeTeam.id, player1_name: homeTeam.name, player2_id: awayTeam.id, player2_name: awayTeam.name };
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    expect(result[0].teamId).toBe(awayTeam.id);
    expect(result[0].opponentTeamId).toBe(homeTeam.id);
  });
});

// ── resolveTeamMatchupRole ───────────────────────────────────────────

describe('resolveTeamMatchupRole', () => {
  test('returns default when no entries', () => {
    const result = resolveTeamMatchupRole(1, 1, []);
    expect(result.matchup).toBeNull();
    expect(result.isPitcher).toBe(true);
    expect(result.role).toBe('pitcher');
  });

  test('returns default when orderNumber not found', () => {
    const eventMatchups = [{
      player1Id: homeTeam.id,
      player2Id: awayTeam.id,
      entries: [{ orderNumber: 1, machineId: 10, playerId: 1, teamId: awayTeam.id, isTop: true }]
    }];
    const result = resolveTeamMatchupRole(1, 999, eventMatchups);
    expect(result.matchup).toBeNull();
  });

  test('resolves batter role when playerId matches entry', () => {
    const eventMatchups = [{
      id: 1,
      player1Id: homeTeam.id,
      player2Id: awayTeam.id,
      roundName: 'Top 1',
      entries: [
        { orderNumber: 1, machineId: 10, playerId: 1, teamId: awayTeam.id, playerName: 'Alice' },
        { orderNumber: 2, machineId: 10, playerId: 2, teamId: awayTeam.id, playerName: 'Bob' },
        { orderNumber: 3, machineId: 11, playerId: 3, teamId: homeTeam.id, playerName: 'Charlie' },
        { orderNumber: 4, machineId: 11, playerId: 4, teamId: homeTeam.id, playerName: 'Dave' },
      ]
    }];

    const result = resolveTeamMatchupRole(1, 1, eventMatchups);
    expect(result.isPitcher).toBe(false);
    expect(result.role).toBe('batter');
    expect(result.opponentName).toBe('');
    expect(result.displayRoundNumber).toBe('Top 1');
  });

  test('resolves pitcher role when player is not the batter', () => {
    const eventMatchups = [{
      id: 1,
      player1Id: homeTeam.id,
      player2Id: awayTeam.id,
      roundName: 'Top 1',
      entries: [
        { orderNumber: 1, machineId: 10, playerId: 1, teamId: awayTeam.id, playerName: 'Alice' },
      ]
    }];

    // Player 3 (Charlie) is not the batter in entry 1
    const result = resolveTeamMatchupRole(3, 1, eventMatchups);
    expect(result.isPitcher).toBe(true);
    expect(result.role).toBe('pitcher');
    expect(result.opponentName).toBe('');
  });

  test('correctly determines round name from event matchup', () => {
    const eventMatchups = [
      {
        id: 1,
        player1Id: homeTeam.id,
        player2Id: awayTeam.id,
        roundName: 'Top 1',
        entries: [
          { orderNumber: 1, machineId: 10, playerId: 1, teamId: awayTeam.id, eventMatchupId: 1 },
          { orderNumber: 2, machineId: 10, playerId: 2, teamId: awayTeam.id, eventMatchupId: 1 },
        ]
      },
      {
        id: 2,
        player1Id: homeTeam.id,
        player2Id: awayTeam.id,
        roundName: 'Bottom 1',
        entries: [
          { orderNumber: 3, machineId: 11, playerId: 3, teamId: homeTeam.id, eventMatchupId: 2 },
          { orderNumber: 4, machineId: 11, playerId: 4, teamId: homeTeam.id, eventMatchupId: 2 },
        ]
      },
      {
        id: 3,
        player1Id: homeTeam.id,
        player2Id: awayTeam.id,
        roundName: 'Top 2',
        entries: [
          { orderNumber: 5, machineId: 12, playerId: 1, teamId: awayTeam.id, eventMatchupId: 3 },
          { orderNumber: 6, machineId: 12, playerId: 2, teamId: awayTeam.id, eventMatchupId: 3 },
        ]
      },
      {
        id: 4,
        player1Id: homeTeam.id,
        player2Id: awayTeam.id,
        roundName: 'Bottom 2',
        entries: [
          { orderNumber: 7, machineId: 13, playerId: 3, teamId: homeTeam.id, eventMatchupId: 4 },
          { orderNumber: 8, machineId: 13, playerId: 4, teamId: homeTeam.id, eventMatchupId: 4 },
        ]
      },
    ];

    const result1 = resolveTeamMatchupRole(1, 1, eventMatchups);
    expect(result1.displayRoundNumber).toBe('Top 1');

    const result3 = resolveTeamMatchupRole(3, 3, eventMatchups);
    expect(result3.displayRoundNumber).toBe('Bottom 1');

    const result5 = resolveTeamMatchupRole(1, 5, eventMatchups);
    expect(result5.displayRoundNumber).toBe('Top 2');
  });
});

// ── enrichTeamMatchupEntries ─────────────────────────────────────────

describe('enrichTeamMatchupEntries', () => {
  // Server entries now include player_id/player_name (batter assigned by rotation)
  const serverEntries = [
    { order_number: 1, machine_id: 10, player_id: 1, player_name: 'Alice' },
    { order_number: 2, machine_id: 10, player_id: 2, player_name: 'Bob' },
    { order_number: 3, machine_id: 11, player_id: 3, player_name: 'Charlie' },
    { order_number: 4, machine_id: 11, player_id: 4, player_name: 'Dave' },
  ];

  test('returns original entries when entries are empty', () => {
    expect(enrichTeamMatchupEntries([], makeMatchupWrapper(), awayMembers, homeMembers)).toEqual([]);
  });

  test('enriches entries with derived fields', () => {
    const wrapper = makeMatchupWrapper();
    const result = enrichTeamMatchupEntries(serverEntries, wrapper, awayMembers, homeMembers, 'Top 1');
    expect(result).toHaveLength(4);
    expect(result[0].playerId).toBeDefined();
    expect(result[0].playerName).toBeDefined();
    expect(result[0].teamId).toBeDefined();
    expect(result[0].isTop).toBeDefined();
    expect(result[0].opponentTeamId).toBeDefined();
  });

  test('top half: all entries have batting team id and isTop=true', () => {
    const wrapper = makeMatchupWrapper();
    const result = enrichTeamMatchupEntries(serverEntries, wrapper, awayMembers, homeMembers, 'Top 1');
    const topEntries = result.filter(e => e.isTop);
    expect(topEntries).toHaveLength(4); // All entries are top half
    expect(topEntries[0].playerId).toBe(1); // Alice
    expect(topEntries[0].playerName).toBe('Alice');
    expect(topEntries[0].teamId).toBe(awayTeam.id); // Batting team
    expect(topEntries[0].opponentTeamId).toBe(homeTeam.id); // Pitching team
  });

  test('bottom half: all entries have home team id and isTop=false', () => {
    const wrapper = makeMatchupWrapper();
    const bottomEntries = [
      { order_number: 1, machine_id: 10, player_id: 3, player_name: 'Charlie' },
      { order_number: 2, machine_id: 10, player_id: 4, player_name: 'Dave' },
      { order_number: 3, machine_id: 11, player_id: 3, player_name: 'Charlie' },
      { order_number: 4, machine_id: 11, player_id: 4, player_name: 'Dave' },
    ];
    const result = enrichTeamMatchupEntries(bottomEntries, wrapper, awayMembers, homeMembers, 'Bottom 1');
    const bottom = result.filter(e => !e.isTop);
    expect(bottom).toHaveLength(4);
    expect(bottom[0].playerId).toBe(3); // Charlie
    expect(bottom[0].playerName).toBe('Charlie');
    expect(bottom[0].teamId).toBe(homeTeam.id); // Batting team
    expect(bottom[0].opponentTeamId).toBe(awayTeam.id); // Pitching team
  });

  test('preserves original entry properties', () => {
    const wrapper = makeMatchupWrapper();
    const entriesWithExtras = [
      { order_number: 1, machine_id: 10, player_id: 1, player_name: 'Alice', id: 42, event_matchup_id: 5 },
      { order_number: 2, machine_id: 10, player_id: 2, player_name: 'Bob', id: 43, event_matchup_id: 5 },
    ];
    const result = enrichTeamMatchupEntries(entriesWithExtras, wrapper, awayMembers, homeMembers, 'Top 1');
    expect(result[0].id).toBe(42);
    expect(result[0].event_matchup_id).toBe(5);
  });

  test('handles camelCase field names in entries', () => {
    const wrapper = makeMatchupWrapper();
    const camelEntries = [
      { orderNumber: 1, machineId: 10, playerId: 1, playerName: 'Alice' },
      { orderNumber: 2, machineId: 10, playerId: 2, playerName: 'Bob' },
    ];
    const result = enrichTeamMatchupEntries(camelEntries, wrapper, awayMembers, homeMembers, 'Top 1');
    expect(result).toHaveLength(2);
    expect(result[0].playerId).toBe(1);
  });

  test('assigns sequential playerOrder values', () => {
    const wrapper = makeMatchupWrapper();
    const result = enrichTeamMatchupEntries(serverEntries, wrapper, awayMembers, homeMembers, 'Top 1');
    expect(result[0].playerOrder).toBe(1);
    expect(result[1].playerOrder).toBe(2);
    expect(result[2].playerOrder).toBe(3);
    expect(result[3].playerOrder).toBe(4);
  });

  test('defaults isTop to true when roundName is not provided', () => {
    const wrapper = makeMatchupWrapper();
    const result = enrichTeamMatchupEntries(serverEntries, wrapper, awayMembers, homeMembers);
    expect(result[0].isTop).toBe(true);
  });
});
