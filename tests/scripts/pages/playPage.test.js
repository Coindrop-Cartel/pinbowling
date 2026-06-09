/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getPlayers: vi.fn(),
    getLocations: vi.fn(),
    createLeague: vi.fn(),
    createEvent: vi.fn(),
    saveTargetScore: vi.fn(),
    getCurrentUser: vi.fn()
  }
}));

vi.mock('@services/auth.js', () => ({
  can: vi.fn(() => Promise.resolve(true)),
  filterPlayersForUser: vi.fn((players) => players),
  PERMISSIONS: {
    CREATE_SESSION: 'CREATE_SESSION',
    JOIN_SESSION: 'JOIN_SESSION'
  }
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    buildRoundValues: vi.fn(() => ({ 1: 100, 10: 1000 })),
    getInitialValues: vi.fn((score) => ({ value1: score, value2: score / 10 })),
    getValue1Label: vi.fn(() => 'Strike'),
    getValue2Label: vi.fn(() => '1 Pin'),
    getThresholdPrefix: vi.fn(() => 'Pins'),
    getThresholdRange: vi.fn(() => [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]),
    getRowSummaryHtml: vi.fn(() => '<div>Summary</div>'),
    getMarkFormatting: vi.fn(() => ''),
    formatMark: vi.fn((turn) => turn.mark),
    getThresholdLabel: vi.fn(rank => rank),
    getThresholdRowStyle: vi.fn(() => ''),
    getThresholdSort: vi.fn(() => (a, b) => b[0] - a[0]),
    getRoundLabel: vi.fn(() => 'Frame'),
    getBrandName: vi.fn(() => 'PinBowling'),
    getThemeClass: vi.fn(() => 'theme-bowling'),
    filterThresholds: vi.fn((v) => v),
    getRoundCountOptions: vi.fn(() => [3, 5, 10]),
  }))
}));

vi.mock('@scripts/utils.js', () => ({
  formatNumber: vi.fn(n => n?.toLocaleString() || '0'),
  applyScoreFormatting: vi.fn(),
  renderThresholdGrid: vi.fn(() => 'Grid'),
  getCookie: vi.fn(() => 'bowling'),
  loadPage: vi.fn(),
}));

const uiMocks = vi.hoisted(() => ({
  createSearchableSelect: vi.fn(),
  showPlayerSelectionDialog: vi.fn(),
  createExpandableRow: vi.fn((container, options) => {
    const div = document.createElement('div');
    div.className = options.className || '';
    div.id = options.id;
    div.innerHTML = `<div class="header">${options.headerHtml || ''}</div><div class="content">${options.contentHtml || ''}</div>`;
    container.appendChild(div);
    return div;
  }),
  setupSortableList: vi.fn(),
  renderThresholdGrid: vi.fn(() => 'Grid'),
  getFormatBadgeHtml: vi.fn(() => 'Badge'),
  applyPreferredTheme: vi.fn(),
}));

vi.mock('@ui/selectors.js', () => uiMocks);
vi.mock('@ui/dialogs.js', () => uiMocks);
vi.mock('@ui/branding.js', () => uiMocks);

import { initPlayPage } from '@scripts/pages/playPage.js';
import { PB_API } from '@services/api.js';

describe('Play Page (playPage.js)', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    document.body.innerHTML = `
      <form id="quick-play-form">
        <select id="qp-location"></select>
        <input id="qp-event-name" />
        <input id="qp-frames" value="3" />
        <select id="qp-difficulty"><option value="med">Medium</option></select>
        <select id="qp-scaling"><option value="curved">Curved</option></select>
        <button id="generate-qp-btn" class="hidden"></button>
      </form>
      <button id="create-new-toggle"></button>
      <div id="qp-generator-options" class="hidden"></div>
      <div id="qp-sessions-card"></div>
      <div id="qp-sessions-list"></div>
      <div id="qp-preview-section" class="hidden">
        <div id="qp-frames-list"></div>
        <button id="finalize-qp-btn"></button>
      </div>
      <div id="qp-setup-fields"></div>
      <div id="qp-setup-summary" class="hidden"><span id="qp-summary-text"></span></div>
    `;
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should load and render existing session leagues', async () => {
    PB_API.getLeagues.mockResolvedValue([{ 
      id: 1, type: 'session', events: [{ id: 101, eventName: 'Nightly', eventDate: new Date().toISOString().split('T')[0] }] 
    }]);
    PB_API.getLocations.mockResolvedValue([]);

    await initPlayPage();

    expect(document.getElementById('qp-sessions-list').children.length).toBe(1);
    expect(document.getElementById('qp-sessions-list').innerHTML).toContain('Nightly');
  });

  it('should generate a preview with random machines from location', async () => {
    const mockLocation = { id: 1, name: 'L1', machines: [
      { machineId: 10, machineName: 'M1', targetMed: 1000 },
      { machineId: 11, machineName: 'M2', targetMed: 2000 }
    ]};
    PB_API.getLocations.mockResolvedValue([mockLocation]);
    PB_API.getLeagues.mockResolvedValue([]);
    
    await initPlayPage();
    
    const locSelect = document.getElementById('qp-location');
    locSelect.value = '1';
    
    const form = document.getElementById('quick-play-form');
    await form.dispatchEvent(new Event('submit'));

    expect(document.getElementById('qp-preview-section').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('qp-frames-list').children.length).toBe(3); // qp-frames value
  });

  it('should create league, event, and targets on finalize', async () => {
    PB_API.getLocations.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1' }] }]);
    PB_API.getLeagues.mockResolvedValue([]);
    PB_API.createLeague.mockResolvedValue({ id: 50 });
    PB_API.createEvent.mockResolvedValue({ id: 500 });

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    await document.getElementById('finalize-qp-btn').onclick();

    expect(PB_API.createLeague).toHaveBeenCalled();
    expect(PB_API.saveTargetScore).toHaveBeenCalled();
  });
});