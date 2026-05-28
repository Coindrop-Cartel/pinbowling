import { PB_API } from './api.js';
import { setupLiveFilter } from './uiComponents.js';

/**
 * Logic for managing Leagues and Events.
 */
export async function initLeaguesPage() {
  const leagueForm = document.getElementById('league-form');
  const leagueNameInput = document.getElementById('league-name');
  const leagueDateInput = document.getElementById('league-start-date');
  const createBtn = document.getElementById('create-league-btn');
  const leaguesList = document.getElementById('leagues-list');
  const emptyNotice = document.getElementById('leagues-list-empty');
  const eventFormCard = document.getElementById('event-form-card');

  let allLeagues = [];
  let filterInstance = null;

  /**
   * Renders the league list based on filtering.
   * Handles the "X matches found" logic and duplicate prevention.
   */
  const onFilterUpdate = (filtered, query) => {
    leaguesList.innerHTML = '';

    if (filtered.length === 0) {
      emptyNotice.classList.remove('hidden');
      emptyNotice.textContent = allLeagues.length === 0 ? 'No leagues created yet.' : 'No matching leagues found.';
    } else {
      emptyNotice.classList.add('hidden');
      filtered.forEach(league => {
        const card = document.createElement('div');
        card.className = 'card league-item';
        card.innerHTML = `
          <div class="league-header" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
            <div>
              <h3 style="margin: 0;">${league.name}</h3>
              <small>Started: ${league.start_date || 'N/A'} | Events: ${league.events?.length || 0}</small>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="add-event-btn secondary">Add Event</button>
              <button class="delete-league-btn">Delete</button>
            </div>
          </div>
          <div class="league-details hidden" style="margin-top: 15px; border-top: 1px solid #ccc; padding-top: 15px;">
            <h4>Events</h4>
            <ul style="list-style: none; padding: 0;">
              ${(league.events || []).map(e => `
                <li style="display: flex; justify-content: space-between; margin-bottom: 5px; background: #f9f9f9; padding: 5px 10px; border-radius: 4px;">
                  <span>${e.event_name} <small>(${e.event_date || 'No Date'})</small></span>
                  <button class="delete-event-btn" data-id="${e.id}" style="padding: 2px 8px; font-size: 0.8rem;">Delete</button>
                </li>
              `).join('') || '<li>No events scheduled.</li>'}
            </ul>
          </div>
        `;

        // Toggle expansion
        card.querySelector('.league-header').onclick = (e) => {
          if (e.target.closest('button')) return;
          card.querySelector('.league-details').classList.toggle('hidden');
        };

        // Action listeners
        card.querySelector('.add-event-btn').onclick = () => showEventForm(league.id, league.name);
        card.querySelector('.delete-league-btn').onclick = () => deleteLeague(league.id, league.name);
        
        card.querySelectorAll('.delete-event-btn').forEach(btn => {
          btn.onclick = (e) => deleteEvent(Number(e.target.dataset.id), league.name);
        });

        leaguesList.appendChild(card);
      });
    }

    // Duplicate Name Prevention
    const exactMatch = allLeagues.find(l => l.name.trim().toLowerCase() === query);
    const dateVal = leagueDateInput.value;
    createBtn.disabled = !query || !dateVal || !!exactMatch;
    
    if (exactMatch) {
      createBtn.title = "A league with this name already exists.";
    } else if (query && !dateVal) {
      createBtn.title = "Start date is required.";
    } else {
      createBtn.title = "";
    }
  };

  filterInstance = setupLiveFilter(leagueNameInput, allLeagues, {
    labelKey: 'name',
    onFilter: onFilterUpdate
  });

  leagueDateInput.addEventListener('input', () => filterInstance.performFilter());

  const refresh = async () => {
    try {
      const data = await PB_API.getLeagues();
      allLeagues.length = 0;
      allLeagues.push(...data);
      filterInstance.performFilter();
    } catch (err) {
      console.error('Failed to load leagues:', err);
    }
  };

  leagueForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = leagueNameInput.value.trim();
    const date = leagueDateInput.value;

    if (window.PB_ADMIN_PASSWORD) {
      const pass = prompt(`Enter Admin Password to create league "${name}":`);
      if (pass !== window.PB_ADMIN_PASSWORD) return alert('Unauthorized');
    }

    await PB_API.createLeague({ name, start_date: date });
    leagueNameInput.value = '';
    leagueDateInput.value = '';
    await refresh();
  });

  async function deleteLeague(id, name) {
    if (!confirm(`Are you sure you want to delete the entire league "${name}"? This will delete all associated events and target scores.`)) return;
    await PB_API.deleteLeague(id);
    await refresh();
  }

  async function deleteEvent(id, leagueName) {
    if (!confirm(`Delete this event from ${leagueName}?`)) return;
    await PB_API.deleteEvent(id);
    await refresh();
  }

  function showEventForm(leagueId, leagueName) {
    eventFormCard.classList.remove('hidden');
    document.getElementById('event-form-league-name').textContent = leagueName;
    document.getElementById('event-league-id').value = leagueId;
    eventFormCard.scrollIntoView({ behavior: 'smooth' });
  }

  document.getElementById('event-form').onsubmit = async (e) => {
    e.preventDefault();
    const leagueId = document.getElementById('event-league-id').value;
    const name = document.getElementById('event-name').value.trim();
    const date = document.getElementById('event-date').value;
    const locationId = document.getElementById('event-location').value;

    await PB_API.createEvent({ league_id: leagueId, event_name: name, event_date: date, location_id: locationId });
    eventFormCard.classList.add('hidden');
    e.target.reset();
    await refresh();
  };

  await refresh();
}