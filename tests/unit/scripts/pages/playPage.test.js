/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    leagues: { getAll: vi.fn(), create: vi.fn(), addPlayer: vi.fn() },
    players: { getAll: vi.fn() },
    locations: { getAll: vi.fn() },
    events: { create: vi.fn() },
    machines: { saveTarget: vi.fn() },
    auth: {
      me: vi.fn(),
    }
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

const engineMock = vi.hoisted(() => ({
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
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => engineMock),
  SCORING_FORMATS: [
    { value: 'bowling', label: 'Bowling (Marks & Frames)' },
    { value: 'golf', label: 'Golf (Strokes vs Par)' }
  ],
}));

vi.mock('@scripts/utils.js', () => ({
  formatNumber: vi.fn(n => n?.toLocaleString() || '0'),
  applyScoreFormatting: vi.fn(),
  parseFormattedNumber: vi.fn((value, allowDecimal = false) => {
    const cleaned = String(value || '').replace(allowDecimal ? /[^\d.]/g : /\D/g, '');
    return allowDecimal ? Number.parseFloat(cleaned) || 0 : Number(cleaned) || 0;
  }),
  renderThresholdGrid: vi.fn(() => 'Grid'),
  getCookie: vi.fn(() => 'bowling'),
  loadPage: vi.fn(),
  escapeHTML: vi.fn(str => str),
}));

