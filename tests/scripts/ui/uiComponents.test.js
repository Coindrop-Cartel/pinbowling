/** @vitest-environment jsdom */
/** @vitest-environment jsdom */ 
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Setup minimum browser environment properties required for evaluation.
 * JSDOM provides most of this, but we need to stub properties that api.js expects.
 */ 
vi.hoisted(() => {
  vi.stubGlobal('location', {
    origin: 'http://localhost',
    pathname: '/index.php'
  });
  window.PB_API_SECRET = '';
  
  // Mock fetch because api.js logic depends on it
  global.fetch = vi.fn(); 
});

// Mock external dependencies used by the components.
// These are hoisted but must be defined outside of vi.hoisted().
vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
  },
}));

vi.mock('@scripts/utils.js', () => ({
  getActiveLeagueId: vi.fn(),
  getActiveEventId: vi.fn(),
  setActiveLeagueId: vi.fn(),
  setActiveEventId: vi.fn(),
}));

import { createSearchableSelect, initReadOnlyTournamentDisplay, showDialog, showConfirm, showPrompt, showPlayerSelectionDialog } from '@ui/uiComponents.js';
import { PB_API } from '@services/api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId } from '@scripts/utils.js';

/**
 * Tests for reusable UI components. 
 * Focuses on the searchable select logic which is core to player and machine selection.
 */
describe('UI Components (uiComponents.js)', () => {
  let searchInput, selectElement;

  beforeEach(() => {
    // Create a minimal DOM environment
    document.body.innerHTML = `
      <input id="search-input" />
      <select id="select-element"></select>
    `;
    searchInput = document.getElementById('search-input');
    selectElement = document.getElementById('select-element');
  });

  it('createSearchableSelect filters options correctly', () => {
    const data = [
      { id: 101, title: 'Addams Family' },
      { id: 102, title: 'Attack from Mars' },
      { id: 103, title: 'Twilight Zone' }
    ];

    const { updateOptions } = createSearchableSelect(searchInput, selectElement, data, {
      valueKey: 'id',
      labelKey: 'title',
      placeholder: 'Select Machine'
    });

    // Test Initial State
    updateOptions('');
    expect(selectElement.options.length).toBe(4); // 1 placeholder + 3 items

    // Test Filtering
    updateOptions('Mars');
    expect(selectElement.options.length).toBe(2); // 1 placeholder + 1 match
    expect(selectElement.options[1].textContent).toBe('Attack from Mars');
    expect(selectElement.options[1].value).toBe('102');
  });

  it('createSearchableSelect syncs select value when exact match is found in input', () => {
    const data = [
      { id: 5, name: 'Player One' },
      { id: 6, name: 'Player Two' }
    ];

    createSearchableSelect(searchInput, selectElement, data, {
      valueKey: 'id',
      labelKey: 'name'
    });

    // Simulate user typing exactly "Player Two"
    searchInput.value = 'Player Two';
    searchInput.dispatchEvent(new Event('input'));

    expect(selectElement.value).toBe('6');
  });

  it('updateOptions handles empty data gracefully', () => {
    const { updateOptions } = createSearchableSelect(searchInput, selectElement, [], {
      placeholder: 'None'
    });
    
    updateOptions('Anything');
    expect(selectElement.options.length).toBe(1);
    expect(selectElement.options[0].textContent).toBe('None');
  });
});

