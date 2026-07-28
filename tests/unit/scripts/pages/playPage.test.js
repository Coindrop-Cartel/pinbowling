/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Shared store so the getMachines mock can read location data set by getAll
const apiMock = vi.hoisted(() => ({
  locations: [],
  getMachines: vi.fn((locationId) => {
    const loc = apiMock.locations.find(l => l.id === Number(locationId));
    return Promise.resolve(loc?.machines || []);
  }),
}));

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    leagues: { getAll: vi.fn(), create: vi.fn(), addPlayer: vi.fn(), get: vi.fn() },
    players: { getAll: vi.fn() },
    locations: {
      getAll: vi.fn(() => Promise.resolve(apiMock.locations)),
      getMachines: apiMock.getMachines,
    },
    events: { create: vi.fn() },
    sessions: { getAll: vi.fn().mockResolvedValue([]), addPlayer: vi.fn(), create: vi.fn(), get: vi.fn() },
    machines: { saveTarget: vi.fn() },
    matchups: { save: vi.fn() },
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
  getMachinesPerRound: vi.fn(() => 1),
  generateValue2Defaults: vi.fn(() => []),
  getMaxRosterSize: vi.fn(() => Infinity),
  availableSpots: vi.fn(() => Infinity),
  getMatchupDescription: vi.fn(() => null),
  getPreviewRowHtml: vi.fn((frame, index) => ({
    headerHtml: `<div class="header"><span>${index}</span><span>${frame.machineName}</span></div>`,
    contentHtml: '<div class="content">content</div>'
  })),
  getPreviewRowData: vi.fn((frame) => ({
    value1: frame.value1,
    value2: frame.value2
  })),
  getBonusTargets: vi.fn(() => ({ t1: 0, t2: 0 })),
  generateMatchupPayload: vi.fn(() => []),
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

vi.mock('@scripts/renderers/roundRowRenderer.js', () => ({
  renderPreviewRow: vi.fn((engine, frame, index, isExpanded, formatNumber, escapeHTML, renderThresholdGrid) => {
    if (engine && engine.getPreviewRowHtml) {
      return engine.getPreviewRowHtml(frame, index, isExpanded, null, formatNumber, escapeHTML, renderThresholdGrid);
    }
    return { headerHtml: '', contentHtml: '' };
  })
}));

const uiMocks = vi.hoisted(() => ({
  createSearchableSelect: vi.fn(() => ({ updateOptions: vi.fn() })),
  showPlayerSelectionDialog: vi.fn(),
  showDialog: vi.fn(),
  showAlert: vi.fn(),
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
  generateSessionName: vi.fn((raw, loc, date, time) => raw || `${loc} ${date} ${time}`),
  selectRandomMachines: vi.fn((machines, count) => machines.slice(0, count)),
  getTargetScoreForDifficulty: vi.fn((m, diff) => {
    if (diff === 'easy') return m?.targetEasy || 500;
    if (diff === 'hard') return m?.targetHard || 2000;
    return m?.targetMed || 1000;
  }),
}));

