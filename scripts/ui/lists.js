import { createExpandableRow } from '@ui/selectors.js';
import { escapeHTML, setActiveLeagueId, setActiveEventId, loadPage } from '@scripts/utils.js';
import { PB_API } from '@services/api.js';
import { showDialog, showConfirm, showAlert } from '@ui/dialogs.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { updateLeagueHeaderStats } from '@scripts/renderers/leagueRegistryRenderer.js';
import { isHead2Head } from '@services/scoringFormat.js';

/**
 * Render the event list for a specific league card.
 * @param {HTMLElement} card The DOM node of the league registry item.
 * @param {Array<Object>} leagueEvents List of event models.
 * @param {string} leagueName Name of the parent league.
 * @param {Object} options Callbacks and parameters.
 * @param {boolean} options.isAuthorized True if user has management permissions.
 * @param {Function} options.onSetupEvent Callback when setup is clicked.
 * @param {Function} options.onEditEvent Callback when edit is clicked.
 * @param {Function} options.onDeleteEvent Callback when delete is clicked.
 */
export function renderRegistryEvents(card, leagueEvents, leagueName, {
  isAuthorized,
  onSetupEvent,
  onEditEvent,
  onDeleteEvent
}) {
  if (!card) return;
  const eventsListEl = card.querySelector('.league-events-list');
  if (!eventsListEl) return;

  eventsListEl.innerHTML = (leagueEvents || []).map(e => `
    <li class="list-item-row">
      <span>${escapeHTML(e.eventName)} <small>(${escapeHTML(e.eventDate) || 'No Date'})</small></span>
      <div class="small-action-buttons">
        ${isAuthorized ? `<button class="setup-event-btn secondary btn-row" data-event-id="${e.id}">Setup</button>` : ''}
        ${isAuthorized ? `<button class="edit-event-btn secondary btn-row" data-event-id="${e.id}">Edit</button>` : ''}
        ${isAuthorized ? `<button class="delete-event-btn btn-row" data-event-id="${e.id}">Delete</button>` : ''}
      </div>
    </li>
  `).join('') || '<li>No events scheduled.</li>';

  // Bind listener actions
  eventsListEl.querySelectorAll('.setup-event-btn').forEach(btn => {
    btn.onclick = () => {
      if (onSetupEvent) onSetupEvent(Number(btn.dataset.eventId));
    };
  });
  eventsListEl.querySelectorAll('.edit-event-btn').forEach(btn => {
    btn.onclick = () => {
      const ev = leagueEvents.find(event => event.id === Number(btn.dataset.eventId));
      if (onEditEvent) onEditEvent(ev);
    };
  });
  eventsListEl.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.onclick = () => {
      if (onDeleteEvent) onDeleteEvent(Number(btn.dataset.eventId));
    };
  });
}

/**
 * Renders the teams assigned to a league roster card.
 * @param {HTMLElement} card The league registry DOM element.
 * @param {Array<Object>} leagueTeams List of teams assigned.
 * @param {Object} options Callbacks.
 * @param {boolean} options.isAuthorized True if management is authorized.
 * @param {Function} options.onRemoveTeam Callback to remove team.
 */
export function renderRegistryTeams(card, leagueTeams, { isAuthorized, onRemoveTeam }) {
  if (!card) return;
  const section = card.querySelector('.league-players-section');
  if (!section) return;
  const teamsListEl = section.querySelector('.league-participants-list');
  const emptyNoticeEl = section.querySelector('.league-participants-empty');
  if (!teamsListEl || !emptyNoticeEl) return;

  teamsListEl.innerHTML = '';
  if (leagueTeams && leagueTeams.length > 0) {
    emptyNoticeEl.classList.add('hidden');
    leagueTeams.forEach(team => {
      const li = document.createElement('li');
      li.className = 'list-item-row';
      li.innerHTML = `
        <span>${escapeHTML(team.name)} <small>(${escapeHTML(team.city) || 'No City'})</small></span>
        ${isAuthorized ? `<button class="remove-team-btn btn-row" data-team-id="${team.id}" data-team-name="${escapeHTML(team.name)}">Delete</button>` : ''}
      `;
      teamsListEl.appendChild(li);
    });
  } else {
    emptyNoticeEl.classList.remove('hidden');
  }

  teamsListEl.querySelectorAll('.remove-team-btn').forEach(btn => {
    btn.onclick = () => {
      if (onRemoveTeam) onRemoveTeam(Number(btn.dataset.teamId), btn.dataset.teamName);
    };
  });
}

/**
 * Renders the players assigned to a league roster card.
 * @param {HTMLElement} card The league registry DOM element.
 * @param {Array<Object>} leaguePlayers List of players assigned.
 * @param {Object} options Callbacks.
 * @param {boolean} options.isAuthorized True if management is authorized.
 * @param {Function} options.onRemovePlayer Callback to remove player.
 */
