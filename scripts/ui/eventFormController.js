import { SCORING_FORMATS } from '../core/engine.js';
import { ScoringFormats } from '../services/scoringFormat.js';
import { getCookie } from '../utils.js';

export function createEventFormController(elements, options) {
  const { eventFormCard, eventForm } = elements;
  const { isAuthorized, PB_API, applyPreferredTheme, onSaveSuccess } = options;
  const checkAuthorized = () => typeof isAuthorized === 'function' ? isAuthorized() : isAuthorized;

  async function showEventForm(leagueId, leagueName, event = null) {
    eventFormCard.classList.remove('hidden');
    const titleEl = document.getElementById('event-form-title');
    titleEl.innerHTML = event ? `Edit Event: ${options.escapeHTML(event.eventName)}` : `Add Event to League: <span id="event-form-league-name">${options.escapeHTML(leagueName)}</span>`;

    document.getElementById('event-league-id').value = leagueId;
    document.getElementById('event-id').value = event ? event.id : '';
    document.getElementById('event-name').value = event ? event.eventName : '';
    document.getElementById('event-date').value = event ? (event.eventDate || '') : new Date().toISOString().split('T')[0];

    const formatSelect = document.getElementById('event-scoring-format');
    if (formatSelect) {
      formatSelect.innerHTML = SCORING_FORMATS.map(f => `<option value="${f.value}">${f.label}</option>`).join('');
      const leagueFormat = options.getLeagueScoringFormat ? options.getLeagueScoringFormat(leagueId) : null;
      const format = ScoringFormats.resolve(event?.scoringFormat || leagueFormat || getCookie('pb_preferred_format'));
      formatSelect.value = format;
      applyPreferredTheme(format);
    }

    const locationSelect = document.getElementById('event-location');
    const allLocations = await PB_API.locations.getAll();
    const leagueLocationIds = options.getLeagueLocationIds ? options.getLeagueLocationIds(leagueId) : [];
    const filteredLocations = leagueLocationIds.length > 0
      ? allLocations.filter(loc => leagueLocationIds.includes(String(loc.id)))
      : allLocations;

    locationSelect.innerHTML = '<option value="">Select Location</option>';
    filteredLocations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc.id;
      opt.textContent = loc.name;
      if (event && event.locationId == loc.id) opt.selected = true;
      locationSelect.appendChild(opt);
    });
    locationSelect.required = true;

    if (filteredLocations.length === 1 && !event) {
      locationSelect.value = filteredLocations[0].id;
    }

    eventFormCard.scrollIntoView({ behavior: 'smooth' });
  }

  const cancelBtn = document.getElementById('cancel-event-edit');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      eventFormCard.classList.add('hidden');
      applyPreferredTheme(ScoringFormats.resolve(getCookie('pb_preferred_format')));
    };
  }

  const eventFormatInput = document.getElementById('event-scoring-format');
  if (eventFormatInput) {
    eventFormatInput.onchange = () => applyPreferredTheme(eventFormatInput.value);
  }

  eventForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!checkAuthorized()) return;

    const leagueId = document.getElementById('event-league-id').value;
    const eventId = document.getElementById('event-id').value;
    const name = document.getElementById('event-name').value.trim();
    const date = document.getElementById('event-date').value;
    const locationValue = document.getElementById('event-location').value;
    const formatValue = document.getElementById('event-scoring-format')?.value;

    if (!locationValue) {
      alert('Please select a location for this event.');
      return;
    }

    const payload = {
      leagueId: leagueId,
      eventName: name,
      eventDate: date,
      scoringFormat: ScoringFormats.resolve(formatValue),
      locationId: Number(locationValue)
    };

    try {
      let result;
      if (eventId) {
        result = await PB_API.events.update(eventId, payload);
      } else {
        result = await PB_API.events.create(payload);
      }

      eventFormCard.classList.add('hidden');
      eventForm.reset();
      await onSaveSuccess(Number(leagueId), eventId ? Number(eventId) : result?.id, payload);
    } catch (err) {
      console.error('Event save failed:', err);
      alert(`Failed to save event: ${err.message}`);
    }
  };

  return { showEventForm };
}
