import { PB_API, ADMIN_PASSWORD } from './api.js';

/**
 * Initializes the Leagues & Events management page.
 */
export async function initLeaguesPage() {
  const leagueForm = document.getElementById('league-form');
  const leagueNameInput = document.getElementById('league-name');
  const leagueStartDateInput = document.getElementById('league-start-date');
  const leaguesListDiv = document.getElementById('leagues-list');
  const leaguesListEmpty = document.getElementById('leagues-list-empty');

  const eventFormCard = document.getElementById('event-form-card');
  const rosterFormCard = document.createElement('section');
  rosterFormCard.className = 'card hidden';
  rosterFormCard.id = 'roster-form-card';
  // Insert the roster form before the event form using their common parent (the main container)
  eventFormCard.parentNode.insertBefore(rosterFormCard, eventFormCard);

  const eventFormTitle = document.getElementById('event-form-title');
  const eventFormLeagueName = document.getElementById('event-form-league-name');
  const eventForm = document.getElementById('event-form');
  const eventLeagueIdInput = document.getElementById('event-league-id');
  const eventIdInput = document.getElementById('event-id');
  const eventNameInput = document.getElementById('event-name');
  const eventDateInput = document.getElementById('event-date');
  const eventLocationSelect = document.getElementById('event-location');
  const cancelEventEditBtn = document.getElementById('cancel-event-edit');

  let allLocations = [];

  async function loadLocations() {
    allLocations = await PB_API.getLocations();
    eventLocationSelect.innerHTML = '<option value="">Select Location (Optional)</option>';
    allLocations.forEach(loc => {
      const option = document.createElement('option');
      option.value = loc.id;
      option.textContent = loc.name;
      eventLocationSelect.appendChild(option);
    });
  }

  async function renderLeagues() {
    leaguesListDiv.innerHTML = '';
    const leagues = await PB_API.getLeagues();

    if (leagues.length === 0) {
      leaguesListEmpty.classList.remove('hidden');
      return;
    }
    leaguesListEmpty.classList.add('hidden');

    for (const league of leagues) {
      const leagueDiv = document.createElement('div');
      leagueDiv.className = 'card league-item';
      leagueDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <h3>${league.name} <small>(${league.start_date || 'No Start Date'})</small></h3>
          <div>
            <button class="add-event-btn secondary">Add Event</button>
            <button class="add-player-btn secondary">Add Player</button>
            <button class="edit-league-btn secondary">Edit</button>
            <button class="delete-league-btn danger">Delete</button>
          </div>
        </div>
        <div class="league-details-columns" style="display: flex; gap: 2rem; flex-wrap: wrap;">
          <div class="events-list" id="events-for-league-${league.id}" style="flex: 1; min-width: 300px;">
            <h4>Events:</h4>
            <div class="events-list-inner"></div>
            <div class="notice events-empty hidden">No events for this league.</div>
          </div>
          <div class="roster-list" id="roster-for-league-${league.id}" style="flex: 1; min-width: 300px;">
            <h4>Players:</h4>
            <div class="roster-list-inner"></div>
            <div class="notice roster-empty hidden">No players assigned to this league.</div>
          </div>
        </div>
      `;
      leaguesListDiv.appendChild(leagueDiv);

      leagueDiv.querySelector('.add-event-btn').addEventListener('click', () => {
        showEventForm(league.id, league.name);
      });
      leagueDiv.querySelector('.add-player-btn').addEventListener('click', () => {
        showRosterForm(league.id, league.name);
      });
      leagueDiv.querySelector('.edit-league-btn').addEventListener('click', () => {
        editLeague(league.id);
      });
      leagueDiv.querySelector('.delete-league-btn').addEventListener('click', () => {
        deleteLeague(league.id);
      });

      // Await these calls to ensure the UI renders sequentially and handles network data correctly
      await renderEventsForLeague(league.id, league.events);
      await renderRosterForLeague(league.id, league.players);
    }
  }

  /**
   * Renders the list of players currently assigned to a league as removable badges.
   * If 'players' is null, it triggers a background fetch for that league's roster.
   */
  async function renderEventsForLeague(leagueId, events = null) {
    const eventsListInner = document.querySelector(`#events-for-league-${leagueId} .events-list-inner`);
    const eventsEmpty = document.querySelector(`#events-for-league-${leagueId} .events-empty`);
    eventsListInner.innerHTML = '';

    if (events === null) {
      events = await PB_API.getEvents(leagueId);
    }

    if (events.length === 0) {
      eventsEmpty.classList.remove('hidden');
      return;
    }
    eventsEmpty.classList.add('hidden');

    events.forEach(event => {
      const eventDiv = document.createElement('div');
      eventDiv.className = 'event-item';
      eventDiv.innerHTML = `
        <span>${event.event_name} (${event.event_date || 'No Date'}) - ${event.location_name || 'No Location'}</span>
        <div>
          <button class="edit-event-btn secondary">Edit</button>
          <button class="delete-event-btn danger">Delete</button>
        </div>
      `;
      eventsListInner.appendChild(eventDiv);

      eventDiv.querySelector('.edit-event-btn').addEventListener('click', () => {
        editEvent(event.id, leagueId);
      });
      eventDiv.querySelector('.delete-event-btn').addEventListener('click', () => {
        deleteEvent(event.id, leagueId);
      });
    });
  }

  async function renderRosterForLeague(leagueId, players = null) {
    const rosterInner = document.querySelector(`#roster-for-league-${leagueId} .roster-list-inner`);
    const rosterEmpty = document.querySelector(`#roster-for-league-${leagueId} .roster-empty`);
    rosterInner.innerHTML = '';

    if (players === null) {
        const league = await PB_API.getLeague(leagueId);
        players = league.players;
    }

    if (players.length === 0) {
      rosterEmpty.classList.remove('hidden');
      return;
    }
    rosterEmpty.classList.add('hidden');

    players.forEach(player => {
      const playerDiv = document.createElement('div');
      playerDiv.className = 'player-item';
      playerDiv.innerHTML = `
        <span>${player.player_name}</span>
        <div>
          <button class="remove-p-btn danger">Delete</button>
        </div>`;
      playerDiv.querySelector('.remove-p-btn').addEventListener('click', async () => {
        if (!confirm(`Remove ${player.player_name} from this league?`)) return;
        await PB_API.removeLeaguePlayer(leagueId, player.id);
        renderRosterForLeague(leagueId);
      });
      rosterInner.appendChild(playerDiv);
    });
  }

  function showEventForm(leagueId, leagueName, event = null) {
    eventFormCard.classList.remove('hidden');
    eventFormLeagueName.textContent = leagueName;
    eventLeagueIdInput.value = leagueId;

    if (event) {
      eventFormTitle.textContent = `Edit Event: ${event.event_name}`;
      eventIdInput.value = event.id;
      eventNameInput.value = event.event_name;
      eventDateInput.value = event.event_date;
      eventLocationSelect.value = event.location_id || '';
    } else {
      eventFormTitle.textContent = `Add Event to League: ${leagueName}`;
      eventIdInput.value = '';
      eventNameInput.value = '';
      eventDateInput.value = '';
      eventLocationSelect.value = '';
    }
  }

  async function showRosterForm(leagueId, leagueName) {
    const players = await PB_API.getPlayers();
    rosterFormCard.innerHTML = `
        <h2>Add Player to League: ${leagueName}</h2>
        <div class="form-row">
            <label for="league-player-select">Select Player</label>
            <select id="league-player-select">
                <option value="">Choose a player...</option>
                ${players.map(p => `<option value="${p.id}">${p.player_name}</option>`).join('')}
            </select>
        </div>
        <div class="form-actions">
            <button id="save-league-player">Add to League</button>
            <button id="cancel-roster" class="secondary">Cancel</button>
        </div>
    `;
    rosterFormCard.classList.remove('hidden');
    window.scrollTo(0, document.body.scrollHeight);

    document.getElementById('cancel-roster').onclick = () => rosterFormCard.classList.add('hidden');
    document.getElementById('save-league-player').onclick = async () => {
        const playerId = document.getElementById('league-player-select').value;
        if (!playerId) return;
        const confirmation = prompt(`Enter Admin Password:`);
        if (confirmation !== ADMIN_PASSWORD) return;

        await PB_API.addLeaguePlayer(leagueId, playerId);
        rosterFormCard.classList.add('hidden');
        renderRosterForLeague(leagueId);
    };
  }

  function hideEventForm() {
    eventFormCard.classList.add('hidden');
    eventForm.reset();
    eventIdInput.value = '';
    eventLeagueIdInput.value = '';
  }

  async function editLeague(leagueId) {
    const league = await PB_API.getLeague(leagueId);
    if (!league) return;
    const newName = prompt(`Edit name for league "${league.name}":`, league.name);
    if (!newName) return;
    
    const confirmation = prompt(`Enter Admin Password:`);
    if (confirmation !== ADMIN_PASSWORD) return;

    await PB_API.updateLeague(leagueId, { name: newName.trim(), start_date: league.start_date });
    await renderLeagues();
  }

  async function deleteLeague(leagueId) {
    if (!confirm(`Are you sure you want to delete this league?`)) return;
    const confirmation = prompt(`Enter Admin Password:`);
    if (confirmation !== ADMIN_PASSWORD) return;
    await PB_API.deleteLeague(leagueId);
    await renderLeagues();
  }

  async function editEvent(eventId, leagueId) {
    const events = await PB_API.getEvents(leagueId);
    const event = events.find(e => String(e.id) === eventId);
    const leagues = await PB_API.getLeagues();
    const league = leagues.find(l => String(l.id) === leagueId);
    if (event && league) showEventForm(leagueId, league.name, event);
  }

  async function deleteEvent(eventId, leagueId) {
    if (!confirm(`Are you sure you want to delete this event?`)) return;
    const confirmation = prompt(`Enter Admin Password:`);
    if (confirmation !== ADMIN_PASSWORD) return;
    await PB_API.deleteEvent(eventId);
    await renderEventsForLeague(leagueId);
  }

  leagueForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = leagueNameInput.value.trim();
    if (!name) return;
    const confirmation = prompt(`Enter Admin Password:`);
    if (confirmation !== ADMIN_PASSWORD) return;
    await PB_API.createLeague({ name, start_date: leagueStartDateInput.value || null });
    leagueForm.reset();
    await renderLeagues();
  });

  eventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const leagueId = eventLeagueIdInput.value;
    const eventId = eventIdInput.value;
    const eventName = eventNameInput.value.trim();
    const eventDate = eventDateInput.value || null;
    const locationId = eventLocationSelect.value || null;

    if (!leagueId || !eventName) return;

    const confirmation = prompt(`Enter Admin Password to save event "${eventName}":`);
    if (confirmation !== ADMIN_PASSWORD) {
      if (confirmation !== null) alert('Incorrect Admin Password.');
      return;
    }

    const payload = {
      league_id: Number(leagueId),
      event_name: eventName,
      event_date: eventDate,
      location_id: locationId ? Number(locationId) : null
    };

    try {
      if (eventId) {
        await PB_API.updateEvent(eventId, payload);
      } else {
        await PB_API.createEvent(payload);
      }
      hideEventForm();
      // Fully re-render to ensure all internal state/events are refreshed
      await renderLeagues();
    } catch (err) {
      console.error("Failed to save event:", err);
      alert("Error saving event: " + err.message);
    }
  });

  cancelEventEditBtn.addEventListener('click', hideEventForm);

  await loadLocations();
  await renderLeagues();
}