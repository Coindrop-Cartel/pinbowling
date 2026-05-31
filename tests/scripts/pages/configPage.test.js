/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initConfigPage } from '@pages/configPage.js';
import { PB_API } from '@services/api.js';
import * as Utils from '@scripts/utils.js';
import * as Auth from '@services/auth.js';

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
  applyScoreFormatting: vi.fn(),
  formatNumber: (n) => String(n),
  navigateTo: vi.fn(),
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@ui/uiComponents.js', () => ({
  createSearchableSelect: vi.fn(() => ({ updateOptions: vi.fn() })),
  showPrompt: vi.fn(),
  initReadOnlyTournamentDisplay: vi.fn((container, refresh) => refresh()),
}));

describe('Event Config Page (configPage.js)', () => {
  beforeEach(() => {
    // Mock layout methods not implemented in JSDOM
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    document.body.innerHTML = `
      <div class="tournament-selector-container"></div>
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
      <div id="reorder-actions" class="hidden"><button id="save-order-btn">Save Order</button></div>
      <table id="rounds-table" class="hidden"><tbody></tbody></table>
      <div id="list-empty"></div>
      <button id="add-target-btn">Add</button>
      <button id="done-setup-btn">Done</button>
    `;

    vi.clearAllMocks();
    PB_API.getLeagues.mockResolvedValue([{ id: 1, name: 'League', events: [{ id: 101, locationId: 1 }] }]);
    PB_API.getMachines.mockResolvedValue([{ id: 1, machineName: 'Iron Maiden' }]);
    PB_API.getTargetScores.mockResolvedValue([]);
    PB_API.getLocationMachines.mockResolvedValue([]);
    Utils.getActiveLeagueId.mockReturnValue('1');
    Utils.getActiveEventId.mockReturnValue('101');
  });

  it('should load machine suggestions and targets on init', async () => {
    await initConfigPage();
    expect(PB_API.getMachines).toHaveBeenCalled();
    expect(PB_API.getTargetScores).toHaveBeenCalledWith('101');
  });

  it('should show the config form when "Add Target" is clicked', async () => {
    await initConfigPage();
    const btn = document.getElementById('add-target-btn');
    const card = document.getElementById('config-card');
    
    btn.click();
    expect(card.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('display-order').textContent).toBe('1');
  });

  it('should call saveTargetScore on form submission', async () => {
    Auth.requireAdmin.mockResolvedValue(true);
    PB_API.saveTargetScore.mockResolvedValue({ success: true });
    
    await initConfigPage();
    
    // Populate fields
    document.getElementById('order-number').value = '1';
    document.getElementById('machine-name').value = 'Iron Maiden';
    document.getElementById('value-10').value = '1,000,000';
    document.getElementById('value-1').value = '100,000';

    const form = document.getElementById('round-form');
    await form.dispatchEvent(new Event('submit'));

    expect(Auth.requireAdmin).toHaveBeenCalled();
    expect(PB_API.saveTargetScore).toHaveBeenCalledWith(expect.objectContaining({
        orderNumber: 1,
        machineId: 1
    }));
  });

  it('should navigate back to leagues when "Done" is clicked', async () => {
    await initConfigPage();
    document.getElementById('done-setup-btn').click();
    expect(Utils.navigateTo).toHaveBeenCalled();
  });
});