/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initPlayersPage } from '@pages/playersPage.js';
import { PB_API } from '@services/api.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getPlayers: vi.fn(),
    createPlayer: vi.fn(),
    updatePlayer: vi.fn(),
    deletePlayer: vi.fn(),
  },
}));

vi.mock('@ui/uiComponents.js', () => ({
  setupLiveFilter: vi.fn((input, data, options) => ({
    performFilter: () => {
      const query = input.value.toLowerCase();
      const filtered = data.filter(item => item.playerName.toLowerCase().includes(query));
      options.onFilter(filtered, query);
    }
  })),
  showConfirm: vi.fn(() => Promise.resolve(true)),
  showPrompt: vi.fn(),
}));

vi.mock('@services/auth.js', () => ({
  requireAdmin: vi.fn(() => Promise.resolve(true)),
}));

describe('Player Management Page (playersPage.js)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <h2 id="player-form-title">Add</h2>
      <form id="player-form">
        <input id="editing-player-id" />
        <input id="player-name" />
        <div class="form-row"><input id="ifpa-id" /></div>
        <div class="form-row"><input id="matchplay-id" /></div>
        <div class="form-actions">
          <button id="save-player-button">Save</button>
          <button id="cancel-edit-button">Cancel</button>
        </div>
      </form>
      <ul id="player-list"></ul>
    `;

    vi.clearAllMocks();
    PB_API.getPlayers.mockResolvedValue([
      { id: 10, playerName: 'Alice', ifpaId: '123' },
      { id: 11, playerName: 'Bob' }
    ]);
  });

  it('should load and render players', async () => {
    await initPlayersPage();
    const list = document.getElementById('player-list');
    expect(list.innerHTML).toContain('Alice');
    expect(list.innerHTML).toContain('IFPA: 123');
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