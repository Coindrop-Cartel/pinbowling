import { PB_API } from '@services/api.js';
import { getActiveEventId, getActiveLeagueId, setActiveEventId, setActiveLeagueId } from '@scripts/utils.js';
import { getFormatBadgeHtml } from '@ui/branding.js';
import { filterLeaguesForUser } from '@services/auth.js';

/**
 * Searchable selects, tournament selectors, expandable rows, and sortable lists.
 * @module ui/selectors
 */

/**
 * Enhances a select element with a search input for filtering options.
 * @param {HTMLInputElement} searchInput - The text input used for filtering.
 * @param {HTMLSelectElement} selectElement - The select element to populate.
 * @param {Array<Object>} data - The array of items to render as options.
 * @param {Object} [options] - Configuration options.
 * @param {string} [options.valueKey='id'] - Property name to use as the option value.
 * @param {string} [options.labelKey='name'] - Property name to use as the option label.
 * @param {string} [options.placeholder='-- Choose --'] - Placeholder text for the default option.
 * @param {function(*): void} [options.onSelect=null] - Callback invoked when a selection is made.
 * @returns {{ updateOptions: function(string): number }} An object with an updateOptions method that re-filters and returns the match count.
 */
export function createSearchableSelect(searchInput, selectElement, initialData, { valueKey = 'id', labelKey = 'name', placeholder = '-- Choose --', onSelect = null } = {}) {
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
    const matchCount = updateOptions(filter);
    selectElement.size = filter.length > 0 ? Math.min(matchCount + 1, 5) : 1;
  });

  searchInput.addEventListener('blur', (e) => { 
    // If focus moved to the select itself, don't collapse immediately
    if (e.relatedTarget === selectElement) return;
    setTimeout(() => { selectElement.size = 1; }, 200); 
  });
  selectElement.addEventListener('change', () => {
    const val = selectElement.value;
    const match = data.find(item => String(item[valueKey]) === String(val));
    selectElement.size = 1;
    searchInput.value = match ? match[labelKey] : '';
    if (onSelect) onSelect(val);
  });
  return { 
    updateOptions,
    setData: (newData) => {
      data = newData;
      return updateOptions(searchInput.value);
    }
  };
}

/**
 * Resolves the active league and event from the leagues array using stored IDs.
 * @param {Array<import('@scripts/types.js').League>} leagues - All available leagues.
 * @param {string|null} activeEventId - The currently active event ID.
 * @param {string|null} activeLeagueId - The currently active league ID.
 * @returns {{ league: import('@scripts/types.js').League|null, event: import('@scripts/types.js').Event|null }}
 */
function _resolveTournamentData(leagues, activeEventId, activeLeagueId) {
  let league = null; let event = null;
  if (activeEventId && activeEventId !== 'summary') {
    for (const l of leagues) {
      const e = (l.events || []).find(evt => String(evt.id) === String(activeEventId));
      if (e) { league = l; event = e; break; }
    }
  }
  if (!league && activeLeagueId) {
    league = leagues.find(l => String(l.id) === String(activeLeagueId));
    if (activeEventId === 'summary') event = { eventName: 'Season Summary' };
  }
  return { league, event };
}

/**
 * Renders a read-only display of the currently selected tournament (league + event).
 * @param {HTMLElement} container - The container element to render into.
 * @param {function(): Promise<void>} [onRefresh] - Callback invoked after the display is updated.
 * @param {Array<import('@scripts/types.js').League>|null} [existingLeagues=null] - Pre-fetched leagues to avoid an API call.
 * @returns {Promise<void>}
 */
