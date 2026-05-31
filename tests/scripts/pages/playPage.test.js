/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initPlayPage } from '@pages/playPage.js';
import { PB_API } from '@services/api.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getPlayers: vi.fn(),
    getLocations: vi.fn(),
    createLeague: vi.fn(),
    createEvent: vi.fn(),
    saveTargetScore: vi.fn(),
    addLeaguePlayer: vi.fn(),
  },
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    buildRoundValues: vi.fn(() => ({ 10: 1000, 1: 100 })),
  })),
}));

vi.mock('@scripts/utils.js', () => ({
  formatNumber: (n) => String(n),
  applyScoreFormatting: vi.fn(),
}));

vi.mock('@ui/uiComponents.js', () => ({
  createSearchableSelect: vi.fn(() => ({ updateOptions: vi.fn() })),
  showPlayerSelectionDialog: vi.fn(),
}));

describe('Quick Play Page (playPage.js)', () => {
  beforeEach(() => {
    // Mock layout methods not implemented in JSDOM
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    document.body.innerHTML = `
      <form id="quick-play-form">
        <select id="qp-location"></select>
        <input id="qp-event-name" />
        <div id="qp-setup-fields"></div>
        <div id="qp-setup-summary" class="hidden"><div id="qp-summary-text"></div></div>
        <div id="qp-generator-options" class="hidden">
           <select id="qp-frames"><option value="10">10</option></select>
           <select id="qp-difficulty"><option value="med">Med</option></select>
        </div>
        <button type="button" id="create-new-toggle">Create</button>
        <button id="generate-qp-btn" class="hidden">Generate</button>
      </form>
      <section id="qp-sessions-card"><div id="qp-sessions-list"></div></section>
      <section id="qp-preview-section" class="hidden">
        <div id="qp-frames-list"></div>
        <button id="finalize-qp-btn">Finalize</button>
      </section>
    `;

    vi.clearAllMocks();
    PB_API.getLeagues.mockResolvedValue([{ name: 'Quick Play Sessions', events: [] }]);
    PB_API.getPlayers.mockResolvedValue([]);
    PB_API.getLocations.mockResolvedValue([{ id: 1, name: 'Bar', machines: [{ machineId: 1, machineName: 'Pin' }] }]);
  });

  it('should show the generator form when Create is clicked', async () => {
    await initPlayPage();
    const toggle = document.getElementById('create-new-toggle');
    const options = document.getElementById('qp-generator-options');
    const sessionsCard = document.getElementById('qp-sessions-card');

    toggle.click();
    expect(options.classList.contains('hidden')).toBe(false);
    expect(sessionsCard.classList.contains('hidden')).toBe(true);
  });

  it('should render a lineup preview when Generate is clicked', async () => {
    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    
    const form = document.getElementById('quick-play-form');
    await form.dispatchEvent(new Event('submit'));

    const preview = document.getElementById('qp-preview-section');
    expect(preview.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('qp-frames-list').children.length).toBeGreaterThan(0);
  });

  it('should display "No active sessions" if todayEvents is empty', async () => {
    // Override mock for this test
    PB_API.getLeagues.mockResolvedValue([{ name: 'Quick Play Sessions', events: [] }]);
    await initPlayPage();
    
    const list = document.getElementById('qp-sessions-list');
    expect(list.innerHTML).toContain('No active sessions found');
  });
});