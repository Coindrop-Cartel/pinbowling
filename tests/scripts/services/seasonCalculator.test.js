/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { calculateSeasonSummary } from '@services/seasonCalculator.js';

// ── Mock Engine ──────────────────────────────────────────────────────
// Provides a controllable engine for testing seasonCalculator logic
function createMockEngine(overrides = {}) {
  return {
    calculateTurnResults: vi.fn((machines, scoreMap) => {
      // Default: sum all ball values as the total
      const total = Object.values(scoreMap).reduce(
        (sum, entry) => sum + (entry.ball1 || 0) + (entry.ball2 || 0) + (entry.ball3 || 0),
        0
      );
      return { turnResults: [], total };
    }),
    compareScores: vi.fn((a, b) => b - a), // Bowling-style: high score wins
    formatTotalScore: vi.fn((total) => String(total)),
    ...overrides
  };
}

// ── Shared test data factories ───────────────────────────────────────
function makeLeague(overrides = {}) {
  return {
    id: 1,
    participants: 'individual',
    seasonScoring: 'cumulative',
    dropLowestWeeks: 0,
    teams: [],
    ...overrides
  };
}

function makePlayers(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Player ${i + 1}`
  }));
}

function makeEvents(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    id: 100 + i,
    name: `Event ${i + 1}`
  }));
}

function makeTargets(eventId, count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    eventId,
    orderNumber: i + 1,
    machineName: `Machine ${i + 1}`,
    value1: 10000,
    value2: 0
  }));
}

function makeScores(eventId, playerId, count = 2) {
  return Array.from({ length: count }, (_, i) => ({
    eventId,
    playerId,
    orderNumber: i + 1,
    machineId: i + 1,
    ball1: (i + 1) * 1000,
    ball2: (i + 1) * 2000,
    ball3: 0
  }));
}

// ── calculateSeasonSummary ───────────────────────────────────────────
describe('calculateSeasonSummary', () => {
  let engine;

  beforeEach(() => {
    engine = createMockEngine();
  });

  it('should return rows for each player in cumulative individual league', () => {
    const league = makeLeague();
    const players = makePlayers(2);
    const events = makeEvents(2);
    const targetsByEvent = { 100: makeTargets(100), 101: makeTargets(101) };
    const scoresByEventAndPlayer = {
      100: { 1: makeScores(100, 1), 2: makeScores(100, 2) },
      101: { 1: makeScores(101, 1), 2: makeScores(101, 2) }
    };

    const result = calculateSeasonSummary({
      league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
    });

    expect(result.rows).toHaveLength(2);
    expect(result.isTeamLeague).toBe(false);
    result.rows.forEach(row => {
      expect(row).toHaveProperty('entity');
      expect(row).toHaveProperty('eventTotals');
      expect(row).toHaveProperty('totalSeasonPoints');
      expect(row).toHaveProperty('playedTargets');
    });
  });

  it('should set isTeamLeague to true for team leagues', () => {
    const league = makeLeague({ participants: 'team', teams: [{ id: 't1', members: [] }] });
    const result = calculateSeasonSummary({
      league, players: [], events: [], targetsByEvent: {}, scoresByEventAndPlayer: {}, engine
    });
    expect(result.isTeamLeague).toBe(true);
  });

  it('should set isTeamLeague to false for individual leagues', () => {
    const league = makeLeague({ participants: 'individual' });
    const result = calculateSeasonSummary({
      league, players: [], events: [], targetsByEvent: {}, scoresByEventAndPlayer: {}, engine
    });
    expect(result.isTeamLeague).toBe(false);
  });

  it('should call engine.calculateTurnResults for each player-event combination', () => {
    const league = makeLeague(); // cumulative
    const players = makePlayers(2);
    const events = makeEvents(2);
    const targetsByEvent = { 100: makeTargets(100), 101: makeTargets(101) };
    const scoresByEventAndPlayer = {
      100: { 1: makeScores(100, 1), 2: makeScores(100, 2) },
      101: { 1: makeScores(101, 1), 2: makeScores(101, 2) }
    };

    calculateSeasonSummary({
      league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
    });

    // 2 players × 2 events = 4 calls (cumulative row building only)
    expect(engine.calculateTurnResults).toHaveBeenCalledTimes(4);
  });

  it('should not call calculateTurnResults when player has no scores for an event', () => {
    const league = makeLeague();
    const players = makePlayers(2);
    const events = makeEvents(1);
    const targetsByEvent = { 100: makeTargets(100) };
    const scoresByEventAndPlayer = {
      100: { 1: makeScores(100, 1) } // Player 2 has no scores
    };

    calculateSeasonSummary({
      league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
    });

    // Only player 1 has scores for event 100 → 1 call
    expect(engine.calculateTurnResults).toHaveBeenCalledTimes(1);
  });

  it('should set eventTotals to null for events with no scores', () => {
    const league = makeLeague();
    const players = makePlayers(1);
    const events = makeEvents(2);
    const targetsByEvent = { 100: makeTargets(100), 101: makeTargets(101) };
    const scoresByEventAndPlayer = {
      100: { 1: makeScores(100, 1) } // Event 101 has no scores
    };

    const result = calculateSeasonSummary({
      league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
    });

    expect(result.rows[0].eventTotals[100]).not.toBeNull();
    expect(result.rows[0].eventTotals[101]).toBeNull();
  });

  // ── Weekly scoring ───────────────────────────────────────────────
  describe('weekly scoring', () => {
    it('should assign points based on ranking per event', () => {
      const league = makeLeague({ seasonScoring: 'weekly' });
      const players = makePlayers(3);
      const events = makeEvents(1);

      // Weekly pre-calc calls (1 per player-event combo)
      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 300 })) // Player 1
        .mockImplementationOnce(() => ({ turnResults: [], total: 200 })) // Player 2
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })); // Player 3

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 2: makeScores(100, 2), 3: makeScores(100, 3) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      // Player 1 (highest) → 3 pts, Player 2 → 2 pts, Player 3 → 1 pt
      const rowByPlayerId = {};
      result.rows.forEach(r => { rowByPlayerId[r.entity.id] = r; });
      expect(rowByPlayerId[1].totalSeasonPoints).toBe(3);
      expect(rowByPlayerId[2].totalSeasonPoints).toBe(2);
      expect(rowByPlayerId[3].totalSeasonPoints).toBe(1);
    });

    it('should display "pts" suffix for weekly event totals', () => {
      const league = makeLeague({ seasonScoring: 'weekly' });
      const players = makePlayers(1);
      const events = makeEvents(1);

      engine.calculateTurnResults.mockImplementation(() => ({ turnResults: [], total: 500 }));

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = { 100: { 1: makeScores(100, 1) } };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      expect(result.rows[0].eventTotals[100]).toContain('pts');
    });

    it('should sort rows by totalSeasonPoints descending for weekly', () => {
      const league = makeLeague({ seasonScoring: 'weekly' });
      const players = makePlayers(3);
      const events = makeEvents(1);

      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // P1 lowest
        .mockImplementationOnce(() => ({ turnResults: [], total: 300 })) // P2 highest
        .mockImplementationOnce(() => ({ turnResults: [], total: 200 })); // P3 middle

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 2: makeScores(100, 2), 3: makeScores(100, 3) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      expect(result.rows[0].totalSeasonPoints).toBeGreaterThanOrEqual(result.rows[1].totalSeasonPoints);
    });
  });

  // ── Team league ──────────────────────────────────────────────────
  describe('team league', () => {
    it('should aggregate member scores for team totals', () => {
      const league = makeLeague({
        participants: 'team',
        teams: [
          { id: 't1', members: [{ id: 1 }, { id: 2 }] },
          { id: 't2', members: [{ id: 3 }] }
        ]
      });
      const players = makePlayers(3);
      const events = makeEvents(1);

      // Cumulative team: each member's calculateTurnResults called once in row building
      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // t1 member 1
        .mockImplementationOnce(() => ({ turnResults: [], total: 200 })) // t1 member 2
        .mockImplementationOnce(() => ({ turnResults: [], total: 400 })); // t2 member 3

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 2: makeScores(100, 2), 3: makeScores(100, 3) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      expect(result.rows).toHaveLength(2);
      expect(result.isTeamLeague).toBe(true);
      // t1 total = 100 + 200 = 300, t2 total = 400
      const rowByTeamId = {};
      result.rows.forEach(r => { rowByTeamId[r.entity.id] = r; });
      expect(rowByTeamId['t1'].totalSeasonPoints).toBe(300);
      expect(rowByTeamId['t2'].totalSeasonPoints).toBe(400);
    });

    it('should return empty playedTargets for team leagues', () => {
      const league = makeLeague({
        participants: 'team',
        teams: [{ id: 't1', members: [{ id: 1 }] }]
      });
      const events = makeEvents(1);
      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = { 100: { 1: makeScores(100, 1) } };

      const result = calculateSeasonSummary({
        league, players: makePlayers(1), events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      expect(result.rows[0].playedTargets).toEqual([]);
    });
  });

  // ── Drop lowest weeks ───────────────────────────────────────────
  describe('drop lowest weeks', () => {
    it('should drop the lowest event score when dropLowestWeeks is 1', () => {
      const league = makeLeague({ dropLowestWeeks: 1 });
      const players = makePlayers(1);
      const events = makeEvents(3);

      // Cumulative: 1 call per player-event in row building
      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // Event 100
        .mockImplementationOnce(() => ({ turnResults: [], total: 300 })) // Event 101
        .mockImplementationOnce(() => ({ turnResults: [], total: 200 })); // Event 102

      const targetsByEvent = {
        100: makeTargets(100), 101: makeTargets(101), 102: makeTargets(102)
      };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1) },
        101: { 1: makeScores(101, 1) },
        102: { 1: makeScores(102, 1) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      // Should drop event 100 (score=100, lowest), sum = 300 + 200 = 500
      expect(result.rows[0].totalSeasonPoints).toBe(500);
    });

    it('should apply strikethrough formatting to dropped event totals', () => {
      const league = makeLeague({ dropLowestWeeks: 1 });
      const players = makePlayers(1);
      const events = makeEvents(2);

      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // Event 100
        .mockImplementationOnce(() => ({ turnResults: [], total: 300 })); // Event 101

      const targetsByEvent = { 100: makeTargets(100), 101: makeTargets(101) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1) },
        101: { 1: makeScores(101, 1) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      // Event 100 (score=100) should be dropped and have strikethrough
      const droppedTotal = result.rows[0].eventTotals[100];
      expect(droppedTotal).toContain('dropped-score');
    });

    it('should not drop any weeks when dropLowestWeeks is 0', () => {
      const league = makeLeague({ dropLowestWeeks: 0 });
      const players = makePlayers(1);
      const events = makeEvents(2);

      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // Event 100
        .mockImplementationOnce(() => ({ turnResults: [], total: 300 })); // Event 101

      const targetsByEvent = { 100: makeTargets(100), 101: makeTargets(101) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1) },
        101: { 1: makeScores(101, 1) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      expect(result.rows[0].totalSeasonPoints).toBe(400);
      // No strikethrough
      expect(result.rows[0].eventTotals[100]).not.toContain('line-through');
      expect(result.rows[0].eventTotals[101]).not.toContain('line-through');
    });

    it('should drop multiple weeks when dropLowestWeeks > 1', () => {
      const league = makeLeague({ dropLowestWeeks: 2 });
      const players = makePlayers(1);
      const events = makeEvents(4);

      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 50 }))  // Event 100 - dropped
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // Event 101 - dropped
        .mockImplementationOnce(() => ({ turnResults: [], total: 300 })) // Event 102
        .mockImplementationOnce(() => ({ turnResults: [], total: 400 })); // Event 103

      const targetsByEvent = {
        100: makeTargets(100), 101: makeTargets(101),
        102: makeTargets(102), 103: makeTargets(103)
      };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1) }, 101: { 1: makeScores(101, 1) },
        102: { 1: makeScores(102, 1) }, 103: { 1: makeScores(103, 1) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      // Drop 2 lowest (50, 100), sum = 300 + 400 = 700
      expect(result.rows[0].totalSeasonPoints).toBe(700);
    });

    it('should handle dropLowestWeeks greater than number of events with scores', () => {
      const league = makeLeague({ dropLowestWeeks: 5 });
      const players = makePlayers(1);
      const events = makeEvents(2);

      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // Event 100
        .mockImplementationOnce(() => ({ turnResults: [], total: 300 })); // Event 101

      const targetsByEvent = { 100: makeTargets(100), 101: makeTargets(101) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1) },
        101: { 1: makeScores(101, 1) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      // All events dropped, total = 0
      expect(result.rows[0].totalSeasonPoints).toBe(0);
    });
  });

  // ── selectedPlayerIds filtering ──────────────────────────────────
  describe('selectedPlayerIds filtering', () => {
    it('should only include selected players when provided', () => {
      const league = makeLeague();
      const players = makePlayers(3);
      const events = makeEvents(1);
      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 2: makeScores(100, 2), 3: makeScores(100, 3) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
        selectedPlayerIds: ['1', '3']
      });

      expect(result.rows).toHaveLength(2);
      const ids = result.rows.map(r => r.entity.id);
      expect(ids).toContain(1);
      expect(ids).toContain(3);
      expect(ids).not.toContain(2);
    });

    it('should include all players when selectedPlayerIds is empty', () => {
      const league = makeLeague();
      const players = makePlayers(3);
      const events = makeEvents(1);
      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 2: makeScores(100, 2), 3: makeScores(100, 3) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
        selectedPlayerIds: []
      });

      expect(result.rows).toHaveLength(3);
    });
  });

  // ── Sorting ─────────────────────────────────────────────────────
  describe('sorting', () => {
    it('should sort rows by totalSeasonPoints descending for cumulative bowling', () => {
      const league = makeLeague();
      const players = makePlayers(3);
      const events = makeEvents(1);

      // Cumulative: 1 call per player-event
      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 200 })) // P1
        .mockImplementationOnce(() => ({ turnResults: [], total: 500 })) // P2
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })); // P3

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 2: makeScores(100, 2), 3: makeScores(100, 3) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      expect(result.rows[0].entity.id).toBe(2); // 500
      expect(result.rows[1].entity.id).toBe(1); // 200
      expect(result.rows[2].entity.id).toBe(3); // 100
    });

    it('should use engine.compareScores for sorting in cumulative mode', () => {
      const golfEngine = createMockEngine({
        compareScores: vi.fn((a, b) => a - b) // Golf: low score wins
      });
      const league = makeLeague();
      const players = makePlayers(3);
      const events = makeEvents(1);

      golfEngine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 20 })) // P1
        .mockImplementationOnce(() => ({ turnResults: [], total: 10 })) // P2
        .mockImplementationOnce(() => ({ turnResults: [], total: 30 })); // P3

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 2: makeScores(100, 2), 3: makeScores(100, 3) }
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine: golfEngine
      });

      // Golf: low score wins → P2(10), P1(20), P3(30)
      expect(result.rows[0].entity.id).toBe(2);
      expect(result.rows[1].entity.id).toBe(1);
      expect(result.rows[2].entity.id).toBe(3);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────
  describe('edge cases', () => {
    it('should handle empty events array', () => {
      const league = makeLeague();
      const players = makePlayers(1);

      const result = calculateSeasonSummary({
        league, players, events: [], targetsByEvent: {}, scoresByEventAndPlayer: {}, engine
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].eventTotals).toEqual({});
      expect(result.rows[0].totalSeasonPoints).toBe(0);
    });

    it('should handle empty players array', () => {
      const league = makeLeague();

      const result = calculateSeasonSummary({
        league, players: [], events: makeEvents(1), targetsByEvent: {}, scoresByEventAndPlayer: {}, engine
      });

      expect(result.rows).toHaveLength(0);
    });

    it('should handle missing targetsByEvent for an event', () => {
      const league = makeLeague();
      const players = makePlayers(1);
      const events = makeEvents(1);

      // No targets for event 100
      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent: {},
        scoresByEventAndPlayer: { 100: { 1: makeScores(100, 1) } }, engine
      });

      // Player has scores but no targets → calculateTurnResults not called (eventTargets.length > 0 guard)
      expect(engine.calculateTurnResults).not.toHaveBeenCalled();
      expect(result.rows[0].eventTotals[100]).toBeNull();
    });

    it('should use engine.formatTotalScore for cumulative event totals', () => {
      const league = makeLeague();
      const players = makePlayers(1);
      const events = makeEvents(1);

      engine.calculateTurnResults.mockImplementation(() => ({ turnResults: [], total: 42 }));
      engine.formatTotalScore.mockReturnValue('42');

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = { 100: { 1: makeScores(100, 1) } };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine
      });

      expect(engine.formatTotalScore).toHaveBeenCalledWith(42);
      expect(result.rows[0].eventTotals[100]).toBe('42');
    });

    it('should handle league with null/undefined properties gracefully', () => {
      const result = calculateSeasonSummary({
        league: null, players: [], events: [],
        targetsByEvent: {}, scoresByEventAndPlayer: {}, engine
      });

      expect(result.rows).toHaveLength(0);
      expect(result.isTeamLeague).toBe(false);
    });
  });

  // ── Weekly team league ──────────────────────────────────────────
  describe('weekly team league', () => {
    it('should calculate team totals in weekly pre-calc and assign points', () => {
      const league = makeLeague({
        participants: 'team',
        seasonScoring: 'weekly',
        teams: [
          { id: 't1', members: [{ id: 1 }, { id: 2 }] },
          { id: 't2', members: [{ id: 3 }] },
        ],
      });
      const players = makePlayers(3);
      const events = makeEvents(1);

      // Weekly pre-calc: each member's calculateTurnResults called once
      // t1: member1=100, member2=200 → teamTotal=300
      // t2: member3=400 → teamTotal=400
      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // t1 member 1
        .mockImplementationOnce(() => ({ turnResults: [], total: 200 })) // t1 member 2
        .mockImplementationOnce(() => ({ turnResults: [], total: 400 })); // t2 member 3

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 2: makeScores(100, 2), 3: makeScores(100, 3) },
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
      });

      // t2 (400) > t1 (300) → t2 gets 2 pts, t1 gets 1 pt
      const rowByTeamId = {};
      result.rows.forEach(r => { rowByTeamId[r.entity.id] = r; });
      expect(rowByTeamId['t2'].totalSeasonPoints).toBe(2);
      expect(rowByTeamId['t1'].totalSeasonPoints).toBe(1);
    });

    it('should skip teams with no member scores in weekly pre-calc', () => {
      const league = makeLeague({
        participants: 'team',
        seasonScoring: 'weekly',
        teams: [
          { id: 't1', members: [{ id: 1 }] },
          { id: 't2', members: [{ id: 2 }] },
        ],
      });
      const players = makePlayers(2);
      const events = makeEvents(1);

      // Only t1 member has scores
      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 250 }));

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1) }, // Only player 1 has scores
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
      });

      // Only t1 has data → 1 entity → gets 1 pt; t2 gets 0
      const rowByTeamId = {};
      result.rows.forEach(r => { rowByTeamId[r.entity.id] = r; });
      expect(rowByTeamId['t1'].totalSeasonPoints).toBe(1);
      expect(rowByTeamId['t2'].totalSeasonPoints).toBe(0);
    });

    it('should handle team with partial member scores in weekly pre-calc', () => {
      const league = makeLeague({
        participants: 'team',
        seasonScoring: 'weekly',
        teams: [
          { id: 't1', members: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        ],
      });
      const players = makePlayers(3);
      const events = makeEvents(1);

      // Only members 1 and 3 have scores; member 2 has none
      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 100 })) // member 1
        .mockImplementationOnce(() => ({ turnResults: [], total: 300 })); // member 3

      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1), 3: makeScores(100, 3) }, // member 2 missing
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
      });

      // t1 total = 100 + 300 = 400, only team → 1 pt
      expect(result.rows[0].totalSeasonPoints).toBe(1);
      expect(result.rows[0].eventTotals[100]).toContain('1 pts');
    });
  });

  // ── Drop lowest with weekly scoring ─────────────────────────────
  describe('drop lowest with weekly scoring', () => {
    it('should drop lowest weekly points when dropLowestWeeks is set', () => {
      const league = makeLeague({ seasonScoring: 'weekly', dropLowestWeeks: 1 });
      const players = makePlayers(1);
      const events = makeEvents(3);

      // Weekly pre-calc: 1 call per player-event
      engine.calculateTurnResults
        .mockImplementationOnce(() => ({ turnResults: [], total: 500 })) // Event 100 → 3 pts (only player)
        .mockImplementationOnce(() => ({ turnResults: [], total: 500 })) // Event 101 → 1 pt (only player)
        .mockImplementationOnce(() => ({ turnResults: [], total: 500 })); // Event 102 → 1 pt (only player)

      const targetsByEvent = {
        100: makeTargets(100),
        101: makeTargets(101),
        102: makeTargets(102),
      };
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1) },
        101: { 1: makeScores(101, 1) },
        102: { 1: makeScores(102, 1) },
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
      });

      // With only 1 player, each event gives 1 pt. Drop lowest 1 → sum of top 2 = 2
      expect(result.rows[0].totalSeasonPoints).toBe(2);
    });
  });

  // ── getPlayedTargets (individual cumulative) ────────────────────
  describe('getPlayedTargets', () => {
    it('should populate playedTargets with targets matching player scores', () => {
      const league = makeLeague();
      const players = makePlayers(1);
      const events = makeEvents(1);
      const targetsByEvent = {
        100: [
          { eventId: 100, orderNumber: 1, machineName: 'Machine A', value1: 10000, value2: 0 },
          { eventId: 100, orderNumber: 2, machineName: 'Machine B', value1: 20000, value2: 0 },
          { eventId: 100, orderNumber: 3, machineName: 'Machine C', value1: 30000, value2: 0 },
        ],
      };
      // Player has scores for orderNumber 1 and 3 only
      const scoresByEventAndPlayer = {
        100: {
          1: [
            { eventId: 100, playerId: 1, orderNumber: 1, machineId: 1, ball1: 1000, ball2: 0, ball3: 0 },
            { eventId: 100, playerId: 1, orderNumber: 3, machineId: 3, ball1: 3000, ball2: 0, ball3: 0 },
          ],
        },
      };

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
      });

      // Player played targets with orderNumber 1 and 3
      const played = result.rows[0].playedTargets;
      expect(played).toHaveLength(2);
      expect(played.map(t => t.orderNumber)).toEqual([1, 3]);
    });

    it('should return empty playedTargets when player has no scores', () => {
      const league = makeLeague();
      const players = makePlayers(1);
      const events = makeEvents(1);
      const targetsByEvent = { 100: makeTargets(100) };
      const scoresByEventAndPlayer = {}; // No scores at all

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
      });

      expect(result.rows[0].playedTargets).toEqual([]);
    });
  });

  // ── Cumulative team with no member scores ───────────────────────
  describe('cumulative team edge cases', () => {
    it('should handle team where no members have scores for an event', () => {
      const league = makeLeague({
        participants: 'team',
        teams: [
          { id: 't1', members: [{ id: 1 }] },
          { id: 't2', members: [{ id: 2 }] },
        ],
      });
      const players = makePlayers(2);
      const events = makeEvents(1);
      const targetsByEvent = { 100: makeTargets(100) };
      // Only player 1 has scores
      const scoresByEventAndPlayer = {
        100: { 1: makeScores(100, 1) },
      };

      engine.calculateTurnResults.mockImplementation(() => ({ turnResults: [], total: 150 }));

      const result = calculateSeasonSummary({
        league, players, events, targetsByEvent, scoresByEventAndPlayer, engine,
      });

      const rowByTeamId = {};
      result.rows.forEach(r => { rowByTeamId[r.entity.id] = r; });
      // t1 has data (member 1 scored), t2 has no data
      expect(rowByTeamId['t1'].eventTotals[100]).not.toBeNull();
      expect(rowByTeamId['t2'].eventTotals[100]).toBeNull();
    });
  });
});