export async function initReadOnlyTournamentDisplay(container, onRefresh, existingLeagues = null) {
  if (!container) return;
  const activeEventId = getActiveEventId();
  const activeLeagueId = getActiveLeagueId();
  if (activeEventId) {
    try {
      const leagues = existingLeagues || await PB_API.getLeagues();
      const { league, event } = _resolveTournamentData(leagues, activeEventId, activeLeagueId);
      if (league) {
        if (String(league.id) !== String(activeLeagueId)) setActiveLeagueId(league.id);
        container.innerHTML = `<section class="card tournament-display mb-20"><div class="flex-col"><h2 class="mb-0">Current Selection:</h2><p class="mb-0"><strong>League:</strong> ${league.name}</p><p class="mb-0"><strong>Event:</strong> ${event?.eventName || 'Season Summary'}</p></div></section>`;
      } else throw new Error('Selection invalid');
    } catch (error) { container.innerHTML = `<div class="notice">Selection context lost.</div>`; }
  } else {
    setActiveLeagueId(''); setActiveEventId('');
    container.innerHTML = `<section class="card tournament-display mb-20"><div class="flex-col"><h2 class="mb-0">No Tournament Selected</h2></div></section>`;
  }
  if (onRefresh) await onRefresh();
}

/**
 * Sets up a live text filter on an input element that filters a data array.
 * @param {HTMLInputElement} inputElement - The text input to listen on.
 * @param {Array<Object>} initialData - The initial data array to filter.
 * @param {Object} [options] - Configuration options.
 * @param {string} [options.labelKey='name'] - Property name to match the filter against.
 * @param {function(Array, string): void} [options.onFilter=null] - Callback invoked with filtered results and query.
 * @returns {{ performFilter: function(): void, setData: function(Array): void }} An object with filtering and data update methods.
 */
export function setupLiveFilter(inputElement, initialData, { labelKey = 'name', onFilter = null } = {}) {
  let data = Array.isArray(initialData) ? initialData : [];

  const performFilter = () => {
    const query = inputElement.value.trim().toLowerCase();
    // Defensive check: ensure data is an array before filtering
    const source = Array.isArray(data) ? data : [];
    const filtered = source.filter(item => String(item[labelKey] || '').toLowerCase().includes(query));
    if (onFilter) onFilter(filtered, query);
  };

  inputElement.addEventListener('input', performFilter);

  return {
    performFilter,
    setData: (newData) => {
      data = Array.isArray(newData) ? newData : [];
    }
  };
}

/**
 * Renders a summary bar with action buttons.
 * @param {HTMLElement} container - The container element to render into.
 * @param {string} title - The summary text displayed above the buttons.
 * @param {Array<{text: string, onclick?: function, hidden?: boolean}>} [actions=[]] - The action buttons to render.
 * @returns {void}
 */
export function renderActionSummary(container, title, actions = []) {
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = `<div class="flex-col"><div class="summary-text">${title}</div><div class="flex gap-8 wrap">${actions.map((act, i) => `<button type="button" class="btn-row secondary ${act.hidden ? 'hidden' : ''}" data-idx="${i}">${act.text}</button>`).join('')}</div></div>`;
  container.querySelectorAll('button').forEach(btn => {
    const action = actions[btn.dataset.idx];
    if (action && action.onclick) btn.onclick = action.onclick;
  });
}

/**
 * Initializes a full tournament selector UI with league search, league select, and event select.
 * @param {HTMLElement|string} container - The container element or CSS selector.
 * @param {Object} [options] - Configuration options.
 * @param {function(): Promise<void>} [options.onRefresh] - Callback invoked when league or event selection changes.
 * @param {string} [options.typeFilter='standard'] - League type filter (e.g. 'standard', 'golf').
 * @param {boolean} [options.showEvents=true] - Whether to show the event dropdown.
 * @param {Array<import('@scripts/types.js').League>|null} [options.existingLeagues=null] - Pre-fetched leagues to avoid an API call.
 * @returns {Promise<void>}
 */
