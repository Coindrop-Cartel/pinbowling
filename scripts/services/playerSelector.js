import { filterPlayersForUser } from './auth.js';

/**
 * Gets the list of selectable players for the scores page dropdown.
 *
 * @param {Object} params - Selection parameters.
 * @returns {Array} List of selectable player objects.
 */
export function getSelectablePlayers(params) {
  const {
    allPlayers,
    leagueId,
    allLeaguesCache,
    activeMatchupId,
    eventMatchups,
    currentUser,
    currentPlayerId
  } = params;

  let selectablePlayers = [];
  const isMatchupContext = !!activeMatchupId;

  if (isMatchupContext) {
    const matchup = eventMatchups[0];
    if (matchup) {
      if (matchup.player2Id) {
        const awayPlayer = allPlayers.find(p => String(p.id) === String(matchup.player2Id));
        selectablePlayers.push(awayPlayer || { id: matchup.player2Id, playerName: matchup.player2Name });
      }
      if (matchup.player1Id) {
        const homePlayer = allPlayers.find(p => String(p.id) === String(matchup.player1Id));
        selectablePlayers.push(homePlayer || { id: matchup.player1Id, playerName: matchup.player1Name });
      }
    }
  } else if (leagueId) {
    const league = allLeaguesCache.find(l => String(l.id) === String(leagueId));
    if (league?.participants === 'team') {
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

  if (currentPlayerId && !selectablePlayers.some(p => String(p.id) === String(currentPlayerId))) {
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
    allPlayersCache,
    activeMatchupId,
    eventMatchups,
    selectablePlayers
  } = params;

  if (activePlayerId) return activePlayerId;

  if (currentUser?.player_id) {
    const isInRoster = allPlayersCache.some(p => String(p.id) === String(currentUser.player_id));
    const isMatchupParticipant = activeMatchupId && eventMatchups[0] && (
      String(eventMatchups[0].player1Id) === String(currentUser.player_id) ||
      String(eventMatchups[0].player2Id) === String(currentUser.player_id)
    );
    if (isInRoster && (!activeMatchupId || isMatchupParticipant)) {
      return String(currentUser.player_id);
    }
  }

  if (activeMatchupId && selectablePlayers && selectablePlayers.length > 0) {
    return String(selectablePlayers[0].id);
  }

  return null;
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
    eventMatchups,
    currentUser,
    allPlayersCache,
    isTD
  } = params;

  const matchup = eventMatchups[0];
  const isParticipant = matchup && currentUser && (
    String(matchup.player1Id) === String(currentUser.player_id) ||
    String(matchup.player2Id) === String(currentUser.player_id)
  );

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
