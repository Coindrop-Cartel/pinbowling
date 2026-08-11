import { PB_API } from '@services/api.js';
import { runAuthorizedLeagueAction } from '@services/auth.js';
import { ScoringFormats, isHead2Head } from '@services/scoringFormat.js';
import { showDialog, showConfirm, showPlayerSelectionDialog } from '@ui/dialogs.js';
import { createSkeletonLoader } from '@ui/selectors.js';

/**
 * Extracted league management flows (playoffs, season updates, printing).
 * These are complex async operations that were previously inline in leaguesPage.js.
 * @module services/leagueFlows
 */

/**
 * Starts a playoff postseason bracket for a league.
 * Shows a configuration dialog, computes season standings to seed the bracket,
 * then calls the API to generate the playoff rounds.
 *
 * @param {Object} options
 * @param {number} options.leagueId The league to start playoffs for.
 * @param {Array} options.allLeagues The full leagues array (used to find the league).
 * @param {HTMLElement} options.loaderParent DOM element to attach the skeleton loader to.
 * @param {Function} options.onComplete Callback invoked after successful completion (e.g. refresh).
 */
export async function startPlayoffsFlow({ leagueId, allLeagues, loaderParent, onComplete }) {
  const league = allLeagues.find(l => l.id === leagueId);
  if (!league) return;
  
  const isTeam = league.participationType === 'team';
  const participants = isTeam ? (league.teams || []) : (league.players || []);
  const maxQualifiers = participants.length;
  if (maxQualifiers < 2) {
    await showDialog({
      title: 'Cannot Start Playoffs',
      message: `You need at least 2 ${isTeam ? 'teams' : 'players'} in the roster to start the playoffs.`
    });
    return;
  }
  
  const container = document.createElement('div');
  container.className = 'playoff-setup-form';
  
  let optionsHtml = '';
  if (maxQualifiers >= 2) optionsHtml += '<option value="2" selected>Top 2</option>';
  if (maxQualifiers >= 4) optionsHtml += '<option value="4">Top 4</option>';
  if (maxQualifiers >= 8) optionsHtml += '<option value="8">Top 8</option>';
  
  container.innerHTML = `
    <div class="form-row mb-10">
      <label for="playoff-qualifiers" style="font-weight: bold; display: block; margin-bottom: 5px;">Qualifying Players:</label>
      <select id="playoff-qualifiers" class="input-standard" style="width: 100%; padding: 6px;">
        ${optionsHtml}
      </select>
    </div>
    <div class="form-row mb-10">
      <label for="playoff-series-length" style="font-weight: bold; display: block; margin-bottom: 5px;">Series Format:</label>
      <select id="playoff-series-length" class="input-standard" style="width: 100%; padding: 6px;">
        <option value="1">Single Game (Best of 1)</option>
        <option value="3" selected>Best of 3 (First to 2 wins)</option>
        <option value="5">Best of 5 (First to 3 wins)</option>
      </select>
    </div>
  `;
  
  const confirmed = await showDialog({
    title: 'Configure Playoff Postseason',
    message: 'Choose how many players qualify and the series length for matchups.',
    confirmText: 'Generate Playoff Bracket',
    cancelText: 'Cancel',
    customElement: container
  });
  
  if (confirmed !== true) return;
  
  const qualifierCount = Number(container.querySelector('#playoff-qualifiers').value);
  const seriesLength = Number(container.querySelector('#playoff-series-length').value);
  
  const loader = createSkeletonLoader(loaderParent, { count: 3 });
  try {
    const { getScoringEngine } = await import('@core/engine.js');
    const { calculateSeasonSummary, fetchSeasonData } = await import('@services/seasonCalculator.js');
    
    const format = ScoringFormats.resolve(league.scoringFormat);
    const engine = getScoringEngine(format, {
      participationType: league.participationType,
      competitionFormat: league.competitionFormat
    });
    
    let players = league.players || [];
    if (isTeam) {
      const memberMap = new Map();
      (league.teams || []).forEach(t => {
        (t.members || []).forEach(m => memberMap.set(String(m.id), { ...m, id: Number(m.id) }));
      });
      players = Array.from(memberMap.values());
    }

    const events = league.events || [];
    
    const { targetsByEvent, scoresByEventAndPlayer, matchupsByEvent } = await fetchSeasonData(
      leagueId, events, PB_API, engine, isTeam
    );
    
    const summary = calculateSeasonSummary({
      league,
      players,
      events,
      targetsByEvent,
      scoresByEventAndPlayer,
      matchupsByEvent,
      engine
    });
    
    const sortedPlayerIds = (summary.rows || []).map(r => r.entity.id);
    const seeds = sortedPlayerIds.slice(0, qualifierCount);
    
    if (seeds.length < qualifierCount) {
      throw new Error('Not enough players have recorded stats to seed the bracket.');
    }
    
    if (isTeam) {
      await PB_API.leagues.startTeamPlayoffs(leagueId, seeds, seriesLength);
    } else {
      await PB_API.leagues.startPlayoffs(leagueId, seeds, seriesLength);
    }
    
    if (onComplete) await onComplete();
    
    await showDialog({
      title: 'Playoffs Started!',
      message: 'Playoff bracket generated successfully. View the playoff round to play matchups.'
    });
  } catch (err) {
    console.error(err);
    await showDialog({
      title: 'Error starting playoffs',
      message: err.message || 'An error occurred.'
    });
  } finally {
    loader.remove();
  }
}

