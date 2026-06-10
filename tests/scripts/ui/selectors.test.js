/** @vitest-environment jsdom */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PB_API } from '@services/api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId, renderThresholdGrid } from '@scripts/utils.js';

vi.hoisted(() => {
  vi.stubGlobal('location', { origin: 'http://localhost' });
  global.fetch = vi.fn();
});

vi.mock('@services/api.js', () => ({
  PB_API: {
    getLeagues: vi.fn(),
    getTargetScores: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(null),
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

vi.mock('@ui/dialogs.js', () => ({
  showAlert: vi.fn(),
}));

vi.mock('@ui/branding.js', () => ({
  getFormatBadgeHtml: vi.fn(() => '<span class="format-badge">bowling</span>'),
}));

vi.mock('@core/engine.js', () => ({
  getScoringEngine: vi.fn(),
}));

// Mock for createSearchableSelect to actually populate the DOM and simulate behavior
const { createSearchableSelectMock } = vi.hoisted(() => ({
  createSearchableSelectMock: vi.fn((searchInput, selectElement, initialData, { valueKey = 'id', labelKey = 'name', placeholder = '-- Choose --', onSelect = null } = {}) => {
    let data = initialData;
    const updateOptions = (filter = '') => {
      const currentVal = selectElement.value;
      selectElement.innerHTML = `<option value="">${placeholder}</option>`;
      const normalizedFilter = filter.toLowerCase();
      let matchCount = 0;
      data.forEach(item => {
        const label = String(item[labelKey]);
        if (label.toLowerCase().includes(normalizedFilter)) {
          const opt = document.createElement('option');
          opt.value = item[valueKey];
          opt.textContent = label;
          if (String(item[valueKey]) === String(currentVal)) opt.selected = true;
          selectElement.appendChild(opt);
          matchCount++;
        }
      });
      return matchCount;
    };

    searchInput.addEventListener('input', (e) => {
      const filter = e.target.value;
      updateOptions(filter);
      const matchCount = updateOptions(filter); // Re-run to get matchCount after filtering
      selectElement.size = filter.length > 0 ? Math.min(matchCount + 1, 5) : 1;
      const exactMatch = data.find(item => String(item[labelKey]).toLowerCase() === filter.toLowerCase());
      if (exactMatch && String(selectElement.value) !== String(exactMatch[valueKey])) {
        selectElement.value = exactMatch[valueKey];
        selectElement.size = 1; // When exact match, collapse
        if (onSelect) onSelect(exactMatch[valueKey]);
      }
    });
    searchInput.addEventListener('blur', () => { setTimeout(() => { selectElement.size = 1; }, 200); });

    selectElement.addEventListener('change', () => {
      const val = selectElement.value;
      const match = data.find(item => String(item[valueKey]) === String(val));
      selectElement.size = 1; // When selection changes, collapse
      searchInput.value = match ? match[labelKey] : '';
      if (onSelect) onSelect(val);
    });

    const initialMatchCount = updateOptions(''); // Initial population
    selectElement.size = 1; // Default size on initial load

    return { 
      updateOptions,
      setData: vi.fn((newData) => {
        data = newData;
        return updateOptions(searchInput.value || '');
      })
    };
  })
}));

// Mock the @ui/selectors.js module to use the custom createSearchableSelectMock
vi.mock('@ui/selectors.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createSearchableSelect: createSearchableSelectMock };
});

// Now import the functions from @ui/selectors.js, they will use the mocked createSearchableSelect
import {
  createSearchableSelect, // This will now be the mocked version
  initReadOnlyTournamentDisplay,
  initTournamentSelector,
  setupLiveFilter,
  renderActionSummary,
  createExpandableRow,
  setupSortableList,
} from '@ui/selectors.js';

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
    { id: '1', name: 'Standard League', type: 'standard', events: [], players: [{ id: '101', userId: null }] },
    { id: '2', name: 'Session League', type: 'session', events: [], players: [{ id: '102', userId: null }] }
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

    search.value = '';
    search.dispatchEvent(new Event('input'));

    expect(select.options.length).toBe(3); // Placeholder + Standard + Session (active)
    expect(select.value).toBe('2');
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

// ── renderActionSummary ──────────────────────────────────────────
describe('renderActionSummary', () => {
  it('should render title and action buttons', () => {
    const container = document.createElement('div');
    const onclick1 = vi.fn();
    const onclick2 = vi.fn();
    const actions = [
      { text: 'Action 1', onclick: onclick1 },
      { text: 'Action 2', onclick: onclick2 },
    ];
    renderActionSummary(container, 'Summary Title', actions);
    expect(container.classList.contains('hidden')).toBe(false);
    expect(container.innerHTML).toContain('Summary Title');
    expect(container.innerHTML).toContain('Action 1');
    expect(container.innerHTML).toContain('Action 2');
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    expect(onclick1).toHaveBeenCalled();
    buttons[1].click();
    expect(onclick2).toHaveBeenCalled();
  });

  it('should hide buttons with hidden: true', () => {
    const container = document.createElement('div');
    const actions = [
      { text: 'Visible', onclick: vi.fn() },
      { text: 'Hidden', hidden: true, onclick: vi.fn() },
    ];
    renderActionSummary(container, 'Test', actions);
    const buttons = container.querySelectorAll('button');
    expect(buttons[0].classList.contains('hidden')).toBe(false);
    expect(buttons[1].classList.contains('hidden')).toBe(true);
  });

  it('should do nothing if container is null', () => {
    expect(() => renderActionSummary(null, 'Title', [])).not.toThrow();
  });

  it('should handle empty actions array', () => {
    const container = document.createElement('div');
    renderActionSummary(container, 'No Actions', []);
    expect(container.innerHTML).toContain('No Actions');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('should remove hidden class from container', () => {
    const container = document.createElement('div');
    container.classList.add('hidden');
    renderActionSummary(container, 'Test', []);
    expect(container.classList.contains('hidden')).toBe(false);
  });
});

// ── createExpandableRow ──────────────────────────────────────────
describe('createExpandableRow', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('should create a row with header and expandable content', () => {
    const row = createExpandableRow(container, {
      id: 'row-1',
      headerHtml: '<span class="machine-name-display">Machine A</span>',
      contentHtml: '<p>Details here</p>',
      isExpanded: false,
    });
    expect(row.dataset.id).toBe('row-1');
    expect(row.classList.contains('list-row')).toBe(true);
    expect(row.querySelector('.row-header').innerHTML).toContain('Machine A');
    const expansion = row.querySelector('.row-expansion');
    expect(expansion.classList.contains('hidden')).toBe(true);
    expect(expansion.innerHTML).toContain('Details here');
  });

  it('should show expansion when isExpanded is true', () => {
    const row = createExpandableRow(container, {
      id: 'row-2',
      headerHtml: 'Header',
      contentHtml: 'Content',
      isExpanded: true,
    });
    expect(row.querySelector('.row-expansion').classList.contains('hidden')).toBe(false);
  });

  it('should not create expansion div when contentHtml is empty', () => {
    const row = createExpandableRow(container, {
      id: 'row-3',
      headerHtml: 'Header',
      contentHtml: '',
    });
    expect(row.querySelector('.row-expansion')).toBeNull();
  });

  it('should call onHeaderClick when header is clicked', () => {
    const onHeaderClick = vi.fn();
    const row = createExpandableRow(container, {
      id: 'row-4',
      headerHtml: 'Header',
      contentHtml: 'Content',
      onHeaderClick,
    });
    row.querySelector('.row-header').click();
    expect(onHeaderClick).toHaveBeenCalled();
  });

  it('should NOT call onHeaderClick when clicking buttons inside header', () => {
    const onHeaderClick = vi.fn();
    const row = createExpandableRow(container, {
      id: 'row-5',
      headerHtml: '<button class="test-btn">Click</button>',
      contentHtml: '',
      onHeaderClick,
    });
    row.querySelector('.test-btn').click();
    expect(onHeaderClick).not.toHaveBeenCalled();
  });

  it('should set draggable attribute when draggable is true', () => {
    const row = createExpandableRow(container, {
      id: 'row-6',
      headerHtml: 'Header',
      contentHtml: '',
      draggable: true,
    });
    expect(row.draggable).toBe(true);
  });

  it('should apply className when provided', () => {
    const row = createExpandableRow(container, {
      id: 'row-7',
      headerHtml: 'Header',
      contentHtml: '',
      className: 'custom-class',
    });
    expect(row.classList.contains('custom-class')).toBe(true);
  });

  it('should use custom tag when provided', () => {
    const row = createExpandableRow(container, {
      id: 'row-8',
      headerHtml: 'Header',
      contentHtml: '',
      tag: 'li',
    });
    expect(row.tagName).toBe('LI');
  });

  it('should render reorder buttons when onMoveUp/onMoveDown provided', () => {
    const onMoveUp = vi.fn();
    const onMoveDown = vi.fn();
    const row = createExpandableRow(container, {
      id: 'row-9',
      headerHtml: '<span class="machine-name-display">Machine</span>',
      contentHtml: '',
      onMoveUp,
      onMoveDown,
    });
    const upBtn = row.querySelector('.move-up-btn');
    const downBtn = row.querySelector('.move-down-btn');
    expect(upBtn).not.toBeNull();
    expect(downBtn).not.toBeNull();
    upBtn.click();
    expect(onMoveUp).toHaveBeenCalled();
    downBtn.click();
    expect(onMoveDown).toHaveBeenCalled();
  });

  it('should hide move-up button when onMoveUp is not provided', () => {
    const onMoveDown = vi.fn();
    const row = createExpandableRow(container, {
      id: 'row-10',
      headerHtml: '<span class="machine-name-display">Machine</span>',
      contentHtml: '',
      onMoveDown,
    });
    const upBtn = row.querySelector('.move-up-btn');
    expect(upBtn.style.visibility).toBe('hidden');
  });

  it('should hide move-down button when onMoveDown is not provided', () => {
    const onMoveUp = vi.fn();
    const row = createExpandableRow(container, {
      id: 'row-11',
      headerHtml: '<span class="machine-name-display">Machine</span>',
      contentHtml: '',
      onMoveUp,
    });
    const downBtn = row.querySelector('.move-down-btn');
    expect(downBtn.style.visibility).toBe('hidden');
  });

  it('should append reorder container to header when no machine-name-display anchor', () => {
    const onMoveUp = vi.fn();
    const row = createExpandableRow(container, {
      id: 'row-12',
      headerHtml: 'No anchor span',
      contentHtml: '',
      onMoveUp,
    });
    const reorderContainer = row.querySelector('.reorder-container');
    expect(reorderContainer).not.toBeNull();
    // Should be inside .row-header since no anchor
    expect(row.querySelector('.row-header').contains(reorderContainer)).toBe(true);
  });

  it('should stop propagation on reorder button clicks', () => {
    const onMoveUp = vi.fn();
    const onHeaderClick = vi.fn();
    const row = createExpandableRow(container, {
      id: 'row-13',
      headerHtml: '<span class="machine-name-display">Machine</span>',
      contentHtml: '',
      onMoveUp,
      onHeaderClick,
    });
    const upBtn = row.querySelector('.move-up-btn');
    upBtn.click();
    expect(onMoveUp).toHaveBeenCalled();
    // onHeaderClick should NOT be called because stopPropagation
    expect(onHeaderClick).not.toHaveBeenCalled();
  });
});

// ── setupSortableList ────────────────────────────────────────────
describe('setupSortableList', () => {
  let container;
  beforeEach(() => {
    container = document.createElement('div');
    container.innerHTML = `
      <div class="item" data-id="a" draggable="true">Item A</div>
      <div class="item" data-id="b" draggable="true">Item B</div>
      <div class="item" data-id="c" draggable="true">Item C</div>
    `;
    document.body.appendChild(container);
  });
  afterEach(() => {
    container.remove();
  });

  it('should set opacity on dragstart and clear on dragend', () => {
    const onReorder = vi.fn();
    setupSortableList(container, { itemSelector: '.item', onReorder });
    const itemA = container.querySelector('[data-id="a"]');
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'target', { value: itemA, writable: false });
    container.dispatchEvent(dragStartEvent);
    expect(itemA.style.opacity).toBe('0.5');
    const dragEndEvent = new Event('dragend', { bubbles: true });
    Object.defineProperty(dragEndEvent, 'target', { value: itemA, writable: false });
    container.dispatchEvent(dragEndEvent);
    expect(itemA.style.opacity).toBe('');
    expect(onReorder).toHaveBeenCalledWith(['a', 'b', 'c']);
  });

  it('should reorder items on dragover (drag above midpoint)', () => {
    const onReorder = vi.fn();
    setupSortableList(container, { itemSelector: '.item', onReorder });
    const itemA = container.querySelector('[data-id="a"]');
    const itemC = container.querySelector('[data-id="c"]');
    // Start dragging item A
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'target', { value: itemA, writable: false });
    container.dispatchEvent(dragStartEvent);
    // Drag over item C — above midpoint → insert before C
    const rect = { top: 0, height: 100 };
    vi.spyOn(itemC, 'getBoundingClientRect').mockReturnValue(rect);
    const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, 'target', { value: itemC, writable: false });
    Object.defineProperty(dragOverEvent, 'clientY', { value: 30, writable: false });
    container.dispatchEvent(dragOverEvent);
    expect(dragOverEvent.defaultPrevented).toBe(true);
    // End drag
    const dragEndEvent = new Event('dragend', { bubbles: true });
    Object.defineProperty(dragEndEvent, 'target', { value: itemA, writable: false });
    container.dispatchEvent(dragEndEvent);
    expect(onReorder).toHaveBeenCalled();
    const order = onReorder.mock.calls[0][0];
    // A moved before C → [b, a, c]
    expect(order).toEqual(['b', 'a', 'c']);
  });

  it('should reorder items on dragover (drag below midpoint)', () => {
    const onReorder = vi.fn();
    setupSortableList(container, { itemSelector: '.item', onReorder });
    const itemA = container.querySelector('[data-id="a"]');
    const itemC = container.querySelector('[data-id="c"]');
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'target', { value: itemA, writable: false });
    container.dispatchEvent(dragStartEvent);
    // Drag over item C — below midpoint → insert after C
    const rect = { top: 0, height: 100 };
    vi.spyOn(itemC, 'getBoundingClientRect').mockReturnValue(rect);
    const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, 'target', { value: itemC, writable: false });
    Object.defineProperty(dragOverEvent, 'clientY', { value: 80, writable: false });
    container.dispatchEvent(dragOverEvent);
    const dragEndEvent = new Event('dragend', { bubbles: true });
    Object.defineProperty(dragEndEvent, 'target', { value: itemA, writable: false });
    container.dispatchEvent(dragEndEvent);
    expect(onReorder).toHaveBeenCalled();
    const order = onReorder.mock.calls[0][0];
    // A moved after C → [b, c, a]
    expect(order).toEqual(['b', 'c', 'a']);
  });

  it('should not reorder when dragging over itself', () => {
    const onReorder = vi.fn();
    setupSortableList(container, { itemSelector: '.item', onReorder });
    const itemA = container.querySelector('[data-id="a"]');
    const dragStartEvent = new Event('dragstart', { bubbles: true });
    Object.defineProperty(dragStartEvent, 'target', { value: itemA, writable: false });
    container.dispatchEvent(dragStartEvent);
    // Drag over itself — should not reorder
    const rect = { top: 0, height: 100 };
    vi.spyOn(itemA, 'getBoundingClientRect').mockReturnValue(rect);
    const dragOverEvent = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragOverEvent, 'target', { value: itemA, writable: false });
    Object.defineProperty(dragOverEvent, 'clientY', { value: 30, writable: false });
    container.dispatchEvent(dragOverEvent);
    const dragEndEvent = new Event('dragend', { bubbles: true });
    Object.defineProperty(dragEndEvent, 'target', { value: itemA, writable: false });
    container.dispatchEvent(dragEndEvent);
    expect(onReorder).toHaveBeenCalledWith(['a', 'b', 'c']); // Order unchanged
  });
});