export async function initTournamentSelector(container, { onRefresh, typeFilter = 'standard', showEvents = true, existingLeagues = null, currentUser = null } = {}) {
  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) return;
  const initialEventId = getActiveEventId();
  const initialLeagueId = getActiveLeagueId();
  let allLeagues = existingLeagues || await PB_API.getLeagues();

  // Apply user-based filtering (e.g. unregistered users only see leagues with guests)
  const getFilteredLeagues = (list) => {
    const currentActiveId = getActiveLeagueId();
    let filtered = filterLeaguesForUser(list, currentUser);
    return typeFilter 
      ? filtered.filter(l => l.type === typeFilter || String(l.id) === String(currentActiveId)) 
      : filtered;
  };

  let leagues = getFilteredLeagues(allLeagues);

  target.innerHTML = `
    <section class="card tournament-selector mb-5 card-pad">
      <div class="flex-col" autocomplete="off">
        <div>
          <label>League Search</label>
          <input type="text" id="league-search-global" placeholder="Type to filter...">
        </div>
        <div>
          <label>Select League</label>
          <select class="league-select-shared">
            <option value="">-- Choose League --</option>
          </select>
        </div>
        <div class="event-select-wrapper shared-ui-hidden">
          <label>Event</label>
          <select class="event-select-shared">
            <option value="">Select Event</option>
          </select>
        </div>
      </div>
    </section>`;

  if (!showEvents) target.querySelector('.event-select-wrapper').classList.add('hidden');
  const searchInput = target.querySelector('#league-search-global');
  const leagueSelect = target.querySelector('.league-select-shared');
  const eventSelect = target.querySelector('.event-select-shared');
  const eventWrapper = target.querySelector('.event-select-wrapper');
  const populateEvents = (leagueId, selectedEventId) => {
    const isStandingsPage = !!document.getElementById('standings-body');
    eventSelect.innerHTML = `<option value="">Select Event</option>${isStandingsPage && leagueId ? '<option value="summary">Season Summary</option>' : ''}`;
    if (!leagueId) { eventWrapper.classList.add('hidden'); eventSelect.value = ''; return; }
    const league = allLeagues.find(l => String(l.id) === String(leagueId));
    const events = league?.events || [];
    if (events.length === 0 && !isStandingsPage) { eventWrapper.classList.add('hidden'); return; }
    eventWrapper.classList.remove('hidden');
    events.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id; opt.textContent = e.eventName;
      if (String(e.id) === String(selectedEventId)) opt.selected = true;
      eventSelect.appendChild(opt);
    });
  };

  const leagueSearch = createSearchableSelect(searchInput, leagueSelect, leagues, {
    placeholder: '-- Choose League --',
    onSelect: (leagueId) => { setActiveLeagueId(leagueId); setActiveEventId(''); populateEvents(leagueId); if (onRefresh) onRefresh(); }
  });

  eventSelect.addEventListener('change', () => { setActiveEventId(eventSelect.value); if (onRefresh) onRefresh(); });

  const { league: resolvedLeague } = _resolveTournamentData(allLeagues, initialEventId, initialLeagueId);
  let currentLeagueId = resolvedLeague ? String(resolvedLeague.id) : initialLeagueId;

  if (currentLeagueId) {
    const league = allLeagues.find(l => String(l.id) === String(currentLeagueId));
    if (league) {
      searchInput.value = league.name;
      leagueSearch.updateOptions(league.name);
      leagueSelect.value = currentLeagueId;
      populateEvents(currentLeagueId, initialEventId);
    }
    else leagueSearch.updateOptions('');
  } else leagueSearch.updateOptions('');

  if (onRefresh) await onRefresh();

  return {
    setData: (newList) => {
      allLeagues = newList;
      const filtered = getFilteredLeagues(newList);
      leagueSearch.setData(filtered);
      // Refresh events in case they changed for the current selection
      const leagueId = getActiveLeagueId();
      if (leagueId) populateEvents(leagueId, getActiveEventId());
    }
  };
}

