/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initDarkMode,
  isDarkModeEnabled,
  setDarkMode,
  toggleDarkMode,
  updateToggleButtonUI,
  updateHeaderLogo,
} from '@ui/darkMode.js';

describe('Dark Mode Controller (darkMode.js)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.className = '';
    document.body.innerHTML = `
      <a class="nav-logo">
        <img src="/images/main-site-logo-header.png" alt="Logo">
      </a>
      <div id="auth-header-container">
        <button id="theme-toggle-btn" class="theme-toggle-btn">🌙</button>
      </div>
    `;
  });

  afterEach(() => {
    localStorage.clear();
    document.body.className = '';
  });

  it('should default to light mode when localStorage is empty', () => {
    expect(isDarkModeEnabled()).toBe(false);
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('should enable dark mode and update class and localStorage', () => {
    setDarkMode(true);
    expect(isDarkModeEnabled()).toBe(true);
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(localStorage.getItem('pb_dark_mode')).toBe('true');
  });

  it('should disable dark mode and update class and localStorage', () => {
    setDarkMode(true);
    setDarkMode(false);
    expect(isDarkModeEnabled()).toBe(false);
    expect(document.body.classList.contains('dark-mode')).toBe(false);
    expect(localStorage.getItem('pb_dark_mode')).toBe('false');
  });

  it('should toggle dark mode state', () => {
    expect(toggleDarkMode()).toBe(true);
    expect(document.body.classList.contains('dark-mode')).toBe(true);
    expect(toggleDarkMode()).toBe(false);
    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('should update button UI text and attributes', () => {
    updateToggleButtonUI(true);
    const btn = document.getElementById('theme-toggle-btn');
    expect(btn.querySelector('.theme-toggle-icon')).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Toggle light mode');

    updateToggleButtonUI(false);
    expect(btn.querySelector('.theme-toggle-icon')).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toBe('Toggle dark mode');
  });

  it('should initialize dark mode and bind click event to toggle button', () => {
    localStorage.setItem('pb_dark_mode', 'true');
    initDarkMode();

    expect(document.body.classList.contains('dark-mode')).toBe(true);
    const btn = document.getElementById('theme-toggle-btn');
    expect(btn.querySelector('.theme-toggle-icon')).not.toBeNull();

    btn.click();

    expect(document.body.classList.contains('dark-mode')).toBe(false);
    expect(isDarkModeEnabled()).toBe(false);
    expect(btn.querySelector('.theme-toggle-icon')).not.toBeNull();
  });

  it('should swap header logo image src when dark mode changes', () => {
    const img = document.querySelector('.nav-logo img');
    setDarkMode(true);
    expect(img.src).toContain('main-site-logo-header-darkmode.png');

    setDarkMode(false);
    expect(img.src).toContain('main-site-logo-header.png');
  });
});
