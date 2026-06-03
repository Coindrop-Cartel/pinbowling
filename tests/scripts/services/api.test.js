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
} from '@services/api.js';

import {
  getCurrentPlayerId, 
  setCurrentPlayerId, 
  getLeaguePassword, 
  setLeaguePassword,
  getAdminSessionPassword,
  setAdminSessionPassword
} from '@services/state.js';

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
    vi.spyOn(console, 'log').mockImplementation(() => {});
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

    await fetchJSON('service/playerService.php');

    // APP_BASE for /app/index.php should be /app
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost/app/service/playerService.php',
      expect.any(Object)
    );
  });

  it('fetchJSON should include mandatory security headers', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await fetchJSON('service/machineService.php');

    const callHeaders = fetch.mock.calls[0][1].headers;
    expect(callHeaders['X-PB-SECRET']).toBe('test-api-secret');
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  it('fetchJSON should tunnel PUT/DELETE via POST with X-HTTP-Method-Override', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await fetchJSON('service/machineService.php?id=1', { method: 'PUT', body: JSON.stringify({ name: 'New' }) });

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
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('service/machineService.php'), expect.any(Object));
  });

  describe('fetchJSON Advanced Logic', () => {
    it('should throw error with message from JSON response on failure', async () => {
      fetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Validation Failed' })
      });

      await expect(fetchJSON('service/testService.php')).rejects.toThrow('Validation Failed');
    });

    it('should fall back to statusText if JSON error parsing fails', async () => {
      fetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Not JSON'))
      });

      await expect(fetchJSON('service/testService.php')).rejects.toThrow('Internal Server Error');
    });

    it('should throw statusText if JSON response exists but has no error key', async () => {
      fetch.mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
        json: () => Promise.resolve({ success: false })
      });

      await expect(fetchJSON('service/test.php')).rejects.toThrow('Forbidden');
    });

    it('should construct origin-based URLs for relative paths', async () => {
        fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
        await fetchJSON('test.php');
        
        const url = fetch.mock.calls[0][0];
        expect(url).toBe('http://localhost/app/test.php');
    });

    it('should provide a default empty body for POST requests to prevent server resets', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await fetchJSON('service/testService.php', { method: 'POST' });
      
      const callArgs = fetch.mock.calls[0][1];
      expect(callArgs.body).toBe(JSON.stringify({}));
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
    
    it('getScores should construct leagueId URL correctly', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      await PB_API.getScores(null, null, 88);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('leagueId=88'), expect.any(Object));
    });

    it('createLeague should send a POST request with the league data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
      const leagueData = { name: 'Major League Pinball', startDate: '2024-05-01' };
      
      await PB_API.createLeague(leagueData);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/leagueService.php'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(leagueData)
        })
      );
    });

    it('updateEvent should use PUT tunneling and include task parameters', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 99 }) });
      const eventData = { eventName: 'Season Finals', leagueId: 5 };
      
      await PB_API.updateEvent(99, eventData);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/leagueService.php?task=fixture&id=99'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'X-HTTP-Method-Override': 'PUT' }),
          body: JSON.stringify(eventData)
        })
      );
    });

    it('getTargetScores should use leagueId if provided', async () => {
        fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
        await PB_API.getTargetScores(null, 5);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('leagueId=5'), expect.any(Object));
    });

    it('getTargetScores should prioritize eventId if both are missing', async () => {
        fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
        await PB_API.getTargetScores(10);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('eventId=10'), expect.any(Object));
    });

    it('deleteTargetScore should include threshold task', async () => {
        fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
        await PB_API.deleteTargetScore(123);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('task=threshold'), expect.any(Object));
    });

    it('location management methods should target the correct API and task', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await PB_API.addLocationMachine(1, 10, { note: 'Back room' });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/locationService.php?task=units'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ locationId: 1, machineId: 10, note: 'Back room' })
        })
      );
    });

    it('player management should handle route parameters correctly', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

      await PB_API.deletePlayer(42);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/playerService.php?id=42'),
        expect.objectContaining({ headers: expect.objectContaining({ 'X-HTTP-Method-Override': 'DELETE' }) })
      );
    });
  });
});