import { SCORING_FORMATS, getScoringEngine } from '../core/engine.js';
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
    leagueCompetitionInput,
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
  const competitionRow = document.getElementById('league-competition-row');
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
    console.log('[Locations] updateLocationsSummary, allLocations:', allLocations.length, 'selectedLocationIds:', JSON.stringify(selectedLocationIds));
    const names = selectedLocationIds.map(id => {
      const loc = allLocations.find(l => String(l.id) === String(id));
      console.log('[Locations] find id:', id, '->', loc ? loc.name : 'NOT FOUND');
      return loc ? loc.name : null;
    }).filter(Boolean);
    console.log('[Locations] resolved names:', JSON.stringify(names), 'count match:', names.length === selectedLocationIds.length);
    if (names.length === selectedLocationIds.length) {
      locationsSummary.innerHTML = names.map(name =>
        `<span style="display: inline-block; background: #e0e0e0; border-radius: 3px; padding: 2px 8px; margin: 2px 4px 2px 0; font-size: 0.85rem;">${name}</span>`
      ).join('');
    } else {
      locationsSummary.textContent = `${selectedLocationIds.length} location(s) selected`;
    }
  };

  const openLocationsDialog = async () => {
    console.log('[Locations] Opening dialog, selectedLocationIds:', JSON.stringify(selectedLocationIds), 'type:', typeof selectedLocationIds, Array.isArray(selectedLocationIds) ? selectedLocationIds.map(id => typeof id) : 'N/A');
    if (allLocations.length === 0) {
      try {
        allLocations = await options.PB_API.locations.getAll();
      } catch (err) {
        console.error('[leagueFormController] Failed to load locations:', err);
        showAlert('Failed to load locations.');
        return;
      }
    }
    console.log('[Locations] allLocations loaded:', allLocations.length, 'items, sample IDs:', allLocations.slice(0, 3).map(l => ({ id: l.id, name: l.name })));
    const result = await showMultiSelectDialog({
      title: 'Select Locations',
      showSelectAll: false,
      items: allLocations.map(loc => ({
        value: String(loc.id),
        label: loc.name + (loc.city ? ` (${loc.city})` : '')
      })),
      selected: selectedLocationIds
    });
    console.log('[Locations] Dialog returned:', JSON.stringify(result), 'type:', typeof result, Array.isArray(result) ? result.map(id => typeof id) : 'N/A');
    if (result === null) return;
    selectedLocationIds = result;
    console.log('[Locations] Updated selectedLocationIds:', JSON.stringify(selectedLocationIds));
    updateLocationsSummary();
  };

  if (locationsBtn) {
    locationsBtn.onclick = openLocationsDialog;
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
    const isH2H = leagueCompetitionInput?.value === 'head2head';
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
      : SCORING_FORMATS.filter(f => !getScoringEngine(f.value)?.requiresHeadToHead?.());
    leagueFormatInput.innerHTML = allowed.map(f =>
      `<option value="${f.value}">${f.label}</option>`
    ).join('');
    if (allowed.some(f => f.value === currentValue)) {
      leagueFormatInput.value = currentValue;
    } else {
      const preferred = ScoringFormats.resolve(getCookie('pb_preferred_format'));
      leagueFormatInput.value = allowed.some(f => f.value === preferred) ? preferred : allowed[0].value;
    }
  };

  const handleCompetitionChange = () => {
    if (!leagueCompetitionInput) return;
    const isH2H = leagueCompetitionInput.value === 'head2head';
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
    competitionRow?.classList.add('hidden');
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
    if (leagueCompetitionInput) leagueCompetitionInput.disabled = false;
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
    if (leagueDateInput) leagueDateInput.value = league.startDate || '';
    if (leagueCompetitionInput) {
      const rawComp = league.competitionFormat || 'group';
      leagueCompetitionInput.value = (rawComp === 'head_to_head' || rawComp === 'head2head') ? 'head2head' : rawComp;
    }
    if (leagueParticipantsInput) leagueParticipantsInput.value = league.participationType || 'individual';
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
    if (competitionRow) competitionRow.classList.remove('hidden');
    if (participantsRow) participantsRow.classList.remove('hidden');

    selectedLocationIds = (league.locationIds || []).map(String);
    console.log('[Locations] editLeague set selectedLocationIds from league:', JSON.stringify(league.locationIds), '->', JSON.stringify(selectedLocationIds));
    updateLocationsSummary();

    // Rebuild format options with the correct competition type first,
    // so the scoring format option exists before we try to select it.
    handleCompetitionChange();
    leagueFormatInput.value = ScoringFormats.resolve(league.scoringFormat);
    console.log('[editLeague] Format set to:', leagueFormatInput.value, '(league.scoringFormat:', league.scoringFormat, ')');
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
    if (leagueCompetitionInput) leagueCompetitionInput.disabled = hasEvents;
    if (leagueParticipantsInput) leagueParticipantsInput.disabled = hasEvents;

    if (options.onEditTriggered) options.onEditTriggered();
  }

  // Bind Listeners
  if (leagueCompetitionInput) {
    leagueCompetitionInput.onchange = handleCompetitionChange;
  }

  if (leagueFormatInput) {
    const isH2H = leagueCompetitionInput?.value === 'head2head';
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
        if (options.onEditTriggered) options.onEditTriggered();
      } else {
        dateRow?.classList.remove('hidden');
        formatRow?.classList.remove('hidden');
        locationsRow?.classList.remove('hidden');
        if (competitionRow) competitionRow.classList.remove('hidden');
        if (participantsRow) participantsRow.classList.remove('hidden');
        handleCompetitionChange();
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
        if (options.onEditTriggered) options.onEditTriggered();
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
    const competitionFormat = leagueCompetitionInput?.value || 'group';
    const participationType = leagueParticipantsInput?.value || 'individual';
    const seasonScoring = leagueSeasonScoringInput?.value || 'weekly';
    const dropLowestWeeks = parseInt(leagueDropLowestInput?.value || '0', 10);
    const selectedEngine = getScoringEngine(scoringFormat);
    const isH2H = competitionFormat === 'head2head' || competitionFormat === 'head_to_head' || selectedEngine?.requiresHeadToHead?.();
    const isWeekly = seasonScoring === 'weekly';
    const weeksInSeasonRaw = isH2H && leagueWeeksInput ? parseInt(leagueWeeksInput.value, 10) : null;
    const weeksInSeason = isH2H ? (isNaN(weeksInSeasonRaw) ? null : weeksInSeasonRaw) : null;
    const roundsPerGame = isH2H ? (parseInt(leagueInningsInput?.value || '2', 10) || 2) : null;
    const matchupsPerRound = isH2H ? 2 : null;
    const weeklyPoints = (!isH2H && isWeekly && leagueWeeklyPointsInput?.value) ? parseInt(leagueWeeklyPointsInput.value, 10) : null;
    const pointSpread = (!isH2H && isWeekly && leaguePointSpreadInput?.value) ? parseInt(leaguePointSpreadInput.value, 10) : null;

    createBtn.disabled = true;
    createBtn.textContent = 'Saving...';

    if (selectedEngine?.requiresHeadToHead?.() && competitionFormat !== 'head2head' && competitionFormat !== 'head_to_head') {
      const brandName = selectedEngine?.getBranding?.()?.brandName || 'Selected';
      showAlert(`${brandName} scoring format is only supported for head-to-head competitions.`);
      createBtn.disabled = false;
      createBtn.textContent = editingLeagueId ? 'Update League' : 'Save League';
      return;
    }

    if (isH2H && (!weeksInSeason || weeksInSeason <= 0)) {
      showAlert('Please specify the number of weeks in season for head-to-head competitions.');
      createBtn.disabled = false;
      createBtn.textContent = editingLeagueId ? 'Update League' : 'Save League';
      return;
    }

    if (isH2H && selectedLocationIds.length === 0) {
      showAlert('Please select at least one location for head-to-head seasons.');
      createBtn.disabled = false;
      createBtn.textContent = editingLeagueId ? 'Update League' : 'Save League';
      return;
    }

    const locationIds = selectedLocationIds.map(Number);
    console.log('[Locations] Save - selectedLocationIds:', JSON.stringify(selectedLocationIds), 'mapped locationIds:', JSON.stringify(locationIds));

    try {
      const payload = {
        name,
        startDate: date,
        scoringFormat,
        competitionFormat,
        participationType,
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
      showAlert(`Failed to save league: ${err.message}`, 'Save League');
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
