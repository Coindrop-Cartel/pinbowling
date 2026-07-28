import { filterPlayersForUser } from './auth.js';

/**
 * Helper to resolve participant IDs (player or team ID) to actual player objects.
 */
export function resolvePlayersForMatchupParticipant(participantId, participantName, allPlayers = [], allLeaguesCache = []) {
  if (!participantId) return [];
  const pIdStr = String(participantId);

  // 1. Check team members across all leagues
  for (const league of allLeaguesCache) {
    const team = (league?.teams || []).find(t => String(t.id) === pIdStr);
    if (team?.members?.length) {
      return team.members;
    }
  }

  // 2. Direct match in allPlayers
  const directPlayer = allPlayers.find(p => String(p.id) === pIdStr);
  if (directPlayer) return [directPlayer];

  // 3. Fallback to name match in allPlayers
  if (participantName) {
    const nameMatch = allPlayers.find(p => p.playerName?.toLowerCase() === participantName.toLowerCase());
    if (nameMatch) return [nameMatch];
  }

  // 4. Return fallback object
  return [{ id: participantId, playerName: participantName || `Participant ${participantId}` }];
}

/**
 * Gets the list of selectable teams for team mode matchup scoring context.
 *
 * @param {Object} params - Selection parameters { activeMatchupId, eventMatchups, allLeaguesCache, leagueId }.
 * @returns {Array<{ id: number, name: string, members: Array, roleLabel?: string }>} List of selectable team objects.
 */
export function getSelectableTeams(params) {
  const { activeMatchupId, eventMatchups = [], allLeaguesCache = [], leagueId } = params;
  const league = allLeaguesCache.find(l => String(l.id) === String(leagueId));

  if (!league || league.participationType !== 'team') return [];

  if (activeMatchupId && eventMatchups.length > 0) {
    const matchup = eventMatchups[0];
    const awayId = String(matchup.team2Id ?? '');
    const homeId = String(matchup.team1Id ?? '');

    const awayTeam = (league.teams || []).find(t => String(t.id) === awayId);
    const homeTeam = (league.teams || []).find(t => String(t.id) === homeId);

    const selectable = [];
    if (awayTeam) selectable.push({ ...awayTeam, roleLabel: 'Away' });
    if (homeTeam) selectable.push({ ...homeTeam, roleLabel: 'Home' });
    return selectable;
  }

  return league.teams || [];
}

/**
 * Helper to check if a player ID is a participant (directly or via team membership) in a matchup.
 */
export function isPlayerInMatchup(playerId, matchup, allLeaguesCache = []) {
  if (!matchup || !playerId) return false;
  const p1Id = String(matchup.team1Id ?? matchup.player1Id ?? '');
  const p2Id = String(matchup.team2Id ?? matchup.player2Id ?? '');
  const curId = String(playerId);

  if (p1Id === curId || p2Id === curId) return true;

  // Check team membership
  for (const league of allLeaguesCache) {
    const t1 = (league?.teams || []).find(t => String(t.id) === p1Id);
    if (t1?.members?.some(m => String(m.id) === curId)) return true;
    const t2 = (league?.teams || []).find(t => String(t.id) === p2Id);
    if (t2?.members?.some(m => String(m.id) === curId)) return true;
  }

  return false;
}

/**
 * Gets the list of selectable players for the scores page dropdown.
 *
 * @param {Object} params - Selection parameters.
 * @returns {Array} List of selectable player objects.
 */
