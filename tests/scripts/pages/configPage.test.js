/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getMachines: vi.fn(),
    getLocationMachines: vi.fn(),
    getTargetScores: vi.fn(),
    saveTargetScore: vi.fn(),
    createMachine: vi.fn((name) => Promise.resolve({ id: 999, machineName: name }))
  }
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(() => ({
    getBonusTargetHtml: vi.fn(() => ''),
    buildRoundValues: vi.fn(() => ({ 1: 100, 10: 1000 })),
  }))
}));

vi.mock('@scripts/utils.js', () => ({
  getActiveEventId: vi.fn(),
  getActiveLeagueId: vi.fn(),
  renderPreview: vi.fn(),
  applyScoreFormatting: vi.fn(),
  formatNumber: vi.fn(n => n?.toLocaleString() || ''),
  navigateTo: vi.fn(),
}));

vi.mock('@services/auth.js', () => ({
  isManagementAuthorized: vi.fn(),
  requireAdmin: vi.fn()
}));

vi.mock('@ui/uiComponents.js', () => ({
  createSearchableSelect: vi.fn((input, select, data, options) => {
    if (options.onSelect) {
      input.addEventListener('input', () => options.onSelect(input.value));
    }
    return { updateOptions: vi.fn() };
  }),
  showPrompt: vi.fn(),
  showAlert: vi.fn(),
  initReadOnlyTournamentDisplay: vi.fn(async (container, onRefresh) => {
    if (onRefresh) await onRefresh();
  }),
  createExpandableRow: vi.fn((container, options) => {
    const div = document.createElement('div');
    div.className = options.className || '';
    div.id = options.id;
    div.innerHTML = `<div class="header">${options.headerHtml}</div><div class="content">${options.contentHtml}</div>`;
    container.appendChild(div);
    return div;
  }),
  setupSortableList: vi.fn(),
  renderThresholdGrid: vi.fn(() => 'Grid')
}));

vi.mock('@ui/printing.js', () => ({
  printMachineScores: vi.fn()
}));

import { initConfigPage } from '@scripts/pages/configPage.js';
import { PB_API } from '@services/api.js';
import { isManagementAuthorized } from '@services/auth.js';
import { navigateTo, getActiveEventId, getActiveLeagueId } from '@scripts/utils.js';
import { showAlert, createExpandableRow } from '@ui/uiComponents.js';

describe('Config Page (configPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="config-card" class="hidden"></div>
      <input id="order-number" />
      <span id="display-order"></span>
      <form id="round-form">
        <input id="machine-name" />
        <input id="value-10" />
        <input id="value-1" />
        <button id="save-round-btn"></button>
      </form>
      <div id="rounds-list"></div>
      <div id="reorder-actions" class="hidden">
        <button id="save-order-btn"></button>
        <button id="cancel-order-btn"></button>
      </div>
      <div id="list-empty" class="hidden"></div>
      <button id="print-machines-btn"></button>
      <button id="fill-easy"></button>
      <button id="fill-med"></button>
      <button id="fill-hard"></button>
      <button id="scaling-flat"></button>
      <button id="scaling-curved"></button>
      <div id="preview-values"></div>
      <button id="done-setup-btn"></button>
      <button id="add-target-btn"></button>
      <button id="cancel-config-btn"></button>
      <div class="tournament-selector-container"></div>
    `;
    vi.clearAllMocks();

    // Reset mocked return values to prevent state leakage between tests.
    // clearAllMocks only resets call history, not return values or implementations.
    getActiveEventId.mockReturnValue(null);
    getActiveLeagueId.mockReturnValue(null);
    PB_API.getLeagues.mockResolvedValue([]);
    PB_API.getTargetScores.mockResolvedValue([]);
    PB_API.getMachines.mockResolvedValue([]);

    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should redirect home if not authorized', async () => {
    isManagementAuthorized.mockResolvedValue(false);
    PB_API.getLeagues.mockResolvedValue([]);

    await initConfigPage();

    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('Unauthorized'), 'Access Denied');
    expect(navigateTo).toHaveBeenCalled();
  });

  it('should initialize and load targets if authorized', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'L1' }]);
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    PB_API.getMachines.mockResolvedValue([]);
    PB_API.getTargetScores.mockResolvedValue([
      { id: 50, machineId: 1, machineName: 'M1', orderNumber: 1, values: { 1: 100, 10: 1000 } }
    ]);

    await initConfigPage();

    expect(document.getElementById('rounds-list').children.length).toBe(1);
    expect(document.getElementById('list-empty').classList.contains('hidden')).toBe(true);
  });

  it('should open config card when "Add Target" is clicked', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.getLeagues.mockResolvedValue([]);
    await initConfigPage();

    const addBtn = document.getElementById('add-target-btn');
    addBtn.click();

    expect(document.getElementById('config-card').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('order-number').value).toBe('1');
  });

  it('should save a new target score', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.getLeagues.mockResolvedValue([]);
    PB_API.getMachines.mockResolvedValue([{ id: 1, machineName: 'M1' }]);
    getActiveEventId.mockReturnValue('101');
    
    await initConfigPage();
    
    document.getElementById('machine-name').value = 'M1';
    document.getElementById('value-10').value = '1,000';
    document.getElementById('value-1').value = '100';
    document.getElementById('order-number').value = '1';

    const form = document.getElementById('round-form');
    form.dispatchEvent(new Event('submit'));

    await vi.waitFor(() => {
      expect(PB_API.saveTargetScore).toHaveBeenCalled();
    });
  });

  it('should populate inputs when Quick Fill buttons are clicked', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    PB_API.getLeagues.mockResolvedValue([{ 
      id: 1, 
      name: 'L1', 
      events: [{ id: 101, locationId: 5 }] 
    }]);
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('101');
    // Mock machine data that includes templates
    PB_API.getMachines.mockResolvedValue([]);
    PB_API.getLocationMachines.mockResolvedValue([{ 
      machineId: 1, 
      machineName: 'M1', 
      targetEasy: 500, 
      targetMed: 1000, 
      targetHard: 2000 
    }]);

    await initConfigPage();
    
    // Select the machine to enable Quick Fill buttons
    const nameInput = document.getElementById('machine-name');
    nameInput.value = 'M1';
    nameInput.dispatchEvent(new Event('input'));

    const btnMed = document.getElementById('fill-med');
    btnMed.click();

    expect(document.getElementById('value-10').value).toBe('1,000');
  });

  it('should toggle scaling mode between curved and flat', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    await initConfigPage();

    const btnFlat = document.getElementById('scaling-flat');
    const btnCurved = document.getElementById('scaling-curved');

    btnFlat.click();
    expect(btnFlat.classList.contains('btn-standard')).toBe(true);
    expect(btnCurved.classList.contains('secondary')).toBe(true);

    btnCurved.click();
    expect(btnCurved.classList.contains('btn-standard')).toBe(true);
    expect(btnFlat.classList.contains('secondary')).toBe(true);
  });

  it('should reset the form and hide the config card on cancel', async () => {
    isManagementAuthorized.mockResolvedValue(true);
    await initConfigPage();

    // Open card
    document.getElementById('add-target-btn').click();
    const configCard = document.getElementById('config-card');
    expect(configCard.classList.contains('hidden')).toBe(false);

    // Fill some data
    document.getElementById('machine-name').value = 'Test';
    
    // Cancel
    document.getElementById('cancel-config-btn').click();

    expect(configCard.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('machine-name').value).toBe('');
  });
});