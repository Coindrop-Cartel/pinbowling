/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initMachinesPage } from '@pages/machinesPage.js';
import { PB_API } from '@services/api.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getMachines: vi.fn(),
    createMachine: vi.fn(),
    deleteMachine: vi.fn(),
  },
}));

vi.mock('@ui/uiComponents.js', () => ({
  setupLiveFilter: vi.fn((input, data, options) => ({
    performFilter: () => {
      const query = input.value.toLowerCase();
      const filtered = data.filter(item => item.machineName.toLowerCase().includes(query));
      options.onFilter(filtered, query);
    }
  })),
  showConfirm: vi.fn(() => Promise.resolve(true)),
  showPrompt: vi.fn(),
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(() => Promise.resolve(true)),
}));

describe('Machine Registry Page (machinesPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form id="machine-form">
        <input id="machine-name" />
        <button id="add-machine-btn">Add</button>
      </form>
      <div id="machines-list"></div>
      <div id="machines-list-empty" class="hidden"></div>
    `;

    vi.clearAllMocks();
    PB_API.getMachines.mockResolvedValue([
      { id: 1, machineName: 'Medieval Madness' },
      { id: 2, machineName: 'The Addams Family' }
    ]);
  });

  it('should render all machines on init', async () => {
    await initMachinesPage();
    const list = document.getElementById('machines-list');
    expect(list.children.length).toBe(2);
    expect(list.innerHTML).toContain('Medieval Madness');
  });

  it('should submit new machine names', async () => {
    await initMachinesPage();
    const input = document.getElementById('machine-name');
    input.value = 'Tron';
    
    await document.getElementById('machine-form').dispatchEvent(new Event('submit'));
    expect(PB_API.createMachine).toHaveBeenCalledWith('Tron');
    expect(input.value).toBe(''); // Should clear after success
  });

  it('should require admin and confirmation for deletion', async () => {
    await initMachinesPage();
    const delBtn = document.querySelector('.delete-mach-btn');
    
    await delBtn.click();
    const { requireAdmin } = await import('@services/auth.js');
    const { showConfirm } = await import('@ui/uiComponents.js');
    expect(requireAdmin).toHaveBeenCalled();
    expect(showConfirm).toHaveBeenCalled();
    expect(PB_API.deleteMachine).toHaveBeenCalledWith(1);
  });
});