describe('initReadOnlyTournamentDisplay', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<div id="display-container"></div>';
    container = document.getElementById('display-container');

    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should display "No League Selected" when no active IDs are found', async () => {
    getActiveLeagueId.mockReturnValue('');
    getActiveEventId.mockReturnValue('');

    await initReadOnlyTournamentDisplay(container);

    expect(container.innerHTML).toMatch(/League:.*No League Selected/);
    expect(container.innerHTML).toMatch(/Event:.*No Event Selected/);
    expect(setActiveLeagueId).toHaveBeenCalledWith('');
  });

  it('should sync league selection if the event belongs to a different league than currently active', async () => {
    const mockLeagues = [{
      id: 1,
      name: 'Monday Night Pinball',
      events: [{ id: 101, event_name: 'Week 1', event_date: '2024-01-01' }]
    }];
    
    getActiveLeagueId.mockReturnValue('99'); // Wrong league active
    getActiveEventId.mockReturnValue('101');
    PB_API.getLeagues.mockResolvedValue(mockLeagues);

    await initReadOnlyTournamentDisplay(container);

    expect(container.innerHTML).toMatch(/League:.*Monday Night Pinball/);
    expect(setActiveLeagueId).toHaveBeenCalledWith(1);
  });

  it('should handle the special "summary" event ID', async () => {
    const mockLeagues = [{ id: 5, name: 'Season League', events: [] }];
    getActiveLeagueId.mockReturnValue('5');
    getActiveEventId.mockReturnValue('summary');
    PB_API.getLeagues.mockResolvedValue(mockLeagues);

    await initReadOnlyTournamentDisplay(container);

    expect(container.innerHTML).toMatch(/Event:.*Season Summary/);
  });

  it('should call onRefresh callback after rendering', async () => {
    const mockRefresh = vi.fn();
    getActiveLeagueId.mockReturnValue('');
    getActiveEventId.mockReturnValue('');

    await initReadOnlyTournamentDisplay(container, mockRefresh);

    expect(mockRefresh).toHaveBeenCalled();
  });
});

describe('Custom Dialog Modals (showDialog)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('showConfirm resolves true when confirm button is clicked', async () => {
    const promise = showConfirm('Are you sure?', 'Test Confirm');
    
    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.click();

    const result = await promise;
    expect(result).toBe(true);
    expect(document.querySelector('.card')).toBeNull(); // Should clean up DOM
  });

  it('showPrompt resolves input value on Enter key', async () => {
    const promise = showPrompt('Enter code:', 'Admin');
    
    const input = document.getElementById('modal-input');
    input.value = 'secret123';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    const result = await promise;
    expect(result).toBe('secret123');
  });

  it('showDialog resolves null/false on Escape key', async () => {
    const promise = showDialog({ title: 'Prompt', message: 'Wait', showInput: true });
    
    const input = document.getElementById('modal-input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    const result = await promise;
    expect(result).toBeNull();
  });

  it('focuses the input field after a short delay', () => {
    showDialog({ title: 'Focus Test', message: 'Test', showInput: true });
    const input = document.getElementById('modal-input');
    
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(input);
  });
});

describe('showPlayerSelectionDialog', () => {
  const mockOptions = [
    { value: 1, label: 'Alice' },
    { value: 2, label: 'Bob' }
  ];

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
  });

  it('renders correctly and populates player options', async () => {
    const promise = showPlayerSelectionDialog('Add Player', 'Pick someone', mockOptions);

    const select = document.getElementById('player-select-modal');
    expect(select.options.length).toBe(3); // Placeholder + 2 players
    expect(select.innerHTML).toContain('Alice');

    document.getElementById('modal-cancel').click();
    await promise;
  });

  it('disables the confirm button until a selection is made', async () => {
    const promise = showPlayerSelectionDialog('Add Player', 'Pick someone', mockOptions);
    const confirmBtn = document.getElementById('modal-confirm');
    const select = document.getElementById('player-select-modal');

    expect(confirmBtn.disabled).toBe(true);

    // Simulate picking Bob
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(confirmBtn.disabled).toBe(false);

    confirmBtn.click();
    const result = await promise;
    expect(result).toBe('2');
  });

  it('filters options when typing in the search box', async () => {
    const promise = showPlayerSelectionDialog('Search Test', 'Filter', mockOptions);
    const searchInput = document.getElementById('player-search-modal');
    const select = document.getElementById('player-select-modal');

    searchInput.value = 'Ali';
    searchInput.dispatchEvent(new Event('input'));

    // 1 placeholder + 1 match (Alice)
    expect(select.options.length).toBe(2);
    expect(select.options[1].textContent).toBe('Alice');

    document.getElementById('modal-cancel').click();
    await promise;
  });
});