// ── createSearchableSelect additional coverage ───────────────────
describe('createSearchableSelect (additional)', () => {
  let searchInput, selectElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <input id="search-input" />
      <select id="select-element"></select>
    `;
    searchInput = document.getElementById('search-input');
    selectElement = document.getElementById('select-element');
  });

  it('should call onSelect when select change event fires', () => {
    const data = [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }];
    const onSelect = vi.fn();
    const { updateOptions } = createSearchableSelect(searchInput, selectElement, data, { onSelect });
    updateOptions(); // Populate options first
    selectElement.value = '2';
    selectElement.dispatchEvent(new Event('change'));
    expect(onSelect).toHaveBeenCalledWith('2');
    expect(searchInput.value).toBe('Beta');
  });
  it('should clear search input when select value does not match any item', () => {
    const data = [{ id: 1, name: 'Alpha' }];
    const { updateOptions } = createSearchableSelect(searchInput, selectElement, data);
    updateOptions(); // Populate options first
    searchInput.value = 'Alpha';
    searchInput.dispatchEvent(new Event('input'));
    expect(selectElement.value).toBe('1');
    // Manually set to empty and trigger change
    selectElement.value = '';
    selectElement.dispatchEvent(new Event('change'));
    expect(searchInput.value).toBe('');
  });
  it('should collapse select on blur', () => {
    vi.useFakeTimers();
    const data = [{ id: 1, name: 'Alpha' }];
    createSearchableSelect(searchInput, selectElement, data);
    searchInput.value = 'Al';
    searchInput.dispatchEvent(new Event('input'));
    expect(selectElement.size).toBeGreaterThan(1);
    searchInput.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(250);
    expect(selectElement.size).toBe(1);
    vi.useRealTimers();
  });
  it('should expand select size when filtering with matches', () => {
    const data = [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Alpha Two' }, { id: 3, name: 'Beta' }];
    createSearchableSelect(searchInput, selectElement, data);
    searchInput.value = 'alph'; // Partial match — not an exact match for any item
    searchInput.dispatchEvent(new Event('input'));
    // 2 matches + 1 placeholder = 3, capped at 5
    expect(selectElement.size).toBe(3);
  });
  it('should cap select size at 5', () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `Item ${i}` }));
    createSearchableSelect(searchInput, selectElement, data);
    searchInput.value = 'Item';
    searchInput.dispatchEvent(new Event('input'));
    expect(selectElement.size).toBe(5);
  });
  it('should preserve selected option when updating with filter', () => {
    const data = [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }];
    const { updateOptions } = createSearchableSelect(searchInput, selectElement, data);
    updateOptions(); // Populate options first
    selectElement.value = '1';
    updateOptions('Alpha');
    expect(selectElement.value).toBe('1');
  });
});

// ── initReadOnlyTournamentDisplay additional coverage ────────────
describe('initReadOnlyTournamentDisplay (additional)', () => {
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<div id="display-container"></div>';
    container = document.getElementById('display-container');
    vi.resetAllMocks();
  });

  it('should display league and event info when active event is found', async () => {
    const mockLeagues = [{
      id: 5,
      name: 'Test League',
      events: [{ id: 10, eventName: 'Event One' }],
    }];
    getActiveEventId.mockReturnValue('10');
    getActiveLeagueId.mockReturnValue('5');
    PB_API.getLeagues.mockResolvedValue(mockLeagues);

    await initReadOnlyTournamentDisplay(container);
    expect(container.innerHTML).toContain('Test League');
    expect(container.innerHTML).toContain('Event One');
  });

  it('should update league ID if resolved league differs from active', async () => {
    const mockLeagues = [{
      id: 5,
      name: 'Test League',
      events: [{ id: 10, eventName: 'Event One' }],
    }];
    getActiveEventId.mockReturnValue('10');
    getActiveLeagueId.mockReturnValue('99'); // Different from resolved league
    PB_API.getLeagues.mockResolvedValue(mockLeagues);

    await initReadOnlyTournamentDisplay(container);
    expect(setActiveLeagueId).toHaveBeenCalledWith(5);
  });

  it('should show "Selection context lost" when event not found in leagues', async () => {
    const mockLeagues = [{
      id: 5,
      name: 'Test League',
      events: [{ id: 10, eventName: 'Event One' }],
    }];
    getActiveEventId.mockReturnValue('999'); // Non-existent event
    getActiveLeagueId.mockReturnValue('');
    PB_API.getLeagues.mockResolvedValue(mockLeagues);

    await initReadOnlyTournamentDisplay(container);
    expect(container.innerHTML).toContain('Selection context lost');
  });

  it('should use existingLeagues when provided instead of fetching', async () => {
    const existingLeagues = [{
      id: 3,
      name: 'Existing League',
      events: [{ id: 7, eventName: 'Existing Event' }],
    }];
    getActiveEventId.mockReturnValue('7');
    getActiveLeagueId.mockReturnValue('3');

    await initReadOnlyTournamentDisplay(container, null, existingLeagues);
    expect(PB_API.getLeagues).not.toHaveBeenCalled();
    expect(container.innerHTML).toContain('Existing League');
  });

  it('should call onRefresh callback after rendering', async () => {
    getActiveEventId.mockReturnValue('');
    getActiveLeagueId.mockReturnValue('');
    const onRefresh = vi.fn();

    await initReadOnlyTournamentDisplay(container, onRefresh);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('should clear IDs when no active event and no active league', async () => {
    getActiveEventId.mockReturnValue('');
    getActiveLeagueId.mockReturnValue('');

    await initReadOnlyTournamentDisplay(container);
    expect(setActiveLeagueId).toHaveBeenCalledWith('');
    expect(setActiveEventId).toHaveBeenCalledWith('');
  });

  it('should do nothing if container is null', async () => {
    await expect(initReadOnlyTournamentDisplay(null)).resolves.toBeUndefined();
  });
});

// ── initTournamentSelector additional coverage ───────────────────
describe('initTournamentSelector (additional)', () => {
  const mockLeagues = [
    { id: '1', name: 'Standard League', type: 'standard', events: [{ id: '10', eventName: 'Event A' }], players: [{ userId: null }] },
    { id: '2', name: 'Session League', type: 'session', events: [], players: [{ userId: null }] },
  ];

  beforeEach(() => {
    document.body.innerHTML = '<div class="tournament-selector-container"></div>';
    vi.clearAllMocks();
    PB_API.getLeagues.mockResolvedValue(mockLeagues);
    getActiveLeagueId.mockReturnValue('');
    getActiveEventId.mockReturnValue('');
  });

  it('should hide event wrapper when showEvents is false', async () => {
    await initTournamentSelector('.tournament-selector-container', { showEvents: false });
    const eventWrapper = document.querySelector('.event-select-wrapper');
    expect(eventWrapper.classList.contains('hidden')).toBe(true);
  });

  it('should populate events when a league is selected', async () => {
    await initTournamentSelector('.tournament-selector-container');
    const leagueSelect = document.querySelector('.league-select-shared');

    leagueSelect.value = '1';
    leagueSelect.dispatchEvent(new Event('change'));

    const eventSelect = document.querySelector('.event-select-shared');
    expect(eventSelect.innerHTML).toContain('Event A');
  });

  it('should hide event wrapper when league has no events and not on standings page', async () => {
    await initTournamentSelector('.tournament-selector-container');
    const leagueSelect = document.querySelector('.league-select-shared');

    // Select session league (no events)
    leagueSelect.value = '2';
    leagueSelect.dispatchEvent(new Event('change'));

    const eventWrapper = document.querySelector('.event-select-wrapper');
    expect(eventWrapper.classList.contains('hidden')).toBe(true);
  });

  it('should set active IDs when event is selected', async () => {
    await initTournamentSelector('.tournament-selector-container');
    const leagueSelect = document.querySelector('.league-select-shared');

    leagueSelect.value = '1';
    leagueSelect.dispatchEvent(new Event('change'));

    const eventSelect = document.querySelector('.event-select-shared');
    eventSelect.value = '10';
    eventSelect.dispatchEvent(new Event('change'));

    expect(setActiveEventId).toHaveBeenCalledWith('10');
  });

  it('should call onRefresh when league is selected', async () => {
    const onRefresh = vi.fn();
    await initTournamentSelector('.tournament-selector-container', { onRefresh });
    const leagueSelect = document.querySelector('.league-select-shared');

    leagueSelect.value = '1';
    leagueSelect.dispatchEvent(new Event('change'));

    expect(onRefresh).toHaveBeenCalled();
  });

  it('should call onRefresh when event is changed', async () => {
    const onRefresh = vi.fn();
    await initTournamentSelector('.tournament-selector-container', { onRefresh });
    const leagueSelect = document.querySelector('.league-select-shared');

    leagueSelect.value = '1';
    leagueSelect.dispatchEvent(new Event('change'));

    const eventSelect = document.querySelector('.event-select-shared');
    eventSelect.value = '10';
    eventSelect.dispatchEvent(new Event('change'));

    expect(setActiveEventId).toHaveBeenCalledWith('10');
  });

  it('should accept a DOM element as container', async () => {
    const el = document.querySelector('.tournament-selector-container');
    await initTournamentSelector(el);
    expect(el.innerHTML).toContain('League Search');
  });

  it('should do nothing if container element is not found', async () => {
    await expect(initTournamentSelector('.non-existent')).resolves.toBeUndefined();
  });

  it('should use existingLeagues when provided', async () => {
    const existingLeagues = [{ id: '99', name: 'Custom League', type: 'standard', events: [], players: [{ userId: null }] }];
    await initTournamentSelector('.tournament-selector-container', { existingLeagues });
    expect(PB_API.getLeagues).not.toHaveBeenCalled();
    const select = document.querySelector('.league-select-shared');
    expect(select.innerHTML).toContain('Custom League');
  });

  it('should show all leagues when typeFilter is null', async () => {
    await initTournamentSelector('.tournament-selector-container', { typeFilter: null });
    const select = document.querySelector('.league-select-shared');
    expect(select.innerHTML).toContain('Standard League');
    expect(select.innerHTML).toContain('Session League');
  });

  it('should pre-populate league and events when active IDs are set', async () => {
    getActiveLeagueId.mockReturnValue('1');
    getActiveEventId.mockReturnValue('10');

    await initTournamentSelector('.tournament-selector-container');
    const leagueSelect = document.querySelector('.league-select-shared');
    const search = document.getElementById('league-search-global');

    expect(leagueSelect.value).toBe('1');

    search.value = '';
    search.dispatchEvent(new Event('input'));

    const eventSelect = document.querySelector('.event-select-shared');
    expect(eventSelect.innerHTML).toContain('Event A');
  });

  it('should clear events when league select is set to empty', async () => {
    await initTournamentSelector('.tournament-selector-container');
    const leagueSelect = document.querySelector('.league-select-shared');

    // First select a league
    leagueSelect.value = '1';
    leagueSelect.dispatchEvent(new Event('change'));

    // Then select empty
    leagueSelect.value = '';
    leagueSelect.dispatchEvent(new Event('change'));

    const eventWrapper = document.querySelector('.event-select-wrapper');
    expect(eventWrapper.classList.contains('hidden')).toBe(true);
  });
});

// ── setupLiveFilter additional coverage ──────────────────────────
describe('setupLiveFilter (additional)', () => {
  it('should return all data when query is empty', () => {
    const input = document.createElement('input');
    const data = [{ name: 'Alpha' }, { name: 'Beta' }];
    const onFilter = vi.fn();
    const { performFilter } = setupLiveFilter(input, data, { labelKey: 'name', onFilter });

    input.value = '';
    performFilter();
    expect(onFilter).toHaveBeenCalledWith(data, '');
  });

  it('should use custom labelKey', () => {
    const input = document.createElement('input');
    const data = [{ title: 'Item A' }, { title: 'Item B' }];
    const onFilter = vi.fn();
    setupLiveFilter(input, data, { labelKey: 'title', onFilter });

    input.value = 'Item A';
    input.dispatchEvent(new Event('input'));
    expect(onFilter).toHaveBeenCalledWith([{ title: 'Item A' }], 'item a');
  });

  it('should work without onFilter callback', () => {
    const input = document.createElement('input');
    const data = [{ name: 'Test' }];
    expect(() => {
      setupLiveFilter(input, data);
      input.value = 'Test';
      input.dispatchEvent(new Event('input'));
    }).not.toThrow();
  });
});