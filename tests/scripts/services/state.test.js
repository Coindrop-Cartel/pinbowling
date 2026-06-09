/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  getCurrentPlayerId,
  setCurrentPlayerId,
  getDebugEnabled,
  setDebugEnabled,
} from '@services/state.js';

describe('State Management (state.js)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getCurrentPlayerId / setCurrentPlayerId', () => {
    it('returns null when no player ID is stored', () => {
      expect(getCurrentPlayerId()).toBeNull();
    });

    it('stores and retrieves a player ID', () => {
      setCurrentPlayerId('42');
      expect(getCurrentPlayerId()).toBe('42');
    });

    it('removes the player ID when null/undefined is passed', () => {
      setCurrentPlayerId('42');
      setCurrentPlayerId(null);
      expect(getCurrentPlayerId()).toBeNull();
    });

    it('removes the player ID when empty string is passed', () => {
      setCurrentPlayerId('42');
      setCurrentPlayerId('');
      expect(getCurrentPlayerId()).toBeNull();
    });

    it('removes the player ID when undefined is passed', () => {
      setCurrentPlayerId('42');
      setCurrentPlayerId(undefined);
      expect(getCurrentPlayerId()).toBeNull();
    });

    it('overwrites a previously stored player ID', () => {
      setCurrentPlayerId('1');
      setCurrentPlayerId('99');
      expect(getCurrentPlayerId()).toBe('99');
    });
  });

  describe('getDebugEnabled / setDebugEnabled', () => {
    it('returns false when debug is not set', () => {
      expect(getDebugEnabled()).toBe(false);
    });

    it('returns false when debug is set to a non-"true" value', () => {
      localStorage.setItem('pb_debug_enabled', 'false');
      expect(getDebugEnabled()).toBe(false);
    });

    it('returns true when debug is enabled', () => {
      setDebugEnabled(true);
      expect(getDebugEnabled()).toBe(true);
    });

    it('returns false when debug is disabled after being enabled', () => {
      setDebugEnabled(true);
      setDebugEnabled(false);
      expect(getDebugEnabled()).toBe(false);
    });

    it('stores the string "true" in localStorage when enabled', () => {
      setDebugEnabled(true);
      expect(localStorage.getItem('pb_debug_enabled')).toBe('true');
    });

    it('stores the string "false" in localStorage when disabled', () => {
      setDebugEnabled(false);
      expect(localStorage.getItem('pb_debug_enabled')).toBe('false');
    });
  });
});
