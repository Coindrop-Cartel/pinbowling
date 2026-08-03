import { 
  BaseAssignmentStrategy,
  IndividualAssignmentStrategy, 
  TeamAssignmentStrategy, 
  getPlayerAssignmentStrategy 
} from '../../../../scripts/core/PlayerAssignmentStrategy.js';
import { GolfEngine } from '../../../../scripts/core/engines/GolfEngine.js';
import { BowlingEngine } from '../../../../scripts/core/engines/BowlingEngine.js';

describe('PlayerAssignmentStrategy', () => {
  const golfEngine = new GolfEngine();
  const bowlingEngine = new BowlingEngine();

  const golfTargets = [
    { orderNumber: 1, machineName: 'Hole 1', value1: 500000, value2: 3, values: { 1: 1500000, 2: 1000000, 3: 500000, 4: 400000, 5: 300000, 6: 200000, 7: 150000, 8: 100000, 9: 50000, 10: 0 } }
  ];

  it('factory returns correct strategy subclass', () => {
    expect(getPlayerAssignmentStrategy('individual')).toBeInstanceOf(IndividualAssignmentStrategy);
    expect(getPlayerAssignmentStrategy('team')).toBeInstanceOf(TeamAssignmentStrategy);
  });

  describe('BaseAssignmentStrategy', () => {
    const strategy = new BaseAssignmentStrategy();

    it('throws error on calculateEntityEventScore', () => {
      expect(() => strategy.calculateEntityEventScore()).toThrow('calculateEntityEventScore must be implemented by subclass');
    });

    it('resolveSlotPlayer returns entity', () => {
      const entity = { id: 1 };
      expect(strategy.resolveSlotPlayer(entity, 0)).toBe(entity);
    });
  });

  describe('IndividualAssignmentStrategy', () => {
    const strategy = new IndividualAssignmentStrategy();

    it('calculates score 1:1 for individual player', () => {
      const player = { id: 1, playerName: 'Player 1' };
      const scoresByPlayer = {
        1: [{ orderNumber: 1, ball1: 600000, ball2: 0, ball3: 0 }] // hit threshold 3 on ball 1 -> 1 stroke
      };

      const result = strategy.calculateEntityEventScore(player, golfTargets, scoresByPlayer, golfEngine);
      expect(result.total).toBe(1);
      expect(result.hasData).toBe(true);
      expect(result.memberTotals.length).toBe(1);
      expect(result.droppedMemberIds).toEqual([]);
    });

    it('resolveSlotPlayer returns entity', () => {
      const player = { id: 1 };
      expect(strategy.resolveSlotPlayer(player)).toBe(player);
    });
  });

  describe('TeamAssignmentStrategy', () => {
    const strategy = new TeamAssignmentStrategy();

    const team = {
      id: 10,
      name: 'Eagle Team',
      members: [
        { id: 101, playerName: 'Member 1' },
        { id: 102, playerName: 'Member 2' },
        { id: 103, playerName: 'Member 3' },
        { id: 104, playerName: 'Member 4' }
      ]
    };

    it('sums scores across all members when no dropLowestPlayer option is given', () => {
      const scoresByPlayer = {
        101: [{ orderNumber: 1, ball1: 600000, ball2: 0, ball3: 0 }], // 1 stroke
        102: [{ orderNumber: 1, ball1: 0, ball2: 600000, ball3: 0 }], // 2 strokes
        103: [{ orderNumber: 1, ball1: 0, ball2: 0, ball3: 600000 }], // 3 strokes
        104: [{ orderNumber: 1, ball1: 1, ball2: 0, ball3: 0 }]       // 10 strokes (missed target)
      };

      const result = strategy.calculateEntityEventScore(team, golfTargets, scoresByPlayer, golfEngine);
      expect(result.total).toBe(1 + 2 + 3 + 10); // 16 strokes
      expect(result.memberTotals.length).toBe(4);
      expect(result.droppedMemberIds).toEqual([]);
    });

    it('drops worst/lowest performing member score when dropLowestPlayer is 1 (Golf: drops 10 strokes)', () => {
      const scoresByPlayer = {
        101: [{ orderNumber: 1, ball1: 600000, ball2: 0, ball3: 0 }], // 1 stroke (best)
        102: [{ orderNumber: 1, ball1: 0, ball2: 600000, ball3: 0 }], // 2 strokes
        103: [{ orderNumber: 1, ball1: 0, ball2: 0, ball3: 600000 }], // 3 strokes
        104: [{ orderNumber: 1, ball1: 1, ball2: 0, ball3: 0 }]       // 10 strokes (worst)
      };

      const result = strategy.calculateEntityEventScore(team, golfTargets, scoresByPlayer, golfEngine, { dropLowestPlayer: 1 });
      expect(result.total).toBe(1 + 2 + 3); // 6 strokes (10 stroke member dropped)
      expect(result.droppedMemberIds).toEqual([104]);
    });

    it('drops worst/lowest performing member score in Bowling (drops lowest pin score)', () => {
      const bowlingTargets = [{ orderNumber: 1, machineName: 'Frame 1', value1: 1000000, value2: 100000, values: {} }];
      const scoresByPlayer = {
        101: [{ orderNumber: 1, ball1: 1000000, ball2: 0, ball3: 0 }], // 10 pins (best)
        102: [{ orderNumber: 1, ball1: 800000, ball2: 0, ball3: 0 }],  // 8 pins
        103: [{ orderNumber: 1, ball1: 600000, ball2: 0, ball3: 0 }],  // 6 pins
        104: [{ orderNumber: 1, ball1: 200000, ball2: 0, ball3: 0 }]   // 2 pins (worst)
      };

      const result = strategy.calculateEntityEventScore(team, bowlingTargets, scoresByPlayer, bowlingEngine, { dropLowestPlayer: 1 });
      expect(result.droppedMemberIds).toEqual([104]);
    });

    it('resolves slot player for rotation (e.g. 2 machines per round in baseball)', () => {
      const baseballTeam = {
        id: 20,
        members: [{ id: 201, playerName: 'Batter A' }, { id: 202, playerName: 'Batter B' }]
      };

      expect(strategy.resolveSlotPlayer(baseballTeam, 0, 2).id).toBe(201); // Inning 1 (Top/Bottom = index 0, 1)
      expect(strategy.resolveSlotPlayer(baseballTeam, 1, 2).id).toBe(201);
      expect(strategy.resolveSlotPlayer(baseballTeam, 2, 2).id).toBe(202); // Inning 2 (Top/Bottom = index 2, 3)
      expect(strategy.resolveSlotPlayer(baseballTeam, 3, 2).id).toBe(202);
    });

    it('returns empty results when team has no members', () => {
      const emptyTeam = { id: 10, members: [] };
      const result = strategy.calculateEntityEventScore(emptyTeam, golfTargets, {}, golfEngine);
      expect(result).toEqual({ total: 0, turnResults: [], hasData: false, memberTotals: [], droppedMemberIds: [] });
    });

    it('returns empty results when event targets is empty', () => {
      const result = strategy.calculateEntityEventScore(team, [], {}, golfEngine);
      expect(result).toEqual({ total: 0, turnResults: [], hasData: false, memberTotals: [], droppedMemberIds: [] });
    });
  });
});
