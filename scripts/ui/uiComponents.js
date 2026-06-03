import { PB_API } from '@services/api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId, getCookie } from '@scripts/utils.js';
import { getScoringEngine } from '@core/engine.js';

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
export async function initReadOnlyTournamentDisplay(container, onRefresh, existingLeagues = null) {
  if (!container) return;

  const activeLeagueId = getActiveLeagueId();
  const activeEventId = getActiveEventId();

  // Toggle visibility of the TV Mode button based on event selection.
  const tvBtn = document.querySelector('.tv-mode-btn');
  if (tvBtn) {
    tvBtn.classList.toggle('hidden', !activeEventId);
  }

  let leagueName = 'No League Selected';
  let eventName = 'No Event Selected';

  if (activeEventId) {
    try {
      // Fetch all leagues to ensure we can resolve metadata for session-based redirects
      const leagues = existingLeagues || await PB_API.getLeagues();
      let activeLeague = null;
      let activeEvent = null;

      // Find the event and its parent league first to ensure consistency
      if (activeEventId !== 'summary') {
        for (const l of leagues) {
          const e = (l.events || []).find(evt => String(evt.id) === String(activeEventId));
          if (e) {
            activeLeague = l;
            activeEvent = e;
            break;
          }
        }
      }

      // If the event exists, ensure the league selection is synced
      if (activeLeague) {
        if (String(activeLeague.id) !== String(activeLeagueId)) {
          setActiveLeagueId(activeLeague.id);
        }
        leagueName = activeLeague.name;
        eventName = `${activeEvent.eventName} (${activeEvent.eventDate || 'No Date'})`;
      } else if (activeEventId === 'summary') {
        activeLeague = leagues.find(l => String(l.id) === String(activeLeagueId));
        leagueName = activeLeague ? activeLeague.name : 'Invalid League';
        eventName = 'Season Summary';
      } else {
        console.warn(`Event ID ${activeEventId} not found in any league. Clearing selection.`);
        showAlert(`Event ID ${activeEventId} not found in any league. Clearing selection.`, 'Selection Warning');
        setActiveEventId('');
        eventName = 'Invalid Event Selected';
      }
    } catch (error) {
      console.error('Error fetching league/event details for read-only display:', error);
      showAlert('Failed to load tournament details. Please check your connection.', 'Error');
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
    if (window.PB_DEBUG_MODE) console.log('[UI] showDialog invoked:', { title, message, showInput });

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
        ${cancelText ? `<button id="modal-cancel" class="secondary" style="flex:1;">${cancelText}</button>` : ''}
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
    if (cancelBtn) {
      cancelBtn.onclick = () => finish(showInput ? null : false);
    }
  });
}

/**
 * Dynamically updates the site-wide theme and branding elements based on 
 * a scoring format (bowling vs golf).
 * 
 * @param {string} [overrideFormat] Optional format to force, otherwise reads from cookie.
 */
export function applyPreferredTheme(overrideFormat) {
  const preferred = overrideFormat || getCookie('pb_preferred_format') || 'bowling';
  const engine = getScoringEngine(preferred);

  // Dynamically swap the theme stylesheet to change colors instantly
  const themeLink = document.getElementById('theme-stylesheet');
  if (themeLink) {
    const currentHref = themeLink.getAttribute('href');
    const lastSlash = currentHref.lastIndexOf('/');
    const basePath = lastSlash !== -1 ? currentHref.substring(0, lastSlash + 1) : '';
    themeLink.setAttribute('href', basePath + (preferred === 'golf' ? 'golf.css' : 'bowling.css'));
  }

  // Clear any previous theme classes and apply the current engine's theme
  document.body.classList.remove('theme-golf', 'theme-bowling');
  const themeClass = engine.getThemeClass();
  if (themeClass) document.body.classList.add(themeClass);
  
  // Update dynamic logos (header/nav)
  const logoImgs = document.querySelectorAll('.nav-logo img, .header-logo img, .site-logo img, #site-logo');
  logoImgs.forEach(img => {
    const lastSlash = img.src.lastIndexOf('/');
    const basePath = lastSlash !== -1 ? img.src.substring(0, lastSlash + 1) : '';
    img.src = basePath + engine.getLogoImage();
    img.alt = engine.getBrandName() + ' Logo';
  });

  // Update the navigation brand name label
  document.querySelectorAll('.nav-logo span').forEach(el => {
    el.textContent = engine.getBrandName();
  });

  // Update all play CTA links (nav and home button)
  document.querySelectorAll('[data-route="PLAY"]').forEach(link => {
    link.textContent = engine.getPlayActionLabel();
  });

  // Update homepage descriptive text
  const logicText = document.getElementById('scoring-logic-text');
  if (logicText) logicText.textContent = engine.getScoringDescription();
}

