/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { initTournamentSelector } from '@ui/tournamentSelector.js';
import { PB_API } from '@services/api.js';
import * as Utils from '@scripts/utils.js';

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
  },
}));

vi.mock('@scripts/utils.js', () => ({
  getActiveLeagueId: vi.fn(),
  setActiveLeagueId: vi.fn(),
  getActiveEventId: vi.fn(),
  setActiveEventId: vi.fn(),
}));

// Capture searchable select onSelect callback for testing
let capturedOnSelect = null;
vi.mock('@ui/uiComponents.js', () => ({
  createSearchableSelect: vi.fn((input, select, data, options) => {
    capturedOnSelect = options.onSelect;
    // Simulate populating the select element so DOM assertions pass
    data.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      select.appendChild(opt);
    });
    return { updateOptions: vi.fn() };
  }),
}));

describe('Tournament Selector Component (tournamentSelector.js)', () => {
  const mockLeagues = [
    { id: 1, name: 'Monday League', events: [{ id: 101, eventName: 'Week 1' }] },
    { id: 2, name: 'Quick Play Sessions', events: [] } // Should be filtered out
  ];

  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());

    document.body.innerHTML = '<div class="tournament-selector-container"></div>';
    vi.clearAllMocks();
    PB_API.getLeagues.mockResolvedValue(mockLeagues);
    Utils.getActiveLeagueId.mockReturnValue('');
    Utils.getActiveEventId.mockReturnValue('');
  });

  it('should render the component and filter out the internal Quick Play league', async () => {
    await initTournamentSelector();

    const leagueSelect = document.getElementById('league-select-global');
    // 1 Placeholder + 1 valid league (Monday League)
    expect(leagueSelect.options.length).toBe(2);
    expect(leagueSelect.innerHTML).not.toContain('Quick Play Sessions');
  });

  it('should update global state and populate events when a league is selected', async () => {
    await initTournamentSelector();
    
    // Simulate choosing a league via the searchable select component
    if (capturedOnSelect) capturedOnSelect('1');

    expect(Utils.setActiveLeagueId).toHaveBeenCalledWith('1');
    expect(Utils.setActiveEventId).toHaveBeenCalledWith('');
    
    const eventSelect = document.getElementById('event-select-global');
    expect(eventSelect.innerHTML).toContain('Week 1');
    expect(document.getElementById('event-select-wrapper').classList.contains('hidden')).toBe(false);
  });

  it('should handle the "Season Summary" option when on the standings page', async () => {
    // Add the element that triggers summary visibility
    document.body.innerHTML += '<div id="standings-body"></div>';
    
    await initTournamentSelector();
    if (capturedOnSelect) capturedOnSelect('1');

    const eventSelect = document.getElementById('event-select-global');
    expect(eventSelect.innerHTML).toContain('Season Summary');
  });

  it('should clear selection and refresh UI when the Clear button is clicked', async () => {
    const refreshSpy = vi.fn();
    await initTournamentSelector(refreshSpy);

    const clearBtn = document.getElementById('clear-selection-btn');
    clearBtn.click();

    expect(Utils.setActiveLeagueId).toHaveBeenCalledWith('');
    expect(Utils.setActiveEventId).toHaveBeenCalledWith('');
    expect(document.getElementById('league-search-global').value).toBe('');
    expect(document.getElementById('event-select-wrapper').classList.contains('hidden')).toBe(true);
    expect(refreshSpy).toHaveBeenCalled();
  });
});