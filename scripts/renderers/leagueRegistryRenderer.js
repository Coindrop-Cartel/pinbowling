import { escapeHTML } from '@scripts/utils.js';

/**
 * Extracted rendering helpers for league registry cards.
 * These produce DOM updates for league header stats and event lists
 * without requiring page-level context.
 * @module renderers/leagueRegistryRenderer
 */

/**
 * Updates the stats line in a league card header (Started, Events, Players, etc.).
 *
 * @param {number} leagueId The league ID to locate the card for.
 * @param {Object} league The league data object.
 * @param {Function} getParticipantMeta Function that returns participant metadata for a league.
 */
export function updateLeagueHeaderStats(leagueId, league, getParticipantMeta, getLocationName) {
  const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
  if (!card) return;

  const statsEl = card.querySelector('.league-header small');
  if (statsEl) {
    const participantMeta = getParticipantMeta(league);
    const eventLabel = league.weeksInSeason ? 'Weeks' : 'Events';
    const locationStr = (league.locationIds && league.locationIds.length > 0)
      ? league.locationIds.map(id => getLocationName ? getLocationName(id) : id).join(', ')
      : 'None';

    statsEl.innerHTML = `Started: ${league.startDate || 'N/A'} | ${participantMeta.mode} | ${eventLabel}: ${league.events?.length || 0} | ${participantMeta.countLabel}: ${participantMeta.count} | Scoring: ${league.seasonScoring === 'weekly' ? 'Weekly' : 'Cumulative'}${league.dropLowestWeeks > 0 ? ` | Drop: ${league.dropLowestWeeks}` : ''} | Status: ${league.status || 'N/A'}<br>Format: ${league.scoringFormat || 'N/A'} | Locations: ${locationStr}`;
  }
}

/**
 * Renders the events list within a league card and binds action button listeners.
 *
 * @param {number} leagueId The league ID to locate the card for.
 * @param {Array} leagueEvents List of event objects.
 * @param {Object} options
 * @param {boolean} options.isAuthorized Whether the user has management access.
 * @param {Function} options.onSetupEvent Callback for setup button clicks.
 * @param {Function} options.onEditEvent Callback for edit button clicks.
 * @param {Function} options.onDeleteEvent Callback for delete button clicks.
 */
export function renderEventsForLeague(leagueId, leagueEvents, { isAuthorized, onSetupEvent, onEditEvent, onDeleteEvent }) {
  const card = document.querySelector(`.league-registry-item[data-league-id="${leagueId}"]`);
  if (!card) return;

  const eventsListEl = card.querySelector('.league-events-list');

  eventsListEl.innerHTML = (leagueEvents || []).map(e => `
    <li class="list-item-row">
      <span>${escapeHTML(e.eventName)} <small>(${escapeHTML(e.eventDate) || 'No Date'})</small></span>
      <div class="small-action-buttons">
        ${isAuthorized ? `<button class="setup-event-btn secondary btn-row" data-league-id="${leagueId}" data-event-id="${e.id}">Setup</button>` : ''}
        ${isAuthorized ? `<button class="edit-event-btn secondary btn-row" data-id="${e.id}">Edit</button>` : ''}
        ${isAuthorized ? `<button class="delete-event-btn btn-row" data-id="${e.id}">Delete</button>` : ''}
      </div>
    </li>
  `).join('') || '<li>No events scheduled.</li>';

  // Attach listeners
  eventsListEl.querySelectorAll('.setup-event-btn').forEach(btn => {
    btn.onclick = () => {
      if (onSetupEvent) onSetupEvent(Number(btn.dataset.eventId), leagueId);
    };
  });
  eventsListEl.querySelectorAll('.edit-event-btn').forEach(btn => {
    btn.onclick = () => {
      const ev = leagueEvents.find(event => event.id === Number(btn.dataset.id));
      if (onEditEvent) onEditEvent(ev);
    };
  });
  eventsListEl.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.onclick = () => {
      if (onDeleteEvent) onDeleteEvent(Number(btn.dataset.id));
    };
  });
}