export const showConfirm = (message, title = 'Confirm Action') => showDialog({ title, message, confirmText: 'Yes, Proceed', cancelText: 'Cancel' });
export const showPrompt = (message, title = 'Admin Password', isPassword = true) => showDialog({ title, message, showInput: true, isPassword, confirmText: 'Submit' });
export const showAlert = (message, title = 'Notice') => showDialog({ title, message, confirmText: 'OK', cancelText: null });

/**
 * Displays a dialog with multiple choice buttons for selecting an option.
 * 
 * @param {string} title Dialog title.
 * @param {string} message Dialog message.
 * @param {Array<{value: any, label: string, class?: string}>} choices List of options to present.
 * @param {any} initialValue The value to select by default.
 * @returns {Promise<any|null>} The selected value, or null if cancelled.
 */
export function showChoiceDialog(title, message, choices, initialValue = null) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;box-sizing:border-box;backdrop-filter:blur(4px);";
    
    const card = document.createElement('div');
    card.className = "card";
    card.style = "max-width:450px;width:100%;margin:0;box-shadow: 0 10px 25px rgba(0,0,0,0.5);";

    let selectedValue = initialValue;

    card.innerHTML = `
      <h2 style="margin-top:0;">${title}</h2>
      <p style="margin-bottom:20px; line-height:1.5;">${message}</p>
      <div class="form-actions" style="margin-top:30px; display:flex; gap:12px; flex-wrap: wrap;">
        ${choices.map(c => `<button type="button" class="choice-btn ${c.class || ''}" data-value="${c.value}" style="flex:1; min-width: 100px; transition: all 0.2s; border: 2px solid #000;">${c.label}</button>`).join('')}
      </div>
      <div class="form-actions" style="margin-top:20px; border-top: 1px solid #eee; padding-top: 20px; display:flex; gap:12px;">
        <button id="modal-save" style="flex:1;">Save</button>
        <button id="modal-cancel" class="secondary" style="flex:1;">Cancel</button>
      </div>
    `;
    
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const updateStyles = () => {
      card.querySelectorAll('.choice-btn').forEach(btn => {
        const isSelected = String(btn.dataset.value) === String(selectedValue);
        btn.style.backgroundColor = isSelected ? '#000' : '#fff';
        btn.style.color = isSelected ? '#fff' : '#000';
      });
    };

    const finish = (value) => {
      document.body.removeChild(backdrop);
      resolve(value);
    };

    card.querySelectorAll('.choice-btn').forEach(btn => {
      btn.onclick = () => {
        selectedValue = btn.dataset.value;
        updateStyles();
      };
    });

    updateStyles(); // Initial style application

    card.querySelector('#modal-save').onclick = () => finish(selectedValue);
    card.querySelector('#modal-cancel').onclick = () => finish(null);
  });
}

/**
 * Displays a dual-mode dialog for User Login and Registration.
 */
