/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initEventSetupPage } from '@pages/eventSetupPage.js';
import { PB_API } from '@services/api.js';
import * as Utils from '@scripts/utils.js';
import * as Auth from '@services/auth.js';
import { ROUTES } from '@scripts/routes.js';
import { printMachineScores } from '@ui/printing.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getMachines: vi.fn(),
    getTargetScores: vi.fn(),
    getLocationMachines: vi.fn(),
    saveTargetScore: vi.fn(),
    createMachine: vi.fn(),
    bulkUpdateTargetOrder: vi.fn(),
  },
}));

vi.mock('@scripts/utils.js', () => ({
  getActiveEventId: vi.fn(),
  getActiveLeagueId: vi.fn(),
  renderPreview: vi.fn(),
  renderThresholdGrid: vi.fn(() => '<div>Grid</div>'),
  applyScoreFormatting: vi.fn(),
  formatNumber: (n) => String(n),
  navigateTo: vi.fn(),
}));

vi.mock('@scripts/routes.js', () => ({
  ROUTES: {
    HOME: () => '/',
    LEAGUES: (id) => `/leagues?id=${id}`,
    LEAGUE_SETUP: (o) => `/setup?l=${o.leagueId}&e=${o.eventId}`
  }
}));

const uiMocks = vi.hoisted(() => ({
  createSearchableSelect: vi.fn(() => ({ updateOptions: vi.fn() })),
  showPrompt: vi.fn(),
  showAlert: vi.fn(),
  initReadOnlyTournamentDisplay: vi.fn((container, refresh) => Promise.resolve(refresh())),
  initTournamentSelector: vi.fn(),
  createExpandableRow: vi.fn((container, options) => {
    const div = document.createElement('div');
    div.className = options.className || '';
    div.innerHTML = (options.headerHtml || '') + (options.contentHtml || '');
    container.appendChild(div);
    return div;
  }),
  setupSortableList: vi.fn(),
}));

vi.mock('@ui/selectors.js', () => uiMocks);
vi.mock('@ui/dialogs.js', () => uiMocks);

vi.mock('@ui/printing.js', () => ({
  printMachineScores: vi.fn(),
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    getInitialValues: vi.fn(() => ({ value1: 5000000, value2: 500000 })),
    getValue1Label: vi.fn(() => 'Target Score'),
    getValue2Label: vi.fn(() => 'Base Score'),
    getRowSummaryHtml: vi.fn(() => '<div>Summary</div>'),
    getMarkFormatting: vi.fn(() => ''),
    formatMark: vi.fn((turn) => turn.mark),
    getRoundLabel: vi.fn(() => 'Frame'),
    getBonusTargetHtml: vi.fn(() => ''),
    filterThresholds: vi.fn(v => v),
    buildRoundValues: vi.fn(() => ({ 10: 1000000, 1: 100000 })),
  }))
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(),
  isManagementAuthorized: vi.fn(() => Promise.resolve(true)),
}));

