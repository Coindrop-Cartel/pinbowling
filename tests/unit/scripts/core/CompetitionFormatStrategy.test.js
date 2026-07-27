import { describe, it, expect } from 'vitest';
import { 
  GroupCompetitionStrategy, 
  HeadToHeadCompetitionStrategy, 
  getCompetitionFormatStrategy 
} from '../../../../scripts/core/CompetitionFormatStrategy.js';
import { GolfEngine } from '../../../../scripts/core/engines/GolfEngine.js';
import { BowlingEngine } from '../../../../scripts/core/engines/BowlingEngine.js';

describe('CompetitionFormatStrategy', () => {
  const golfEngine = new GolfEngine();
  const bowlingEngine = new BowlingEngine();

  it('factory returns correct strategy subclass', () => {
    expect(getCompetitionFormatStrategy('group')).toBeInstanceOf(GroupCompetitionStrategy);
    expect(getCompetitionFormatStrategy('head_to_head')).toBeInstanceOf(HeadToHeadCompetitionStrategy);
    expect(getCompetitionFormatStrategy('head2head')).toBeInstanceOf(HeadToHeadCompetitionStrategy);
  });

  describe('GroupCompetitionStrategy', () => {
    const strategy = new GroupCompetitionStrategy();

    it('sorts standings based on totalSeasonPoints for Golf (lowest total wins)', () => {
      const rows = [
        { entity: { id: 1 }, totalSeasonPoints: 40 },
        { entity: { id: 2 }, totalSeasonPoints: 30 },
        { entity: { id: 3 }, totalSeasonPoints: 35 }
      ];

      const sorted = golfEngine.sortStandings(rows);
      expect(sorted.map(r => r.entity.id)).toEqual([2, 3, 1]); // 30, 35, 40
    });

    it('sorts standings based on totalSeasonPoints for Bowling (highest total wins)', () => {
      const rows = [
        { entity: { id: 1 }, totalSeasonPoints: 150 },
        { entity: { id: 2 }, totalSeasonPoints: 220 },
        { entity: { id: 3 }, totalSeasonPoints: 180 }
      ];

      const sorted = strategy.sortStandings(rows, bowlingEngine);
      expect(sorted.map(r => r.entity.id)).toEqual([2, 3, 1]); // 220, 180, 150
    });
  });

  describe('HeadToHeadCompetitionStrategy', () => {
    const strategy = new HeadToHeadCompetitionStrategy();

    const entities = [{ id: 1 }, { id: 2 }];
    const events = [{ id: 10 }];
    const matchupsByEvent = {
      10: [
        { status: 'completed', player1Id: 1, player2Id: 2, player1Score: 30, player2Score: 36 } // Golf: Player 1 (30) beat Player 2 (36)
      ]
    };

    it('calculates H2H records evaluating lower score as winner in Golf', () => {
      const records = strategy.calculateMatchupRecords(entities, events, matchupsByEvent, null, golfEngine);

      expect(records[1].wins).toBe(1);
      expect(records[1].losses).toBe(0);
      expect(records[1].winRate).toBe(1);
      expect(records[2].wins).toBe(0);
      expect(records[2].losses).toBe(1);
      expect(records[2].winRate).toBe(0);
    });

    it('sorts H2H standings prioritizing win rate', () => {
      const rows = [
        { entity: { id: 2 }, record: { winRate: 0.0, headToHead: {}, scoreDiff: -6, totalScore: 36 }, totalSeasonPoints: 36 },
        { entity: { id: 1 }, record: { winRate: 1.0, headToHead: {}, scoreDiff: 6, totalScore: 30 }, totalSeasonPoints: 30 }
      ];

      const sorted = strategy.sortStandings(rows, golfEngine);
      expect(sorted.map(r => r.entity.id)).toEqual([1, 2]);
    });
  });
});
