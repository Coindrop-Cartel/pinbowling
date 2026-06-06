import { PB_API } from '@services/api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';
import { showAlert } from './dialogs.js';
import { getFormatBadgeHtml } from './branding.js';

export function createSearchableSelect(searchInput, selectElement, data, {
  valueKey = 'id',
  labelKey = 'name',
  placeholder = '-- Choose --',
  onSelect = null
} = {}) {
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
    const exactMatch = data.find(item => String(item[labelKey]).toLowerCase() === filter.toLowerCase());
    if (exactMatch && String(selectElement.value) !== String(exactMatch[valueKey])) {
      selectElement.value = exactMatch[valueKey];
      selectElement.size = 1;
      if (onSelect) onSelect(exactMatch[valueKey]);
    }
  });

  searchInput.addEventListener('blur', () => { setTimeout(() => { selectElement.size = 1; }, 200); });
  selectElement.addEventListener('change', () => {
    const val = selectElement.value;
    const match = data.find(item => String(item[valueKey]) === String(val));
    selectElement.size = 1;
    searchInput.value = match ? match[labelKey] : '';
    if (onSelect) onSelect(val);
  });
  return { updateOptions };
}

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
        container.innerHTML = `<section class="card tournament-display" style="margin-bottom: 1.5rem;"><div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;"><h2 style="margin: 0;">Current Selection:</h2><p style="margin: 0;"><strong>League:</strong> ${league.name}</p><p style="margin: 0;"><strong>Event:</strong> ${event?.eventName || 'Season Summary'}</p></div></section>`;
      } else throw new Error('Selection invalid');
    } catch (error) { container.innerHTML = `<div class="notice">Selection context lost.</div>`; }
  } else {
    setActiveLeagueId(''); setActiveEventId('');
    container.innerHTML = `<section class="card tournament-display" style="margin-bottom: 1.5rem;"><div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%;"><h2 style="margin: 0;">No Tournament Selected</h2></div></section>`;
  }
  if (onRefresh) await onRefresh();
}

export function setupLiveFilter(inputElement, data, { labelKey = 'name', onFilter = null } = {}) {
  const performFilter = () => {
    const query = inputElement.value.trim().toLowerCase();
    const filtered = data.filter(item => String(item[labelKey]).toLowerCase().includes(query));
    if (onFilter) onFilter(filtered, query);
  };
  inputElement.addEventListener('input', performFilter);
  return { performFilter };
}

export function renderActionSummary(container, title, actions = []) {
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = `<div style="display: flex; flex-direction: column; gap: 8px;"><div style="font-weight: bold; font-size: 1.1rem; line-height: 1.2;">${title}</div><div style="display: flex; gap: 8px; flex-wrap: wrap;">${actions.map((act, i) => `<button type="button" class="secondary ${act.hidden ? 'hidden' : ''}" data-idx="${i}" style="padding: 4px 10px; font-size: 0.75rem; width: auto;">${act.text}</button>`).join('')}</div></div>`;
  container.querySelectorAll('button').forEach(btn => {
    const action = actions[btn.dataset.idx];
    if (action && action.onclick) btn.onclick = action.onclick;
  });
}

export async function initTournamentSelector(container, { onRefresh, typeFilter = 'standard', showEvents = true, existingLeagues = null } = {}) {
  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) return;
  const activeEventId = getActiveEventId();
  const activeLeagueId = getActiveLeagueId();
  const allLeagues = existingLeagues || await PB_API.getLeagues();
  const leagues = typeFilter ? allLeagues.filter(l => l.type === typeFilter || String(l.id) === String(activeLeagueId)) : allLeagues;

  target.innerHTML = `
    <section class="card tournament-selector" style="margin-bottom: 5px; padding: 12px 15px;">
      <div style="display: flex; flex-direction: column; gap: 0.75rem; width: 100%; box-sizing: border-box;" autocomplete="off">
        <div style="width: 100%;">
          <label style="display: block; margin-bottom: 5px;">League Search</label>
          <input type="text" id="league-search-global" style="width: 100%; box-sizing: border-box; margin-bottom: 0;" placeholder="Type to filter...">
        </div>
        <div style="width: 100%;">
          <label style="display: block; margin-bottom: 5px;">Select League</label>
          <select class="league-select-shared" style="width: 100%; box-sizing: border-box;">
            <option value="">-- Choose League --</option>
          </select>
        </div>
        <div class="event-select-wrapper shared-ui-hidden" style="width: 100%;">
          <label style="display: block; margin-bottom: 5px;">Event</label>
          <select class="event-select-shared" style="width: 100%; box-sizing: border-box;">
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

  const { updateOptions } = createSearchableSelect(searchInput, leagueSelect, leagues, {
    placeholder: '-- Choose League --',
    onSelect: (leagueId) => { setActiveLeagueId(leagueId); setActiveEventId(''); populateEvents(leagueId); if (onRefresh) onRefresh(); }
  });

  eventSelect.addEventListener('change', () => { setActiveEventId(eventSelect.value); if (onRefresh) onRefresh(); });

  const { league: resolvedLeague } = _resolveTournamentData(allLeagues, activeEventId, activeLeagueId);
  let currentLeagueId = resolvedLeague ? String(resolvedLeague.id) : activeLeagueId;

  if (currentLeagueId) {
    const league = allLeagues.find(l => String(l.id) === String(currentLeagueId));
    if (league) {
      searchInput.value = league.name;
      updateOptions(league.name);
      leagueSelect.value = currentLeagueId;
      populateEvents(currentLeagueId, activeEventId);
    }
    else updateOptions('');
  } else updateOptions('');

  if (onRefresh) await onRefresh();
}

export function createExpandableRow(container, options) {
  const { id, headerHtml, contentHtml, isExpanded = false, onHeaderClick, onMoveUp, onMoveDown, draggable = false, className = '', tag = 'div', format = null } = options;
  const row = document.createElement(tag);
  if (className) row.className = className;
  row.dataset.id = id;
  if (draggable) row.draggable = true;
  row.style = "margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: #fff; list-style: none;";
  row.innerHTML = `<div class="row-header" style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #f9f9f9; cursor: pointer;">${headerHtml}${getFormatBadgeHtml(format)}</div>${contentHtml ? `<div class="row-expansion ${isExpanded ? '' : 'hidden'}" style="padding: 12px 15px; border-top: 1px solid #ddd;">${contentHtml}</div>` : ''}`;
  const header = row.querySelector('.row-header');
  if (onMoveUp || onMoveDown) {
    const reorderContainer = document.createElement('div');
    reorderContainer.style = 'display: flex; flex-direction: column; gap: 2px; margin-left: 8px; align-items: center; justify-content: center;';
    reorderContainer.innerHTML = `<button type="button" class="move-up-btn" style="padding: 2px; background: none!important; color: var(--pb-primary)!important; border: none!important; font-size: 0.8rem;">▲</button><button type="button" class="move-down-btn" style="padding: 2px; background: none!important; color: var(--pb-primary)!important; border: none!important; font-size: 0.8rem;">▼</button>`;
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