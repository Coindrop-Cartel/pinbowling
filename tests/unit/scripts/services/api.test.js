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
  
  // Mock fetch globally for use in all tests
  global.fetch = vi.fn();
});

import { 
  fetchJSON, 
  PB_API 
} from '@services/api.js';

import {
  getCurrentPlayerId, 
  setCurrentPlayerId
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
    expect(callHeaders['Content-Type']).toBe('application/json');
  });

  it('fetchJSON should use native PUT/DELETE methods', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });

    await fetchJSON('service/machineService.php?id=1', { method: 'PUT', body: JSON.stringify({ name: 'New' }) });

    const callArgs = fetch.mock.calls[0];
    expect(callArgs[1].method).toBe('PUT');
    expect(callArgs[1].headers['X-HTTP-Method-Override']).toBeUndefined();
  });

  it('PB_API helper methods should call fetchJSON with correct routes', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([])
    });

    await PB_API.machines.getAll();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('service/machineService.php'), expect.any(Object));
  });

  describe('fetchJSON Advanced Logic', () => {
    it('should filter out null and undefined values from params', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      
      await fetchJSON('test.php', { 
        params: { a: 1, b: null, c: undefined, d: 'val' } 
      });

      const url = fetch.mock.calls[0][0];
      expect(url).toContain('a=1');
      expect(url).toContain('d=val');
      expect(url).not.toContain('b=');
      expect(url).not.toContain('c=');
    });

    it('should append params using & if the URL already contains a query string', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      
      await fetchJSON('test.php?existing=true', { params: { new: 'yes' } });

      const url = fetch.mock.calls[0][0];
      expect(url).toBe('http://localhost/app/test.php?existing=true&new=yes');
    });

    it('should sanitize paths by removing leading slashes', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      
      await fetchJSON('/service/test.php');

      const url = fetch.mock.calls[0][0];
      expect(url).toBe('http://localhost/app/service/test.php');
    });

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

    it('should throw a network error if fetch itself rejects', async () => {
      const networkError = new Error('Failed to fetch');
      fetch.mockRejectedValue(networkError);

      await expect(fetchJSON('test.php')).rejects.toThrow('Failed to fetch');
    });

    it('fetchJSON should include CSRF token for state-changing requests if present', async () => {
      window.PB_CSRF_TOKEN = 'test-token';
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await fetchJSON('test.php', { method: 'POST' });

      const callHeaders = fetch.mock.calls[0][1].headers;
      expect(callHeaders['X-CSRF-TOKEN']).toBe('test-token');
      
      // Cleanup global state
      delete window.PB_CSRF_TOKEN;
    });
  });

  describe('PB_API Helper Methods', () => {
    it('scores.get should return an empty array if no event or league ID is provided', async () => {
      const result = await PB_API.scores.get();
      expect(result).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('scores.get should construct URL based on parameters', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

      // League Summary Mode
      await PB_API.scores.get(null, null, 100);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('leagueId=100'), expect.any(Object));

      // Player Event Mode
      vi.clearAllMocks();
      await PB_API.scores.get(1, 2);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('eventId=2&playerId=1'), expect.any(Object));
    });
    
    it('scores.get should construct leagueId URL correctly', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      await PB_API.scores.get(null, null, 88);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('leagueId=88'), expect.any(Object));
    });

    it('leagues.create should send a POST request with the league data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
      const leagueData = { name: 'Major League Pinball', startDate: '2024-05-01' };
      
      await PB_API.leagues.create(leagueData);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/leagueService.php'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(leagueData)
        })
      );
    });

    it('scores.save should send a POST request with the score data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
      const scoreData = { eventId: 1, playerId: 2, ball1: 10 };
      
      await PB_API.scores.save(scoreData);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/scoreService.php'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(scoreData) })
      );
    });

    it('events.update should use PUT and include task parameters', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 99 }) });
      const eventData = { eventName: 'Season Finals', leagueId: 5 };
      
      await PB_API.events.update(99, eventData);
      
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/leagueService.php?task=fixture&id=99',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(eventData)
        })
      );
    });

    it('events.getAll should include leagueId in query if provided', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      
      await PB_API.events.getAll(42);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('task=fixture&leagueId=42'), expect.any(Object));
      
      vi.clearAllMocks();
      await PB_API.events.getAll();
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('task=fixture'), expect.any(Object));
      expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('leagueId='), expect.any(Object));
    });

    it('leagues.removePlayer should construct URL with both leagueId and playerId', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.leagues.removePlayer(10, 20);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('task=member&leagueId=10&playerId=20'), expect.any(Object));
    });

    it('machines.getTargets should use leagueId if provided', async () => {
        fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
        await PB_API.machines.getTargets(null, 5);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('leagueId=5'), expect.any(Object));
    });

    it('machines.getTargets should prioritize eventId if both are missing', async () => {
        fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
        await PB_API.machines.getTargets(10);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('eventId=10'), expect.any(Object));
    });

    it('machines.bulkUpdateSort should send a POST request to sort task', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      const updates = [{ id: 1, order: 2 }];
      await PB_API.machines.bulkUpdateSort(updates);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('task=sort'), expect.objectContaining({ method: 'POST' }));
    });

    it('system.runCleanup should call the cleanup service via POST', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.system.runCleanup();
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('service/cleanupService.php'), expect.objectContaining({ method: 'POST' }));
    });

    it('system.runCleanup should pass the days parameter if provided', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      // Verification for Issue 1.4 bug fix
      await PB_API.system.runCleanup(15);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('service/cleanupService.php?days=15'), expect.objectContaining({ method: 'POST' }));
    });

    it('machines.deleteTarget should include threshold task', async () => {
        fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
        await PB_API.machines.deleteTarget(123);
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('task=threshold'), expect.any(Object));
    });

    it('locations management methods should target the correct API and task', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await PB_API.locations.addMachine(1, 10, { note: 'Back room' });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/locationService.php?task=units'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ locationId: 1, machineId: 10, note: 'Back room' })
        })
      );
    });

    it('players.updatePassword should target reset task with POST', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.players.updatePassword(5, 'newpass');
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('task=reset&id=5'), expect.objectContaining({ method: 'POST' }));
    });

    it('players management should handle route parameters correctly', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

      await PB_API.players.delete(42);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/playerService.php?id=42',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('auth.login should POST to authService with credentials', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
      await PB_API.auth.login('user', 'pass');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=login'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ username: 'user', password: 'pass' }) })
      );
    });

    it('auth.logout should POST to authService', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.auth.logout();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=logout'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('auth.register should POST user data to authService', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 5 }) });
      const data = { username: 'newuser', password: 'pass' };
      await PB_API.auth.register(data);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=register'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(data) })
      );
    });

    it('auth.me should GET from authService me task', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1, role: 'admin' }) });
      await PB_API.auth.me();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=me'),
        expect.any(Object)
      );
    });

    it('players.getAll should GET from playerService', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      await PB_API.players.getAll({ search: 'test' });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/playerService.php'),
        expect.any(Object)
      );
    });

    it('players.create should POST to playerService', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 10 }) });
      const player = { playerName: 'New Player' };
      await PB_API.players.create(player);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/playerService.php'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(player) })
      );
    });

    it('players.update should PUT to playerService with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.players.update(5, { playerName: 'Updated' });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/playerService.php?id=5',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ playerName: 'Updated' }) })
      );
    });

    it('scores.save should POST score data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      const score = { eventId: 1, playerId: 2, ball1: 10 };
      await PB_API.scores.save(score);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/scoreService.php'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(score) })
      );
    });

    it('scores.clear should DELETE from scoreService with playerId', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.scores.clear(42);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/scoreService.php?playerId=42',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('leagues.get should GET from leagueService with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 7 }) });
      await PB_API.leagues.get(7);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('id=7'),
        expect.any(Object)
      );
    });

    it('leagues.update should PUT league data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.leagues.update(3, { name: 'Updated' });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/leagueService.php?id=3',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Updated' }) })
      );
    });

    it('leagues.delete should DELETE with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.leagues.delete(9);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/leagueService.php?id=9',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('events.create should POST event data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 100 }) });
      const event = { eventName: 'Finals', leagueId: 5 };
      await PB_API.events.create(event);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=fixture'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(event) })
      );
    });

    it('events.delete should DELETE with id and optional leagueId', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.events.delete(10, 5);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/leagueService.php?task=fixture&id=10&leagueId=5',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
      expect(fetch.mock.calls[0][0]).toContain('leagueId=5');
    });

    it('events.delete should work without leagueId', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.events.delete(10);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('id=10'),
        expect.any(Object)
      );
    });

    it('leagues.addPlayer should POST member data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.leagues.addPlayer(1, 2);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=member'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ leagueId: 1, playerId: 2 }) })
      );
    });

    it('teams.create should POST team data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
      const data = { name: 'Team A' };
      await PB_API.teams.create(data);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/teamService.php'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(data) })
      );
    });

    it('teams.update should PUT team data with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.teams.update(3, { name: 'Updated' });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/teamService.php?id=3',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Updated' }) })
      );
    });

    it('teams.delete should DELETE with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.teams.delete(7);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/teamService.php?id=7',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('teams.addMember should POST member data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.teams.addMember(1, 2);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=member'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ teamId: 1, playerId: 2 }) })
      );
    });

    it('teams.removeMember should DELETE', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.teams.removeMember(1, 2);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/teamService.php?task=member&teamId=1&playerId=2',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('teams.addToLeague should POST league team data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.teams.addToLeague(5, 10);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=league'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ leagueId: 5, teamId: 10 }) })
      );
    });

    it('teams.removeFromLeague should DELETE', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.teams.removeFromLeague(5, 10);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/teamService.php?task=league&leagueId=5&teamId=10',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('locations.getAll should GET from locationService', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      await PB_API.locations.getAll({ search: 'test' });
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/locationService.php'),
        expect.any(Object)
      );
    });

    it('locations.create should POST location data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ id: 1 }) });
      const loc = { name: 'Venue' };
      await PB_API.locations.create(loc);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('service/locationService.php'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(loc) })
      );
    });

    it('locations.update should PUT location data with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.locations.update(3, { name: 'Updated' });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/locationService.php?id=3',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Updated' }) })
      );
    });

    it('locations.delete should DELETE with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.locations.delete(5);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/locationService.php?id=5',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('locations.getMachines should GET with locationId', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      await PB_API.locations.getMachines(10);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('locationId=10'),
        expect.any(Object)
      );
    });

    it('locations.getMachines should work without locationId', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
      await PB_API.locations.getMachines(null);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('task=units'),
        expect.any(Object)
      );
    });

    it('locations.removeMachine should DELETE', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.locations.removeMachine(1, 2);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/locationService.php?task=units&locationId=1&machineId=2',
        expect.objectContaining({ 
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('machines.saveTarget should POST target data', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      const target = { eventId: 1, machineId: 2, value1: 100 };
      await PB_API.machines.saveTarget(target);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('eventId=1'),
        expect.objectContaining({ method: 'POST', body: JSON.stringify(target) })
      );
    });

    it('players.updateRole should PUT to role task', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.players.updateRole(5, 'admin');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/playerService.php?task=role&id=5',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ role: 'admin' }) })
      );
    });

    it('machines.update should PUT machine data with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.machines.update(3, { machineName: 'Updated' });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/machineService.php?id=3',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ machineName: 'Updated' }) })
      );
    });

    it('machines.delete should DELETE with id', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await PB_API.machines.delete(7);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost/app/service/machineService.php?id=7',
        expect.objectContaining({
          method: 'DELETE',
          body: '{}'
        })
      );
    });

    it('fetchJSON should pass through full URLs without modification', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await fetchJSON('http://example.com/api/test');
      expect(fetch).toHaveBeenCalledWith('http://example.com/api/test', expect.any(Object));
    });

    it('fetchJSON should handle GET requests without body', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await fetchJSON('service/test.php', { method: 'GET' });
      const callArgs = fetch.mock.calls[0][1];
      expect(callArgs.body).toBeUndefined();
    });

    it('fetchJSON should use custom headers when provided', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await fetchJSON('service/test.php', { headers: { 'X-Custom': 'value' } });
      const callHeaders = fetch.mock.calls[0][1].headers;
      expect(callHeaders['X-Custom']).toBe('value');
    });

    it('fetchJSON should log debug info when pb_debug is on', async () => {
      const logSpy = vi.spyOn(console, 'log');
      localStorage.setItem('pb_debug', 'true');
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      await fetchJSON('service/test.php', { method: 'GET' }); // Ensure it's a GET request for specific log messages
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[API] Constructing GET request to: service/test.php'), expect.objectContaining({ params: undefined }));
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[API\] Final Request URL:.*http:\/\/localhost\/app\/service\/test\.php/));
    });
  });
});