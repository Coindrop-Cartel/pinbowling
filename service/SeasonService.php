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
            $stmt = $pdo->prepare('SELECT status, start_date, weeks_in_season, matchups_per_game FROM leagues WHERE id = ?');
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
            
            $inningsPerGame = (int)($league['matchups_per_game'] ?? 2);
            
            // Fetch roster
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
                        // Alternate home/away weekly to be fair
                        if ($round % 2 === 0) {
                            $pairings[] = ['home' => $home, 'away' => $away];
                        } else {
                            $pairings[] = ['home' => $away, 'away' => $home];
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
                        // Normal pending matchup
                        $stmt = $pdo->prepare(
                            'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number)
                             VALUES (?, ?, ?, \'pending\', 1)'
                        );
                        $stmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id']]);
                        $eventMatchupId = (int)$pdo->lastInsertId();
 
                        // Determine the machine pool for this matchup
                        $matchupMachineIds = $allMachineIds;
                        if (!empty($assignedLocationIds)) {
                            // Pick a random location from the assigned locations
                            $chosenLocId = (int)$assignedLocationIds[array_rand($assignedLocationIds)];
                            if (!empty($machinesByLocation[$chosenLocId])) {
                                $matchupMachineIds = $machinesByLocation[$chosenLocId];
                            }
                        }

                        MatchupGenerator::createInningSlots(
                            $pdo, $eventMatchupId,
                            $inningsPerGame, $matchupMachineIds
                        );
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
            $stmt = $pdo->prepare('SELECT status, matchups_per_game FROM leagues WHERE id = ?');
            $stmt->execute([$leagueId]);
            $league = $stmt->fetch();
            if (!$league) {
                throw new \Exception("League not found.");
            }
            if ($league['status'] !== 'active') {
                throw new \Exception("League must be active to update the season schedule.");
            }
            
            $inningsPerGame = (int)($league['matchups_per_game'] ?? 2);
            
            // Fetch roster
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
                // Check if any matchups for this event are completed AND not a BYE (away_player_id is NOT NULL)
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
                            $pairings[] = ['home' => $away, 'away' => $home];
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
                        // Normal pending matchup
                        $stmt = $pdo->prepare(
                            "INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number)
                             VALUES (?, ?, ?, 'pending', 1)"
                        );
                        $stmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id']]);
                        $eventMatchupId = (int)$pdo->lastInsertId();
 
                        // Determine the machine pool for this matchup
                        $matchupMachineIds = $allMachineIds;
                        if (!empty($assignedLocationIds)) {
                            // Pick a random location from the assigned locations
                            $chosenLocId = (int)$assignedLocationIds[array_rand($assignedLocationIds)];
                            if (!empty($machinesByLocation[$chosenLocId])) {
                                $matchupMachineIds = $machinesByLocation[$chosenLocId];
                            }
                        }

                        MatchupGenerator::createInningSlots(
                            $pdo, $eventMatchupId,
                            $inningsPerGame, $matchupMachineIds
                        );
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
