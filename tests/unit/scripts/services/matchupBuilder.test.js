import { describe, test, expect } from 'vitest';
import {
  buildRoundRobinMatchups,
  resolveMatchupRole,
  buildTeamRoundRobinMatchups,
  resolveTeamMatchupRole,
  enrichTeamMatchupEntries,
  validatePitcherWorkload,
  resolvePlayerForBall,
} from '@services/matchupBuilder.js';

// ── Shared Fixtures ──────────────────────────────────────────────────

const makeMachine = (id) => ({ machineId: id, id });
const makePlayer = (id, name) => ({ id, playerName: name });

const awayTeam = { id: 100, name: 'Team A' };
const homeTeam = { id: 200, name: 'Team B' };
const awayMembers = [makePlayer(1, 'Alice'), makePlayer(2, 'Bob')];
const homeMembers = [makePlayer(3, 'Charlie'), makePlayer(4, 'Dave')];

const makeMatchupWrapper = () => ({
  team1Id: homeTeam.id,
  team1Name: homeTeam.name,
  team2Id: awayTeam.id,
  team2Name: awayTeam.name,
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
    expect(result.isPlayer1).toBe(true);
  });

  test('resolves Player 1 identity on top machine', () => {
    const eventMatchups = [{
      player1Id: 1, player1Name: 'Alice',
      player2Id: 2, player2Name: 'Bob',
      entries: [
        { orderNumber: 1, machineId: 10, playerOrder: 1 },
        { orderNumber: 2, machineId: 11, playerOrder: 2 },
      ]
    }];
    const result = resolveMatchupRole(1, 10, eventMatchups);
    expect(result.isPlayer1).toBe(true);
    expect(result.opponentName).toBe('Bob');
  });

  test('resolves Player 2 identity on bottom machine', () => {
    const eventMatchups = [{
      player1Id: 1, player1Name: 'Alice',
      player2Id: 2, player2Name: 'Bob',
      entries: [
        { orderNumber: 1, machineId: 10, playerOrder: 1 },
        { orderNumber: 2, machineId: 11, playerOrder: 2 },
      ]
    }];
    const result = resolveMatchupRole(2, 11, eventMatchups);
    expect(result.isPlayer1).toBe(false);
    expect(result.opponentName).toBe('Alice');
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

  test('generates 2 matchups per inning (1 per half-inning)', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    // 1 inning × 2 halves = 2 total (NOT one row per team member)
    expect(result).toHaveLength(2);
  });

  test('generates correct total for multiple innings', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11), makeMachine(12), makeMachine(13)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 2, machines);
    // 2 innings × 2 halves = 4 total
    expect(result).toHaveLength(4);
  });

  test('top half uses 1 machine for the whole half-inning', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    const topEntries = result.filter(e => e.isTop);
    // Exactly 1 matchup row for Top — batter rotation handled at scoring time
    expect(topEntries).toHaveLength(1);
    expect(topEntries[0].machineId).toBe(10);
  });

  test('bottom half uses 1 machine for the whole half-inning', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    const bottomEntries = result.filter(e => !e.isTop);
    // Exactly 1 matchup row for Bottom — batter rotation handled at scoring time
    expect(bottomEntries).toHaveLength(1);
    expect(bottomEntries[0].machineId).toBe(11);
  });

  test('top half: lead-off away batter and team IDs are set', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    const top = result.find(e => e.isTop);

    // Lead-off batter is away[0] = Alice; batter rotation continues at scoring time
    expect(top.playerId).toBe(1); // Alice (away lead-off)
    expect(top.playerName).toBe('Alice');
    // Team IDs reference the team objects, not individual players
    expect(top.teamId).toBe(awayTeam.id);
    expect(top.opponentTeamId).toBe(homeTeam.id);
    expect(top.player1Id).toBe(homeTeam.id); // home = pitching team
    expect(top.player2Id).toBe(awayTeam.id); // away = batting team
  });

  test('bottom half: lead-off home batter and team IDs are set', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    const bottom = result.find(e => !e.isTop);

    // Lead-off batter is home[0] = Charlie
    expect(bottom.playerId).toBe(3); // Charlie (home lead-off)
    expect(bottom.playerName).toBe('Charlie');
    expect(bottom.teamId).toBe(homeTeam.id);
    expect(bottom.opponentTeamId).toBe(awayTeam.id);
  });

  test('team IDs are set correctly', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);

    // result[0] = Top (away bats), result[1] = Bottom (home bats)
    expect(result[0].teamId).toBe(awayTeam.id);
    expect(result[0].opponentTeamId).toBe(homeTeam.id);
    expect(result[1].teamId).toBe(homeTeam.id);
    expect(result[1].opponentTeamId).toBe(awayTeam.id);
  });

  test('orderNumbers are sequential starting from 1', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 1, machines);
    // 1 inning = 2 rows (Top 1, Bottom 1)
    expect(result.map(e => e.orderNumber)).toEqual([1, 2]);
  });

  test('roundName is set on each half-inning', () => {
    const wrapper = makeMatchupWrapper();
    const machines = [makeMachine(10), makeMachine(11), makeMachine(12), makeMachine(13)];
    const result = buildTeamRoundRobinMatchups(wrapper, awayMembers, homeMembers, 2, machines);
    expect(result[0].roundName).toBe('Top 1');
    expect(result[1].roundName).toBe('Bottom 1');
    expect(result[2].roundName).toBe('Top 2');
    expect(result[3].roundName).toBe('Bottom 2');
  });

  test('uses team IDs from matchupWrapper', () => {
    const wrapper = { team1Id: homeTeam.id, team2Id: awayTeam.id };
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
    expect(result.isPlayer1).toBe(true);
  });

  test('returns default when orderNumber not found', () => {
    const eventMatchups = [{
      team1Id: homeTeam.id,
      team2Id: awayTeam.id,
      entries: [{ orderNumber: 1, machineId: 10, playerId: 1, teamId: awayTeam.id, isTop: true }]
    }];
    const result = resolveTeamMatchupRole(1, 999, eventMatchups);
    expect(result.matchup).toBeNull();
  });

  test('resolves away team as player2', () => {
    const eventMatchups = [{
      id: 1,
      team1Id: homeTeam.id,
      team2Id: awayTeam.id,
      roundName: 'Top 1',
      entries: [
        { orderNumber: 1, machineId: 10, playerId: 1, teamId: awayTeam.id, playerName: 'Alice' },
        { orderNumber: 2, machineId: 10, playerId: 2, teamId: awayTeam.id, playerName: 'Bob' },
        { orderNumber: 3, machineId: 11, playerId: 3, teamId: homeTeam.id, playerName: 'Charlie' },
        { orderNumber: 4, machineId: 11, playerId: 4, teamId: homeTeam.id, playerName: 'Dave' },
      ]
    }];

    const result = resolveTeamMatchupRole(awayTeam.id, 1, eventMatchups);
    expect(result.isPlayer1).toBe(false);
    expect(result.opponentName).toBe('');
    expect(result.displayRoundNumber).toBe('Top 1');
  });

  test('resolves home team as player1', () => {
    const eventMatchups = [{
      id: 1,
      team1Id: homeTeam.id,
      team2Id: awayTeam.id,
      roundName: 'Top 1',
      entries: [
        { orderNumber: 1, machineId: 10, playerId: 1, teamId: awayTeam.id, playerName: 'Alice' },
      ]
    }];

    const result = resolveTeamMatchupRole(homeTeam.id, 1, eventMatchups);
    expect(result.isPlayer1).toBe(true);
    expect(result.opponentName).toBe('');
  });

  test('derives round name from order number arithmetic', () => {
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

    // Top 1: away team bats
    const result1 = resolveTeamMatchupRole(awayTeam.id, 1, eventMatchups);
    expect(result1.displayRoundNumber).toBe('Top 1');

    // orderNumber 3 → arithmetic gives 'Top 2'
    const result3 = resolveTeamMatchupRole(homeTeam.id, 3, eventMatchups);
    expect(result3.displayRoundNumber).toBe('Top 2');

    // orderNumber 5 → arithmetic gives 'Top 3'
    const result5 = resolveTeamMatchupRole(awayTeam.id, 5, eventMatchups);
    expect(result5.displayRoundNumber).toBe('Top 3');
  });
});

