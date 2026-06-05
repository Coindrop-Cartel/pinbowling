/** @vitest-environment jsdom */
import { vi, describe, it, expect } from 'vitest';
import { fitTVModeToScreen } from '@ui/branding.js';

vi.hoisted(() => {
  vi.stubGlobal('location', {
    origin: 'http://localhost',
    pathname: '/index.php'
  });
});

describe('Branding Utilities (branding.js)', () => {
  it('fitTVModeToScreen should exist', () => {
    expect(fitTVModeToScreen).toBeDefined();
  });

  // Note: fitTVModeToScreen relies heavily on window.innerWidth and body scaling,
  // which can be tricky to test in a headless JSDOM environment without 
  // deep mocking of the layout engine.
  it('should be callable without throwing', () => {
    document.body.innerHTML = '<div id="tv-mode-content"></div>';
    expect(() => fitTVModeToScreen()).not.toThrow();
  });
});