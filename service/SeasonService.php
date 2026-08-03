<?php

namespace App\Service;

use PDO;

/**
 * Service managing round-robin regular season schedules and weekly fixtures.
 */
class SeasonService {
    private DatabaseService $db;
    private EventService $eventService;

    public function __construct(DatabaseService $db, EventService $eventService) {
        $this->db = $db;
        $this->eventService = $eventService;
    }

    /**
     * Generate regular season round-robin weekly matchups for a league.
     *
     * @param int $leagueId
     * @return bool Success
     */
    public function startSeason(int $leagueId): bool {
        $db = $this->db;
        
        try {
            $db->beginTransaction();
            
            // 1. Fetch league details directly
            $stmt = $db->prepare('SELECT status, start_date, weeks_in_season, rounds_per_game, matchups_per_round, participation_type, scoring_format FROM leagues WHERE id = ?');
            $stmt->execute([$leagueId]);
            $league = $stmt->fetch();
            if (!$league) {
                throw new \Exception("League not found.");
            }
            if ($league['status'] !== 'setup') {
                throw new \Exception("Season has already been started or is completed.");
            }
            
            $weeksInSeason = (int)($league['weeks_in_season'] ?? 0);
            if ($weeksInSeason <= 0) {
                throw new \Exception("Weeks in season must be greater than 0. Please edit the league to specify the number of weeks in season.");
            }

            error_log("[PinBowling DEBUG] SeasonService::startSeason — leagueId=$leagueId weeks=$weeksInSeason status={$league['status']} start_date={$league['start_date']} participation={$league['participation_type']}");

            // Total matchups per game = rounds × matchups_per_round
            // e.g. baseball: 2 innings × 2 sides = 4 matchup rows
            $rounds = (int)($league['rounds_per_game'] ?? 2);
            $matchupsPerRound = (int)($league['matchups_per_round'] ?? 2);
            $isTeam = ($league['participation_type'] ?? 'individual') === 'team';
            
            // Fetch roster / participants
            if ($isTeam) {
                $stmt = $db->prepare(
                    'SELECT t.id, t.name as player_name 
                     FROM teams t 
                     JOIN league_teams lt ON t.id = lt.team_id 
                     WHERE lt.league_id = ?'
                );
            } else {
                $stmt = $db->prepare(
                    'SELECT p.id, p.player_name 
                     FROM players p 
                     JOIN league_players lp ON p.id = lp.player_id 
                     WHERE lp.league_id = ?'
                );
            }
            $stmt->execute([$leagueId]);
            $players = $stmt->fetchAll();
            if (count($players) < 2) {
                throw new \Exception("At least 2 participants (teams or individual players) are required to start a season.");
            }
            
            // Fetch assigned locations for the league (fallback to all active locations if none explicitly assigned)
            $llStmt = $db->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
            $llStmt->execute([$leagueId]);
            $assignedLocationIds = $llStmt->fetchAll(PDO::FETCH_COLUMN);

            if (empty($assignedLocationIds)) {
                $allLocStmt = $db->query('SELECT id FROM locations');
                $assignedLocationIds = $allLocStmt->fetchAll(PDO::FETCH_COLUMN);
            }

            // Fetch machine IDs grouped by location
            $lmStmt = $db->query('SELECT location_id, machine_id FROM location_machines');
            $machinesByLocation = [];
            foreach ($lmStmt->fetchAll() as $row) {
                $machinesByLocation[(int)$row['location_id']][] = (int)$row['machine_id'];
            }

            // 2. Fetch all available machines
            $machinesStmt = $db->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception("No machines found in database. Please register machines first.");
            }
            
            // 3. Prepare Round-Robin schedule
            $pairingsByRound = $this->buildRoundRobinPairings($players);
            $roundsCount = count($pairingsByRound);
            error_log("[PinBowling DEBUG] SeasonService::startSeason — participants=" . count($players) . " pairingsRounds=$roundsCount pairingsByRound=" . json_encode($pairingsByRound));
            
            // 4. Generate Weeks (Events) and Matchups
            $startDate = $league['start_date'] ?: date('Y-m-d');
            $leagueFormat = $league['scoring_format'] ?? 'bowling';

            for ($w = 1; $w <= $weeksInSeason; $w++) {
                // Calculate week date (7 days per week)
                $eventDate = date('Y-m-d', strtotime($startDate . " + " . (($w - 1) * 7) . " days"));
                
                // Primary location for the weekly event header
                $primaryLocId = !empty($assignedLocationIds) ? (int)$assignedLocationIds[($w - 1) % count($assignedLocationIds)] : null;

                // Create Weekly Event
                $event = $this->eventService->createEvent($leagueId, "Week " . $w, $eventDate, $primaryLocId, $leagueFormat);
                $eventId = (int)$event['id'];
                
                // Get matchups for this week and distribute them across all assigned locations
                $pairings = $pairingsByRound[($w - 1) % $roundsCount];

                error_log("[PinBowling DEBUG] SeasonService::startSeason — week #$w: eventId=$eventId date=$eventDate locId=$primaryLocId pairings=" . json_encode($pairings));

                $this->generateWeekMatchups(
                    $db, $eventId, $assignedLocationIds, ($w - 1), $pairings,
                    $isTeam, $rounds, $matchupsPerRound, $allMachineIds, $machinesByLocation
                );
            }
            
            // 5. Update league status to active
            $stmt = $db->prepare('UPDATE leagues SET status = \'active\' WHERE id = ?');
            $stmt->execute([$leagueId]);
            
            $db->commit();
            return true;
        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Get ordered member IDs for a team.
     *
     * @param DatabaseService $db
     * @param int $teamId
     * @return array Array of ['id' => int] items
     */
    private function getTeamMembers(DatabaseService $db, int $teamId): array {
        $stmt = $db->prepare(
            'SELECT p.id FROM team_members tm
             JOIN players p ON tm.player_id = p.id
             WHERE tm.team_id = ?
             ORDER BY tm.player_id ASC'
        );
        $stmt->execute([$teamId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Generates round-robin pairings for a given participant roster.
     *
     * @param array $players Participant rows with 'id' and 'player_name'
     * @return array Array of pairings per round
     */
    private function buildRoundRobinPairings(array $players): array {
        $list = $players;
        if (count($list) % 2 !== 0) {
            $list[] = null; // BYE dummy
        }
        $n = count($list);
        $roundsCount = $n - 1;
        
        $pairingsByRound = [];
        for ($round = 0; $round < $roundsCount; $round++) {
            $pairings = [];
            for ($i = 0; $i < $n / 2; $i++) {
                $home = $list[$i];
                $away = $list[$n - 1 - $i];
                
                // Normalize home/away so that if there is a BYE, it is always the away player
                if ($home === null && $away !== null) {
                    $home = $away;
                    $away = null;
                }
                
                if ($home !== null) {
                    if ($round % 2 !== 0 && $away !== null) {
                        $pairings[] = ['home' => $away, 'away' => $home];
                    } else {
                        $pairings[] = ['home' => $home, 'away' => $away];
                    }
                }
            }
            $pairingsByRound[$round] = $pairings;
            
            // Rotate the list (circle method)
            $first = array_shift($list);
            array_unshift($list, array_pop($list));
            array_unshift($list, $first);
        }
        return $pairingsByRound;
    }

    /**
     * Generates matchups and machine slots for a specific event week.
     * Cycles through assigned location IDs to guarantee every location hosts matchups each week.
     */
    private function generateWeekMatchups(
        DatabaseService $db,
        int $eventId,
        array $assignedLocationIds,
        int $weekIndex,
        array $pairings,
        bool $isTeam,
        int $rounds,
        int $matchupsPerRound,
        array $allMachineIds,
        array $machinesByLocation
    ): void {
        $locations = !empty($assignedLocationIds) ? array_values($assignedLocationIds) : [];
        $locCount = count($locations);

        error_log("[PinBowling DEBUG] SeasonService::generateWeekMatchups — eventId=$eventId isTeam=" . ($isTeam ? 'yes' : 'no') . " rounds=$rounds matchupsPerRound=$matchupsPerRound pairingsCount=" . count($pairings));

        foreach ($pairings as $pairIndex => $pair) {
            $homePlayer = $pair['home'];
            $awayPlayer = $pair['away'];
            error_log("[PinBowling DEBUG] SeasonService::generateWeekMatchups — pair #$pairIndex: homeId={$homePlayer['id']} homeName={$homePlayer['player_name']} awayId=" . ($awayPlayer ? $awayPlayer['id'] : 'BYE') . " awayName=" . ($awayPlayer ? $awayPlayer['player_name'] : 'BYE'));

            // Round-robin assignment across available locations to guarantee EVERY location is used each week
            $matchupLocId = $locCount > 0 ? (int)$locations[($weekIndex + $pairIndex) % $locCount] : null;

            // Machine pool for this specific matchup's assigned location
            $matchupMachineIds = ($matchupLocId && !empty($machinesByLocation[$matchupLocId]))
                ? $machinesByLocation[$matchupLocId]
                : $allMachineIds;

            // Shuffle machine order per game so each matchup gets a different sequence
            shuffle($matchupMachineIds);
            
            if ($awayPlayer === null) {
                // BYE Week matchup
                $stmt = $db->prepare(
                    "INSERT INTO event_matchups (event_id, location_id, player1_id, player2_id, player1_score, player2_score, player_winner_id, status, game_number)
                     VALUES (?, ?, ?, NULL, 0, 0, NULL, 'completed', 1)"
                );
                $stmt->execute([$eventId, $matchupLocId, $homePlayer['id']]);
            } else {
                if ($isTeam) {
                    // Team baseball: 1 team_event_matchup per game (team1=home, team2=away)
                    $homeTeamMembers = $this->getTeamMembers($db, $homePlayer['id']);
                    $awayTeamMembers = $this->getTeamMembers($db, $awayPlayer['id']);

                    // Create 1 game-level temId
                    $temStmt = $db->prepare(
                        'INSERT INTO team_event_matchups (event_id, location_id, team1_id, team2_id, status, game_number)
                         VALUES (?, ?, ?, ?, \'pending\', 1)'
                    );
                    $temStmt->execute([$eventId, $matchupLocId, $homePlayer['id'], $awayPlayer['id']]);
                    $temId = (int)$db->lastInsertId();
                    error_log("[PinBowling DEBUG] SeasonService::generateWeekMatchups — game temId=$temId home={$homePlayer['id']} away={$awayPlayer['id']}");

                    // Each inning has Top (away bats) and Bottom (home bats) = 2 half-innings
                    for ($orderNum = 1; $orderNum <= $rounds * 2; $orderNum++) {
                        $isTop = ($orderNum % 2 === 1);
                        $inning = (int)(($orderNum - 1) / 2) + 1;

                        // Assign pitcher (team1) and batter (team2) based on half-inning role
                        $pitcherTeamId = $isTop ? $homePlayer['id'] : $awayPlayer['id'];
                        $batterTeamId  = $isTop ? $awayPlayer['id'] : $homePlayer['id'];

                        // Round-robin machine selection across all half-innings
                        $machineIdx = ($orderNum - 1) % max(count($matchupMachineIds), 1);
                        $machines = [$matchupMachineIds[$machineIdx]];

                        error_log("[PinBowling DEBUG] SeasonService::generateWeekMatchups — orderNum=$orderNum " . ($isTop ? 'Top' : 'Bottom') . " $inning: pitcher=$pitcherTeamId batter=$batterTeamId machine=" . $machines[0]);

                        MatchupGenerator::createTeamMatchups(
                            $db, $temId, $machines, $eventId, $matchupLocId,
                            $pitcherTeamId, $batterTeamId, $orderNum
                        );
                    }
                } else {
                    // Individual baseball: existing logic
                    $stmt = $db->prepare(
                        'INSERT INTO event_matchups (event_id, location_id, player1_id, player2_id, status, game_number)
                         VALUES (?, ?, ?, ?, \'pending\', 1)'
                    );
                    $stmt->execute([$eventId, $matchupLocId, $homePlayer['id'], $awayPlayer['id']]);
                    $eventMatchupId = (int)$db->lastInsertId();

                    MatchupGenerator::createMatchupSlots(
                        $db, $eventMatchupId,
                        $rounds, $matchupsPerRound, $matchupMachineIds
                    );
                }
            }
        }
    }

    /**
     * Recreates matchups for any unplayed regular season weeks
     * to attempt to balance the schedule with the current roster.
     *
     * @param int $leagueId
     * @return bool Success
     */
    public function updateSeason(int $leagueId): bool {
        $db = $this->db;
        
        try {
            $db->beginTransaction();
            
            // 1. Fetch league details directly
            $stmt = $db->prepare('SELECT status, rounds_per_game, matchups_per_round, participation_type FROM leagues WHERE id = ?');
            $stmt->execute([$leagueId]);
            $league = $stmt->fetch();
            if (!$league) {
                throw new \Exception("League not found.");
            }
            if ($league['status'] !== 'active') {
                throw new \Exception("League must be active to update the season schedule.");
            }
            
            // Total matchups per game = rounds × matchups_per_round
            $rounds = (int)($league['rounds_per_game'] ?? 2);
            $matchupsPerRound = (int)($league['matchups_per_round'] ?? 2);
            $isTeam = ($league['participation_type'] ?? 'individual') === 'team';
            
            // Fetch roster / participants
            if ($isTeam) {
                $stmt = $db->prepare(
                    'SELECT t.id, t.name as player_name 
                     FROM teams t 
                     JOIN league_teams lt ON t.id = lt.team_id 
                     WHERE lt.league_id = ?'
                );
                $stmt->execute([$leagueId]);
                $players = $stmt->fetchAll();
                if (count($players) < 2) {
                    throw new \Exception("At least 2 teams are required to update a head-to-head season.");
                }
            } else {
                $stmt = $db->prepare(
                    'SELECT DISTINCT p.id, p.player_name 
                     FROM players p 
                     JOIN league_players lp ON p.id = lp.player_id 
                     WHERE lp.league_id = ?'
                );
                $stmt->execute([$leagueId]);
                $players = $stmt->fetchAll();
                if (count($players) < 2) {
                    throw new \Exception("At least 2 players are required to update a head-to-head season.");
                }
            }
            
            // Fetch assigned locations for the league (fallback to all active locations if none explicitly assigned)
            $llStmt = $db->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
            $llStmt->execute([$leagueId]);
            $assignedLocationIds = $llStmt->fetchAll(PDO::FETCH_COLUMN);

            if (empty($assignedLocationIds)) {
                $allLocStmt = $db->query('SELECT id FROM locations');
                $assignedLocationIds = $allLocStmt->fetchAll(PDO::FETCH_COLUMN);
            }

            // Fetch machine IDs grouped by location
            $lmStmt = $db->query('SELECT location_id, machine_id FROM location_machines');
            $machinesByLocation = [];
            foreach ($lmStmt->fetchAll() as $row) {
                $machinesByLocation[(int)$row['location_id']][] = (int)$row['machine_id'];
            }

            // Fetch all available machines
            $machinesStmt = $db->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception("No machines found in database. Please register machines first.");
            }
            
            // 2. Classify events as played (has scores or completed non-BYE matchups) or unplayed
            $stmt = $db->prepare('SELECT id, event_name, event_date FROM events WHERE league_id = ?');
            $stmt->execute([$leagueId]);
            $events = $stmt->fetchAll();
            
            // Filter to only regular season weeks (ignore Playoffs)
            $regSeasonEvents = array_filter($events, function($e) {
                return !str_starts_with($e['event_name'] ?? '', 'Playoffs:');
            });
            
            if (empty($regSeasonEvents)) {
                throw new \Exception("No regular season events found.");
            }
            
            // Determine which weeks are unplayed (checking both scores table and completed event_matchups)
            $playedMap = [];
            foreach ($regSeasonEvents as $event) {
                $eventId = (int)$event['id'];
                
                $scoreStmt = $db->prepare('SELECT COUNT(*) FROM scores WHERE event_id = ?');
                $scoreStmt->execute([$eventId]);
                $scoreCount = (int)$scoreStmt->fetchColumn();

                $checkStmt = $db->prepare(
                    "SELECT COUNT(*) FROM event_matchups 
                     WHERE event_id = ? AND status = 'completed' AND player2_id IS NOT NULL"
                );
                $checkStmt->execute([$eventId]);
                $completedCount = (int)$checkStmt->fetchColumn();

                $playedMap[$eventId] = ($scoreCount > 0 || $completedCount > 0);
            }
            
            // Check if there is at least one unplayed week
            $hasUnplayed = false;
            foreach ($playedMap as $eventId => $isPlayed) {
                if (!$isPlayed) {
                    $hasUnplayed = true;
                    break;
                }
            }
            if (!$hasUnplayed) {
                $db->commit();
                return true;
            }
            
            // 3. Prepare new Round-Robin schedule using CURRENT roster
            $pairingsByRound = $this->buildRoundRobinPairings($players);
            $roundsCount = count($pairingsByRound);
            
            // 4. Update the unplayed weeks
            usort($regSeasonEvents, function($a, $b) {
                $dateA = $a['event_date'] ?? '';
                $dateB = $b['event_date'] ?? '';
                if ($dateA === $dateB) {
                    return (int)$a['id'] - (int)$b['id'];
                }
                return strcmp($dateA, $dateB);
            });
            
            $weekNum = 0;
            foreach ($regSeasonEvents as $event) {
                $weekNum++;
                $eventId = (int)$event['id'];
                
                // If it was already played or has scores, do not touch it
                if ($playedMap[$eventId]) {
                    continue;
                }
                
                // Delete existing matchups for this unplayed week
                $db->prepare('DELETE FROM matchups WHERE event_matchup_id IN (SELECT id FROM event_matchups WHERE event_id = ?)')->execute([$eventId]);
                $db->prepare('DELETE FROM event_matchups WHERE event_id = ?')->execute([$eventId]);

                // Primary location for the weekly event header
                $primaryLocId = !empty($assignedLocationIds) ? (int)$assignedLocationIds[($weekNum - 1) % count($assignedLocationIds)] : null;
                if ($primaryLocId) {
                    $db->prepare('UPDATE events SET location_id = ? WHERE id = ?')->execute([$primaryLocId, $eventId]);
                }
                
                $pairings = $pairingsByRound[($weekNum - 1) % $roundsCount];
                $this->generateWeekMatchups(
                    $db, $eventId, $assignedLocationIds, ($weekNum - 1), $pairings,
                    $isTeam, $rounds, $matchupsPerRound, $allMachineIds, $machinesByLocation
                );
            }

            $db->commit();
            return true;
        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }
}
