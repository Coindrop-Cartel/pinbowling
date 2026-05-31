/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initNavigation } from '@ui/navigation.js';

// Mock ROUTES with simple string-builders for testing
vi.mock('@scripts/routes.js', () => ({
  ROUTES: {
    HOME: (p) => `/?leagueId=${p.leagueId || ''}`,
    MACHINES: (p) => `/machines?leagueId=${p.leagueId || ''}`
  }
}));

describe('Navigation Utility (navigation.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <nav class="nav-container">
        <a data-route="HOME">Home</a>
        <a data-route="MACHINES">Machines</a>
        <div class="dropdown">
           <button class="dropbtn">Admin</button>
           <a data-route="MACHINES" href="/machines.php">Nested Link</a>
        </div>
      </nav>
    `;

    // Default location stub
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/',
      search: ''
    });
  });

  it('should initialize hrefs and preserve persistent URL parameters', () => {
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/',
      search: '?leagueId=42&playerId=7&other=ignored'
    });

    initNavigation('.nav-container');

    const links = document.querySelectorAll('a[data-route]');
    expect(links[0].getAttribute('href')).toBe('/?leagueId=42');
    expect(links[1].getAttribute('href')).toBe('/machines?leagueId=42');
  });

  it('should apply "active" class to links matching the current path', () => {
    vi.stubGlobal('location', {
      pathname: '/machines.php',
      search: ''
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
      pathname: '/machines/',
      search: ''
    });

    initNavigation('.nav-container');
    expect(document.querySelector('a[data-route="MACHINES"]').classList.contains('active')).toBe(true);
  });

  it('should do nothing if the navigation container is not found', () => {
    const container = document.querySelector('.nav-container');
    initNavigation('.missing-container');
    expect(container.querySelector('a').getAttribute('href')).toBeNull();
  });
});