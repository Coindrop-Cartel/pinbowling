/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initNavigation } from '@ui/navigation.js';

// Mock ROUTES with simple string-builders for testing
vi.mock('@scripts/routes.js', () => {
  const buildUrl = (path, params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, value);
      }
    });
    const queryString = searchParams.toString();
    return `${path}${queryString ? '?' + queryString : ''}`;
  };
  return {
    ROUTES: {
      HOME: (p = {}) => buildUrl('/', p),
      MACHINES: (p = {}) => buildUrl('/machines', p),
      SCORES: (p = {}) => buildUrl('/scores', p),
      STANDINGS: (p = {}) => buildUrl('/standings', p),
    },
  };
});

vi.mock('@scripts/utils.js', () => ({
  loadPage: vi.fn(),
}));

import { loadPage } from '@scripts/utils.js';

describe('Navigation Utility (navigation.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <nav class="nav-container">
        <div class="nav-links">
          <a data-route="HOME">Home</a>
          <a data-route="MACHINES">Machines</a>
          <a data-route="SCORES">Scores</a>
          <a data-route="STANDINGS">Standings</a>
          <div class="nav-item dropdown">
            <button class="dropbtn">Admin</button>
            <a data-route="MACHINES" href="/machines.php">Nested Link</a>
          </div>
        </div>
      </nav>
    `;
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/',
      search: '',
      href: 'http://localhost/',
    });
    loadPage.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize hrefs and preserve persistent URL parameters', () => {
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/',
      search: '?leagueId=42&playerId=7&other=ignored',
      href: 'http://localhost/?leagueId=42&playerId=7&other=ignored',
    });
    initNavigation('.nav-container');
    const links = document.querySelectorAll('a[data-route]');
    expect(links[0].getAttribute('href')).toBe('/?leagueId=42&playerId=7');
    expect(links[1].getAttribute('href')).toBe('/machines?leagueId=42&playerId=7');
  });

  it('should apply "active" class to links matching the current path', () => {
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/machines.php',
      search: '',
      href: 'http://localhost/machines.php',
    });
    initNavigation('.nav-container');
    const machinesLink = document.querySelector('a[data-route="MACHINES"]');
    const homeLink = document.querySelector('a[data-route="HOME"]');
    expect(machinesLink.classList.contains('active')).toBe(true);
    expect(homeLink.classList.contains('active')).toBe(false);
    // Parent dropdown should also get the active class
    expect(document.querySelector('.dropbtn').classList.contains('active')).toBe(true);
  });

  it('should normalize paths correctly (stripping extensions and handling trailing slashes)', () => {
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/machines/',
      search: '',
      href: 'http://localhost/machines/',
    });
    initNavigation('.nav-container');
    expect(document.querySelector('a[data-route="MACHINES"]').classList.contains('active')).toBe(true);
  });

  it('should do nothing if the navigation container is not found', () => {
    const container = document.querySelector('.nav-container');
    initNavigation('.missing-container');
    expect(container.querySelector('a').getAttribute('href')).toBeNull();
  });

  // ── Link click handlers ─────────────────────────────────────────
  describe('link click handlers', () => {
    it('should call loadPage when clicking a link to a different page', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      initNavigation('.nav-container');
      const machinesLink = document.querySelector('a[data-route="MACHINES"]');
      machinesLink.click();
      expect(loadPage).toHaveBeenCalled();
    });

    it('should prevent default and not call loadPage for same-page links', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      initNavigation('.nav-container');
      const homeLink = document.querySelector('a[data-route="HOME"]');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      const spy = vi.spyOn(event, 'preventDefault');
      homeLink.dispatchEvent(event);
      // loadPage should NOT be called since it's the same page
      expect(loadPage).not.toHaveBeenCalled();
    });

    it('should stop propagation on link clicks', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      initNavigation('.nav-container');
      const machinesLink = document.querySelector('a[data-route="MACHINES"]');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      const spy = vi.spyOn(event, 'stopPropagation');
      machinesLink.dispatchEvent(event);
      expect(spy).toHaveBeenCalled();
    });

    it('should reset eventId when clicking Scores while on scores page', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/scores',
        search: '?eventId=5',
        href: 'http://localhost/scores?eventId=5',
      });
      initNavigation('.nav-container');
      const scoresLink = document.querySelector('a[data-route="SCORES"]');
      scoresLink.click();
      // The href should have been modified to remove eventId
      const calledUrl = loadPage.mock.calls[0]?.[0] || scoresLink.href;
      expect(calledUrl).not.toContain('eventId');
    });

    it('should reset eventId when clicking Standings while on standings page', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/standings',
        search: '?eventId=10',
        href: 'http://localhost/standings?eventId=10',
      });
      initNavigation('.nav-container');
      const standingsLink = document.querySelector('a[data-route="STANDINGS"]');
      standingsLink.click();
      const calledUrl = loadPage.mock.calls[0]?.[0] || standingsLink.href;
      expect(calledUrl).not.toContain('eventId');
    });

    it('should collapse all dropdowns on link click', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      initNavigation('.nav-container');
      const dropdown = document.querySelector('.nav-item.dropdown');
      dropdown.classList.add('is-open');
      const machinesLink = document.querySelector('a[data-route="MACHINES"]');
      machinesLink.click();
      expect(dropdown.classList.contains('is-open')).toBe(false);
    });
  });

  // ── Dropdown toggle on mobile ───────────────────────────────────
  describe('dropdown toggle on mobile', () => {
    it('should toggle dropdown on mobile (innerWidth <= 768)', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
      initNavigation('.nav-container');
      const dropdown = document.querySelector('.nav-item.dropdown');
      const btn = dropdown.querySelector('.dropbtn');
      btn.click();
      expect(dropdown.classList.contains('is-open')).toBe(true);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      // Click again to close
      btn.click();
      expect(dropdown.classList.contains('is-open')).toBe(false);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should not toggle dropdown on desktop (innerWidth > 768)', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
      initNavigation('.nav-container');
      const dropdown = document.querySelector('.nav-item.dropdown');
      const btn = dropdown.querySelector('.dropbtn');
      btn.click();
      expect(dropdown.classList.contains('is-open')).toBe(false);
    });

    it('should close other dropdowns when opening one (accordion)', () => {
      document.body.innerHTML = `
        <nav class="nav-container">
          <div class="nav-links">
            <div class="nav-item dropdown">
              <button class="dropbtn">Menu 1</button>
            </div>
            <div class="nav-item dropdown">
              <button class="dropbtn">Menu 2</button>
            </div>
          </div>
        </nav>
      `;
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
      initNavigation('.nav-container');
      const dropdowns = document.querySelectorAll('.nav-item.dropdown');
      const btn1 = dropdowns[0].querySelector('.dropbtn');
      const btn2 = dropdowns[1].querySelector('.dropbtn');

      // Open first
      btn1.click();
      expect(dropdowns[0].classList.contains('is-open')).toBe(true);

      // Open second — first should close
      btn2.click();
      expect(dropdowns[0].classList.contains('is-open')).toBe(false);
      expect(dropdowns[1].classList.contains('is-open')).toBe(true);
    });

    it('should toggle dropdown-active class on nav-links', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
      initNavigation('.nav-container');
      const navLinks = document.querySelector('.nav-links');
      const btn = document.querySelector('.nav-item.dropdown .dropbtn');

      btn.click();
      expect(navLinks.classList.contains('dropdown-active')).toBe(true);

      btn.click();
      expect(navLinks.classList.contains('dropdown-active')).toBe(false);
    });

    it('should prevent default and stop propagation on dropdown button click', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
      initNavigation('.nav-container');
      const btn = document.querySelector('.nav-item.dropdown .dropbtn');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      const preventSpy = vi.spyOn(event, 'preventDefault');
      const stopSpy = vi.spyOn(event, 'stopPropagation');
      btn.dispatchEvent(event);
      expect(preventSpy).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  // ── collapseAll ─────────────────────────────────────────────────
  describe('collapseAll', () => {
    it('should remove is-open from all dropdowns on init', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      const dropdown = document.querySelector('.nav-item.dropdown');
      dropdown.classList.add('is-open');
      initNavigation('.nav-container');
      expect(dropdown.classList.contains('is-open')).toBe(false);
    });

    it('should remove dropdown-active from nav-links on init', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      const navLinks = document.querySelector('.nav-links');
      navLinks.classList.add('dropdown-active');
      initNavigation('.nav-container');
      expect(navLinks.classList.contains('dropdown-active')).toBe(false);
    });

    it('should reset aria-expanded to false on all dropdowns', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      const btn = document.querySelector('.nav-item.dropdown .dropbtn');
      btn.setAttribute('aria-expanded', 'true');
      initNavigation('.nav-container');
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });
  });

  // ── Active class assignment ─────────────────────────────────────
  describe('active class assignment', () => {
    it('should clear all active classes before reassigning', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/machines.php',
        search: '',
        href: 'http://localhost/machines.php',
      });
      // Pre-add active to home link
      const homeLink = document.querySelector('a[data-route="HOME"]');
      homeLink.classList.add('active');
      initNavigation('.nav-container');
      expect(homeLink.classList.contains('active')).toBe(false);
      expect(document.querySelector('a[data-route="MACHINES"]').classList.contains('active')).toBe(true);
    });

    it('should handle index page as currentBase', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      initNavigation('.nav-container');
      expect(document.querySelector('a[data-route="HOME"]').classList.contains('active')).toBe(true);
    });

    it('should not add active class to any link when no route matches', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/unknown-page',
        search: '',
        href: 'http://localhost/unknown-page',
      });
      initNavigation('.nav-container');
      const activeLinks = document.querySelectorAll('a[data-route].active');
      expect(activeLinks.length).toBe(0);
    });

    it('should add active class to dropbtn when link is inside a dropdown', () => {
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/machines.php',
        search: '',
        href: 'http://localhost/machines.php',
      });
      initNavigation('.nav-container');
      const dropbtn = document.querySelector('.dropbtn');
      expect(dropbtn.classList.contains('active')).toBe(true);
    });
  });

  // ── Debug mode ──────────────────────────────────────────────────
  describe('debug mode', () => {
    it('should log debug messages when PB_DEBUG_MODE is true', () => {
      vi.stubGlobal('PB_DEBUG_MODE', true);
      vi.stubGlobal('location', {
        origin: 'http://localhost',
        pathname: '/',
        search: '',
        href: 'http://localhost/',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      initNavigation('.nav-container');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
      vi.stubGlobal('PB_DEBUG_MODE', false);
    });
  });
});