/**
 * Advances the active playoff bracket to the next round (e.g., Semifinals or Finals).
 *
 * @param {Object} options
 * @param {number} options.leagueId The league to advance playoffs for.
 * @param {string} [options.nextRoundName='Next Round'] Name of the round to start.
 * @param {HTMLElement} options.loaderParent DOM element to attach the loader to.
 * @param {Function} options.onComplete Callback invoked after successful completion.
 */
export async function advancePlayoffsFlow({ leagueId, nextRoundName = 'Next Round', loaderParent, onComplete }) {
  const confirmed = await showConfirm(
    `Are you sure you want to start the ${nextRoundName}? This will lock the results of the previous round and generate the ${nextRoundName} matchups.`,
    `Start ${nextRoundName}`
  );
  if (!confirmed) return;

  const loader = createSkeletonLoader(loaderParent, { count: 3 });
  try {
    await PB_API.leagues.advancePlayoffs(leagueId);
    if (onComplete) await onComplete();
    await showDialog({
      title: `${nextRoundName} Started!`,
      message: `The ${nextRoundName} matchups have been generated successfully.`
    });
  } catch (err) {
    console.error(err);
    await showDialog({
      title: `Error starting ${nextRoundName}`,
      message: err.message || 'An error occurred.'
    });
  } finally {
    if (loader && loader.remove) loader.remove();
  }
}

/**
 * Updates the season schedule for a league (deletes pending matchups and recreates them).
 *
 * @param {Object} options
 * @param {number} options.leagueId The league to update.
 * @param {Array} options.allLeagues The full leagues array.
 * @param {HTMLElement} options.loaderParent DOM element to attach the skeleton loader to.
 * @param {Function} options.onComplete Callback invoked after successful completion.
 */
export async function updateSeasonFlow({ leagueId, allLeagues, loaderParent, onComplete }) {
  const league = allLeagues.find(l => l.id === leagueId);
  if (!league) return;
  
  const proceed = await showConfirm(
    `Are you sure you want to update the season schedule for "${league.name}"? This will delete all pending (unplayed) matchups, and recreate them using the current roster. This action cannot be undone.`,
    'Update Season'
  );
  if (!proceed) return;
  
  const loader = createSkeletonLoader(loaderParent, { count: 3 });
  try {
    await PB_API.leagues.updateSeason(leagueId);
    if (onComplete) await onComplete();
    await showDialog({
      title: 'Season Updated',
      message: 'The regular season schedule has been updated with the current roster.'
    });
  } catch (err) {
    console.error(err);
    await showDialog({
      title: 'Error updating season',
      message: err.message || 'An error occurred.'
    });
  } finally {
    loader.remove();
  }
}

