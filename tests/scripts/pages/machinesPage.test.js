/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@services/api.js', () => ({
  PB_API: {
    getCurrentUser: vi.fn(),
    getMachines: vi.fn(),
    updateMachine: vi.fn(),
    createMachine: vi.fn(),
    deleteMachine: vi.fn()
  }
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn()
}));

vi.mock('@scripts/utils.js', () => ({
  navigateTo: vi.fn(),
}));

vi.mock('@ui/uiComponents.js', () => ({
  setupLiveFilter: vi.fn((input, data, options) => ({
    performFilter: () => {
      const query = input.value.toLowerCase();
      const filtered = data.filter(m => m.machineName.toLowerCase().includes(query));
      options.onFilter(filtered, query);
    }
  })),
  showConfirm: vi.fn(),
  showAlert: vi.fn()
}));

import { initMachinesPage } from '@scripts/pages/machinesPage.js';
import { PB_API } from '@services/api.js';
import { requireAdmin } from '@services/auth.js';

describe('Machines Page (machinesPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="card">
        <h2 id="machine-form-title">Add</h2>
        <form id="machine-form">
          <input id="editing-machine-id" />
          <input id="machine-name" />
          <div id="machine-metadata-row" class="hidden">
            <input id="machine-year" />
            <input id="machine-manufacturer" />
          </div>
          <div class="form-actions hidden">
            <button id="save-machine-button"></button>
          </div>
        </form>
      </div>
      <div id="machines-list"></div>
      <div id="machines-list-empty"></div>
    `;
    vi.clearAllMocks();
    vi.stubGlobal('scrollTo', vi.fn());
  });

  it('should hide the creation form for non-privileged users', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'player' });
    PB_API.getMachines.mockResolvedValue([]);

    await initMachinesPage();

    expect(document.querySelector('.card').classList.contains('hidden')).toBe(true);
  });

  it('should render the list and allow editing for admins', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    PB_API.getMachines.mockResolvedValue([{ id: 1, machineName: 'Medieval Madness', year: 1997 }]);

    await initMachinesPage();

    expect(document.getElementById('machines-list').innerHTML).toContain('Medieval Madness');
    
    const editBtn = document.querySelector('.edit-mach-btn');
    editBtn.click();

    expect(document.getElementById('machine-name').value).toBe('Medieval Madness');
    expect(document.getElementById('machine-form-title').textContent).toContain('Edit');
  });

  it('should require admin password to save changes', async () => {
    PB_API.getCurrentUser.mockResolvedValue({ role: 'admin' });
    PB_API.getMachines.mockResolvedValue([]);
    requireAdmin.mockResolvedValue(true);

    await initMachinesPage();
    document.getElementById('machine-name').value = 'Monster Bash';
    document.getElementById('machine-name').dispatchEvent(new Event('input'));

    const form = document.getElementById('machine-form');
    await form.dispatchEvent(new Event('submit'));

    expect(requireAdmin).toHaveBeenCalled();
  });
});