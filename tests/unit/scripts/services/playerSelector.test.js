import { describe, it, expect } from 'vitest';
import { resolvePlayersForMatchupParticipant, getSelectablePlayers, isPlayerInMatchup } from '../../../../scripts/services/playerSelector.js';

describe('playerSelector service', () => {
  const allPlayers = [
    { id: 1, playerName: 'Alice' },
    { id: 2, playerName: 'Bob' },
    { id: 5, playerName: 'Charlie' }, // Individual player ID 5
    { id: 10, playerName: 'Dave' },
    { id: 11, playerName: 'Eve' },
  ];

  const allLeaguesCache = [
    {
      id: 101,
      name: 'Individual League',
      participationType: 'individual',
      players: [
        { id: 1, playerName: 'Alice' },
        { id: 5, playerName: 'Charlie' },
      ],
    },
    {
      id: 202,
      name: 'Team League',
      participationType: 'team',
      teams: [
        {
          id: 5, // Team ID 5 collides with Player ID 5!
          name: 'The Striking Pins',
          members: [
            { id: 10, playerName: 'Dave' },
            { id: 11, playerName: 'Eve' },
          ],
        },
      ],
    },
  ];

  describe('resolvePlayersForMatchupParticipant', () => {
    it('should resolve player object in individual mode without pulling team members from team league when IDs collide', () => {
      const resolved = resolvePlayersForMatchupParticipant(5, 'Charlie', allPlayers, allLeaguesCache, false);
      expect(resolved).toEqual([{ id: 5, playerName: 'Charlie' }]);
    });

    it('should resolve team members in team mode when isTeamMode is true', () => {
      const resolved = resolvePlayersForMatchupParticipant(5, 'The Striking Pins', allPlayers, allLeaguesCache, true);
      expect(resolved).toEqual([
        { id: 10, playerName: 'Dave' },
        { id: 11, playerName: 'Eve' },
      ]);
    });

    it('should prefer player match over team match when isTeamMode is null and player exists in allPlayers', () => {
      const resolved = resolvePlayersForMatchupParticipant(5, 'Charlie', allPlayers, allLeaguesCache, null);
      expect(resolved).toEqual([{ id: 5, playerName: 'Charlie' }]);
    });
  });

  describe('getSelectablePlayers', () => {
    it('should return only matchup individual players and not team members from a team league when IDs collide', () => {
      const eventMatchups = [
        {
          id: 50,
          eventId: 500,
          player1Id: 1,
          player1Name: 'Alice',
          player2Id: 5,
          player2Name: 'Charlie',
        },
      ];

      const selectable = getSelectablePlayers({
        allPlayers,
        leagueId: 101,
        allLeaguesCache,
        activeMatchupId: 50,
        eventMatchups,
      });

      // Selectable should contain Alice (id: 1) and Charlie (id: 5), NOT Dave (10) or Eve (11)
      const ids = selectable.map(p => p.id);
      expect(ids).toContain(1);
      expect(ids).toContain(5);
      expect(ids).not.toContain(10);
      expect(ids).not.toContain(11);
    });
  });

  describe('isPlayerInMatchup', () => {
    it('should correctly identify individual matchup participant when team ID collides', () => {
      const matchup = {
        id: 50,
        eventId: 500,
        player1Id: 1,
        player2Id: 5,
      };

      expect(isPlayerInMatchup(5, matchup, allLeaguesCache, false)).toBe(true);
      expect(isPlayerInMatchup(10, matchup, allLeaguesCache, false)).toBe(false);
      expect(isPlayerInMatchup(11, matchup, allLeaguesCache, false)).toBe(false);
    });
  });
});