import { initPlayPage } from '@scripts/pages/playPage.js';
import { PB_API } from '@services/api.js';
import { can } from '@services/auth.js';
import { loadPage } from '@scripts/utils.js';
import { showPlayerSelectionDialog, showAlert, showDialog } from '@ui/dialogs.js';
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

    // Sync the shared location store whenever a test sets getAll's return value
    apiMock.locations = [];
    const originalMockResolvedValue = PB_API.locations.getAll.mockResolvedValue.bind(PB_API.locations.getAll);
    PB_API.locations.getAll.mockResolvedValue = (value) => {
      apiMock.locations = Array.isArray(value) ? value : [];
      return originalMockResolvedValue(value);
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should load and render existing sessions', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.sessions.getAll.mockResolvedValue([{ 
      id: 1, name: 'Nightly Session', scoringFormat: 'bowling', players: [],
      events: [{ id: 101, eventName: 'Nightly', eventDate: today, scoringFormat: 'bowling', locationId: null, sessionId: 1 }] 
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);

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
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);
    
    await initPlayPage();
    
    const locSelect = document.getElementById('qp-location');
    locSelect.value = '1';
    
    const form = document.getElementById('quick-play-form');
    await form.dispatchEvent(new Event('submit'));

    expect(document.getElementById('qp-preview-section').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('qp-frames-list').children.length).toBe(3);
  });

  it('should create session and targets on finalize', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1' }] }]);
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.sessions.create.mockResolvedValue({ id: 50, events: [{ id: 500 }] });
    PB_API.auth.me.mockResolvedValue(null);

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    await document.getElementById('finalize-qp-btn').onclick();

    expect(PB_API.sessions.create).toHaveBeenCalled();
    expect(PB_API.machines.saveTarget).toHaveBeenCalled();
  });

  it('should update round options when format changes', async () => {
    PB_API.sessions.getAll.mockResolvedValue([]);
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
    PB_API.sessions.getAll.mockResolvedValue([]);
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
    PB_API.sessions.getAll.mockResolvedValue([]);
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
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const createToggle = document.getElementById('create-new-toggle');
    expect(createToggle.classList.contains('hidden')).toBe(true);
  });

  it('should show change setup button and toggle setup fields', async () => {
    PB_API.sessions.getAll.mockResolvedValue([]);
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
    PB_API.sessions.getAll.mockResolvedValue([
      { id: 1, name: 'Monday Night', scoringFormat: 'bowling', players: [], events: [{ id: 101, eventName: 'Monday Night', eventDate: today, scoringFormat: 'bowling', sessionId: 1 }] },
      { id: 2, name: 'Tuesday Fun', scoringFormat: 'bowling', players: [], events: [{ id: 102, eventName: 'Tuesday Fun', eventDate: today, scoringFormat: 'bowling', sessionId: 2 }] }
    ]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initPlayPage();

    const nameInput = document.getElementById('qp-event-name');
    nameInput.value = 'Monday';
    nameInput.dispatchEvent(new Event('input'));

    const sessionsList = document.getElementById('qp-sessions-list');
    expect(sessionsList.innerHTML).toContain('Monday Night');
    expect(sessionsList.innerHTML).not.toContain('Tuesday Fun');
  });

  it('should show no sessions notice when no matching sessions', async () => {
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const sessionsList = document.getElementById('qp-sessions-list');
    expect(sessionsList.innerHTML).toContain('No active sessions found');
  });

  it('should alert when location has no machines during preview generation', async () => {
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'Empty Location', machines: [] }]);

    await initPlayPage();

    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('no machines'));
  });

  it('should auto-join player on Play button click when user has player_id', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.sessions.getAll.mockResolvedValue([{
      id: 1, name: 'Session', scoringFormat: 'bowling',
      events: [{ id: 101, eventName: 'Session', eventDate: today, scoringFormat: 'bowling', sessionId: 1 }],
      players: [{ id: 5, playerName: 'Current Player' }]
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.auth.me.mockResolvedValue({ player_id: 5 });

    await initPlayPage();

    const playBtn = document.querySelector('.play-btn');
    expect(playBtn).not.toBeNull();
    playBtn.click();

    await vi.waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(expect.stringContaining('scores'));
    });
    // Player 5 is already in roster, so addPlayer should NOT be called
    expect(PB_API.sessions.addPlayer).not.toHaveBeenCalled();
  });

  it('should show player selection dialog for guest users on Play click', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.sessions.getAll.mockResolvedValue([{
      id: 1, name: 'Session', scoringFormat: 'bowling',
      events: [{ id: 101, eventName: 'Session', eventDate: today, scoringFormat: 'bowling', sessionId: 1 }],
      players: []
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.auth.me.mockResolvedValue(null);
    PB_API.players.getAll.mockResolvedValue([{ id: 10, playerName: 'Guest1' }]);
    showPlayerSelectionDialog.mockResolvedValue('10');
    PB_API.sessions.addPlayer.mockResolvedValue({}); // Return empty object (no .error)

    await initPlayPage();

    const playBtn = document.querySelector('.play-btn');
    expect(playBtn).not.toBeNull();
    playBtn.click();

    await vi.waitFor(() => {
      expect(showPlayerSelectionDialog).toHaveBeenCalled();
      expect(PB_API.sessions.addPlayer).toHaveBeenCalledWith(1, 10);
      expect(loadPage).toHaveBeenCalledWith(expect.stringContaining('scores'));
    });
  });

  it('should navigate to standings on Scoreboard button click', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.sessions.getAll.mockResolvedValue([{
      id: 1, name: 'Session', scoringFormat: 'bowling',
      events: [{ id: 101, eventName: 'Session', eventDate: today, scoringFormat: 'bowling', sessionId: 1 }],
      players: []
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);

    await initPlayPage();

    const scoreboardBtn = document.querySelector('.scoreboard-btn');
    if (scoreboardBtn) {
      scoreboardBtn.click();
      expect(loadPage).toHaveBeenCalledWith(expect.stringContaining('standings'));
    }
  });

  it('should alert on finalize error', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.sessions.create.mockRejectedValue(new Error('Server error'));
    PB_API.auth.me.mockResolvedValue(null);

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    const finalizeBtn = document.getElementById('finalize-qp-btn');
    await finalizeBtn.onclick();

    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Server error'));
    expect(finalizeBtn.disabled).toBe(false);
    expect(finalizeBtn.textContent).toBe('Create Session');
  });

  it('should auto-join current user on finalize when player_id exists', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.sessions.create.mockResolvedValue({ id: 50, events: [{ id: 500 }] });
    PB_API.auth.me.mockResolvedValue({ player_id: 42 });

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    const finalizeBtn = document.getElementById('finalize-qp-btn');
    await finalizeBtn.onclick();

    expect(PB_API.sessions.addPlayer).toHaveBeenCalledWith(50, 42);
    expect(loadPage).toHaveBeenCalledWith(expect.stringContaining('playerId=42'));
  });

  it('should populate location dropdown from API', async () => {
    PB_API.sessions.getAll.mockResolvedValue([]);
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
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.locations.getAll.mockResolvedValue([]);

    await initPlayPage();

    const formatSelect = document.getElementById('qp-format');
    expect(formatSelect.children.length).toBe(2);
    expect(formatSelect.children[0].value).toBe('bowling');
    expect(formatSelect.children[1].value).toBe('golf');
  });

  it('should filter sessions by location', async () => {
    const today = new Date().toISOString().split('T')[0];
    PB_API.sessions.getAll.mockResolvedValue([
      { id: 1, name: 'S1', scoringFormat: 'bowling', players: [], events: [{ id: 101, eventName: 'S1', eventDate: today, scoringFormat: 'bowling', locationId: 1, sessionId: 1 }] },
      { id: 2, name: 'S2', scoringFormat: 'bowling', players: [], events: [{ id: 102, eventName: 'S2', eventDate: today, scoringFormat: 'bowling', locationId: 2, sessionId: 2 }] }
    ]);
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1' }, { id: 2, name: 'L2' }]);
    PB_API.players.getAll.mockResolvedValue([]);

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
    PB_API.sessions.getAll.mockResolvedValue([{
      id: 1, name: 'Session', scoringFormat: 'bowling',
      events: [{ id: 101, eventName: 'Session', eventDate: today, scoringFormat: 'bowling', sessionId: 1 }],
      players: []
    }]);
    PB_API.locations.getAll.mockResolvedValue([]);
    PB_API.players.getAll.mockResolvedValue([]);
    PB_API.auth.me.mockResolvedValue({ player_id: 5 });
    PB_API.sessions.addPlayer.mockRejectedValue(new Error('Unauthorized'));

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
    PB_API.sessions.getAll.mockResolvedValue([]);
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

  it('should throw error when session creation returns no id on finalize', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.sessions.create.mockResolvedValue({}); // No id
    PB_API.auth.me.mockResolvedValue(null);

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    const finalizeBtn = document.getElementById('finalize-qp-btn');
    await finalizeBtn.onclick();

    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Failed to create session'));
  });

  it('should throw error when session has no event on finalize', async () => {
    PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }] }]);
    PB_API.sessions.getAll.mockResolvedValue([]);
    PB_API.sessions.create.mockResolvedValue({ id: 50, events: [] }); // No event
    PB_API.auth.me.mockResolvedValue(null);

    await initPlayPage();
    document.getElementById('qp-location').value = '1';
    await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

    const finalizeBtn = document.getElementById('finalize-qp-btn');
    await finalizeBtn.onclick();

    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Failed to create session'));
  });

  describe('Additional playPage Coverage', () => {
    it('should toggle generator fields via changeBtn', async () => {
      document.body.innerHTML += `<button id="qp-change-setup-btn"></button>`;
      PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [] }]);
      await initPlayPage();

      // Show generator
      document.getElementById('create-new-toggle').click();

      // Change button click
      const changeBtn = document.getElementById('qp-change-setup-btn');
      changeBtn.click();

      expect(document.getElementById('qp-setup-fields').classList.contains('hidden')).toBe(false);
      expect(document.getElementById('qp-setup-summary').classList.contains('hidden')).toBe(true);
    });

    it('should reorder items and toggle expansion state in preview list', async () => {
      PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1' }] }]);
      apiMock.locations = [{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetMed: 1000 }, { machineId: 20, machineName: 'M2', targetMed: 2000 }] }];
      await initPlayPage();

      document.getElementById('create-new-toggle').click();
      document.getElementById('qp-location').value = '1';
      document.getElementById('qp-frames').value = '2'; // generate 2 frames
      await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

      // Test toggle expansion
      const rows = document.querySelectorAll('.frame-preview-item');
      expect(rows.length).toBe(2);

      // Trigger reorder callback
      const onReorder = uiMocks.setupSortableList.mock.calls[0][1].onReorder;
      const originalFrames = [...document.querySelectorAll('.frame-preview-item')];
      const tidOrder = originalFrames.map(r => r.id);
      
      // Swap order
      onReorder([tidOrder[1], tidOrder[0]]);
      const reorderedRows = document.querySelectorAll('.frame-preview-item');
      expect(reorderedRows[0].id).toBe(tidOrder[1]);
    });

    it('should handle difficulty fills and scaling toggles', async () => {
      PB_API.locations.getAll.mockResolvedValue([{ id: 1, name: 'L1', machines: [] }]);
      apiMock.locations = [{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetEasy: 100, targetMed: 200, targetHard: 300 }] }];
      
      // Force engine to return custom inputs
      engineMock.getPreviewRowHtml.mockImplementation((frame, index) => {
        return {
          headerHtml: `<div class="header">Header</div>`,
          contentHtml: `
            <input class="score10-input" value="${frame.value1 || ''}" />
            <input class="score1-input" value="${frame.value2 || ''}" />
            <button class="qfill" data-type="easy">Easy</button>
            <button class="scaling-btn ${frame.scaling === 'curved' ? 'btn-standard' : ''}" data-scale="curved">Curved</button>
            <input class="row-machine-search" />
            <select class="row-machine-select"></select>
            <div class="preview-values-container"></div>
          `
        };
      });

      await initPlayPage();

      document.getElementById('create-new-toggle').click();
      document.getElementById('qp-location').value = '1';
      document.getElementById('qp-frames').value = '1'; 
      await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

      // Wait for preview to generate
      await vi.waitFor(() => {
        expect(document.getElementById('finalize-qp-btn').disabled).toBe(false);
      });

      // Simulate expansion to show qfill and scaling buttons
      const previewCalls = uiMocks.createExpandableRow.mock.calls.filter(c => c[1]?.className === 'frame-preview-item');
      const lastPreviewCall = previewCalls[previewCalls.length - 1];
      const onHeaderClick = lastPreviewCall[1].onHeaderClick;
      onHeaderClick();

      // Locate qfill button (e.g. Easy)
      const easyBtn = document.querySelector('.qfill[data-type="easy"]');
      easyBtn.click();
      expect(document.querySelector('.score10-input').value).toBe('100');

      // Locate scaling button (e.g. Curved)
      const curvedBtn = document.querySelector('.scaling-btn[data-scale="curved"]');
      curvedBtn.click();
      expect(curvedBtn.classList.contains('btn-standard')).toBe(true);

      // Restore mock
      engineMock.getPreviewRowHtml.mockImplementation((frame, index) => ({
        headerHtml: `<div class="header"><span>${index}</span><span>${frame.machineName}</span></div>`,
        contentHtml: '<div class="content">content</div>'
      }));
    });

    it('should prompt for opponent and save matchups in baseball head-to-head format on finalize', async () => {
      apiMock.locations = [{ id: 1, name: 'L1', machines: [{ machineId: 10, machineName: 'M1', targetEasy: 100, targetMed: 200, targetHard: 300 }] }];
      PB_API.locations.getAll.mockResolvedValue(apiMock.locations);
      PB_API.sessions.create.mockResolvedValue({ id: 99, events: [{ id: 101 }], players: [{ id: 1, playerName: 'Kyle' }] });
      PB_API.sessions.get.mockResolvedValue({ id: 99, players: [{ id: 1, playerName: 'Kyle' }] });
      PB_API.auth.me.mockResolvedValue({ player_id: 1 });
      PB_API.sessions.addPlayer.mockResolvedValue({ success: true });
      PB_API.players.getAll.mockResolvedValue([{ id: 1, playerName: 'Kyle' }, { id: 2, playerName: 'Brian' }]);
      PB_API.sessions.getAll.mockResolvedValue([]);

      // Enable baseball format
      engineMock.getMatchupDescription.mockReturnValue({
        description: 'Head to Head Baseball',
        details: []
      });
      engineMock.generateMatchupPayload.mockReturnValue([{ roundNumber: 1, player1Id: 1, player2Id: 2 }]);

      // Opponent selection mock
      uiMocks.showPlayerSelectionDialog.mockResolvedValueOnce(2); // Choose Brian

      await initPlayPage();

      // Setup format selector for baseball
      const formatSelect = document.getElementById('qp-format');
      formatSelect.innerHTML = `
        <option value="bowling">Bowling</option>
        <option value="baseball">Baseball</option>
      `;
      formatSelect.value = 'baseball';

      document.getElementById('create-new-toggle').click();
      document.getElementById('qp-location').value = '1';
      document.getElementById('qp-frames').value = '1'; 
      await document.getElementById('quick-play-form').dispatchEvent(new Event('submit'));

      // Wait for preview to generate
      await vi.waitFor(() => {
        expect(document.getElementById('finalize-qp-btn').disabled).toBe(false);
      });

      // Finalize quick play
      const finalizeBtn = document.getElementById('finalize-qp-btn');
      await finalizeBtn.onclick();

      expect(uiMocks.showPlayerSelectionDialog).toHaveBeenCalled();
      expect(PB_API.sessions.addPlayer).toHaveBeenCalledWith(99, 2);
      expect(PB_API.matchups.save).toHaveBeenCalled();
    });
  });
});
