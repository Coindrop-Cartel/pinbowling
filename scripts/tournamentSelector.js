import { PB_API } from './api.js';
import { getActiveLeagueId, setActiveLeagueId, getActiveEventId, setActiveEventId } from './utils.js';

export async function initTournamentSelector(onRefresh) {
  const container = document.querySelector('.tournament-selector-container');
  if (!container) return;

  const leagues = await PB_API.getLeagues();
  const activeLeagueId = getActiveLeagueId();
  const activeEventId = getActiveEventId();

  container.innerHTML = `
    <section class="card tournament-selector" style="margin-bottom: 1.5rem;">
      <div style="display: flex; gap: 1rem; flex-wrap: wrap; width: 100%; box-sizing: border-box;">
        <div style="flex: 1 0 250px; display: flex; flex-direction: column;">
          <label style="display: block; margin-bottom: 5px;">League Search</label>
          <input type="text" id="league-search-global" style="width: 100%; box-sizing: border-box;" placeholder="Type to filter..." autocomplete="off">
        </div>
        <div style="flex: 1 0 250px; display: flex; flex-direction: column;">
          <label for="league-select-global" style="display: block; margin-bottom: 5px;">Select League</label>
          <select id="league-select-global" style="width: 100%; box-sizing: border-box;">
            <option value="">-- Choose League --</option>
          </select>
        </div>
        <div id="event-select-wrapper" style="flex: 1 0 250px; display: flex; flex-direction: column;" class="hidden">
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

  const updateLeagueOptions = (filter = '') => {
    const currentVal = leagueSelect.value;
    leagueSelect.innerHTML = '<option value="">-- Choose League --</option>';
    const normalizedFilter = filter.toLowerCase();
    
    let matchCount = 0;
    leagues.forEach(l => {
      if (l.name.toLowerCase().includes(normalizedFilter)) {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name;
        if (String(l.id) === String(currentVal)) opt.selected = true;
        leagueSelect.appendChild(opt);
        matchCount++;
      }
    });
    return matchCount;
  };

  const populateEvents = (leagueId, selectedEventId) => {
    const isStandingsPage = !!document.getElementById('standings-body');
    eventSelect.innerHTML = `<option value="">Select Event</option>${isStandingsPage && leagueId ? '<option value="summary">Season Summary</option>' : ''}`;
    
    if (!leagueId) {
      eventWrapper.classList.add('hidden');
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

  searchInput.addEventListener('input', (e) => {
    const filter = e.target.value;
    const matchCount = updateLeagueOptions(filter);

    // Dynamically set size based on results (+1 for placeholder), capped at 5
    leagueSelect.size = filter.length > 0 ? Math.min(matchCount + 1, 5) : 1;

    // If they type a name that matches exactly, auto-select it to "update as they type"
    const match = leagues.find(l => l.name.toLowerCase() === filter.toLowerCase());
    if (match && String(leagueSelect.value) !== String(match.id)) {
      leagueSelect.value = match.id;
      leagueSelect.size = 1; // Collapse once an exact match is found/selected
      setActiveLeagueId(match.id);
      setActiveEventId('');
      populateEvents(match.id);
      updateLeagueOptions(filter);
      if (onRefresh) onRefresh();
    }
  });

  // Ensure the list collapses if the user clicks away
  searchInput.addEventListener('blur', () => { setTimeout(() => { leagueSelect.size = 1; }, 200); });

  leagueSelect.addEventListener('change', () => {
    const leagueId = leagueSelect.value;
    const league = leagues.find(l => String(l.id) === String(leagueId));
    leagueSelect.size = 1; // Collapse after selection
    searchInput.value = league ? league.name : '';
    
    setActiveLeagueId(leagueId);
    setActiveEventId('');
    populateEvents(leagueId);
    updateLeagueOptions(searchInput.value);
    if (onRefresh) onRefresh();
  });

  eventSelect.addEventListener('change', () => {
    setActiveEventId(eventSelect.value);
    if (onRefresh) onRefresh();
  });

  // Init
  if (activeLeagueId) {
    const league = leagues.find(l => String(l.id) === String(activeLeagueId));
    if (league) {
      searchInput.value = league.name;
      leagueSelect.value = activeLeagueId;
      updateLeagueOptions(league.name);
      populateEvents(activeLeagueId, activeEventId);
    }
  } else {
    updateLeagueOptions('');
  }
}