export async function showAuthDialog() {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;box-sizing:border-box;backdrop-filter:blur(4px);";
    
    const card = document.createElement('div');
    card.className = "card";
    card.style = "max-width:400px;width:100%;margin:0;box-shadow: 0 10px 25px rgba(0,0,0,0.5);";
    
    const renderMode = (isRegister = false) => {
      card.innerHTML = `
        <h2 style="margin-top:0;">${isRegister ? 'Create Account' : 'Sign In'}</h2>
        <form id="auth-modal-form">
          <div class="form-row">
            <label>Username</label>
            <input type="text" id="auth-username" required style="width:100%;box-sizing:border-box;">
          </div>
          <div class="form-row">
            <label>Password</label>
            <input type="password" id="auth-pass" required style="width:100%;box-sizing:border-box;">
          </div>
          ${isRegister ? `
          <div class="form-row">
            <label>Player Name (Full Name)</label>
            <input type="text" id="auth-name" required placeholder="e.g. John Doe" style="width:100%;box-sizing:border-box;">
          </div>` : ''}
          <div class="form-actions" style="margin-top:20px; flex-direction: column; gap: 10px;">
            <button type="submit" style="width:100%;">${isRegister ? 'Register' : 'Login'}</button>
            <button type="button" id="auth-switch" class="secondary" style="width:100%; border:none; background:none; text-decoration:underline; font-size:0.9rem;">
              ${isRegister ? 'Already have an account? Sign In' : 'Need an account? Register now'}
            </button>
            <button type="button" id="auth-cancel" class="secondary" style="width:100%;">Cancel</button>
          </div>
        </form>
      `;

      const form = card.querySelector('#auth-modal-form');
      form.onsubmit = async (e) => {
        e.preventDefault();
        const username = card.querySelector('#auth-username').value;
        const password = card.querySelector('#auth-pass').value;
        
        try {
          let user;
          if (isRegister) {
            const playerName = card.querySelector('#auth-name').value;
            let regResult = await PB_API.register({ username, password, playerName });
            
            // Handle existing player profile claim
            if (regResult && regResult.claimRequired) {
              const confirmed = await showConfirm(regResult.message, 'Claim Profile');
              if (confirmed) {
                await PB_API.register({ username, password, playerName, confirmClaim: true });
              } else {
                return; // Exit and keep modal open for name change
              }
            }
            user = await PB_API.login(username, password);
          } else {
            user = await PB_API.login(username, password);
          }
          document.body.removeChild(backdrop);
          resolve(user);
        } catch (err) {
          showAlert(err.message, 'Authentication Failed');
        }
      };

      card.querySelector('#auth-switch').onclick = () => renderMode(!isRegister);
      card.querySelector('#auth-cancel').onclick = () => {
        document.body.removeChild(backdrop);
        resolve(null);
      };
    };

    renderMode(false);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  });
}

/**
 * Replaces native browser confirm() and prompt() with a custom UI modal
 * that matches the site's card-based theme, specifically for player selection.
 * 
 * @param {string} title Dialog title.
 * @param {string} message Dialog message.
 * @param {Array<{value: string|number, label: string}>} options List of players to select from.
 * @param {string} confirmText Text for the confirmation button.
 * @returns {Promise<string|null>} The selected player ID or null if cancelled.
 */