export function getSelectablePlayers(params) {
  const {
    allPlayers = [],
    leagueId,
    allLeaguesCache = [],
    activeMatchupId,
    eventMatchups = [],
    currentUser,
    currentPlayerId,
    sessionPlayers
  } = params;

  let selectablePlayers = [];
  const isMatchupContext = !!activeMatchupId;

  if (isMatchupContext) {
    const matchup = eventMatchups[0];
    if (matchup) {
      const p2Id = matchup.team2Id ?? matchup.player2Id;
      if (p2Id) {
        const awayPlayers = resolvePlayersForMatchupParticipant(p2Id, matchup.team2Name ?? matchup.player2Name, allPlayers, allLeaguesCache);
        awayPlayers.forEach(p => {
          if (!selectablePlayers.some(sp => String(sp.id) === String(p.id))) {
            selectablePlayers.push(p);
          }
        });
      }
      const p1Id = matchup.team1Id ?? matchup.player1Id;
      if (p1Id) {
        const homePlayers = resolvePlayersForMatchupParticipant(p1Id, matchup.team1Name ?? matchup.player1Name, allPlayers, allLeaguesCache);
        homePlayers.forEach(p => {
          if (!selectablePlayers.some(sp => String(sp.id) === String(p.id))) {
            selectablePlayers.push(p);
          }
        });
      }
    }
  } else if (sessionPlayers) {
    selectablePlayers = sessionPlayers;
  } else if (leagueId) {
    const league = allLeaguesCache.find(l => String(l.id) === String(leagueId));
    if (league?.participationType === 'team') {
      const memberMap = new Map();
      (league.teams || []).forEach(team => {
        (team.members || []).forEach(m => memberMap.set(String(m.id), m));
      });
      selectablePlayers = Array.from(memberMap.values());
    } else {
      selectablePlayers = league?.players || [];
    }
  } else {
    selectablePlayers = allPlayers;
  }

  if (!isMatchupContext) {
    selectablePlayers = filterPlayersForUser(selectablePlayers, currentUser);
  }

  if (!sessionPlayers && currentPlayerId && !selectablePlayers.some(p => String(p.id) === String(currentPlayerId))) {
    const p = allPlayers.find(p => String(p.id) === String(currentPlayerId));
    if (p) selectablePlayers.unshift(p);
  }

  return selectablePlayers;
}

/**
 * Determines the auto-selected player ID if none is currently selected.
 *
 * @param {Object} params - Auto-select parameters.
 * @returns {string|null} The auto-selected player ID, or null.
 */
export function getAutoSelectedPlayerId(params) {
  const {
    activePlayerId,
    currentUser,
    allPlayersCache = [],
    activeMatchupId,
    eventMatchups = [],
    selectablePlayers = [],
    allLeaguesCache = []
  } = params;

  if (activePlayerId) return activePlayerId;

  if (currentUser?.player_id) {
    const isInSelectable = selectablePlayers.some(p => String(p.id) === String(currentUser.player_id));
    const isInRoster = allPlayersCache.some(p => String(p.id) === String(currentUser.player_id));
    const isMatchupParticipant = activeMatchupId && eventMatchups[0] && isPlayerInMatchup(currentUser.player_id, eventMatchups[0], allLeaguesCache);
    if (isInSelectable && isInRoster && (!activeMatchupId || isMatchupParticipant)) {
      return String(currentUser.player_id);
    }
  }

  if (activeMatchupId && selectablePlayers && selectablePlayers.length > 0) {
    return String(selectablePlayers[0].id);
  }

  return null;
}

/**
 * Returns the team ID that the current user belongs to for a team-mode matchup.
 * Returns null if the user is not a member of any participating team.
 *
 * @param {Object} params
 * @param {Object} params.currentUser
 * @param {Array}  params.selectableTeams  Teams in the matchup (from getSelectableTeams).
 * @param {string|null} params.activeTeamId  Currently selected team ID (if any).
 * @returns {string|null}
 */
export function getAutoSelectedTeamId({ currentUser, selectableTeams = [], activeTeamId = null }) {
  if (activeTeamId) {
    // Verify the stored ID is still a valid team in this matchup
    if (selectableTeams.some(t => String(t.id) === String(activeTeamId))) {
      return String(activeTeamId);
    }
  }

  if (!currentUser?.player_id) return null;

  // Find which team in the matchup the current user is a member of
  const userTeam = selectableTeams.find(t =>
    (t.members || []).some(m => String(m.id) === String(currentUser.player_id))
  );

  return userTeam ? String(userTeam.id) : null;
}



/**
 * Determines if the current view is in spectator mode and if the selected player is editable.
 *
 * @param {Object} params - Spectator parameters.
 * @returns {Object} { isSpectator, canEditSelected }
 */
export function getSpectatorStatus(params) {
  const {
    activePlayerId,
    activeMatchupId,
    eventMatchups = [],
    currentUser,
    allPlayersCache = [],
    allLeaguesCache = [],
    isTD
  } = params;

  const matchup = eventMatchups[0];
  const isParticipant = matchup && currentUser && isPlayerInMatchup(currentUser.player_id, matchup, allLeaguesCache);

  const isSpectator = !!(activeMatchupId && !isParticipant);

  let canEditSelected = false;
  if (isSpectator) {
    const selectedPlayerObj = allPlayersCache.find(p => String(p.id) === String(activePlayerId));
    const isSelectedPlayerUnregistered = !selectedPlayerObj?.userId;
    canEditSelected = isSelectedPlayerUnregistered || isTD;
  } else {
    canEditSelected = true;
  }

  return { isSpectator, canEditSelected };
}
