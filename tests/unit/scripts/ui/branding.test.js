/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { applyPreferredTheme, getFormatBadgeHtml, fitTVModeToScreen } from '@ui/branding.js';
import { getCookie } from '@scripts/utils.js'; // Keep this import
vi.mock('@scripts/utils.js', () => ({ getCookie: vi.fn(() => 'bowling'), }));

// Dynamic mock for getScoringEngine to return format-specific values (moved to top-level)
const { getScoringEngineMock } = vi.hoisted(() => ({
  getScoringEngineMock: vi.fn((format = 'bowling') => ({
    getBrandName: vi.fn(() => {
      if (format === 'golf') return 'PinGolf';
      return 'PinBowling';
    }),
    getLogoImage: vi.fn(() => {
      if (format === 'golf') return 'logo-golf.png';
      return 'logo-bowling.png';
    }),
    getPlayActionLabel: vi.fn(() => {
      if (format === 'golf') return 'Play Golf';
      return 'Bowl Now';
    }),
    getScoringDescription: vi.fn(() => {
      if (format === 'golf') return 'Golf-style scoring';
      return 'Bowling-style scoring';
    }),
    getThemeClass: vi.fn(() => `theme-${format}`),
  })),
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: getScoringEngineMock,
}));

describe('Branding Utilities (branding.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.classList.remove('theme-golf', 'theme-bowling');
    vi.mocked(getCookie).mockReturnValue('bowling');
  });

  describe('applyPreferredTheme', () => {
    it('should apply bowling theme by default', () => {
      applyPreferredTheme();
      expect(document.body.classList.contains('theme-bowling')).toBe(true);
      expect(document.body.classList.contains('theme-golf')).toBe(false);
    });
    it('should apply golf theme when override format is golf', () => {
      document.body.classList.add('theme-bowling');
      applyPreferredTheme('golf');
      expect(document.body.classList.contains('theme-golf')).toBe(true);
      expect(document.body.classList.contains('theme-bowling')).toBe(false);
    });
    it('should use cookie value when no override is provided', () => {
      vi.mocked(getCookie).mockReturnValue('golf');
      applyPreferredTheme();
      expect(document.body.classList.contains('theme-golf')).toBe(true);
    });
    it('should default to bowling when cookie is empty', () => {
      vi.mocked(getCookie).mockReturnValue('');
      applyPreferredTheme();
      expect(document.body.classList.contains('theme-bowling')).toBe(true);
    });
    it('should update logo images and alt text', () => {
      document.body.innerHTML = `<div class="nav-logo"><img src="/images/old.png" /></div><div class="header-logo"><img src="/images/old.png" /></div>`;
      applyPreferredTheme('bowling');
      const imgs = document.querySelectorAll('.nav-logo img, .header-logo img');
      imgs.forEach(img => {
        expect(img.src).toContain('logo-bowling.png');
        expect(img.alt).toBe('PinBowling Logo');
      });
    });
    it('should update nav brand name spans', () => {
      document.body.innerHTML = `<div class="nav-logo"><span>Old Name</span></div>`;
      applyPreferredTheme('golf');
      expect(document.querySelector('.nav-logo span').textContent).toBe('PinGolf');
    });
    it('should update play CTA links', () => {
      document.body.innerHTML = `<a data-route="PLAY">Old Label</a>`;
      applyPreferredTheme('bowling');
      expect(document.querySelector('[data-route="PLAY"]').textContent).toBe('Bowl Now');
    });
    it('should update scoring-logic-text element', () => {
      document.body.innerHTML = `<span id="scoring-logic-text">Old text</span>`;
      applyPreferredTheme('golf');
      expect(document.getElementById('scoring-logic-text').textContent).toBe('Golf-style scoring');
    });
    it('should not crash when scoring-logic-text element is missing', () => {
      document.body.innerHTML = '';
      expect(() => applyPreferredTheme('bowling')).not.toThrow();
    });
    it('should remove previous theme class before applying new one', () => {
      document.body.classList.add('theme-bowling');
      applyPreferredTheme('golf');
      expect(document.body.classList.contains('theme-bowling')).toBe(false);
      expect(document.body.classList.contains('theme-golf')).toBe(true);
    });
    it('should handle logo src with no slash gracefully', () => {
      document.body.innerHTML = `<div class="nav-logo"><img src="logo.png" /></div>`;
      applyPreferredTheme('bowling');
      const img = document.querySelector('.nav-logo img');
      expect(img.src).toContain('logo-bowling.png');
    });
    it('should update site-logo img and #site-logo elements', () => {
      document.body.innerHTML = `<div class="site-logo"><img src="/images/old.png" /></div><img id="site-logo" src="/images/old.png" />`;
      applyPreferredTheme('golf');
      document.querySelectorAll('.site-logo img, #site-logo').forEach(img => {
        expect(img.src).toContain('logo-golf.png');
      });
    });
  });
  describe('getFormatBadgeHtml', () => {
    it('should return empty string for falsy format', () => {
      expect(getFormatBadgeHtml(null)).toBe('');
      expect(getFormatBadgeHtml('')).toBe('');
      expect(getFormatBadgeHtml(undefined)).toBe('');
    });
    it('should return badge HTML with bowling theme class and brand name', () => {
      const html = getFormatBadgeHtml('bowling');
      expect(html).toContain('badge');
      expect(html).toContain('theme-bowling');
      expect(html).toContain('PinBowling');
    });
    it('should return badge HTML with golf theme class and brand name', () => {
      const html = getFormatBadgeHtml('golf');
      expect(html).toContain('badge');
      expect(html).toContain('theme-golf');
      expect(html).toContain('PinGolf');
    });
    it('should include the badge CSS class', () => {
      const html = getFormatBadgeHtml('bowling');
      expect(html).toContain('class="badge');
    });
  });
  describe('fitTVModeToScreen', () => {
    it('should do nothing when tv-mode-content container does not exist', () => {
      expect(() => fitTVModeToScreen()).not.toThrow();
    });
    it('should clear transform when not in tv-mode-active', () => {
      document.body.innerHTML = '<div id="tv-mode-content" style="transform: scale(0.5); width: 200%;"></div>';
      const container = document.getElementById('tv-mode-content');
      document.body.classList.remove('tv-mode-active');
      fitTVModeToScreen();
      expect(container.style.transform).toBe('');
      expect(container.style.width).toBe('');
    });
    it('should apply scaling when content is wider than viewport in tv-mode', () => {
      document.body.innerHTML = '<div id="tv-mode-content" style="width: 2000px;"></div>';
      document.body.classList.add('tv-mode-active');
      Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 2000 });
      fitTVModeToScreen();
      const container = document.getElementById('tv-mode-content');
      expect(container.style.transform).toContain('scale');
      expect(container.style.transformOrigin).toBe('top center');
    });
    it('should not scale when content fits within viewport', () => {
      document.body.innerHTML = '<div id="tv-mode-content" style="width: 500px;"></div>';
      document.body.classList.add('tv-mode-active');
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 500 });
      fitTVModeToScreen();
      const container = document.getElementById('tv-mode-content');
      expect(container.style.transform).toBe('scale(1)');
    });
    it('should reset transform and width before recalculating', () => {
      document.body.innerHTML = '<div id="tv-mode-content" style="transform: scale(0.5); width: 200%;"></div>';
      document.body.classList.add('tv-mode-active');
      Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 500 });
      fitTVModeToScreen();
      const container = document.getElementById('tv-mode-content');
      expect(container.style.transform).toBe('scale(1)');
      expect(container.style.width).toBe('auto');
    });
  });
});