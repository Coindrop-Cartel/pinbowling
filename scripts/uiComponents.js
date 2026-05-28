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

  if (activeEventId) {
    try {
      // Fetch all leagues to find the specific one and its events
      const leagues = await PB_API.getLeagues(); 
      let activeLeague = leagues.find(l => String(l.id) === String(activeLeagueId));

      // Self-healing: If league is missing but we have an event, find the league containing the event
      if (!activeLeague && activeEventId !== 'summary') {
        activeLeague = leagues.find(l => (l.events || []).some(e => String(e.id) === String(activeEventId)));
        if (activeLeague) {
          setActiveLeagueId(activeLeague.id);
        }
      }

      if (activeLeague) {
        leagueName = activeLeague.name;
        const activeEvent = (activeLeague.events || []).find(e => String(e.id) === String(activeEventId));
        if (activeEvent) {
          eventName = `${activeEvent.event_name} (${activeEvent.event_date || 'No Date'})`;
        } else if (activeEventId !== 'summary') {
          // If event not found in the active league, clear event ID
          setActiveEventId('');
          eventName = 'Invalid Event Selected';
        }
      } else if (activeLeagueId) {
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
    await onRefresh();
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

/**
 * Replaces native browser confirm() and prompt() with a custom UI modal
 * that matches the site's card-based theme.
 * 
 * @param {Object} params
 * @returns {Promise<string|boolean|null>}
 */
export function showDialog({ title, message, showInput = false, isPassword = true, confirmText = 'Confirm', cancelText = 'Cancel' }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;box-sizing:border-box;backdrop-filter:blur(4px);";
    
    const card = document.createElement('div');
    card.className = "card";
    card.style = "max-width:450px;width:100%;margin:0;box-shadow: 0 10px 25px rgba(0,0,0,0.5);";
    
    let inputHtml = '';
    if (showInput) {
      inputHtml = `<div class="form-row" style="margin-top:20px;"><input type="${isPassword ? 'password' : 'text'}" id="modal-input" style="width:100%;box-sizing:border-box;font-size:1.1rem;padding:12px;" /></div>`;
    }

    card.innerHTML = `
      <h2 style="margin-top:0;">${title}</h2>
      <p style="margin-bottom:0; line-height:1.5;">${message}</p>
      ${inputHtml}
      <div class="form-actions" style="margin-top:30px; display:flex; gap:12px;">
        <button id="modal-confirm" style="flex:1;">${confirmText}</button>
        <button id="modal-cancel" class="secondary" style="flex:1;">${cancelText}</button>
      </div>
    `;
    
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const input = card.querySelector('#modal-input');
    const confirmBtn = card.querySelector('#modal-confirm');
    const cancelBtn = card.querySelector('#modal-cancel');

    const finish = (value) => {
      document.body.removeChild(backdrop);
      resolve(value);
    };

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finish(input.value);
        if (e.key === 'Escape') finish(null);
      });
      setTimeout(() => input.focus(), 50);
    }

    confirmBtn.onclick = () => finish(input ? input.value : true);
    cancelBtn.onclick = () => finish(showInput ? null : false);
  });
}

export const showConfirm = (message, title = 'Confirm Action') => showDialog({ title, message, confirmText: 'Yes, Proceed', cancelText: 'Cancel' });
export const showPrompt = (message, title = 'Admin Password', isPassword = true) => showDialog({ title, message, showInput: true, isPassword, confirmText: 'Submit' });

/**
 * Replaces native browser confirm() and prompt() with a custom UI modal
 * that matches the site's card-based theme, specifically for player selection.
 * 
 * @param {string} title Dialog title.
 * @param {string} message Dialog message.
 * @param {Array<{value: string|number, label: string}>} options List of players to select from.
 * @returns {Promise<string|null>} The selected player ID or null if cancelled.
 */
export async function showPlayerSelectionDialog(title, message, options) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;box-sizing:border-box;backdrop-filter:blur(4px);";
    
    const card = document.createElement('div');
    card.className = "card";
    card.style = "max-width:450px;width:100%;margin:0;box-shadow: 0 10px 25px rgba(0,0,0,0.5);";
    
    card.innerHTML = `
      <h2 style="margin-top:0;">${title}</h2>
      <p style="margin-bottom:0; line-height:1.5;">${message}</p>
      <div class="form-row" style="margin-top:20px;">
        <input type="text" id="player-search-modal" style="width:100%;box-sizing:border-box;font-size:1.1rem;padding:12px;" placeholder="Search players...">
        <select id="player-select-modal" style="width:100%;box-sizing:border-box;font-size:1.1rem;padding:12px;margin-top:10px;"></select>
      </div>
      <div class="form-actions" style="margin-top:30px; display:flex; gap:12px;">
        <button id="modal-confirm" style="flex:1;">Add Player</button>
        <button id="modal-cancel" class="secondary" style="flex:1;">Cancel</button>
      </div>
    `;
    
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const searchInput = card.querySelector('#player-search-modal');
    const selectElement = card.querySelector('#player-select-modal');
    const confirmBtn = card.querySelector('#modal-confirm');
    const cancelBtn = card.querySelector('#modal-cancel');

    // Populate initial options
    selectElement.innerHTML = '<option value="">-- Select Player --</option>' + options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');

    const searchableSelectInstance = createSearchableSelect(searchInput, selectElement, options, {
      valueKey: 'value',
      labelKey: 'label',
      placeholder: '-- Select Player --',
      onSelect: (val) => {
        confirmBtn.disabled = !val;
      }
    });

    const finish = (value) => {
      document.body.removeChild(backdrop);
      resolve(value);
    };

    confirmBtn.disabled = true; // Initially disabled until a player is selected
    confirmBtn.onclick = () => finish(selectElement.value);
    cancelBtn.onclick = () => finish(null);

    setTimeout(() => searchInput.focus(), 50);
  });
}