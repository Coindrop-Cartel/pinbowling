import { PB_API } from './api.js';
import { getActiveLeagueId, getActiveEventId, setActiveLeagueId, setActiveEventId } from './utils.js';

/**
 * Shared component for selecting the active League and Event.
 * Injects a searchable league selector into all .tournament-selector-container elements.
 */
export async function initTournamentSelector(onRefresh) {
  const containers = document.querySelectorAll('.tournament-selector-container');
  if (containers.length === 0) return;

  const leagues = await PB_API.getLeagues();
  const activeLeagueId = getActiveLeagueId();
  const activeEventId = getActiveEventId();

  containers.forEach(container => {
    container.innerHTML = `
      <div class="selector-group" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end;">
        <div class="form-row" style="margin: 0; flex: 1; min-width: 200px;">
          <label>League Search</label>
          <input type="text" class="league-search" placeholder="Type to filter leagues..." autocomplete="off">
        </div>
        <div class="form-row" style="margin: 0; flex: 1; min-width: 200px;">
          <label>Select League</label>
          <select class="league-select">
            <option value="">-- Choose League --</option>
          </select>
        </div>
        <div class="form-row event-select-wrapper hidden" style="margin: 0; flex: 1; min-width: 200px;">
          <label>Select Event</label>
          <select class="event-select">
            <option value="">-- Choose Event --</option>
          </select>
        </div>
      </div>
    `;

    const searchInput = container.querySelector('.league-search');
    const leagueSelect = container.querySelector('.league-select');
    const eventWrapper = container.querySelector('.event-select-wrapper');
    const eventSelect = container.querySelector('.event-select');

    const updateLeagueOptions = (filter = '') => {
      const currentVal = leagueSelect.value;
      leagueSelect.innerHTML = '<option value="">-- Choose League --</option>';
      const normalizedFilter = filter.toLowerCase();
      
      leagues.forEach(l => {
        if (l.name.toLowerCase().includes(normalizedFilter)) {
          const opt = document.createElement('option');
          opt.value = l.id;
          opt.textContent = l.name;
          if (String(l.id) === String(currentVal)) opt.selected = true;
          leagueSelect.appendChild(opt);
        }
      });
    };

    const populateEvents = (leagueId) => {
      const league = leagues.find(l => String(l.id) === String(leagueId));
      if (!league || !league.events || league.events.length === 0) {
        eventWrapper.classList.add('hidden');
        return;
      }
      eventWrapper.classList.remove('hidden');
      eventSelect.innerHTML = '<option value="">-- Choose Event --</option>';
      league.events.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = `${e.event_name} (${e.event_date || 'No Date'})`;
        if (String(e.id) === String(activeEventId)) opt.selected = true;
        eventSelect.appendChild(opt);
      });
    };

    searchInput.addEventListener('input', (e) => updateLeagueOptions(e.target.value));
    
    leagueSelect.addEventListener('change', () => {
      const leagueId = leagueSelect.value;
      const league = leagues.find(l => String(l.id) === String(leagueId));
      searchInput.value = league ? league.name : '';
      setActiveLeagueId(leagueId);
      setActiveEventId(''); // Reset event when league changes
      populateEvents(leagueId);
      updateLeagueOptions(searchInput.value);
      if (onRefresh) onRefresh();
    });

    eventSelect.addEventListener('change', () => {
      setActiveEventId(eventSelect.value);
      if (onRefresh) onRefresh();
    });

    // Initial state
    if (activeLeagueId) {
      const league = leagues.find(l => String(l.id) === String(activeLeagueId));
      if (league) {
        searchInput.value = league.name;
        leagueSelect.value = activeLeagueId;
        updateLeagueOptions(league.name);
        populateEvents(activeLeagueId);
      }
    } else {
      updateLeagueOptions('');
    }
  });
}