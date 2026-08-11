import { getScoringEngine } from '@core/engine.js';
import { ROUTE_PATHS } from '@scripts/routes.js';
import { loadPage } from '@scripts/utils.js';
import { generateSessionName } from '@services/sessionGenerator.js';

export async function finalizeSession(options) {
  const {
    rawName,
    locId,
    locationsCache,
    currentSessionFormat,
    participationType = 'individual',
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
  const engine = getScoringEngine(currentSessionFormat);

  let teamIds = null;
  let sessionPlayerIds = null;
  if (participationType === 'team') {
    teamIds = await pickTeams(showPlayerSelectionDialog, PB_API, engine, generatedFrames);
    if (teamIds === undefined) return;
  } else {
    sessionPlayerIds = await pickSessionPlayers(showPlayerSelectionDialog, PB_API, allPlayersCache, engine, generatedFrames);
    if (sessionPlayerIds === undefined) return;
  }

  const newSession = await PB_API.sessions.create({
    name: eventName,
    scoringFormat: currentSessionFormat,
    competitionFormat: engine?.getDefaultCompetitionFormat?.() ?? 'group',
    participationType,
    teamSize: 1,
    roundsPerGame: engine?.getDefaultRoundsPerGame?.(generatedFrames.length) ?? 2,
    matchupsPerRound: engine?.getDefaultMatchupsPerRound?.() ?? null,
    locationId: locId,
    eventName,
    eventDate: now.toISOString().split('T')[0]
  });

  if (!newSession?.id) throw new Error('Failed to create session.');
  const event = newSession.events?.[0];
  if (!event?.id) throw new Error('Failed to create session event.');

  const targetPayloads = generatedFrames.filter(f => f.machineId).map(frame => ({
    eventId: Number(event.id), machineId: Number(frame.machineId),
    orderNumber: frame.orderNumber, value1: frame.value1, value2: frame.value2, values: frame.values
  }));
  if (targetPayloads.length > 0) await PB_API.machines.saveTarget(targetPayloads);

  if (participationType === 'team') {
    for (const tid of teamIds) {
      await PB_API.sessions.addTeam(newSession.id, tid);
    }

    let eventMatchupId = null;
    const matchupInfo = engine?.getMatchupDescription?.(generatedFrames?.length ?? 0);
    if (matchupInfo) {
      const inningCount = generatedFrames.length / engine.getMachinesPerRound();
      const machineIds = generatedFrames.map(f => f.machineId);
      const teamMatchupPayload = [];
      for (let orderNum = 1; orderNum <= generatedFrames.length; orderNum++) {
        const isTop = orderNum % 2 === 1;
        const pitcherTeamId = isTop ? teamIds[0] : teamIds[1];
        const batterTeamId = isTop ? teamIds[1] : teamIds[0];
        const machineIdx = (orderNum - 1) % machineIds.length;
        teamMatchupPayload.push({
          eventId: Number(event.id),
          team1Id: pitcherTeamId,
          team2Id: batterTeamId,
          orderNumber: orderNum,
          machineId: machineIds[machineIdx]
        });
      }
      const res = await PB_API.teamMatchups.save(teamMatchupPayload);
      if (res?.teamEventMatchupIds?.[0]) eventMatchupId = res.teamEventMatchupIds[0];
    }

    const currentUser = await PB_API.auth.me();
    loadPage(ROUTE_PATHS.SCORES({ eventId: event.id, sessionId: newSession.id, teamEventMatchupId: eventMatchupId || '', playerId: currentUser?.player_id, teamId: currentUser?.player_id }));
    return;
  }

  const currentUser = await PB_API.auth.me();
  if (sessionPlayerIds && sessionPlayerIds.length > 0) {
    for (const pId of sessionPlayerIds) {
      await PB_API.sessions.addPlayer(newSession.id, pId);
    }
  } else if (currentUser?.player_id) {
    await PB_API.sessions.addPlayer(newSession.id, currentUser.player_id);
  }

  let eventMatchupId = null;
  const matchupInfo = engine.getMatchupDescription(generatedFrames.length);
  if (matchupInfo) {
    const finalRoster = sessionPlayerIds && sessionPlayerIds.length >= 2
      ? sessionPlayerIds.map(id => ({ id }))
      : [{ id: currentUser?.player_id }];
    if (finalRoster.length >= 2) {
      const inningCount = generatedFrames.length / engine.getMachinesPerRound();
      const machines = generatedFrames.map(f => ({ machineId: f.machineId }));
      const matchups = engine.generateMatchupPayload(finalRoster, inningCount, machines);
      if (matchups.length > 0) {
        const res = await PB_API.matchups.save(matchups.map(m => ({ ...m, eventId: Number(event.id) })));
        if (res?.eventMatchupId) eventMatchupId = res.eventMatchupId;
      }
    }
  }

  loadPage(ROUTE_PATHS.SCORES({ eventId: event.id, sessionId: newSession.id, eventMatchupId: eventMatchupId || '', playerId: currentUser?.player_id }));
}

async function pickSessionPlayers(showPlayerSelectionDialog, PB_API, allPlayersCache, engine, generatedFrames) {
  if (!engine?.requiresHeadToHead?.()) return null;
  const currentUser = await PB_API.auth.me();
  if (!currentUser?.player_id) return null;

  const maxRoster = engine.getMaxRosterSize() || 2;
  const selectedPlayerIds = [Number(currentUser.player_id)];

  if (maxRoster <= 2) {
    const opponentOptions = allPlayersCache
      .filter(p => Number(p.id) !== Number(currentUser.player_id))
      .map(p => ({ value: p.id, label: p.playerName }));
    if (opponentOptions.length === 0) return selectedPlayerIds;
    const opponentId = await showPlayerSelectionDialog('Select Opponent', 'This format requires at least 2 players. Choose an opponent:', opponentOptions, 'Add & Continue');
    if (!opponentId) return undefined;
    selectedPlayerIds.push(Number(opponentId));
    return selectedPlayerIds;
  }

  // 2 to 4 Player Group Matchup (Golf Skins)
  let availablePool = allPlayersCache.filter(p => Number(p.id) !== Number(currentUser.player_id));

  while (selectedPlayerIds.length < maxRoster && availablePool.length > 0) {
    const isMinMet = selectedPlayerIds.length >= 2;
    const currentCount = selectedPlayerIds.length;

    const options = availablePool.map(p => ({ value: p.id, label: p.playerName }));
    if (isMinMet) {
      options.unshift({ value: 'DONE', label: '✔ Done (Start session with selected players)' });
    }

    const promptTitle = `Select Player ${currentCount + 1}`;
    const promptMsg = isMinMet
      ? `Choose Player ${currentCount + 1} for this ${engine.config?.format === 'golf_skins' ? 'Golf Skins' : 'Matchup'} group (2 to 4 players), or select Done:`
      : `Golf Skins requires at least 2 players. Choose Player ${currentCount + 1}:`;

    const pickedId = await showPlayerSelectionDialog(promptTitle, promptMsg, options, 'Add Player');
    if (!pickedId || pickedId === 'DONE') {
      if (!isMinMet) return undefined; // Canceled before meeting minimum required 2 players
      break;
    }

    const numPicked = Number(pickedId);
    if (numPicked > 0 && !selectedPlayerIds.includes(numPicked)) {
      selectedPlayerIds.push(numPicked);
      availablePool = availablePool.filter(p => Number(p.id) !== numPicked);
    }
  }

  return selectedPlayerIds;
}

async function pickTeams(showPlayerSelectionDialog, PB_API, engine, generatedFrames) {
  const allTeams = await PB_API.teams.getAll().catch(() => []);
  if (allTeams.length < 2) return null;
  const teamOptions = allTeams.map(t => ({ value: t.id, label: t.name }));

  const matchupInfo = engine?.getMatchupDescription?.(generatedFrames?.length ?? 0);
  const promptLabel = matchupInfo ? 'Select Team 1' : 'Select Team';

  const firstTeamId = await showPlayerSelectionDialog(promptLabel, 'Select the first team:', teamOptions, 'Next');
  if (!firstTeamId) return undefined;

  const remainingOptions = teamOptions.filter(t => String(t.value) !== String(firstTeamId));
  const secondTeamId = await showPlayerSelectionDialog('Select Team 2', 'Select the opposing team:', remainingOptions, 'Add & Continue');
  if (!secondTeamId) return undefined;

  return [Number(firstTeamId), Number(secondTeamId)];
}
