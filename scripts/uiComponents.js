import { PB_API } from './api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId } from './utils.js';
/**
 * Creates a searchable selection interaction between a text input and a select dropdown.
 * 
 * @param {HTMLInputElement} searchInput The text field used for filtering.
 * @param {HTMLSelectElement} selectElement The dropdown to be filtered.
 * @param {Array} data The array of objects to search through.
 * @param {Object} options Configuration for keys, placeholders, and callbacks.
 */
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

  searchInput.addEventListener('blur', () => {
    setTimeout(() => { selectElement.size = 1; }, 200);
  });

  selectElement.addEventListener('change', () => {
    const val = selectElement.value;
    const match = data.find(item => String(item[valueKey]) === String(val));
    selectElement.size = 1;
    searchInput.value = match ? match[labelKey] : '';
    if (onSelect) onSelect(val);
  });

  return { updateOptions };
}

/**
 * Initializes a read-only display for the active League and Event.
 * Used on pages where the selection is expected to be pre-determined (e.g., event-setup).
 * 
 * @param {HTMLElement} container The DOM element to render the display into.
 * @param {Function} onRefresh Callback to execute after the display is rendered.
 */
export async function initReadOnlyTournamentDisplay(container, onRefresh) {
  if (!container) return;

  const activeLeagueId = getActiveLeagueId();
  const activeEventId = getActiveEventId();

  let leagueName = 'No League Selected';
  let eventName = 'No Event Selected';

  if (activeLeagueId && activeEventId) {
    try {
      // Fetch all leagues to find the specific one and its events
      const leagues = await PB_API.getLeagues(); 
      const activeLeague = leagues.find(l => String(l.id) === String(activeLeagueId));

      if (activeLeague) {
        leagueName = activeLeague.name;
        const activeEvent = (activeLeague.events || []).find(e => String(e.id) === String(activeEventId));
        if (activeEvent) {
          eventName = `${activeEvent.event_name} (${activeEvent.event_date || 'No Date'})`;
        } else {
          // If event not found in the active league, clear event ID
          setActiveEventId('');
          eventName = 'Invalid Event Selected';
        }
      } else {
        // If league not found, clear both
        setActiveLeagueId('');
        setActiveEventId('');
        leagueName = 'Invalid League Selected';
        eventName = 'No Event Selected';
      }
    } catch (error) {
      console.error('Error fetching league/event details for read-only display:', error);
      leagueName = 'Error Loading League';
      eventName = 'Error Loading Event';
    }
  } else {
    // If no league or event is active, ensure both are cleared
    setActiveLeagueId('');
    setActiveEventId('');
  }

  container.innerHTML = `
    <section class="card tournament-display" style="margin-bottom: 1.5rem;">
      <div style="display: flex; flex-direction: column; gap: 0.5rem; width: 100%; box-sizing: border-box;">
        <h2 style="margin: 0;">Current Selection:</h2>
        <p style="margin: 0;"><strong>League:</strong> ${leagueName}</p>
        <p style="margin: 0;"><strong>Event:</strong> ${eventName}</p>
      </div>
    </section>
  `;

  // Trigger the page's refresh logic
  if (onRefresh) {
    onRefresh();
  }
}

/**
 * Sets up a live search/filter on an input field against a data array.
 * Useful for filtering lists that are rendered manually (e.g., div lists, tables).
 * 
 * @param {HTMLInputElement} inputElement The input field to watch.
 * @param {Array} data The source data (should be updated in-place to maintain reference).
 * @param {Object} options Configuration.
 */
export function setupLiveFilter(inputElement, data, { labelKey = 'name', onFilter = null } = {}) {
  const performFilter = () => {
    const query = inputElement.value.trim().toLowerCase();
    const filtered = data.filter(item =>
      String(item[labelKey]).toLowerCase().includes(query)
    );
    if (onFilter) onFilter(filtered, query);
  };

  inputElement.addEventListener('input', performFilter);
  return { performFilter };
}