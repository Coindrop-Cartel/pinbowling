import { getScoringEngine } from '@core/engine.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { loadPage } from '@scripts/utils.js';
import { generateSessionName } from '@services/sessionGenerator.js';

/**
 * Finalizes a quick-play session:
 * 1. Creates a session league + event
 * 2. Saves generated target scores
 * 3. Joins the current user
 * 4. Handles matchup generation for H2H formats
 * 5. Redirects to the scores page
 *
 * @param {Object} options - { rawName, locId, locationsCache, currentSessionFormat, generatedFrames, allPlayersCache, PB_API, showPlayerSelectionDialog }
 * @returns {Promise<void>}
 */
export async function finalizeSession(options) {
  const {
    rawName,
    locId,
    locationsCache,
    currentSessionFormat,
    generatedFrames,
    allPlayersCache,
    PB_API,
    showPlayerSelectionDialog
  } = options;

  const location = locationsCache.find(l => l.id === locId);
  const locName = location ? location.name : 'Unknown Location';
  
  const now = new Date();
  const date = now.toLocaleDateString();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const eventName = generateSessionName(rawName, locName, date, time);

  const newLeague = await PB_API.leagues.create({ 
    name: eventName, 
    startDate: now.toISOString().split('T')[0],
    type: 'session',
    scoringFormat: currentSessionFormat,
    participants: currentSessionFormat === 'baseball' ? 'head2head' : 'individual',
    matchupsPerGame: currentSessionFormat === 'baseball' ? (generatedFrames.length / 2) : 2,
    inningsPerGame: currentSessionFormat === 'baseball' ? (generatedFrames.length / 2) : 2
  });

  if (!newLeague || !newLeague.id) {
    throw new Error('Failed to create session league.');
  }

  const qpLeague = newLeague;

  const newEvent = await PB_API.events.create({
    leagueId: qpLeague.id,
    eventName: eventName,
    eventDate: now.toISOString().split('T')[0],
    locationId: locId,
    scoringFormat: currentSessionFormat
  });

  if (!newEvent || !newEvent.id) {
    throw new Error('Failed to create event. Backend did not return an event ID. Check your createEvent endpoint.');
  }

  const event = newEvent;

  const targetPayloads = generatedFrames
    .filter(f => f.machineId)
    .map(frame => {
      return {
        eventId: Number(event.id),
        machineId: Number(frame.machineId),
        orderNumber: frame.orderNumber,
        value1: frame.value1,
        value2: frame.value2,
        values: frame.values
      };
    });

  if (targetPayloads.length > 0) {
    await PB_API.machines.saveTarget(targetPayloads);
  }

  const currentUser = await PB_API.auth.me();
  if (currentUser?.player_id) {
    await PB_API.leagues.addPlayer(qpLeague.id, currentUser.player_id);
  }

  let eventMatchupId = null;
  const engine = getScoringEngine(currentSessionFormat);
  const matchupInfo = engine.getMatchupDescription(generatedFrames.length);
  if (matchupInfo) {
    const leagueData = await PB_API.leagues.get(qpLeague.id);
    const roster = leagueData?.players || [];

    if (roster.length < 2 && allPlayersCache.length > 0) {
      const opponentOptions = allPlayersCache
        .filter(p => !roster.some(r => r.id === p.id))
        .map(p => ({ value: p.id, label: p.playerName }));

      if (opponentOptions.length > 0) {
        const opponentId = await showPlayerSelectionDialog(
          'Select Opponent',
          'This format requires at least 2 players. Choose an opponent:',
          opponentOptions,
          'Add & Continue'
        );
        if (opponentId) {
          await PB_API.leagues.addPlayer(qpLeague.id, Number(opponentId));
          roster.push({ id: Number(opponentId) });
        }
      }
    }

    const updatedLeague = roster.length >= 2 ? { players: roster } : await PB_API.leagues.get(qpLeague.id);
    const finalRoster = updatedLeague?.players || [];

    if (finalRoster.length >= 2) {
      const inningCount = generatedFrames.length / engine.getMachinesPerRound();
      const machines = generatedFrames.map(f => ({ machineId: f.machineId }));
      const matchups = engine.generateMatchupPayload(finalRoster, inningCount, machines);

      if (matchups.length > 0) {
        const res = await PB_API.matchups.save(matchups.map(m => ({
          ...m,
          eventId: Number(event.id)
        })));
        if (res && res.eventMatchupId) {
          eventMatchupId = res.eventMatchupId;
        }
      }
    }
  }

  loadPage(ROUTE_PATHS.SCORES({ 
    eventId: event.id, 
    leagueId: qpLeague.id, 
    eventMatchupId: eventMatchupId || '', 
    playerId: currentUser?.player_id 
  }));
}