export async function showPlayerSelectionDialog(title, message, options, confirmText = 'Add Player') {
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
        <button id="modal-confirm" style="flex:1;">${confirmText}</button>
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

/**
 * Scales the TV Mode container to fit the viewport width.
 * Prevents horizontal cutoff on standard 16:9 screens while allowing
 * full expansion on ultra-wide displays.
 */
export function fitTVModeToScreen() {
  const container = document.getElementById('tv-mode-content');
  if (!container || !document.body.classList.contains('tv-mode-active')) {
    if (container) {
      container.style.transform = '';
      container.style.width = '';
    }
    return;
  }

  // Reset to calculate natural dimensions
  container.style.transform = 'scale(1)';
  container.style.width = 'auto';

  const viewportWidth = window.innerWidth - 40; // Horizontal padding
  const contentWidth = container.offsetWidth;

  if (contentWidth > viewportWidth) {
    const scaleFactor = viewportWidth / contentWidth;
    container.style.transformOrigin = 'top center';
    container.style.transform = `scale(${scaleFactor})`;
    // Increase width to prevent content clipping inside the scaled container
    container.style.width = (100 / scaleFactor) + '%';
  }
}

/**
 * Initializes a unified League and Event selector.
 * 
 * @param {HTMLElement|string} container The element or selector to render into.
 * @param {Object} options
 * @param {Function} options.onRefresh Callback after selection changes.
 * @param {string|null} options.typeFilter 'standard', 'session', or null for all.
 * @param {boolean} options.showEvents Whether to include the event selection dropdown.
 */
export async function initTournamentSelector(container, { onRefresh, typeFilter = 'standard', showEvents = true, existingLeagues = null } = {}) {
  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) return;

  const activeLeagueId = getActiveLeagueId();
  const activeEventId = getActiveEventId();

  // Fetch all leagues to ensure metadata resolution works for redirects.
  // We filter the list for the dropdown specifically to keep the UI clean.
  const allLeagues = existingLeagues || await PB_API.getLeagues();
  const leagues = typeFilter 
    ? allLeagues.filter(l => l.type === typeFilter || String(l.id) === String(activeLeagueId))
    : allLeagues;

  target.innerHTML = `
    <section class="card tournament-selector" style="margin-bottom: 5px; padding: 12px 15px;">
      <div style="display: flex; flex-direction: column; gap: 0.75rem; width: 100%; box-sizing: border-box;" autocomplete="off">
        <div style="width: 100%;">
          <label style="display: block; margin-bottom: 5px;">League Search</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" class="league-search-shared" style="flex: 1; box-sizing: border-box; margin-bottom: 0;" placeholder="Type to filter...">
            <button class="clear-selection-btn secondary" style="padding: 10px 15px; white-space: nowrap;">Clear</button>
          </div>
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
    </section>
  `;

  if (!showEvents) target.querySelector('.event-select-wrapper').classList.add('hidden');

  const searchInput = target.querySelector('.league-search-shared');
  const leagueSelect = target.querySelector('.league-select-shared');
  const eventSelect = target.querySelector('.event-select-shared');
  const eventWrapper = target.querySelector('.event-select-wrapper');
  const clearBtn = target.querySelector('.clear-selection-btn');

  const populateEvents = (leagueId, selectedEventId) => {
    if (!showEvents) return;
    const isStandingsPage = !!document.getElementById('standings-body');
    eventSelect.innerHTML = `<option value="">Select Event</option>${isStandingsPage && leagueId ? '<option value="summary">Season Summary</option>' : ''}`;
    
    if (!leagueId) {
      eventWrapper.classList.add('hidden');
      eventSelect.value = '';
      return;
    }

    const league = allLeagues.find(l => String(l.id) === String(leagueId));
    const events = league?.events || [];

    if (events.length === 0 && !isStandingsPage) {
      eventWrapper.classList.add('hidden');
      return;
    }

    eventWrapper.classList.remove('hidden');
    events.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.eventName;
      if (String(e.id) === String(selectedEventId)) opt.selected = true;
      eventSelect.appendChild(opt);
    });
  };

  const { updateOptions } = createSearchableSelect(searchInput, leagueSelect, leagues, {
    placeholder: '-- Choose League --',
    onSelect: (leagueId) => {
      setActiveLeagueId(leagueId);
      setActiveEventId('');
      populateEvents(leagueId);
      if (onRefresh) onRefresh();
    }
  });

  eventSelect.addEventListener('change', () => {
    setActiveEventId(eventSelect.value);
    if (onRefresh) onRefresh();
  });

  clearBtn.addEventListener('click', () => {
    setActiveLeagueId('');
    setActiveEventId('');
    searchInput.value = '';
    leagueSelect.value = '';
    updateOptions('');
    populateEvents('', '');
    if (onRefresh) onRefresh();
  });

  // Initialization sync
  let currentLeagueId = activeLeagueId;
  if (!currentLeagueId && activeEventId && activeEventId !== 'summary') {
    const found = allLeagues.find(l => (l.events || []).some(e => String(e.id) === String(activeEventId)));
    if (found) { currentLeagueId = String(found.id); setActiveLeagueId(currentLeagueId); }
  }

  if (currentLeagueId) {
    const league = allLeagues.find(l => String(l.id) === String(currentLeagueId));
    if (league) {
      searchInput.value = league.name;
      updateOptions(league.name);
      leagueSelect.value = currentLeagueId;
      populateEvents(currentLeagueId, activeEventId);
    } else {
      updateOptions('');
    }
  } else {
    updateOptions('');
  }
  if (onRefresh) await onRefresh();
}

