/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createSearchableSelect, initReadOnlyTournamentDisplay, initTournamentSelector, setupLiveFilter } from '@ui/selectors.js';
import { PB_API } from '@services/api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, renderThresholdGrid } from '@scripts/utils.js';

vi.hoisted(() => {
  vi.stubGlobal('location', { origin: 'http://localhost' });
  global.fetch = vi.fn();
});

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getTargetScores: vi.fn(),
  },
}));

vi.mock('@scripts/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getActiveLeagueId: vi.fn(),
    getActiveEventId: vi.fn(),
    setActiveLeagueId: vi.fn(),
    setActiveEventId: vi.fn(),
  };
});

describe('Selector Components (selectors.js)', () => {
  let searchInput, selectElement;

  beforeEach(() => {
    vi.stubGlobal('scrollTo', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
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

    updateOptions('');
    expect(selectElement.options.length).toBe(4); 

    updateOptions('Mars');
    expect(selectElement.options.length).toBe(2); 
    expect(selectElement.options[1].textContent).toBe('Attack from Mars');
    expect(selectElement.options[1].value).toBe('102');
  });

  it('createSearchableSelect syncs select value when exact match is found in input', () => {
    const data = [{ id: 5, name: 'Player One' }, { id: 6, name: 'Player Two' }];
    createSearchableSelect(searchInput, selectElement, data, { valueKey: 'id', labelKey: 'name' });

    searchInput.value = 'Player Two';
    searchInput.dispatchEvent(new Event('input'));
    expect(selectElement.value).toBe('6');
  });
});

describe('initReadOnlyTournamentDisplay', () => {
  let container;
  beforeEach(() => {
    document.body.innerHTML = '<div id="display-container"></div>';
    container = document.getElementById('display-container');
    vi.resetAllMocks();
  });

  it('should display "No Tournament Selected" when no active IDs are found', async () => {
    getActiveLeagueId.mockReturnValue('');
    getActiveEventId.mockReturnValue('');
    await initReadOnlyTournamentDisplay(container);
    expect(container.innerHTML).toContain('No Tournament Selected');
  });

  it('should handle the special "summary" event ID', async () => {
    const mockLeagues = [{ id: 5, name: 'Season League', events: [] }];
    getActiveLeagueId.mockReturnValue('5');
    getActiveEventId.mockReturnValue('summary');
    PB_API.getLeagues.mockResolvedValue(mockLeagues);

    await initReadOnlyTournamentDisplay(container);
    expect(container.innerHTML).toMatch(/Event:.*Season Summary/);
  });
});

describe('initTournamentSelector', () => {
  const mockLeagues = [
    { id: 1, name: 'Standard League', type: 'standard', events: [] },
    { id: 2, name: 'Session League', type: 'session', events: [] }
  ];

  beforeEach(() => {
    document.body.innerHTML = '<div class="tournament-selector-container"></div>';
    vi.clearAllMocks();
    PB_API.getLeagues.mockResolvedValue(mockLeagues);
    getActiveLeagueId.mockReturnValue('');
  });

  it('should filter for standard leagues by default', async () => {
    await initTournamentSelector('.tournament-selector-container');
    const select = document.querySelector('.league-select-shared');
    expect(select.options.length).toBe(2); 
    expect(select.innerHTML).toContain('Standard League');
    expect(select.innerHTML).not.toContain('Session League');
  });

  it('should include the active league even if it does not match the type filter', async () => {
    vi.mocked(getActiveLeagueId).mockReturnValue('2'); 
    await initTournamentSelector('.tournament-selector-container', { typeFilter: 'standard' });
    
    const select = document.querySelector('.league-select-shared');
    const search = document.getElementById('league-search-global');

    expect(select.options.length).toBe(2);
    expect(select.value).toBe('2');

    search.value = '';
    search.dispatchEvent(new Event('input'));
    expect(select.options.length).toBe(3);
  });
});

describe('UI Utilities', () => {
  describe('setupLiveFilter', () => {
    it('should filter data and trigger onFilter callback', () => {
      const input = document.createElement('input');
      const data = [{ name: 'Medieval Madness' }, { name: 'Monster Bash' }];
      const onFilter = vi.fn();

      setupLiveFilter(input, data, { labelKey: 'name', onFilter });
      input.value = 'Mon';
      input.dispatchEvent(new Event('input'));

      expect(onFilter).toHaveBeenCalledWith([{ name: 'Monster Bash' }], 'mon');
    });
  });

  describe('renderThresholdGrid', () => {
    it('should render a notice when no values are provided', () => {
      const html = renderThresholdGrid({});
      expect(html).toContain('Enter scores to see thresholds');
    });

    it('should render ranks in descending order', () => {
      const values = { 1: 1000, 2: 2000, 10: 10000 };
      const html = renderThresholdGrid(values, (v) => v.toLocaleString());
      
      expect(html).toContain('10:');
      expect(html).toContain('2:');
      expect(html).toContain('1:');
      expect(html.indexOf('10:')).toBeLessThan(html.indexOf('2:'));
    });
  });
});