/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.hoisted(() => {
  window.APP_BASE = '/pinball';
});

import { ROUTES, ROUTE_PATHS } from '@scripts/routes.js';

describe('Route Configuration (routes.js)', () => {
  beforeEach(() => {
    window.APP_BASE = '/pinball';
  });
  it('should have standard route definitions', () => {
    expect(ROUTES).toContainEqual({ path: '/pinball/', label: 'Home' });
    expect(ROUTES).toContainEqual({ path: '/pinball/leagues', label: 'Leagues' });
  });

  describe('buildUrl logic via helper methods', () => {
    it('should map a primitive param to leagueId automatically', () => {
      // Using 5 as a primitive should result in ?leagueId=5
      const url = ROUTE_PATHS.SCORES(5);
      expect(url).toBe('/pinball/scores?leagueId=5');
    });

    it('should handle object parameters correctly', () => {
      const url = ROUTE_PATHS.LEAGUE_SETUP({ leagueId: 10, eventId: 20 });
      expect(url).toBe('/pinball/eventSetup?leagueId=10&eventId=20');
    });

    it('should filter out undefined or null parameters', () => {
      const url = ROUTE_PATHS.STANDINGS({ leagueId: 5, eventId: null, empty: '' });
      expect(url).toBe('/pinball/standings?leagueId=5');
    });

    it('should use / as the base for the HOME route', () => {
      expect(ROUTE_PATHS.HOME()).toBe('/pinball/');
    });

    it('should handle missing APP_BASE gracefully', () => {
      window.APP_BASE = undefined;
      const url = ROUTE_PATHS.PLAYERS({ id: 1 });
      expect(url).toBe('/players?id=1');
    });

    it('should prevent double slashes when BASE_PATH ends with a slash', () => {
      window.APP_BASE = '/subdir/';
      const url = ROUTE_PATHS.LOCATIONS();
      expect(url).toBe('/subdir/locations');
    });
  });

  describe('Specific Route Generators', () => {
    it('should generate correct paths for all entities', () => {
      expect(ROUTE_PATHS.LEAGUES()).toBe('/pinball/leagues');
      expect(ROUTE_PATHS.MACHINES()).toBe('/pinball/machines');
      expect(ROUTE_PATHS.PLAYERS()).toBe('/pinball/players');
    });

    it('should handle empty params object', () => {
      expect(ROUTE_PATHS.SCORES({})).toBe('/pinball/scores');
    });
  });
});