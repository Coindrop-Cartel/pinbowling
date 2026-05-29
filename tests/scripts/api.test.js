/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Setup the browser environment properties required by api.js during module evaluation.
 * JSDOM provides the window/storage objects, but we must set specific properties
 * before the module is imported.
 */
vi.hoisted(() => {
  // Redirect location for URL calculation tests
  vi.stubGlobal('location', {
    origin: 'http://localhost',
    pathname: '/app/index.php'
  });

  window.PB_API_SECRET = 'test-api-secret';
  
  // Mock fetch globally for use in all tests
  global.fetch = vi.fn();
});

import { 
  fetchJSON, 
  PB_API 
} from '../../scripts/api.js';

import {
  getCurrentPlayerId, 
  setCurrentPlayerId, 
  getLeaguePassword, 
  setLeaguePassword,
  getAdminSessionPassword,
  setAdminSessionPassword
} from '../../scripts/state.js';

/**
 * Unit tests for the API Client.
 */
describe('API Client (api.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    // Silence console methods within this test file to prevent 
    // expected error scenarios from polluting the test runner output.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('State Management Helpers', () => {
    it('should manage current player ID in localStorage', () => {
      setCurrentPlayerId('42');
      expect(getCurrentPlayerId()).toBe('42');
      setCurrentPlayerId(null);
      expect(getCurrentPlayerId()).toBeNull();
    });

    it('should manage league passwords in sessionStorage', () => {
      setLeaguePassword(10, 'secret-pass');
      expect(getLeaguePassword(10)).toBe('secret-pass');
      setLeaguePassword(10, null);
      expect(getLeaguePassword(10)).toBeNull();
    });

    it('should manage admin session password in sessionStorage', () => {
      setAdminSessionPassword('admin-token');
      expect(getAdminSessionPassword()).toBe('admin-token');
      setAdminSessionPassword(null);
      expect(getAdminSessionPassword()).toBeNull();
    });
  });

  it('fetchJSON should construct the correct absolute URL', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: 'ok' })
    });

    await fetchJSON('api/players.php');

    // APP_BASE for /app/index.php should be /app
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost/app/api/players.php',
      expect.any(Object)
    );
  });

  it('fetchJSON should include mandatory security headers', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await fetchJSON('api/machines.php');

    const callHeaders = fetch.mock.calls[0][1].headers;
    expect(callHeaders['X-PB-SECRET']).toBe('test-api-secret');
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  it('fetchJSON should tunnel PUT/DELETE via POST with X-HTTP-Method-Override', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await fetchJSON('api/machines.php?id=1', { method: 'PUT', body: JSON.stringify({ name: 'New' }) });

    const callArgs = fetch.mock.calls[0];
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].headers['X-HTTP-Method-Override']).toBe('PUT');
  });

  it('PB_API helper methods should call fetchJSON with correct routes', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    });

    await PB_API.getMachines();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('api/machines.php'), expect.any(Object));
  });

  describe('fetchJSON Advanced Logic', () => {
    it('should throw error with message from JSON response on failure', async () => {
      fetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Validation Failed' })
      });

      await expect(fetchJSON('api/test')).rejects.toThrow('Validation Failed');
    });

    it('should fall back to statusText if JSON error parsing fails', async () => {
      fetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Not JSON'))
      });

      await expect(fetchJSON('api/test')).rejects.toThrow('Internal Server Error');
    });

    it('should provide a default empty body for POST requests to prevent server resets', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await fetchJSON('api/test', { method: 'POST' });
      
      const callArgs = fetch.mock.calls[0][1];
      expect(callArgs.body).toBe(JSON.stringify({}));
    });

    it('should include X-LEAGUE-PASSWORD if leagueId is in query params', async () => {
      setLeaguePassword(5, 'league-access-code');
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await fetchJSON('api/scores.php?leagueId=5');

      const headers = fetch.mock.calls[0][1].headers;
      expect(headers['X-LEAGUE-PASSWORD']).toBe('league-access-code');
    });

    it('should include X-LEAGUE-PASSWORD if league_id is in request body', async () => {
      setLeaguePassword(7, 'body-secret');
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await fetchJSON('api/scores.php', { 
        method: 'POST', 
        body: JSON.stringify({ league_id: 7, other: 'data' }) 
      });

      const headers = fetch.mock.calls[0][1].headers;
      expect(headers['X-LEAGUE-PASSWORD']).toBe('body-secret');
    });
  });

  describe('PB_API Helper Methods', () => {
    it('getScores should return an empty array if no event or league ID is provided', async () => {
      const result = await PB_API.getScores();
      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('getScores should construct URL based on parameters', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      // League Summary Mode
      await PB_API.getScores(null, null, 100);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('leagueId=100'), expect.any(Object));

      // Player Event Mode
      vi.clearAllMocks();
      await PB_API.getScores(1, 2);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('eventId=2&playerId=1'), expect.any(Object));
    });

    it('createLeague should send a POST request with the league data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
      const leagueData = { name: 'Major League Pinball', start_date: '2024-05-01' };
      
      await PB_API.createLeague(leagueData);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('api/leagues.php'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(leagueData)
        })
      );
    });

    it('updateEvent should use PUT tunneling and include task parameters', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 99 }) });
      const eventData = { event_name: 'Season Finals', league_id: 5 };
      
      await PB_API.updateEvent(99, eventData);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('api/leagues.php?task=fixture&id=99'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-HTTP-Method-Override': 'PUT' }),
          body: JSON.stringify(eventData)
        })
      );
    });

    it('location management methods should target the correct API and task', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await PB_API.addLocationMachine(1, 10, { note: 'Back room' });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('api/locations.php?task=units'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ location_id: 1, machine_id: 10, note: 'Back room' })
        })
      );
    });

    it('player management should handle route parameters correctly', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

      await PB_API.deletePlayer(42);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('api/players.php?id=42'),
        expect.objectContaining({ headers: expect.objectContaining({ 'X-HTTP-Method-Override': 'DELETE' }) })
      );
    });
  });
});