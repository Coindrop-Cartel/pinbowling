/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ROUTES } from '@scripts/routes.js';

describe('Route Configuration (routes.js)', () => {
  beforeEach(() => {
    window.APP_BASE = '/pinball';
  });

  it('should have standard route definitions', () => {
    expect(ROUTES).toContainEqual({ path: 'index.php', label: 'Home' });
    expect(ROUTES).toContainEqual({ path: 'leagues.php', label: 'Leagues' });
  });

  describe('buildUrl logic via helper methods', () => {
    it('should map a primitive param to leagueId automatically', () => {
      // Using 5 as a primitive should result in ?leagueId=5
      const url = ROUTES.SCORES(5);
      expect(url).toBe('/pinball/scores?leagueId=5');
    });

    it('should handle object parameters correctly', () => {
      const url = ROUTES.LEAGUE_SETUP({ leagueId: 10, eventId: 20 });
      expect(url).toBe('/pinball/event-setup?leagueId=10&eventId=20');
    });

    it('should filter out undefined or null parameters', () => {
      const url = ROUTES.STANDINGS({ leagueId: 5, eventId: null, empty: '' });
      expect(url).toBe('/pinball/standings?leagueId=5');
    });

    it('should use / as the base for the HOME route', () => {
      expect(ROUTES.HOME()).toBe('/pinball/');
    });

    it('should handle missing APP_BASE gracefully', () => {
      window.APP_BASE = undefined;
      const url = ROUTES.PLAYERS({ id: 1 });
      expect(url).toBe('/players?id=1');
    });

    it('should prevent double slashes when BASE_PATH ends with a slash', () => {
      window.APP_BASE = '/subdir/';
      const url = ROUTES.LOCATIONS();
      expect(url).toBe('/subdir/locations');
    });
  });

  describe('Specific Route Generators', () => {
    it('should generate correct paths for all entities', () => {
      expect(ROUTES.LEAGUES()).toBe('/pinball/leagues');
      expect(ROUTES.MACHINES()).toBe('/pinball/machines');
      expect(ROUTES.PLAYERS()).toBe('/pinball/players');
    });

    it('should handle empty params object', () => {
      expect(ROUTES.SCORES({})).toBe('/pinball/scores');
    });
  });
});