/**
 * Creates an expandable row element and appends it to the container.
 * @param {HTMLElement} container - The parent container to append the row to.
 * @param {Object} options - Row configuration.
 * @param {string} options.id - Unique identifier stored in data-id.
 * @param {string} options.headerHtml - HTML content for the always-visible header.
 * @param {string} [options.contentHtml] - HTML content for the collapsible body.
 * @param {boolean} [options.isExpanded=false] - Whether the row starts expanded.
 * @param {function(Event): void} [options.onHeaderClick] - Click handler for the header.
 * @param {function(Event): void} [options.onMoveUp] - Click handler for the move-up button.
 * @param {function(Event): void} [options.onMoveDown] - Click handler for the move-down button.
 * @param {boolean} [options.draggable=false] - Whether the row is draggable.
 * @param {string} [options.className=''] - Additional CSS class names.
 * @param {string} [options.tag='div'] - The HTML tag to create.
 * @param {string|null} [options.format=null] - Scoring format for the format badge.
 * @returns {HTMLElement} The created row element.
 */
export function createExpandableRow(container, options) {
  const { id, headerHtml, contentHtml, isExpanded = false, onHeaderClick, onMoveUp, onMoveDown, draggable = false, className = '', tag = 'div', format = null } = options;
  const row = document.createElement(tag);
  if (className) row.className = className;
  row.dataset.id = id;
  if (draggable) row.draggable = true;
  row.classList.add('list-row');
  row.innerHTML = `<div class="row-header">${headerHtml}${getFormatBadgeHtml(format)}</div>${contentHtml ? `<div class="row-expansion ${isExpanded ? '' : 'hidden'}">${contentHtml}</div>` : ''}`;
  const header = row.querySelector('.row-header');
  if (onMoveUp || onMoveDown) {
    const reorderContainer = document.createElement('div');
    reorderContainer.className = 'reorder-container';
    reorderContainer.innerHTML = `<button type="button" class="move-up-btn">▲</button><button type="button" class="move-down-btn">▼</button>`;
    const anchor = row.querySelector('.machine-name-display');
    if (anchor) anchor.after(reorderContainer); else header.appendChild(reorderContainer);
    const up = reorderContainer.querySelector('.move-up-btn');
    const down = reorderContainer.querySelector('.move-down-btn');
    if (onMoveUp) up.onclick = (e) => { e.stopPropagation(); onMoveUp(e); }; else up.style.visibility = 'hidden';
    if (onMoveDown) down.onclick = (e) => { e.stopPropagation(); onMoveDown(e); }; else down.style.visibility = 'hidden';
  }
  header.onclick = (e) => { if (!e.target.closest('button, input, select, label, .reorder-btns') && onHeaderClick) onHeaderClick(e); };
  container.appendChild(row);
  return row;
}

/**
 * Enables drag-and-drop reordering on a container's child items.
 * @param {HTMLElement} container - The container element with draggable children.
 * @param {Object} options - Configuration options.
 * @param {string} options.itemSelector - CSS selector for draggable items within the container.
 * @param {function(string[]): void} [options.onReorder] - Callback invoked with the ordered array of data-id values after a drag.
 * @returns {void}
 */
export function setupSortableList(container, { itemSelector, onReorder }) {
  let draggedItem = null;
  container.addEventListener('dragstart', (e) => { draggedItem = e.target.closest(itemSelector); if (draggedItem) draggedItem.style.opacity = '0.5'; });
  container.addEventListener('dragend', (e) => {
    if (draggedItem) {
      draggedItem.style.opacity = '';
      if (onReorder) onReorder(Array.from(container.querySelectorAll(itemSelector)).map(el => el.dataset.id));
    }
    draggedItem = null;
  });
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const overItem = e.target.closest(itemSelector);
    if (overItem && overItem !== draggedItem) {
      const rect = overItem.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) container.insertBefore(draggedItem, overItem);
      else container.insertBefore(draggedItem, overItem.nextSibling);
    }
  });
}