/**
 * Prints a full season results report for a league.
 *
 * @param {Object} options
 * @param {number} options.leagueId The league to print results for.
 * @param {Array} options.allLeagues The full leagues array.
 * @param {HTMLElement} options.loaderParent DOM element to attach the skeleton loader to.
 */
export async function printSeasonResultsFlow({ leagueId, allLeagues, loaderParent }) {
  const league = allLeagues.find(l => l.id === leagueId);
  if (!league) return;

  const loader = createSkeletonLoader(loaderParent, { count: 3 });
  try {
    const [rawScores, allLeagueTargets, locations] = await Promise.all([
      PB_API.scores.get(null, null, leagueId),
      PB_API.machines.getTargets(null, leagueId),
      PB_API.locations.getAll()
    ]);

    const { getScoringEngine } = await import('@core/engine.js');
    const { printSeasonResults } = await import('@ui/printing.js');
    const format = ScoringFormats.resolve(league.scoringFormat);
    const engine = getScoringEngine(format);

    printSeasonResults(league, league.players || [], league.events || [], locations, allLeagueTargets, rawScores, engine);
  } catch (err) {
    console.error(err);
    await showDialog({
      title: 'Error generating season printout',
      message: err.message || 'An error occurred.'
    });
  } finally {
    loader.remove();
  }
}

/**
 * Adds a player to a league, with mid-season validation for head2head leagues.
 *
 * @param {Object} options
 * @param {number} options.leagueId The league to add to.
 * @param {string} options.leagueName Display name for dialogs.
 * @param {Array} options.allLeagues The full leagues array.
 * @param {Array} options.allPlayersCache Cached player list for selection.
 * @param {boolean} options.isAuthorized Whether the user is authorized.
 * @param {Function} options.onPlayerAdded Callback with (league, player) after add.
 */
export async function addPlayerToLeague({ leagueId, leagueName, allLeagues, allPlayersCache, isAuthorized, onPlayerAdded }) {
  const league = allLeagues.find(l => l.id === leagueId);
  if (!league) return;
  
  if (isHead2Head(league.competitionFormat) && league.status === 'active') {
    const weeksInSeason = league.weeksInSeason || 8;
    const midpoint = Math.ceil(weeksInSeason / 2);
    
    const completedWeeks = (league.events || []).filter(e => 
      e.matchups && e.matchups.length > 0 && e.matchups.every(m => m.status === 'completed')
    ).length;
    
    if (completedWeeks >= midpoint) {
      alert(`Roster additions are disabled after the midway point of the season (Week ${midpoint}).`);
      return;
    }
    
    const proceed = await showConfirm(
      `WARNING: Adding a player mid-season (Week ${completedWeeks + 1}) will create an imbalanced schedule. Future matchups will NOT be automatically rescheduled. Do you wish to proceed?`,
      'Confirm Mid-Season Addition'
    );
    if (!proceed) return;
  }

  const playersInLeague = new Set((league.players || []).map(p => p.id));
  const availablePlayers = allPlayersCache.filter(p => !playersInLeague.has(p.id));

  if (availablePlayers.length === 0) {
      alert('All available players are already in this league.');
      return;
  }

  const playerOptions = availablePlayers.map(p => ({ value: p.id, label: p.playerName }));
  const selectedPlayerId = await showPlayerSelectionDialog(
      `Add Player to ${leagueName}`,
      'Select a player to add:',
      playerOptions,
      'Add Player'
  );

  if (selectedPlayerId) {
      await PB_API.leagues.addPlayer(leagueId, Number(selectedPlayerId));
      const player = allPlayersCache.find(p => p.id === Number(selectedPlayerId));
      if (player) {
          if (!league.players) league.players = [];
          league.players.push(player);
          league.players.sort((a, b) => a.playerName.localeCompare(b.playerName));
          if (onPlayerAdded) onPlayerAdded(league, player);
      }
  }
}