// ── enrichTeamMatchupEntries ─────────────────────────────────────────

describe('enrichTeamMatchupEntries', () => {
  // Server entries now include team1_id/team2_id (pitcher/batter).
  // Top half: home(200) pitches, away(100) bats
  const serverEntries = [
    { order_number: 1, machine_id: 10, player_id: 1, player_name: 'Alice', team1_id: 200, team2_id: 100 },
    { order_number: 2, machine_id: 10, player_id: 2, player_name: 'Bob', team1_id: 200, team2_id: 100 },
    { order_number: 3, machine_id: 11, player_id: 3, player_name: 'Charlie', team1_id: 200, team2_id: 100 },
    { order_number: 4, machine_id: 11, player_id: 4, player_name: 'Dave', team1_id: 200, team2_id: 100 },
  ];

  // Bottom half: away(100) pitches, home(200) bats
  const bottomServerEntries = [
    { order_number: 1, machine_id: 10, player_id: 3, player_name: 'Charlie', team1_id: 100, team2_id: 200 },
    { order_number: 2, machine_id: 10, player_id: 4, player_name: 'Dave', team1_id: 100, team2_id: 200 },
    { order_number: 3, machine_id: 11, player_id: 3, player_name: 'Charlie', team1_id: 100, team2_id: 200 },
    { order_number: 4, machine_id: 11, player_id: 4, player_name: 'Dave', team1_id: 100, team2_id: 200 },
  ];

  test('returns original entries when entries are empty', () => {
    expect(enrichTeamMatchupEntries([], makeMatchupWrapper(), awayMembers, homeMembers)).toEqual([]);
  });

  test('enriches entries with derived fields', () => {
    const wrapper = makeMatchupWrapper();
    const result = enrichTeamMatchupEntries(serverEntries, wrapper, awayMembers, homeMembers);
    expect(result).toHaveLength(4);
    expect(result[0].playerId).toBeDefined();
    expect(result[0].playerName).toBeDefined();
    expect(result[0].teamId).toBeDefined();
    expect(result[0].isTop).toBeDefined();
    expect(result[0].opponentTeamId).toBeDefined();
  });

  test('top half: all entries have batting team id and isTop=true', () => {
    const wrapper = makeMatchupWrapper();
    const result = enrichTeamMatchupEntries(serverEntries, wrapper, awayMembers, homeMembers);
    const topEntries = result.filter(e => e.isTop);
    // team1_id=200 (home) → home pitching = top → all 4 entries are top
    expect(topEntries).toHaveLength(4);
    expect(topEntries[0].playerId).toBe(1); // Alice
    expect(topEntries[0].playerName).toBe('Alice');
    expect(topEntries[0].teamId).toBe(awayTeam.id); // Batting team
    expect(topEntries[0].opponentTeamId).toBe(homeTeam.id); // Pitching team
  });

  test('bottom half: all entries have home team id and isTop=false', () => {
    const wrapper = makeMatchupWrapper();
    const result = enrichTeamMatchupEntries(bottomServerEntries, wrapper, awayMembers, homeMembers);
    const bottom = result.filter(e => !e.isTop);
    // team1_id=100 (away) → away pitching = bottom → all 4 entries are bottom
    expect(bottom).toHaveLength(4);
    expect(bottom[0].playerId).toBe(3); // Charlie
    expect(bottom[0].playerName).toBe('Charlie');
    expect(bottom[0].teamId).toBe(homeTeam.id); // Batting team
    expect(bottom[0].opponentTeamId).toBe(awayTeam.id); // Pitching team
  });

  test('preserves original entry properties', () => {
    const wrapper = makeMatchupWrapper();
    const entriesWithExtras = [
      { order_number: 1, machine_id: 10, player_id: 1, player_name: 'Alice', id: 42, event_matchup_id: 5, team1_id: 200, team2_id: 100 },
      { order_number: 2, machine_id: 10, player_id: 2, player_name: 'Bob', id: 43, event_matchup_id: 5, team1_id: 200, team2_id: 100 },
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

  test('defaults isTop from team1_id when roundName is not provided', () => {
    const wrapper = makeMatchupWrapper();
    const result = enrichTeamMatchupEntries(serverEntries, wrapper, awayMembers, homeMembers);
    // team1_id=200 (home) → home pitching = top
    expect(result[0].isTop).toBe(true);
  });
});

describe('validatePitcherWorkload & resolvePlayerForBall', () => {
  const members = [{ id: 1, playerName: 'Kyle' }, { id: 2, playerName: 'Steve' }];

  test('validatePitcherWorkload identifies balanced assignments', () => {
    const res = validatePitcherWorkload(members, { 1: 1, 2: 2 });
    expect(res.valid).toBe(true);
    expect(res.maxCount).toBe(1);
    expect(res.minCount).toBe(1);
  });

  test('validatePitcherWorkload flags uneven assignments', () => {
    const res = validatePitcherWorkload(members, { 1: 1, 2: 1, 3: 1 });
    expect(res.valid).toBe(false);
    expect(res.message).toContain('Pitching workload is uneven');
  });

  test('resolvePlayerForBall cycles through batting order', () => {
    expect(resolvePlayerForBall(members, 0).playerName).toBe('Kyle');
    expect(resolvePlayerForBall(members, 1).playerName).toBe('Steve');
    expect(resolvePlayerForBall(members, 2).playerName).toBe('Kyle');
  });
});