describe('Event Setup Page (eventSetupPage.js)', () => {
  beforeEach(() => {
    // Mock layout methods not implemented in JSDOM
    vi.stubGlobal('location', { origin: 'http://localhost' });
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    document.body.innerHTML = `
      <div class="tournament-selector-container"></div>
      <div id="tournament-selector-ui" class="hidden"></div>
      <div id="config-card" class="hidden">
        <div id="display-order"></div>
        <input id="order-number" />
        <input id="machine-name" />
        <input id="value-10" />
        <input id="value-1" />
        <button id="fill-easy"></button>
        <button id="fill-med"></button>
        <button id="fill-hard"></button>
        <div id="preview-values"></div>
        <form id="round-form">
          <button id="save-round-btn" disabled>Save</button>
          <button id="cancel-config-btn" type="button">Cancel</button>
        </form>
      </div>
      <div id="reorder-actions" class="hidden">
        <button id="save-order-btn">Save Order</button>
        <button id="cancel-order-btn">Cancel Order</button>
      </div>
      <table id="rounds-table" class="hidden"><tbody id="rounds-list"></tbody></table>
      <div id="list-empty"></div>
      <button id="add-target-btn">Add</button>
      <button id="done-setup-btn">Done</button>
      <button id="print-machines-btn">Print</button>
    `;

    vi.clearAllMocks();
    PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'League', events: [{ id: 101, locationId: 1 }] }]);
    PB_API.getMachines.mockResolvedValue([{ id: 1, machineName: 'Iron Maiden' }]);
    PB_API.getTargetScores.mockResolvedValue([]);
    PB_API.getLocationMachines.mockResolvedValue([]);
    Utils.getActiveLeagueId.mockReturnValue('1');
    Utils.getActiveEventId.mockReturnValue('101');

    // Reset authorization state for every test to prevent state leakage
    Auth.isManagementAuthorized.mockResolvedValue(true);
    Auth.requireAdmin.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should redirect if not authorized', async () => {
    Auth.isManagementAuthorized.mockResolvedValue(false);
    await initEventSetupPage();
    expect(uiMocks.showAlert).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'), 'Access Denied');
    expect(Utils.navigateTo).toHaveBeenCalledWith(ROUTES.HOME);
  });

  it('should load machine suggestions and targets on init', async () => {
    await initEventSetupPage();
    expect(PB_API.getMachines).toHaveBeenCalled();
    expect(PB_API.getTargetScores).toHaveBeenCalledWith('101');
  });

  it('should show the config form when "Add Target" is clicked', async () => {
    await initEventSetupPage();
    const btn = document.getElementById('add-target-btn');
    const card = document.getElementById('config-card');
    
    btn.click();
    expect(card.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('display-order').textContent).toBe('1');
  });

  it('should toggle scaling modes', async () => {
    document.body.innerHTML += `
      <button id="scaling-flat"></button>
      <button id="scaling-curved"></button>
    `;
    await initEventSetupPage();
    
    const btnFlat = document.getElementById('scaling-flat');
    const btnCurved = document.getElementById('scaling-curved');
    
    btnFlat.click();
    expect(btnFlat.classList.contains('btn-standard')).toBe(true);
    
    btnCurved.click();
    expect(btnCurved.classList.contains('btn-standard')).toBe(true);
    expect(btnFlat.classList.contains('secondary')).toBe(true);
  });

  it('should handle quick fill buttons', async () => {
    const machine = { id: 1, machineName: 'Iron Maiden', targetEasy: 1000, targetMed: 2000, targetHard: 3000 };
    // Ensure machines are returned before initialization
    PB_API.getMachines.mockResolvedValue([machine]);
    // Mock location machines as the active event has locationId: 1
    PB_API.getLocationMachines.mockResolvedValue([machine]);
    await initEventSetupPage();

    // Manually trigger onSelect of the searchable select to set selectedMachineTargets
    const onSelect = uiMocks.createSearchableSelect.mock.calls[0][3].onSelect;
    onSelect('Iron Maiden');

    const btnEasy = document.getElementById('fill-easy');
    btnEasy.click();
    expect(document.getElementById('value-10').value).toBe('1000');
  });

  it('should call printing when print button is clicked', async () => {
    await initEventSetupPage();
    
    const printBtn = document.getElementById('print-machines-btn');
    printBtn.click();
    
    await vi.waitFor(() => expect(PB_API.getLeagues).toHaveBeenCalled());
    expect(printMachineScores).toHaveBeenCalled();
  });

  it('should handle reordering rounds and saving the batch', async () => {
    PB_API.getTargetScores.mockResolvedValue([
      { id: 1, machineId: 10, orderNumber: 1, machineName: 'M1', values: {} },
      { id: 2, machineId: 20, orderNumber: 2, machineName: 'M2', values: {} }
    ]);
    await initEventSetupPage();

    const onReorder = uiMocks.setupSortableList.mock.calls[0][1].onReorder;
    onReorder(['2', '1']); // Simulate swapping M2 and M1

    expect(document.getElementById('reorder-actions').classList.contains('hidden')).toBe(false);
    
    PB_API.saveTargetScore.mockResolvedValue({ success: true });
    document.getElementById('save-order-btn').click();
    
    await vi.waitFor(() => expect(PB_API.saveTargetScore).toHaveBeenCalled());
  });

  it('should call saveTargetScore on form submission', async () => {
    Auth.requireAdmin.mockResolvedValue(true);
    PB_API.saveTargetScore.mockResolvedValue({ success: true });
    
    await initEventSetupPage();
    
    // Populate fields
    document.getElementById('order-number').value = '1';
    document.getElementById('machine-name').value = 'Iron Maiden';
    document.getElementById('value-10').value = '1,000,000';
    document.getElementById('value-1').value = '100,000';
    
    // Trigger events to ensure internal state is updated
    document.getElementById('machine-name').dispatchEvent(new Event('change'));
    document.getElementById('save-round-btn').disabled = false;

    const form = document.getElementById('round-form');
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => expect(Auth.requireAdmin).toHaveBeenCalled());
    expect(Auth.requireAdmin).toHaveBeenCalled();
    expect(PB_API.saveTargetScore).toHaveBeenCalledWith(expect.objectContaining({
        orderNumber: 1,
        machineId: 1
    }));
  });

  it('should navigate back to leagues when "Done" is clicked', async () => {
    await initEventSetupPage();
    document.getElementById('done-setup-btn').click();
    expect(Utils.navigateTo).toHaveBeenCalled();
  });
});