const uiMocks = vi.hoisted(() => ({
  createSearchableSelect: vi.fn(() => ({ updateOptions: vi.fn() })),
  showPlayerSelectionDialog: vi.fn(),
  createExpandableRow: vi.fn((container, options) => {
    const div = document.createElement('div');
    div.className = options.className || '';
    div.id = options.id;
    // Render header and content as real DOM so querySelector works on buttons inside
    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = options.headerHtml || '';
    const content = document.createElement('div');
    content.className = 'content';
    content.innerHTML = options.contentHtml || '';
    div.appendChild(header);
    div.appendChild(content);
    container.appendChild(div);
    // Bind onHeaderClick to the header element
    if (options.onHeaderClick) {
      header.addEventListener('click', options.onHeaderClick);
    }
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

vi.mock('@services/sessionGenerator.js', () => ({
  generatePars: vi.fn(() => [3, 4, 3]),
  generateSessionName: vi.fn((raw, loc, date, time) => raw || `${loc} ${date} ${time}`),
  selectRandomMachines: vi.fn((machines, count) => machines.slice(0, count)),
  getTargetScoreForDifficulty: vi.fn((m, diff) => m.targetMed || 1000),
}));

import { initPlayPage } from '@scripts/pages/playPage.js';
import { PB_API } from '@services/api.js';
import { can } from '@services/auth.js';
import { loadPage } from '@scripts/utils.js';
import { showPlayerSelectionDialog } from '@ui/dialogs.js';
import { selectRandomMachines, generateSessionName } from '@services/sessionGenerator.js';

describe('Play Page (playPage.js)', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    document.body.innerHTML = `
      <form id="quick-play-form">
        <select id="qp-location"></select>
        <select id="qp-format"></select>
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
      <label for="qp-frames">Frames</label>
    `;
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load and render existing session leagues', async () => {
    PB_API.leagues.getAll.mockResolvedValue([{ 
      id: 1, type: 'session', scoringFormat: 'bowling', events: [{ id: 101, eventName: 'Nightly', eventDate: new Date().toISOString().split('T')[0], scoringFormat: 'bowling' }] 
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    expect(document.getElementById('qp-sessions-list').children.length).toBe(1);
    expect(document.getElementById('qp-sessions-list').innerHTML).toContain('Nightly');
  });

  it('should generate a preview with random machines from location', async () => {
    const mockLocation = { id: 1, name: 'L1', machines: [
      { machineId: 10, machineName: 'M1', targetMed: 1000 },
      { machineId: 11, machineName: 'M2', targetMed: 2000 }
    ]};
    PB_API.locations.getAll.mockResolvedValue([mockLocation]);
    PB_API.leagues.getAll.mockResolvedValue([]);
    
    await initPlayPage();
    
    const locSelect = document.getElementById('qp-location');
    locSelect.value = '1';
    
    const form = document.getElementById('quick-play-form');
    await form.dispatchEvent(new Event('submit'));

    expect(document.getElementById('qp-preview-section').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('qp-frames-list').children.length).toBe(3);
  });

  it('should create league, event, and targets on finalize', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1' }] }]);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.leagues.create.mockResolvedValue({ id: 50 });
    PB_API.events.create.mockResolvedValue({ id: 500 });

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    await document.getElementById('finalize-qp-btn').onclick();

    expect(PB_API.leagues.create).toHaveBeenCalled();
    expect(PB_API.machines.saveTarget).toHaveBeenCalled();
  });

  it('should update round options when format changes', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const formatSelect = document.getElementById('qp-format');
    formatSelect.value = 'golf';
    formatSelect.dispatchEvent(new Event('change'));

    // The round label should be updated via engine.getRoundLabel
    expect(engineMock.getRoundLabel).toHaveBeenCalled();
    expect(engineMock.getRoundCountOptions).toHaveBeenCalled();
  });

  it('should show create toggle and hide generator options initially', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const createToggle = document.getElementById('create-new-toggle');
    const generatorOptions = document.getElementById('qp-generator-options');
    const generateBtn = document.getElementById('generate-qp-btn');

    expect(createToggle.classList.contains('hidden')).toBe(false);
    expect(generatorOptions.classList.contains('hidden')).toBe(true);
    expect(generateBtn.classList.contains('hidden')).toBe(true);
  });

  it('should toggle generator options on create button click', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const createToggle = document.getElementById('create-new-toggle');
    const generatorOptions = document.getElementById('qp-generator-options');
    const generateBtn = document.getElementById('generate-qp-btn');

    // First click: show generator
    createToggle.click();
    expect(generatorOptions.classList.contains('hidden')).toBe(false);
    expect(generateBtn.classList.contains('hidden')).toBe(false);
    expect(createToggle.textContent).toBe('Cancel');

    // Second click: hide generator
    createToggle.click();
    expect(generatorOptions.classList.contains('hidden')).toBe(true);
    expect(generateBtn.classList.contains('hidden')).toBe(true);
    expect(createToggle.textContent).toBe('Create New Session');
  });

  it('should hide create toggle when user lacks CREATE_SESSION permission', async () => {
    can.mockResolvedValue(false);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const createToggle = document.getElementById('create-new-toggle');
    expect(createToggle.classList.contains('hidden')).toBe(true);
  });

  it('should show change setup button and toggle setup fields', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);

    await initPlayPage();

    // Generate a preview first to show setup summary
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    // After generating, setup fields should be hidden and summary shown
    expect(document.getElementById('qp-setup-fields').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('qp-setup-summary').classList.contains('hidden')).toBe(false);

    // Click change button to show fields again
    const changeBtn = document.getElementById('qp-change-setup-btn');
    if (changeBtn) {
      changeBtn.click();
      expect(document.getElementById('qp-setup-fields').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('qp-setup-summary').classList.contains('hidden')).toBe(true);
    }
  });

  it('should filter sessions by name', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.leagues.getAll.mockResolvedValue([
      { id: 1, type: 'session', scoringFormat: 'bowling', events: [{ id: 101, eventName: 'Monday Night', eventDate: today, scoringFormat: 'bowling' }] },
      { id: 2, type: 'session', scoringFormat: 'bowling', events: [{ id: 102, eventName: 'Tuesday Fun', eventDate: today, scoringFormat: 'bowling' }] }
    ]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const nameInput = document.getElementById('qp-event-name');
    nameInput.value = 'Monday';
    nameInput.dispatchEvent(new Event('input'));

    const sessionsList = document.getElementById('qp-sessions-list');
    expect(sessionsList.innerHTML).toContain('Monday Night');
    expect(sessionsList.innerHTML).not.toContain('Tuesday Fun');
  });

  it('should show no sessions notice when no matching sessions', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const sessionsList = document.getElementById('qp-sessions-list');
    expect(sessionsList.innerHTML).toContain('No active sessions found');
  });

  it('should alert when location has no machines during preview generation', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'Empty Location', machines: [] }]);

    await initPlayPage();

    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    expect(alert).toHaveBeenCalledWith(expect.stringContaining('no machines'));
  });

  it('should auto-join player on Play button click when user has player_id', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.leagues.getAll.mockResolvedValue([{
      id: 1, type: 'session', scoringFormat: 'bowling',
      events: [{ id: 101, eventName: 'Session', eventDate: today, scoringFormat: 'bowling', leagueId: 1 }],
      players: [{ id: 5, playerName: 'Current Player' }]
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.auth.me.mockResolvedValue({ player_id: 5 });

    await initPlayPage();

    const playBtn = document.querySelector('.play-btn');
    expect(playBtn).not.toBeNull();
    playBtn.click();

    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(expect.stringContaining('scores'));
    });
    // Player 5 is already in roster, so addPlayer should NOT be called
    expect(PB_API.leagues.addPlayer).not.toHaveBeenCalled();
  });

  it('should show player selection dialog for guest users on Play click', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.leagues.getAll.mockResolvedValue([{
      id: 1, type: 'session', scoringFormat: 'bowling',
      events: [{ id: 101, eventName: 'Session', eventDate: today, scoringFormat: 'bowling', leagueId: 1 }],
      players: []
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.auth.me.mockResolvedValue(null);
    PB_API.players.getAll.mockResolvedValue([{ id: 10, playerName: 'Guest1' }]);
    showPlayerSelectionDialog.mockResolvedValue('10');
    PB_API.leagues.addPlayer.mockResolvedValue({}); // Return empty object (no .error)

    await initPlayPage();

    const playBtn = document.querySelector('.play-btn');
    expect(playBtn).not.toBeNull();
    playBtn.click();

    await vi.waitFor(() => {
      expect(showPlayerSelectionDialog).toHaveBeenCalled();
      expect(PB_API.leagues.addPlayer).toHaveBeenCalledWith(1, 10);
      expect(loadPage).toHaveBeenCalledWith(expect.stringContaining('scores'));
    });
  });

  it('should navigate to standings on Scoreboard button click', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.leagues.getAll.mockResolvedValue([{
      id: 1, type: 'session', scoringFormat: 'bowling',
      events: [{ id: 101, eventName: 'Session', eventDate: today, scoringFormat: 'bowling', leagueId: 1 }],
      players: []
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const scoreboardBtn = document.querySelector('.scoreboard-btn');
    if (scoreboardBtn) {
      scoreboardBtn.click();
      expect(loadPage).toHaveBeenCalledWith(expect.stringContaining('standings'));
    }
  });

  it('should alert on finalize error', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.leagues.create.mockRejectedValue(new Error('Server error'));

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    const finalizeBtn = document.getElementById('finalize-qp-btn');
    await finalizeBtn.onclick();

    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Server error'));
    expect(finalizeBtn.disabled).toBe(false);
    expect(finalizeBtn.textContent).toBe('Create Session');
  });

  it('should auto-join current user on finalize when player_id exists', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.leagues.create.mockResolvedValue({ id: 50 });
    PB_API.events.create.mockResolvedValue({ id: 500 });
    PB_API.auth.me.mockResolvedValue({ player_id: 42 });

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    const finalizeBtn = document.getElementById('finalize-qp-btn');
    await finalizeBtn.onclick();

    expect(PB_API.leagues.addPlayer).toHaveBeenCalledWith(50, 42);
    expect(loadPage).toHaveBeenCalledWith(expect.stringContaining('playerId=42'));
  });

  it('should populate location dropdown from API', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([
      { id: 1, name: 'Main Alley', city: 'NYC' },
      { id: 2, name: 'Side Lane', city: 'LA' }
    ]);

    await initPlayPage();

    const locSelect = document.getElementById('qp-location');
    expect(locSelect.children.length).toBe(2);
    expect(locSelect.children[0].textContent).toContain('Main Alley');
    expect(locSelect.children[1].textContent).toContain('Side Lane');
  });

  it('should populate format dropdown from SCORING_FORMATS', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const formatSelect = document.getElementById('qp-format');
    expect(formatSelect.children.length).toBe(2);
    expect(formatSelect.children[0].value).toBe('bowling');
    expect(formatSelect.children[1].value).toBe('golf');
  });

  it('should filter sessions by location', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.leagues.getAll.mockResolvedValue([
      { id: 1, type: 'session', scoringFormat: 'bowling', events: [{ id: 101, eventName: 'S1', eventDate: today, scoringFormat: 'bowling', locationId: 1 }] },
      { id: 2, type: 'session', scoringFormat: 'bowling', events: [{ id: 102, eventName: 'S2', eventDate: today, scoringFormat: 'bowling', locationId: 2 }] }
    ]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1' }, { id: 2, name: 'L2' }]);

    await initPlayPage();

    const locSelect = document.getElementById('qp-location');
    locSelect.value = '1';
    locSelect.dispatchEvent(new Event('change'));

    const sessionsList = document.getElementById('qp-sessions-list');
    expect(sessionsList.innerHTML).toContain('S1');
    expect(sessionsList.innerHTML).not.toContain('S2');
  });

  it('should handle Unauthorized error on Play button click', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.leagues.getAll.mockResolvedValue([{
      id: 1, type: 'session', scoringFormat: 'bowling',
      events: [{ id: 101, eventName: 'Session', eventDate: today, scoringFormat: 'bowling', leagueId: 1 }],
      players: []
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.auth.me.mockResolvedValue({ player_id: 5 });
    PB_API.leagues.addPlayer.mockRejectedValue(new Error('Unauthorized'));

    await initPlayPage();

    const playBtn = document.querySelector('.play-btn');
    expect(playBtn).not.toBeNull();
    playBtn.click();

    // Should show access denied dialog for Unauthorized
    await vi.waitFor(() => {
      expect(showPlayerSelectionDialog).toHaveBeenCalledWith(
        'Access Denied',
        expect.stringContaining('Guest'),
        [],
        'Close'
      );
    });
  });

  it('should hide preview section when canceling create flow', async () => {
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);

    await initPlayPage();

    // Show generator, generate preview
    const createToggle = document.getElementById('create-new-toggle');
    createToggle.click(); // Show generator
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    expect(document.getElementById('qp-preview-section').classList.contains('hidden')).toBe(false);

    // Cancel creation
    createToggle.click();
    expect(document.getElementById('qp-preview-section').classList.contains('hidden')).toBe(true);
  });

  it('should throw error when league creation returns no id on finalize', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.leagues.create.mockResolvedValue({}); // No id

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    const finalizeBtn = document.getElementById('finalize-qp-btn');
    await finalizeBtn.onclick();

    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Failed to create session'));
  });

  it('should throw error when event creation returns no id on finalize', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);
    PB_API.leagues.getAll.mockResolvedValue([]);
    PB_API.leagues.create.mockResolvedValue({ id: 50 });
    PB_API.events.create.mockResolvedValue({}); // No id

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    const finalizeBtn = document.getElementById('finalize-qp-btn');
    await finalizeBtn.onclick();

    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Failed to create event'));
  });
});
