/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initPlayersPage } from '@pages/playersPage.js';
import { PB_API } from '@services/api.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getPlayers: vi.fn(),
    createPlayer: vi.fn(),
    updatePlayer: vi.fn(),
    deletePlayer: vi.fn(),
    getCurrentUser: vi.fn(),
  },
}));

const uiMocks = vi.hoisted(() => ({
  setupLiveFilter: vi.fn((input, data, options) => ({
    performFilter: () => {
      const query = input.value.toLowerCase();
      const filtered = data.filter(item => item.playerName.toLowerCase().includes(query));
      options.onFilter(filtered, query);
    }
  })),
  showConfirm: vi.fn(() => Promise.resolve(true)),
  showPrompt: vi.fn(),
  showChoiceDialog: vi.fn(),
  showAlert: vi.fn(),
  createExpandableRow: vi.fn((container, options) => {
    const row = document.createElement(options.tag || 'div');
    row.innerHTML = options.headerHtml + (options.contentHtml || '');
    if (options.className) row.className = options.className;
    container.appendChild(row);
    return row;
  }),
}));

vi.mock('@ui/selectors.js', () => uiMocks);
vi.mock('@ui/dialogs.js', () => uiMocks);

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(() => Promise.resolve(true)),
  initAuthHeader: vi.fn(() => Promise.resolve()), // Mock initAuthHeader to prevent reload calls
}));

describe('Player Management Page (playersPage.js)', () => {
  let originalLocation;

  beforeEach(() => {
    // Mock layout methods not implemented in JSDOM
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();

    // Correct way to mock location in JSDOM/Vitest to avoid "Not implemented" errors
    originalLocation = window.location;
    delete window.location;
    const mockLocation = new URL('http://localhost/players.php');
    mockLocation.assign = vi.fn();
    mockLocation.replace = vi.fn();
    mockLocation.reload = vi.fn();
    Object.defineProperty(mockLocation, 'href', { writable: true, value: mockLocation.href });
    window.location = mockLocation;

    document.body.innerHTML = `
      <section class="card">
        <h2 id="player-form-title">Add</h2>
        <form id="player-form">
          <input id="editing-player-id" />
          <input id="player-name" />
          <div id="player-ifpa-row" class="form-row"><input id="ifpa-id" /></div>
          <div id="player-matchplay-row" class="form-row"><input id="matchplay-id" /></div>
          <div id="player-form-actions" class="form-actions">
            <button id="save-player-button">Save</button>
            <button id="cancel-edit-button">Cancel</button>
          </div>
        </form>
      </section>
      <ul id="player-list"></ul>
    `;

    vi.clearAllMocks();
    PB_API.getPlayers.mockResolvedValue([
      { id: 10, playerName: 'Alice', ifpaId: '123' },
      { id: 11, playerName: 'Bob' }
    ]);
    PB_API.getCurrentUser.mockResolvedValue({ id: 1, role: 'admin', player_name: 'Admin User' });
  });

  afterEach(() => {
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  it('should load and render players', async () => {
    await initPlayersPage();
    const list = document.getElementById('player-list');
    expect(list.innerHTML).toContain('Alice');
    expect(list.innerHTML).toContain('IFPA ID:</strong> 123');
  });

  it('should switch to edit mode when Edit is clicked', async () => {
    await initPlayersPage();
    const editBtn = document.querySelector('.edit-player-btn');
    editBtn.click();

    expect(document.getElementById('player-name').value).toBe('Alice');
    expect(document.getElementById('player-form-title').textContent).toBe('Edit Player: Alice');
    expect(document.getElementById('save-player-button').textContent).toBe('Update Player');
  });

  it('should call updatePlayer on submit when in edit mode', async () => {
    await initPlayersPage();
    // Trigger edit mode
    document.querySelector('.edit-player-btn').click();
    
    // Modify name
    document.getElementById('player-name').value = 'Alice Updated';
    
    await document.getElementById('player-form').dispatchEvent(new Event('submit'));
    
    expect(PB_API.updatePlayer).toHaveBeenCalledWith(10, expect.objectContaining({
      playerName: 'Alice Updated'
    }));
  });
});