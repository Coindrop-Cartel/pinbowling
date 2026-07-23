import { SCORING_FORMATS } from '../core/engine.js';
import { ScoringFormats } from '../services/scoringFormat.js';
import { getCookie } from '../utils.js';
import { showMultiSelectDialog, showAlert } from './dialogs.js';

export function createLeagueFormController(elements, options) {
  const {
    leagueForm,
    createToggle,
    leagueNameInput,
    leagueDateInput,
    createBtn,
    leagueFormTitle,
    leagueFormatInput,
    leagueSeasonScoringInput,
    leagueWeeklyPointsInput,
    leaguePointSpreadInput,
    leagueParticipantsInput,
    leagueDropLowestInput,
    leagueWeeksInput,
    leagueInningsInput
  } = elements;

  const {
    isAuthorized,
    applyPreferredTheme,
    onSaveSuccess
  } = options;

  const checkAuthorized = () => typeof isAuthorized === 'function' ? isAuthorized() : isAuthorized;

  const dateRow = leagueDateInput ? leagueDateInput.closest('.form-row') : null;
  const formatRow = document.getElementById('league-format-row');
  const seasonScoringRow = document.getElementById('league-season-scoring-row');
  const weeklyPointsRow = document.getElementById('league-weekly-points-row');
  const pointSpreadRow = document.getElementById('league-point-spread-row');
  const participantsRow = document.getElementById('league-participants-row');
  const dropLowestRow = document.getElementById('league-drop-weeks-row');
  const weeksRow = document.getElementById('league-weeks-in-season-row');
  const inningsRow = document.getElementById('league-rounds-per-game-row');
  const locationsRow = document.getElementById('league-locations-row');
  const locationsContainer = document.getElementById('league-locations-container');
  const locationsBtn = document.getElementById('league-locations-btn');
  const locationsSummary = document.getElementById('league-locations-summary');
  const actionsRow = createBtn?.closest('.form-actions');

  let editingLeagueId = null;
  let allLocations = [];
  let selectedLocationIds = [];

  const updateLocationsSummary = () => {
    if (!locationsSummary) return;
    if (selectedLocationIds.length === 0) {
      locationsSummary.textContent = 'No locations selected';
      return;
    }
    const names = selectedLocationIds.map(id => {
      const loc = allLocations.find(l => String(l.id) === String(id));
      return loc ? loc.name : null;
    }).filter(Boolean);
    if (names.length === selectedLocationIds.length) {
      locationsSummary.innerHTML = names.map(name =>
        `<span style="display: inline-block; background: #e0e0e0; border-radius: 3px; padding: 2px 8px; margin: 2px 4px 2px 0; font-size: 0.85rem;">${name}</span>`
      ).join('');
    } else {
      locationsSummary.textContent = `${selectedLocationIds.length} location(s) selected`;
    }
  };

  const openLocationsDialog = async () => {
    if (allLocations.length === 0) {
      try {
        allLocations = await options.PB_API.locations.getAll();
      } catch (err) {
        console.error('[leagueFormController] Failed to load locations:', err);
        showAlert('Failed to load locations.');
        return;
      }
    }
    const result = await showMultiSelectDialog({
      title: 'Select Locations',
      showSelectAll: false,
      items: allLocations.map(loc => ({
        value: String(loc.id),
        label: loc.name + (loc.city ? ` (${loc.city})` : '')
      })),
      selected: selectedLocationIds
    });
    if (result === null) return;
    selectedLocationIds = result;
    updateLocationsSummary();
  };

  if (locationsBtn && !locationsBtn.dataset.listenersBound) {
    locationsBtn.addEventListener('click', openLocationsDialog);
    locationsBtn.dataset.listenersBound = 'true';
  }

  const loadLocations = async () => {
    try {
      allLocations = await options.PB_API.locations.getAll();
      updateLocationsSummary();
    } catch (err) {
      console.error('[leagueFormController] Failed to load locations:', err);
    }
  };
  loadLocations();

  const handleSeasonScoringChange = () => {
    if (!leagueSeasonScoringInput) return;
    const isWeekly = leagueSeasonScoringInput.value === 'weekly';
    const isH2H = leagueParticipantsInput?.value === 'head2head';
    if (isWeekly && !isH2H && dateRow && !dateRow.classList.contains('hidden')) {
      weeklyPointsRow?.classList.remove('hidden');
      pointSpreadRow?.classList.remove('hidden');
    } else {
      weeklyPointsRow?.classList.add('hidden');
      pointSpreadRow?.classList.add('hidden');
    }
  };

  const updateFormatOptions = (isH2H) => {
    if (!leagueFormatInput) return;
    const currentValue = leagueFormatInput.value;
    const allowed = isH2H
      ? SCORING_FORMATS
      : SCORING_FORMATS.filter(f => f.value !== ScoringFormats.BASEBALL);
    leagueFormatInput.innerHTML = allowed.map(f =>
      `<option value="${f.value}">${f.label}</option>`
    ).join('');
    if (!allowed.some(f => f.value === currentValue)) {
      const preferred = ScoringFormats.resolve(getCookie('pb_preferred_format'));
      leagueFormatInput.value = allowed.some(f => f.value === preferred) ? preferred : allowed[0].value;
    }
  };

  const handleParticipantsChange = () => {
    if (!leagueParticipantsInput) return;
    const isH2H = leagueParticipantsInput.value === 'head2head';
    updateFormatOptions(isH2H);
    if (isH2H) {
      seasonScoringRow?.classList.add('hidden');
      dropLowestRow?.classList.add('hidden');
      weeklyPointsRow?.classList.add('hidden');
      pointSpreadRow?.classList.add('hidden');
      weeksRow?.classList.remove('hidden');
      inningsRow?.classList.remove('hidden');
    } else {
      if (dateRow && !dateRow.classList.contains('hidden')) {
        seasonScoringRow?.classList.remove('hidden');
        dropLowestRow?.classList.remove('hidden');
        handleSeasonScoringChange();
      }
      weeksRow?.classList.add('hidden');
      inningsRow?.classList.add('hidden');
    }
  };

  function resetForm() {
    editingLeagueId = null;
    leagueForm.reset();
    if (leagueFormTitle) leagueFormTitle.textContent = 'Create League';
    createBtn.textContent = 'Save League';

    dateRow?.classList.add('hidden');
    formatRow?.classList.add('hidden');
    participantsRow?.classList.add('hidden');
    seasonScoringRow?.classList.add('hidden');
    weeklyPointsRow?.classList.add('hidden');
    pointSpreadRow?.classList.add('hidden');
    dropLowestRow?.classList.add('hidden');
    weeksRow?.classList.add('hidden');
    inningsRow?.classList.add('hidden');
    locationsRow?.classList.add('hidden');
    actionsRow?.classList.add('hidden');

    selectedLocationIds = [];
    updateLocationsSummary();

    if (leagueFormatInput) leagueFormatInput.disabled = false;
    if (leagueParticipantsInput) leagueParticipantsInput.disabled = false;

    if (createToggle) {
      createToggle.textContent = 'Create League';
      createToggle.classList.replace('mt-0', 'mt-10');
      leagueNameInput.after(createToggle);
    }
    applyPreferredTheme(ScoringFormats.resolve(getCookie('pb_preferred_format')));
  }

  function editLeague(league) {
    editingLeagueId = league.id;
    leagueNameInput.value = league.name;
    leagueDateInput.value = league.startDate || '';
    leagueFormatInput.value = ScoringFormats.resolve(league.scoringFormat);
    if (leagueParticipantsInput) leagueParticipantsInput.value = league.participants || 'individual';
    if (leagueSeasonScoringInput) leagueSeasonScoringInput.value = league.seasonScoring || 'weekly';
    if (leagueDropLowestInput) leagueDropLowestInput.value = league.dropLowestWeeks || 0;
    if (leagueWeeklyPointsInput) leagueWeeklyPointsInput.value = league.weeklyPoints !== null && league.weeklyPoints !== undefined ? league.weeklyPoints : '';
    if (leaguePointSpreadInput) leaguePointSpreadInput.value = league.pointSpread !== null && league.pointSpread !== undefined ? league.pointSpread : '';
    if (leagueWeeksInput) leagueWeeksInput.value = league.weeksInSeason || 8;
    if (leagueInningsInput) leagueInningsInput.value = league.roundsPerGame || 2;

    createBtn.textContent = 'Update League';
    if (leagueFormTitle) leagueFormTitle.textContent = `Edit League: ${league.name}`;

    dateRow?.classList.remove('hidden');
    formatRow?.classList.remove('hidden');
    locationsRow?.classList.remove('hidden');
    if (participantsRow) participantsRow.classList.remove('hidden');

    selectedLocationIds = (league.locationIds || []).map(String);
    updateLocationsSummary();

    handleParticipantsChange();
    actionsRow?.classList.remove('hidden');

    if (createToggle) {
      createToggle.textContent = 'Cancel';
      createToggle.classList.replace('mt-10', 'mt-0');
      actionsRow.appendChild(createToggle);
    }

    if (leagueForm) {
      leagueForm.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    applyPreferredTheme(leagueFormatInput.value);

    const hasEvents = league.events && league.events.length > 0;
    if (leagueFormatInput) leagueFormatInput.disabled = hasEvents;
    if (leagueParticipantsInput) leagueParticipantsInput.disabled = hasEvents;

    if (options.onEditTriggered) options.onEditTriggered();
  }

  // Bind Listeners
  if (leagueParticipantsInput && !leagueParticipantsInput.dataset.listenersBound) {
    leagueParticipantsInput.addEventListener('change', handleParticipantsChange);
    leagueParticipantsInput.dataset.listenersBound = 'true';
  }

  if (leagueFormatInput) {
    const isH2H = leagueParticipantsInput?.value === 'head2head';
    updateFormatOptions(isH2H);
    leagueFormatInput.onchange = () => {
      applyPreferredTheme(leagueFormatInput.value);
    };
  }

  if (leagueSeasonScoringInput) {
    leagueSeasonScoringInput.innerHTML = `
      <option value="weekly" selected>Weekly Points</option>
      <option value="cumulative">Cumulative Total</option>
    `;
    leagueSeasonScoringInput.onchange = handleSeasonScoringChange;
  }

  // Hide initial creation fields
  resetForm();

  if (checkAuthorized() && leagueForm) {
    leagueForm.closest('.card').classList.remove('hidden');
  }

  if (createToggle && checkAuthorized()) {
    createToggle.onclick = () => {
      const isHidden = dateRow?.classList.contains('hidden');
      if (!isHidden || editingLeagueId) {
        resetForm();
      } else {
        dateRow?.classList.remove('hidden');
        formatRow?.classList.remove('hidden');
        locationsRow?.classList.remove('hidden');
        if (participantsRow) participantsRow.classList.remove('hidden');
        handleParticipantsChange();
        handleSeasonScoringChange();
        actionsRow?.classList.remove('hidden');
        createToggle.classList.replace('mt-10', 'mt-0');
        actionsRow.appendChild(createToggle);
        createToggle.textContent = 'Cancel';
        if (leagueFormatInput) applyPreferredTheme(leagueFormatInput.value);
        if (leagueDateInput && !leagueDateInput.value) {
          leagueDateInput.value = new Date().toISOString().split('T')[0];
        }
        updateLocationsSummary();
      }
    };
    createToggle.classList.remove('hidden');
  }

  leagueForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!checkAuthorized()) return;

    const name = leagueNameInput.value.trim();
    const date = leagueDateInput.value;
    const scoringFormat = leagueFormatInput.value;
    const participants = leagueParticipantsInput?.value || 'individual';
    const seasonScoring = leagueSeasonScoringInput?.value || 'weekly';
    const dropLowestWeeks = parseInt(leagueDropLowestInput?.value || '0', 10);
    const isH2H = participants === 'head2head';
    const isWeekly = seasonScoring === 'weekly';
    const weeksInSeason = (isH2H && leagueWeeksInput) ? parseInt(leagueWeeksInput.value, 10) : null;
    const roundsPerGame = (isH2H && leagueInningsInput) ? parseInt(leagueInningsInput.value, 10) : null;
    const matchupsPerRound = isH2H ? 2 : null;
    const weeklyPoints = (!isH2H && isWeekly && leagueWeeklyPointsInput?.value) ? parseInt(leagueWeeklyPointsInput.value, 10) : null;
    const pointSpread = (!isH2H && isWeekly && leaguePointSpreadInput?.value) ? parseInt(leaguePointSpreadInput.value, 10) : null;

    createBtn.disabled = true;
    createBtn.textContent = 'Saving...';

    if (isH2H && weeksInSeason && selectedLocationIds.length === 0) {
      showAlert('Please select at least one location for head-to-head seasons.');
      createBtn.disabled = false;
      createBtn.textContent = editingLeagueId ? 'Update League' : 'Save League';
      return;
    }

    const locationIds = selectedLocationIds.map(Number);

    try {
      const payload = {
        name,
        startDate: date,
        scoringFormat,
        participants,
        seasonScoring,
        dropLowestWeeks,
        weeksInSeason,
        roundsPerGame,
        matchupsPerRound,
        weeklyPoints,
        pointSpread,
        locationIds
      };
      if (editingLeagueId) {
        await options.PB_API.leagues.update(editingLeagueId, payload);
      } else {
        await options.PB_API.leagues.create(payload);
      }
      resetForm();
      await onSaveSuccess();
    } catch (err) {
      console.error('League save failed:', err);
      alert(`Failed to save league: ${err.message}`);
    } finally {
      createBtn.disabled = false;
      createBtn.textContent = editingLeagueId ? 'Update League' : 'Save League';
    }
  };

  return {
    editLeague,
    resetForm,
    getEditingLeagueId: () => editingLeagueId,
    getDateRow: () => dateRow
  };
}