export function renderRegistryPlayers(card, leaguePlayers, { isAuthorized, onRemovePlayer }) {
  if (!card) return;
  const section = card.querySelector('.league-players-section');
  if (!section) return;
  const playersListEl = section.querySelector('.league-participants-list');
  const emptyNoticeEl = section.querySelector('.league-participants-empty');
  if (!playersListEl || !emptyNoticeEl) return;

  playersListEl.innerHTML = '';
  if (leaguePlayers && leaguePlayers.length > 0) {
    emptyNoticeEl.classList.add('hidden');
    leaguePlayers.forEach(lp => {
      if (lp && lp.id) {
        const li = document.createElement('li');
        li.className = 'list-item-row';
        li.innerHTML = `
          <span>${escapeHTML(lp.playerName)}</span>
          ${isAuthorized ? `<button class="remove-player-btn btn-row" data-player-id="${lp.id}" data-player-name="${escapeHTML(lp.playerName)}">Delete</button>` : ''}
        `;
        playersListEl.appendChild(li);
      }
    });
  } else {
    emptyNoticeEl.classList.remove('hidden');
  }

  playersListEl.querySelectorAll('.remove-player-btn').forEach(btn => {
    btn.onclick = () => {
      if (onRemovePlayer) onRemovePlayer(Number(btn.dataset.playerId), btn.dataset.playerName);
    };
  });
}

/**
 * Render the entire league summary list, building expandable elements.
 * @param {HTMLElement} container Parent list element.
 * @param {Array<Object>} filteredLeagues List of filtered leagues to show.
 * @param {Object} config Dependencies and callbacks.
 */