/**
 * Returns a stylized badge HTML string for a scoring format.
 */
export function getFormatBadgeHtml(format) {
  if (!format) return '';
  const color = format === 'golf' ? 'var(--pb-primary)' : '#666';
  const label = format === 'golf' ? 'Golf' : 'Bowling';
  return `<span class="badge" style="background:${color}; color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:10px; margin-left:8px; vertical-align:middle; font-weight: bold; text-transform: uppercase; border: none;">${label}</span>`;
}

/**
 * Creates a standardized expandable row component.
 * @param {HTMLElement} container - The parent element to append to.
 * @param {Object} options - Configuration options.
 * @returns {HTMLElement} The created row element.
 */
export function createExpandableRow(container, options) {
  const { 
    id, 
    headerHtml, 
    contentHtml, 
    isExpanded = false, 
    onHeaderClick, 
    draggable = false, 
    className = '', 
    tag = 'div',
    format = null
  } = options;

  const row = document.createElement(tag);
  if (className) row.className = className;
  row.dataset.id = id;
  if (draggable) row.draggable = true;
  
  row.style = "margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; background: #fff; list-style: none;";

  row.innerHTML = `
    <div class="row-header" style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: #f9f9f9; cursor: pointer;">
      ${headerHtml}
      ${getFormatBadgeHtml(format)}
    </div>
    ${contentHtml ? `
    <div class="row-expansion ${isExpanded ? '' : 'hidden'}" style="padding: 12px 15px; border-top: 1px solid #ddd;">
      ${contentHtml}
    </div>` : ''}
  `;

  const header = row.querySelector('.row-header');
  header.onclick = (e) => {
    // Prevent toggling when clicking interactive elements inside the header
    if (e.target.closest('button, input, select, label')) return;
    if (onHeaderClick) onHeaderClick(e);
  };

  container.appendChild(row);
  return row;
}

/**
 * Enables drag-and-drop reordering for a list of elements.
 * @param {HTMLElement} container - The parent element containing the items.
 * @param {Object} options - Configuration options.
 * @param {string} options.itemSelector - CSS selector for the draggable items.
 * @param {Function} options.onReorder - Callback when order changes, receiving the new array of IDs.
 */
export function setupSortableList(container, { itemSelector, onReorder }) {
  let draggedItem = null;

  container.addEventListener('dragstart', (e) => {
    draggedItem = e.target.closest(itemSelector);
    if (draggedItem) draggedItem.style.opacity = '0.5';
  });

  container.addEventListener('dragend', (e) => {
    if (draggedItem) {
      draggedItem.style.opacity = '';
      if (onReorder) {
        const ids = Array.from(container.querySelectorAll(itemSelector))
          .map(el => el.dataset.id);
        onReorder(ids);
      }
    }
    draggedItem = null;
  });

  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    const overItem = e.target.closest(itemSelector);
    if (overItem && overItem !== draggedItem) {
      const rect = overItem.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (e.clientY < midpoint) container.insertBefore(draggedItem, overItem);
      else container.insertBefore(draggedItem, overItem.nextSibling);
    }
  });
}