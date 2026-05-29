/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

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

import { fetchJSON, PB_API } from '../scripts/api.js';

/**
 * Unit tests for the API Client.
 * Ensures that security headers, method tunneling, and URL construction
 * are handled correctly before deployment.
 */
describe('API Client (api.js)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});