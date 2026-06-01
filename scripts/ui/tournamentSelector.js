import { PB_API } from '@services/api.js';
import { getActiveLeagueId, setActiveLeagueId, getActiveEventId, setActiveEventId } from '@scripts/utils.js';
import { createSearchableSelect } from '@ui/uiComponents.js';

export async function initTournamentSelector(onRefresh) {
  const container = document.querySelector('.tournament-selector-container');
  if (!container) return;

  // Filter out the internal Quick Play league from standard searches
  const leagues = await PB_API.getLeagues({ type: 'standard' });
  const activeLeagueId = getActiveLeagueId();
  const activeEventId = getActiveEventId();

  container.innerHTML = `
    <section class="tournament-selector" style="margin-bottom: 5px; border: 1px solid #ddd; border-radius: 4px; background: #fff; padding: 12px 15px;">
      <div style="display: flex; flex-direction: column; gap: 0.75rem; width: 100%; box-sizing: border-box;" autocomplete="off">
        <div style="width: 100%;">
          <label style="display: block; margin-bottom: 5px;">League Search</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="league-search-global" style="flex: 1; box-sizing: border-box; margin-bottom: 0;" placeholder="Type to filter...">
            <button id="clear-selection-btn" class="secondary" style="padding: 10px 15px; white-space: nowrap;">Clear</button>
          </div>
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
  const clearBtn = document.getElementById('clear-selection-btn');

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
    if (onRefresh) onRefresh(); // UI interaction - keep as standard call
    }
  });

  eventSelect.addEventListener('change', () => {
    const val = eventSelect.value;
    setActiveEventId(val);
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

  // Init logic: Resolve League/Event relationship
  let currentLeagueId = activeLeagueId;
  let currentEventId = activeEventId;

  // If we have an event but no league, resolve the league from the event data
  if (!currentLeagueId && currentEventId && currentEventId !== 'summary') {
    const foundLeague = leagues.find(l => (l.events || []).some(e => String(e.id) === String(currentEventId)));
    if (foundLeague) {
      currentLeagueId = String(foundLeague.id);
      setActiveLeagueId(currentLeagueId);
    }
  }

  if (currentLeagueId) {
    const league = leagues.find(l => String(l.id) === String(currentLeagueId));
    if (league) {
      searchInput.value = league.name;
      updateOptions(league.name);
      leagueSelect.value = currentLeagueId;
      await populateEvents(currentLeagueId, currentEventId);
    }
  } else {
    updateOptions('');
    await populateEvents('', '');
  }

  if (onRefresh) {
    await onRefresh();
  }
}