/**
 * Adds a team to a league.
 *
 * @param {Object} options
 * @param {number} options.leagueId The league to add to.
 * @param {string} options.leagueName Display name for dialogs.
 * @param {Array} options.allLeagues The full leagues array.
 * @param {Function} options.onTeamAdded Callback with (league, team) after add.
 */
export async function addTeamToLeague({ leagueId, leagueName, allLeagues, onTeamAdded }) {
  const league = allLeagues.find(l => l.id === leagueId);
  if (!league) return;
  
  const teamsInLeague = new Set((league.teams || []).map(t => t.id));
  const allTeams = await PB_API.teams.getAll();
  const availableTeams = allTeams.filter(t => !teamsInLeague.has(t.id));

  if (availableTeams.length === 0) {
      alert('All available teams are already in this league.');
      return;
  }

  const teamOptions = availableTeams.map(t => ({ value: t.id, label: `${t.name} (${t.city || 'No City'})` }));
  const selectedTeamId = await showPlayerSelectionDialog(
      `Add Team to ${leagueName}`,
      'Select a team to add:',
      teamOptions,
      'Add Team'
  );

  if (selectedTeamId) {
      await PB_API.teams.addToLeague(leagueId, Number(selectedTeamId));
      const team = allTeams.find(t => t.id === Number(selectedTeamId));
      if (team) {
          if (!league.teams) league.teams = [];
          league.teams.push(team);
          if (onTeamAdded) onTeamAdded(league, team);
      }
  }
}

/**
 * Removes a player from a league roster.
 *
 * @param {Object} options
 * @param {number} options.leagueId The league to remove from.
 * @param {number} options.playerId The player to remove.
 * @param {string} options.playerName Display name for confirm dialog.
 * @param {Array} options.allLeagues The full leagues array.
 * @param {Function} options.onPlayerRemoved Callback with (league) after removal.
 */
export async function removePlayerFromLeague({ leagueId, playerId, playerName, allLeagues, onPlayerRemoved }) {
  if (!await showConfirm(`Remove ${playerName} from this league? Their scores will remain, but they will no longer be associated with this league's roster.`, 'Remove Player')) return;

  await runAuthorizedLeagueAction(leagueId, async () => {
    await PB_API.leagues.removePlayer(leagueId, playerId);
    const league = allLeagues.find(l => l.id === leagueId);
    if (league && league.players) {
        league.players = league.players.filter(p => p.id !== playerId);
        if (onPlayerRemoved) onPlayerRemoved(league);
    }
  });
}

/**
 * Removes a team from a league roster.
 *
 * @param {Object} options
 * @param {number} options.leagueId The league to remove from.
 * @param {number} options.teamId The team to remove.
 * @param {string} options.teamName Display name for confirm dialog.
 * @param {Array} options.allLeagues The full leagues array.
 * @param {Function} options.onTeamRemoved Callback with (league) after removal.
 */
export async function removeTeamFromLeague({ leagueId, teamId, teamName, allLeagues, onTeamRemoved }) {
  if (!await showConfirm(`Remove "${teamName}" from this league?`, 'Remove Team')) return;
  await runAuthorizedLeagueAction(leagueId, async () => {
    await PB_API.teams.removeFromLeague(leagueId, teamId);
    const league = allLeagues.find(l => l.id === leagueId);
    if (league && league.teams) {
        league.teams = league.teams.filter(t => t.id !== teamId);
        if (onTeamRemoved) onTeamRemoved(league);
    }
  });
}
