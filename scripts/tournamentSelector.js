import { PB_API } from './api.js';
import { getActiveLeagueId, setActiveLeagueId, getActiveEventId, setActiveEventId } from './utils.js';

export async function initTournamentSelector(onChange) {
  const container = document.querySelector('.tournament-selector-container');
  if (!container) return;

  const leagues = await PB_API.getLeagues();
  container.innerHTML = `
    <section class="card tournament-selector" style="margin-bottom: 1.5rem;">
      <div class="form-row" style="display: flex; gap: 1rem; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px;">
          <label for="league-select-global">League</label>
          <select id="league-select-global">
            <option value="">Select League</option>
            ${leagues.map(l => `<option value="${l.id}" ${getActiveLeagueId() == l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
          </select>
        </div>
        <div style="flex: 1; min-width: 200px;">
          <label for="event-select-global">Event</label>
          <select id="event-select-global" disabled>
            <option value="">Select Event</option>
          </select>
        </div>
      </div>
    </section>
  `;

  const leagueSelect = document.getElementById('league-select-global');
  const eventSelect = document.getElementById('event-select-global');

  const populateEvents = async (leagueId, selectedEventId) => {
    const isStandingsPage = !!document.getElementById('standings-body');
    eventSelect.innerHTML = `<option value="">Select Event</option>${isStandingsPage && leagueId ? '<option value="summary">Season Summary</option>' : ''}`;
    
    if (!leagueId) { eventSelect.disabled = true; return; }
    const events = leagues.find(l => String(l.id) === String(leagueId))?.events || [];
    events.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.event_name;
      if (String(e.id) === String(selectedEventId)) opt.selected = true;
      eventSelect.appendChild(opt);
    });
    eventSelect.disabled = false;
  };

  if (leagueSelect.value) await populateEvents(leagueSelect.value, getActiveEventId());

  leagueSelect.addEventListener('change', async () => {
    setActiveLeagueId(leagueSelect.value);
    setActiveEventId('');
    await populateEvents(leagueSelect.value);
    if (onChange) onChange();
  });

  eventSelect.addEventListener('change', () => {
    setActiveEventId(eventSelect.value);
    if (onChange) onChange();
  });
}