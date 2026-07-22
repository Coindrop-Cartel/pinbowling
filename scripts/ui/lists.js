import { createExpandableRow } from '@ui/selectors.js';
import { escapeHTML, setActiveLeagueId, setActiveEventId, loadPage } from '@scripts/utils.js';
import { PB_API } from '@services/api.js';
import { showDialog, showConfirm } from '@ui/dialogs.js';
import { ROUTE_PATHS } from '@scripts/routes.js';

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
  getParticipantMeta,
  skipScroll
}) {
  container.innerHTML = '';
  
  filteredLeagues.forEach(league => {
    const shouldExpand = activeLeagueId && String(league.id) === String(activeLeagueId);
    const participantMeta = getParticipantMeta(league);
    const isH2H = league.participants === 'head2head';
    const isSeasonActive = isH2H && (league.status === 'active' || league.status === 'completed');

    const playoffEvents = (league.events || []).filter(e => e.eventName && e.eventName.startsWith('Playoffs:'));
    let bracketHtml = '';
    if (playoffEvents.length > 0) {
      let rounds = [];
      if (playoffEvents.some(e => e.eventName.includes('Quarterfinals'))) {
        rounds = ['Quarterfinals', 'Semifinals', 'Finals'];
      } else if (playoffEvents.some(e => e.eventName.includes('Semifinals'))) {
        rounds = ['Semifinals', 'Finals'];
      } else {
        rounds = ['Finals'];
      }
      
      const roundData = {};
      playoffEvents.forEach(e => {
        const match = e.eventName.match(/Playoffs:\s*(Quarterfinals|Semifinals|Finals)/);
        if (match) {
          const rName = match[1];
          roundData[rName] = e.matchups || [];
        }
      });
      
      const columnsHtml = rounds.map((rName) => {
        let seriesCount = 1;
        if (rName === 'Quarterfinals') seriesCount = 4;
        else if (rName === 'Semifinals') seriesCount = 2;
        
        const cardsHtml = [];
        for (let sId = 1; sId <= seriesCount; sId++) {
          const games = (roundData[rName] || []).filter(m => (m.seriesId || 1) === sId);
          games.sort((a, b) => a.gameNumber - b.gameNumber);
          
          let awayName = 'TBD';
          let homeName = 'TBD';
          let awayWins = 0;
          let homeWins = 0;
          
          if (games.length > 0) {
            const firstGame = games[0];
            awayName = firstGame.awayPlayerName || 'BYE';
            homeName = firstGame.homePlayerName || 'TBD';
            
            games.forEach(g => {
              if (g.status === 'completed') {
                if (g.winnerId === g.homePlayerId) homeWins++;
                else if (g.winnerId === g.awayPlayerId) awayWins++;
              }
            });
          }
          
          const clinchCount = Math.ceil((league.playoffSeriesLength || 1) / 2);
          const finished = (homeWins >= clinchCount || awayWins >= clinchCount);
          const homeClinched = homeWins >= clinchCount;
          const awayClinched = awayWins >= clinchCount;
          
          cardsHtml.push(`
            <div class="bracket-series-card" style="padding: 10px; margin: 10px 0; border: 1px solid ${finished ? '#2e7d32' : (games.length > 0 ? '#2196f3' : '#ccc')}; border-radius: 6px; background: ${games.length > 0 ? '#fff' : '#f5f5f5'}; box-shadow: 0 2px 4px rgba(0,0,0,0.05); min-width: 150px;">
              <div style="font-size: 0.8em; font-weight: bold; color: ${games.length > 0 ? '#1976d2' : '#888'}; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 4px;">
                Series ${sId}
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 4px; ${awayClinched ? 'font-weight: bold; color: #2e7d32;' : ''}">
                <span style="${games.length === 0 ? 'color: #888;' : ''}">${escapeHTML(awayName)}</span>
                <span>${games.length > 0 ? awayWins : '-'}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.9em; ${homeClinched ? 'font-weight: bold; color: #2e7d32;' : ''}">
                <span style="${games.length === 0 ? 'color: #888;' : ''}">${escapeHTML(homeName)}</span>
                <span>${games.length > 0 ? homeWins : '-'}</span>
              </div>
            </div>
          `);
        }
        
        return `
          <div class="bracket-column" style="display: flex; flex-direction: column; justify-content: space-around; align-items: center; min-width: 180px;">
            <h4 style="text-align: center; color: #333; border-bottom: 2px solid #ddd; padding-bottom: 4px; width: 100%; margin-bottom: 10px; font-size: 0.95em;">${escapeHTML(rName)}</h4>
            <div style="display: flex; flex-direction: column; height: 100%; justify-content: space-around;">
              ${cardsHtml.join('')}
            </div>
          </div>
        `;
      }).join('');
      
      bracketHtml = `
        <div class="playoff-bracket-section mt-15" style="border-top: 2px solid #eee; padding-top: 15px; margin-top: 15px;">
          <h4 class="section-subheading mb-10" style="color: #1976d2;">Postseason Playoff Bracket</h4>
          <div class="playoff-bracket-tree" style="display: flex; gap: 30px; overflow-x: auto; padding: 10px 0; min-height: 250px; background: #fafafa; border-radius: 6px; border: 1px solid #eaeaea;">
            ${columnsHtml}
          </div>
        </div>
      `;
    }

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

    const headerHtml = `
      <div>
        <h3 class="section-heading">${escapeHTML(league.name)}</h3>
        <small>Started: ${escapeHTML(league.startDate) || 'N/A'} | ${participantMeta.mode} | Events/Weeks: ${isH2H ? (league.events?.length || league.weeksInSeason || 0) : (league.events?.length || 0)} | ${participantMeta.countLabel}: ${participantMeta.count} | Scoring: ${league.seasonScoring === 'weekly' ? 'Weekly' : 'Cumulative'}${league.dropLowestWeeks > 0 ? ` | Drop: ${league.dropLowestWeeks}` : ''} | Status: ${escapeHTML(league.status || 'setup')}</small>
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
          ${isAuthorized ? `<button class="${league.participants === 'team' ? 'add-team-btn' : 'add-player-btn'} secondary btn-row" data-league-id="${league.id}">Add ${league.participants === 'team' ? 'Team' : 'Player'}</button>` : ''}
        </div>
        <ul class="league-participants-list list-unstyled"></ul>
        <div class="notice league-participants-empty hidden">No ${participantMeta.emptyLabel} assigned to this league.</div>
      </div>
      ${bracketHtml}
      <div class="action-buttons">
        ${isAuthorized && isH2H && league.status === 'setup' ? '<button class="start-season-btn primary btn-row">Start Season</button>' : ''}
        ${isAuthorized && showStartPlayoffsBtn ? `<button class="start-playoffs-btn primary btn-row" data-league-id="${league.id}">Start Playoffs</button>` : ''}
        ${isAuthorized && isH2H && league.status === 'active' ? `<button class="update-season-btn primary btn-row" data-league-id="${league.id}">Update Season</button>` : ''}
        ${isAuthorized ? `<button class="print-season-results-btn secondary btn-row" data-league-id="${league.id}">Print Season Results</button>` : ''}
        ${isAuthorized ? '<button class="edit-league-btn secondary btn-row">Edit League</button>' : ''}
        ${isAuthorized ? '<button class="delete-league-btn btn-row">Delete League</button>' : ''}
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

    // Action listeners
    if (isAuthorized) {
      row.querySelector('.edit-league-btn').onclick = () => onEditLeague(league);
      row.querySelector('.delete-league-btn').onclick = () => onDeleteLeague(league.id, league.name);
      
      const startSeasonBtn = row.querySelector('.start-season-btn');
      if (startSeasonBtn) {
        startSeasonBtn.onclick = async () => {
          const confirmed = await showConfirm(
            `Are you sure you want to start the season for "${league.name}"? This will generate the round-robin weekly matchups and lock the rosters.`,
            'Start Season'
          );
          if (confirmed) {
            try {
              startSeasonBtn.disabled = true;
              startSeasonBtn.textContent = 'Starting...';
              await PB_API.leagues.startSeason(league.id);
              loadPage(ROUTE_PATHS.LEAGUES());
            } catch (err) {
              alert(`Failed to start season: ${err.message}`);
              startSeasonBtn.disabled = false;
              startSeasonBtn.textContent = 'Start Season';
            }
          }
        };
      }

      const startPlayoffsBtn = row.querySelector('.start-playoffs-btn');
      if (startPlayoffsBtn) {
        startPlayoffsBtn.onclick = () => {
          if (onStartPlayoffs) onStartPlayoffs(league.id);
        };
      }

      const updateSeasonBtn = row.querySelector('.update-season-btn');
      if (updateSeasonBtn) {
        updateSeasonBtn.onclick = () => {
          if (onUpdateSeason) onUpdateSeason(league.id);
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

      if (league.participants === 'team') {
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