export function renderLeagueList(container, filteredLeagues, {
  isAuthorized,
  activeLeagueId,
  onHeaderClick,
  onEditLeague,
  onDeleteLeague,
  onAddEvent,
  onSetupEvent,
  onEditEvent,
  onDeleteEvent,
  onAddTeam,
  onRemoveTeam,
  onAddPlayer,
  onRemovePlayer,
  onStartPlayoffs,
  onUpdateSeason,
  onPrintSeasonResults,
  onArchiveLeague,
  getParticipantMeta,
  getLocationName,
  skipScroll
}) {
  container.innerHTML = '';
  
  filteredLeagues.forEach(league => {
    const shouldExpand = activeLeagueId && String(league.id) === String(activeLeagueId);
    const participantMeta = getParticipantMeta(league);
    const isH2H = isHead2Head(league.competitionFormat);
    const isSeasonActive = isH2H && (league.status === 'active' || league.status === 'completed');

    let showStartPlayoffsBtn = false;
    if (isH2H && league.status === 'active' && league.events && league.events.length > 0) {
      const hasPlayoffs = league.events.some(e => e.eventName && e.eventName.startsWith('Playoffs:'));
      if (!hasPlayoffs) {
        let allCompleted = true;
        let matchupCount = 0;
        league.events.forEach(e => {
          if (e.matchups && e.matchups.length > 0) {
            e.matchups.forEach(m => {
              matchupCount++;
              if (m.status !== 'completed') {
                allCompleted = false;
              }
            });
          }
        });
        if (allCompleted && matchupCount > 0) {
          showStartPlayoffsBtn = true;
        }
      }
    }

    let seasonActionHtml = '';
    if (isAuthorized && isH2H) {
      if (league.status === 'setup') {
        seasonActionHtml = '<button class="season-action-btn primary btn-row">Start Season</button>';
      } else if (showStartPlayoffsBtn) {
        seasonActionHtml = '<button class="season-action-btn primary btn-row">Start Playoffs</button>';
      } else if (league.status === 'active') {
        seasonActionHtml = '<button class="season-action-btn primary btn-row">Update Season</button>';
      }
    }

    const headerHtml = `
      <div class="league-header">
        <h3 class="section-heading">${escapeHTML(league.name)}</h3>
        <small></small>
      </div>
    `;

    const contentHtml = `
      ${!isSeasonActive ? `
        <div class="section-bar">
          <h4 class="section-subheading">Events</h4>
          ${isAuthorized && !isH2H ? `<button class="add-event-btn secondary btn-row" data-league-id="${league.id}">Add Event</button>` : ''}
        </div>
        <ul class="league-events-list list-unstyled"></ul>
      ` : ''}
      <div class="league-players-section roster-section">
        <div class="section-bar">
          <h4 class="section-subheading">${participantMeta.listLabel}</h4>
          ${isAuthorized ? `<button class="${league.participationType === 'team' ? 'add-team-btn' : 'add-player-btn'} secondary btn-row" data-league-id="${league.id}">Add ${league.participationType === 'team' ? 'Team' : 'Player'}</button>` : ''}
        </div>
        <ul class="league-participants-list list-unstyled"></ul>
        <div class="notice league-participants-empty hidden">No ${participantMeta.emptyLabel} assigned to this league.</div>
      </div>
      <div class="action-buttons">
        ${seasonActionHtml}
        ${isAuthorized ? '<button class="edit-league-btn secondary btn-row">Edit</button>' : ''}
        ${isAuthorized ? `<button class="archive-league-btn btn-row">${league.status === 'archived' ? 'Unarchive' : 'Archive'}</button>` : ''}
        ${isAuthorized ? '<button class="delete-league-btn btn-row">Delete</button>' : ''}
        ${isAuthorized ? `<button class="print-season-results-btn secondary btn-row" data-league-id="${league.id}">Print Results</button>` : ''}
      </div>
    `;

    const row = createExpandableRow(container, {
      id: league.id,
      className: 'league-registry-item',
      headerHtml,
      contentHtml,
      isExpanded: shouldExpand,
      onHeaderClick: (e) => {
        if (e.target.closest('button') || e.target.closest('select')) return;
        if (onHeaderClick) onHeaderClick(league);
      }
    });

    row.dataset.leagueId = league.id;
    updateLeagueHeaderStats(league.id, league, getParticipantMeta, getLocationName);

    // Action listeners
    if (isAuthorized) {
      row.querySelector('.edit-league-btn').onclick = () => onEditLeague(league);
      row.querySelector('.archive-league-btn').onclick = (e) => { e.stopPropagation(); if (onArchiveLeague) onArchiveLeague(league); };
      row.querySelector('.delete-league-btn').onclick = () => onDeleteLeague(league.id, league.name);
      
      const seasonActionBtn = row.querySelector('.season-action-btn');
      if (seasonActionBtn) {
        seasonActionBtn.onclick = async () => {
          const text = seasonActionBtn.textContent;
          if (text === 'Start Season') {
            const confirmed = await showConfirm(
              `Are you sure you want to start the season for "${league.name}"? This will generate the round-robin weekly matchups and lock the rosters.`,
              'Start Season'
            );
            if (confirmed) {
              try {
                seasonActionBtn.disabled = true;
                seasonActionBtn.textContent = 'Starting...';
                await PB_API.leagues.startSeason(league.id);
                loadPage(ROUTE_PATHS.LEAGUES());
              } catch (err) {
                showAlert(`Failed to start season: ${err.message}`, 'Start Season');
                seasonActionBtn.disabled = false;
                seasonActionBtn.textContent = 'Start Season';
              }
            }
          } else if (text === 'Start Playoffs') {
            if (onStartPlayoffs) onStartPlayoffs(league.id);
          } else if (text === 'Update Season') {
            if (onUpdateSeason) onUpdateSeason(league.id);
          }
        };
      }

      const printSeasonResultsBtn = row.querySelector('.print-season-results-btn');
      if (printSeasonResultsBtn) {
        printSeasonResultsBtn.onclick = () => {
          if (onPrintSeasonResults) onPrintSeasonResults(league.id);
        };
      }
      
      const addEventBtn = row.querySelector('.add-event-btn');
      if (addEventBtn) addEventBtn.onclick = () => onAddEvent(league.id, league.name);

      const addPlayerBtn = row.querySelector('.add-player-btn');
      if (addPlayerBtn) addPlayerBtn.onclick = () => onAddPlayer(league.id, league.name);
      
      const addTeamBtn = row.querySelector('.add-team-btn');
      if (addTeamBtn) addTeamBtn.onclick = () => onAddTeam(league.id, league.name);
    }

    if (!isSeasonActive) {
      renderRegistryEvents(row, league.events, league.name, {
        isAuthorized,
        onSetupEvent: (eventId) => onSetupEvent(eventId, league.id),
        onEditEvent: (ev) => onEditEvent(league.id, league.name, ev),
        onDeleteEvent: (eventId) => onDeleteEvent(eventId, league.id, league.name)
      });
    }

    if (shouldExpand) {
      // Weekly schedule matchups are now managed on the separate Scores Page.

      if (league.participationType === 'team') {
        renderRegistryTeams(row, league.teams, {
          isAuthorized,
          onRemoveTeam: (teamId, teamName) => onRemoveTeam(league.id, teamId, teamName)
        });
      } else {
        renderRegistryPlayers(row, league.players, {
          isAuthorized,
          onRemovePlayer: (playerId, playerName) => onRemovePlayer(league.id, playerId, playerName)
        });
      }
    }

    if (shouldExpand && !row.dataset.scrolled) {
      row.dataset.scrolled = "true";
      if (!skipScroll) {
        setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
      }
    }
  });
}


