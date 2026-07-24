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
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();
            
            // 1. Fetch league details directly
            $stmt = $pdo->prepare('SELECT status, start_date, weeks_in_season, rounds_per_game, matchups_per_round, participation_type FROM leagues WHERE id = ?');
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
                throw new \Exception("Weeks in season must be greater than 0.");
            }
            
            // Total matchups per game = rounds × matchups_per_round
            // e.g. baseball: 2 innings × 2 sides = 4 matchup rows
            $rounds = (int)($league['rounds_per_game'] ?? 2);
            $matchupsPerRound = (int)($league['matchups_per_round'] ?? 2);
            $isTeam = ($league['participation_type'] ?? 'individual') === 'team';
            
            // Fetch roster / participants
            if ($isTeam) {
                $stmt = $pdo->prepare(
                    'SELECT t.id, t.name as player_name 
                     FROM teams t 
                     JOIN league_teams lt ON t.id = lt.team_id 
                     WHERE lt.league_id = ?'
                );
                $stmt->execute([$leagueId]);
                $players = $stmt->fetchAll();
                if (count($players) < 2) {
                    throw new \Exception("At least 2 teams are required to start a head-to-head season.");
                }

                // Validate innings is multiple of all team sizes
                foreach ($players as $team) {
                    $memberStmt = $pdo->prepare('SELECT COUNT(*) FROM team_members WHERE team_id = ?');
                    $memberStmt->execute([$team['id']]);
                    $teamSize = (int)$memberStmt->fetchColumn();
                    if ($teamSize > 0 && $rounds % $teamSize !== 0) {
                        throw new \Exception(
                            "Innings ({$rounds}) must be a multiple of team size ({$teamSize}) for team '{$team['player_name']}'."
                        );
                    }
                }
            } else {
                $stmt = $pdo->prepare(
                    'SELECT p.id, p.player_name 
                     FROM players p 
                     JOIN league_players lp ON p.id = lp.player_id 
                     WHERE lp.league_id = ?'
                );
                $stmt->execute([$leagueId]);
                $players = $stmt->fetchAll();
                if (count($players) < 2) {
                    throw new \Exception("At least 2 players are required to start a head-to-head season.");
                }
            }
            
            // Fetch assigned locations for the league
            $llStmt = $pdo->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
            $llStmt->execute([$leagueId]);
            $assignedLocationIds = $llStmt->fetchAll(PDO::FETCH_COLUMN);

            // Fetch machine IDs grouped by location
            $lmStmt = $pdo->query('SELECT location_id, machine_id FROM location_machines');
            $machinesByLocation = [];
            foreach ($lmStmt->fetchAll() as $row) {
                $machinesByLocation[(int)$row['location_id']][] = (int)$row['machine_id'];
            }

            // 2. Fetch all available machines
            $machinesStmt = $pdo->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception("No machines found in database. Please register machines first.");
            }
            
            // 3. Prepare Round-Robin schedule
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
                        // Alternate home/away weekly to be fair.
                        // On odd rounds, swap — but only if away is not a BYE null,
                        // otherwise keep original order so homePlayer is never null.
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
            
            // 4. Generate Weeks (Events) and Matchups
            $startDate = $league['start_date'] ?: date('Y-m-d');
            for ($w = 1; $w <= $weeksInSeason; $w++) {
                // Calculate week date (7 days per week)
                $eventDate = date('Y-m-d', strtotime($startDate . " + " . (($w - 1) * 7) . " days"));
                
                // Create Weekly Event
                $event = $this->eventService->createEvent($leagueId, "Week " . $w, $eventDate, null, 'baseball');
                $eventId = (int)$event['id'];
                
                // Get matchups for this week
                $pairings = $pairingsByRound[($w - 1) % $roundsCount];
                foreach ($pairings as $pair) {
                    $homePlayer = $pair['home'];
                    $awayPlayer = $pair['away'];
                    
                    if ($awayPlayer === null) {
                        // BYE Week matchup
                        $stmt = $pdo->prepare(
                            'INSERT INTO event_matchups (event_id, player1_id, player2_id, player1_score, player2_score, winner_id, status, game_number)
                             VALUES (?, ?, NULL, 0, 0, NULL, \'completed\', 1)'
                        );
                        $stmt->execute([$eventId, $homePlayer['id']]);
                    } else {
                        // Determine the machine pool for this matchup
                        $matchupMachineIds = $allMachineIds;
                        if (!empty($assignedLocationIds)) {
                            // Pick a random location from the assigned locations
                            $chosenLocId = (int)$assignedLocationIds[array_rand($assignedLocationIds)];
                            if (!empty($machinesByLocation[$chosenLocId])) {
                                $matchupMachineIds = $machinesByLocation[$chosenLocId];
                            }
                        }

                        if ($isTeam) {
                            // Team baseball: 1 event_matchup per half-inning
                            // Fetch team members for batting rotation
                            $homeTeamMembers = $this->getTeamMembers($pdo, $homePlayer['id']);
                            $awayTeamMembers = $this->getTeamMembers($pdo, $awayPlayer['id']);
                            $homeTeamSize = count($homeTeamMembers);
                            $awayTeamSize = count($awayTeamMembers);

                            for ($inning = 1; $inning <= $rounds; $inning++) {
                                // Top half: Away team bats, Home team pitches
                                $topMatchupStmt = $pdo->prepare(
                                    'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number, round_name)
                                     VALUES (?, ?, ?, \'pending\', ?, ?)'
                                );
                                $topMatchupStmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id'], $inning, "Top $inning"]);
                                $topMatchupId = (int)$pdo->lastInsertId();

                                // Batting rotation for away team
                                $halfInningNum = ($inning - 1) * 2; // Top = even
                                $startIdx = $halfInningNum % max($awayTeamSize, 1);
                                $awayBatters = [];
                                for ($b = 0; $b < $matchupsPerRound; $b++) {
                                    $idx = ($startIdx + $b) % $awayTeamSize;
                                    $awayBatters[] = $awayTeamMembers[$idx]['id'];
                                }
                                $topMachines = MatchupGenerator::selectMachines($matchupMachineIds, $matchupsPerRound);
                                MatchupGenerator::createMatchupSlots(
                                    $pdo, $topMatchupId,
                                    1, $matchupsPerRound, $topMachines, $awayBatters
                                );

                                // Bottom half: Home team bats, Away team pitches
                                $bottomMatchupStmt = $pdo->prepare(
                                    'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number, round_name)
                                     VALUES (?, ?, ?, \'pending\', ?, ?)'
                                );
                                $bottomMatchupStmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id'], $inning, "Bottom $inning"]);
                                $bottomMatchupId = (int)$pdo->lastInsertId();

                                // Batting rotation for home team
                                $halfInningNum = ($inning - 1) * 2 + 1; // Bottom = odd
                                $startIdx = $halfInningNum % max($homeTeamSize, 1);
                                $homeBatters = [];
                                for ($b = 0; $b < $matchupsPerRound; $b++) {
                                    $idx = ($startIdx + $b) % $homeTeamSize;
                                    $homeBatters[] = $homeTeamMembers[$idx]['id'];
                                }
                                $bottomMachines = MatchupGenerator::selectMachines($matchupMachineIds, $matchupsPerRound);
                                MatchupGenerator::createMatchupSlots(
                                    $pdo, $bottomMatchupId,
                                    1, $matchupsPerRound, $bottomMachines, $homeBatters
                                );
                            }
                        } else {
                            // Individual baseball: existing logic
                            $stmt = $pdo->prepare(
                                'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number)
                                 VALUES (?, ?, ?, \'pending\', 1)'
                            );
                            $stmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id']]);
                            $eventMatchupId = (int)$pdo->lastInsertId();

                            MatchupGenerator::createMatchupSlots(
                                $pdo, $eventMatchupId,
                                $rounds, $matchupsPerRound, $matchupMachineIds
                            );
                        }
                    }
                }
            }
            
            // 5. Update league status to active
            $stmt = $pdo->prepare('UPDATE leagues SET status = \'active\' WHERE id = ?');
            $stmt->execute([$leagueId]);
            
            $pdo->commit();
            return true;
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Get ordered member IDs for a team.
     *
     * @param PDO $pdo
     * @param int $teamId
     * @return array Array of ['id' => int] items
     */
    private function getTeamMembers(PDO $pdo, int $teamId): array {
        $stmt = $pdo->prepare(
            'SELECT p.id FROM team_members tm
             JOIN players p ON tm.player_id = p.id
             WHERE tm.team_id = ?
             ORDER BY tm.player_id ASC'
        );
        $stmt->execute([$teamId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Recreates matchups for any unplayed regular season weeks
     * to attempt to balance the schedule with the current roster.
     *
     * @param int $leagueId
     * @return bool Success
     */
    public function updateSeason(int $leagueId): bool {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();
            
            // 1. Fetch league details directly
            $stmt = $pdo->prepare('SELECT status, rounds_per_game, matchups_per_round, participation_type FROM leagues WHERE id = ?');
            $stmt->execute([$leagueId]);
            $league = $stmt->fetch();
            if (!$league) {
                throw new \Exception("League not found.");
            }
            if ($league['status'] !== 'active') {
                throw new \Exception("League must be active to update the season schedule.");
            }
            
            // Total matchups per game = rounds × matchups_per_round
            // e.g. baseball: 2 innings × 2 sides = 4 matchup rows
            $rounds = (int)($league['rounds_per_game'] ?? 2);
            $matchupsPerRound = (int)($league['matchups_per_round'] ?? 2);
            $isTeam = ($league['participation_type'] ?? 'individual') === 'team';
            
            // Fetch roster / participants
            if ($isTeam) {
                $stmt = $pdo->prepare(
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
                $stmt = $pdo->prepare(
                    'SELECT p.id, p.player_name 
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
            
            // Fetch assigned locations for the league
            $llStmt = $pdo->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
            $llStmt->execute([$leagueId]);
            $assignedLocationIds = $llStmt->fetchAll(PDO::FETCH_COLUMN);

            // Fetch machine IDs grouped by location
            $lmStmt = $pdo->query('SELECT location_id, machine_id FROM location_machines');
            $machinesByLocation = [];
            foreach ($lmStmt->fetchAll() as $row) {
                $machinesByLocation[(int)$row['location_id']][] = (int)$row['machine_id'];
            }

            // Fetch all available machines
            $machinesStmt = $pdo->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception("No machines found in database. Please register machines first.");
            }
            
            // 2. Classify events as played or unplayed
            $stmt = $pdo->prepare('SELECT id, event_name, event_date FROM events WHERE league_id = ?');
            $stmt->execute([$leagueId]);
            $events = $stmt->fetchAll();
            
            // Filter to only regular season weeks (ignore Playoffs)
            $regSeasonEvents = array_filter($events, function($e) {
                return !str_starts_with($e['event_name'] ?? '', 'Playoffs:');
            });
            
            if (empty($regSeasonEvents)) {
                throw new \Exception("No regular season events found.");
            }
            
            // Determine which weeks are unplayed
            $playedMap = [];
            foreach ($regSeasonEvents as $event) {
                $eventId = (int)$event['id'];
                // Check if any matchups for this event are completed AND not a BYE (player2_id is NOT NULL)
                $checkStmt = $pdo->prepare(
                    "SELECT COUNT(*) FROM event_matchups 
                     WHERE event_id = ? AND status = 'completed' AND player2_id IS NOT NULL"
                );
                $checkStmt->execute([$eventId]);
                $completedCount = (int)$checkStmt->fetchColumn();
                $playedMap[$eventId] = ($completedCount > 0);
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
                throw new \Exception("All weeks have already been played. Cannot update the season.");
            }
            
            // 3. Prepare new Round-Robin schedule using CURRENT roster
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
                    if ($home === null && $away !== null) {
                        $home = $away;
                        $away = null;
                    }
                    if ($home !== null) {
                        if ($round % 2 === 0) {
                            $pairings[] = ['home' => $home, 'away' => $away];
                        } else {
                            if ($away !== null) {
                                $pairings[] = ['home' => $away, 'away' => $home];
                            } else {
                                // BYE on odd round: keep original order to avoid null home
                                $pairings[] = ['home' => $home, 'away' => $away];
                            }
                        }
                    }
                }
                $pairingsByRound[$round] = $pairings;
                
                // Rotate the list (circle method)
                $first = array_shift($list);
                array_unshift($list, array_pop($list));
                array_unshift($list, $first);
            }
            
            // 4. Update the unplayed weeks
            // To align week numbers with the round robin, we sort regSeasonEvents by date / creation order
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
                
                // If it was already played, do not touch it
                if ($playedMap[$eventId]) {
                    continue;
                }
                
                // Delete existing matchups for this unplayed week
                $pdo->prepare('DELETE FROM matchups WHERE event_matchup_id IN (SELECT id FROM event_matchups WHERE event_id = ?)')->execute([$eventId]);
                $pdo->prepare('DELETE FROM event_matchups WHERE event_id = ?')->execute([$eventId]);
                
                // Get new pairings for this week (using the weekNum)
                $pairings = $pairingsByRound[($weekNum - 1) % $roundsCount];
                foreach ($pairings as $pair) {
                    $homePlayer = $pair['home'];
                    $awayPlayer = $pair['away'];
                    
                    if ($awayPlayer === null) {
                        // BYE Week matchup
                        $stmt = $pdo->prepare(
                            "INSERT INTO event_matchups (event_id, player1_id, player2_id, player1_score, player2_score, winner_id, status, game_number)
                             VALUES (?, ?, NULL, 0, 0, NULL, 'completed', 1)"
                        );
                        $stmt->execute([$eventId, $homePlayer['id']]);
                    } else {
                        // Determine the machine pool for this matchup
                        $matchupMachineIds = $allMachineIds;
                        if (!empty($assignedLocationIds)) {
                            $chosenLocId = (int)$assignedLocationIds[array_rand($assignedLocationIds)];
                            if (!empty($machinesByLocation[$chosenLocId])) {
                                $matchupMachineIds = $machinesByLocation[$chosenLocId];
                            }
                        }

                        if ($isTeam) {
                            // Team baseball: 1 event_matchup per half-inning
                            $homeTeamMembers = $this->getTeamMembers($pdo, $homePlayer['id']);
                            $awayTeamMembers = $this->getTeamMembers($pdo, $awayPlayer['id']);
                            $homeTeamSize = count($homeTeamMembers);
                            $awayTeamSize = count($awayTeamMembers);

                            for ($inning = 1; $inning <= $rounds; $inning++) {
                                // Top half: Away team bats, Home team pitches
                                $topMatchupStmt = $pdo->prepare(
                                    'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number, round_name)
                                     VALUES (?, ?, ?, \'pending\', ?, ?)'
                                );
                                $topMatchupStmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id'], $inning, "Top $inning"]);
                                $topMatchupId = (int)$pdo->lastInsertId();

                                $halfInningNum = ($inning - 1) * 2;
                                $startIdx = $halfInningNum % max($awayTeamSize, 1);
                                $awayBatters = [];
                                for ($b = 0; $b < $matchupsPerRound; $b++) {
                                    $idx = ($startIdx + $b) % $awayTeamSize;
                                    $awayBatters[] = $awayTeamMembers[$idx]['id'];
                                }
                                $topMachines = MatchupGenerator::selectMachines($matchupMachineIds, $matchupsPerRound);
                                MatchupGenerator::createMatchupSlots(
                                    $pdo, $topMatchupId,
                                    1, $matchupsPerRound, $topMachines, $awayBatters
                                );

                                // Bottom half: Home team bats, Away team pitches
                                $bottomMatchupStmt = $pdo->prepare(
                                    'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number, round_name)
                                     VALUES (?, ?, ?, \'pending\', ?, ?)'
                                );
                                $bottomMatchupStmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id'], $inning, "Bottom $inning"]);
                                $bottomMatchupId = (int)$pdo->lastInsertId();

                                $halfInningNum = ($inning - 1) * 2 + 1;
                                $startIdx = $halfInningNum % max($homeTeamSize, 1);
                                $homeBatters = [];
                                for ($b = 0; $b < $matchupsPerRound; $b++) {
                                    $idx = ($startIdx + $b) % $homeTeamSize;
                                    $homeBatters[] = $homeTeamMembers[$idx]['id'];
                                }
                                $bottomMachines = MatchupGenerator::selectMachines($matchupMachineIds, $matchupsPerRound);
                                MatchupGenerator::createMatchupSlots(
                                    $pdo, $bottomMatchupId,
                                    1, $matchupsPerRound, $bottomMachines, $homeBatters
                                );
                            }
                        } else {
                            // Individual baseball: existing logic
                            $stmt = $pdo->prepare(
                                "INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number)
                                 VALUES (?, ?, ?, 'pending', 1)"
                            );
                            $stmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id']]);
                            $eventMatchupId = (int)$pdo->lastInsertId();

                            MatchupGenerator::createMatchupSlots(
                                $pdo, $eventMatchupId,
                                $rounds, $matchupsPerRound, $matchupMachineIds
                            );
                        }
                    }
                }
            }

            $pdo->commit();
            return true;
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
