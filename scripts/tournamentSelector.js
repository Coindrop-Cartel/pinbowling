import { PB_API } from './api.js';
import { getActiveLeagueId, setActiveLeagueId, getActiveEventId, setActiveEventId } from './utils.js';
import { createSearchableSelect } from './uiComponents.js';

export async function initTournamentSelector(onRefresh) {
  const container = document.querySelector('.tournament-selector-container');
  if (!container) return;

  const leagues = await PB_API.getLeagues();
  const activeLeagueId = getActiveLeagueId();
  const activeEventId = getActiveEventId();

  container.innerHTML = `
    <section class="card tournament-selector" style="margin-bottom: 1.5rem;">
      <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; box-sizing: border-box;">
        <div style="width: 100%;">
          <label style="display: block; margin-bottom: 5px;">League Search</label>
          <input type="text" id="league-search-global" style="width: 100%; box-sizing: border-box;" placeholder="Type to filter..." autocomplete="off">
        </div>
        <div style="width: 100%;">
          <label for="league-select-global" style="display: block; margin-bottom: 5px;">Select League</label>
          <select id="league-select-global" style="width: 100%; box-sizing: border-box;">
            <option value="">-- Choose League --</option>
          </select>
        </div>
        <div id="event-select-wrapper" style="width: 100%;" class="hidden">
          <label for="event-select-global" style="display: block; margin-bottom: 5px;">Event</label>
          <select id="event-select-global" style="width: 100%; box-sizing: border-box;">
            <option value="">Select Event</option>
          </select>
        </div>
      </div>
    </section>
  `;

  const searchInput = document.getElementById('league-search-global');
  const leagueSelect = document.getElementById('league-select-global');
  const eventSelect = document.getElementById('event-select-global');
  const eventWrapper = document.getElementById('event-select-wrapper');

  const populateEvents = (leagueId, selectedEventId) => {
    const isStandingsPage = !!document.getElementById('standings-body');
    eventSelect.innerHTML = `<option value="">Select Event</option>${isStandingsPage && leagueId ? '<option value="summary">Season Summary</option>' : ''}`;
    
    if (!leagueId) {
      eventWrapper.classList.add('hidden');
      eventSelect.value = '';
      return;
    }

    const league = leagues.find(l => String(l.id) === String(leagueId));
    const events = league?.events || [];

    if (events.length === 0 && !isStandingsPage) {
      eventWrapper.classList.add('hidden');
      return;
    }

    eventWrapper.classList.remove('hidden');
    events.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.event_name;
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

  // Init
  if (activeLeagueId) {
    const league = leagues.find(l => String(l.id) === String(activeLeagueId));
    if (league) {
      searchInput.value = ''; // Ensure search field starts fresh on navigation
      leagueSelect.value = activeLeagueId;
      updateOptions(''); // Show all options instead of just the matched one
      populateEvents(activeLeagueId, activeEventId);
    } else {
      // If the league in storage is invalid, clear everything
      setActiveLeagueId('');
      setActiveEventId('');
      updateOptions('');
      populateEvents('', '');
    }
  } else {
    // No league selected - ensure event is also unselected and hidden
    setActiveEventId('');
    updateOptions('');
    populateEvents('', '');
  }
}