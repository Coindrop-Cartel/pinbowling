<?php

namespace App\Service;

use PDO;

/**
 * Service managing leagues, seasons, events, rosters, and event schedules/fixtures.
 */
class LeagueService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Get all leagues, optionally filtered by type.
     * NOTE: This is used internally by getAllLeaguesWithDetails(). External callers
     * should prefer that method to get events, players, and teams in a single pass.
     *
     * @param string|null $type Optional type filter ('session', 'standard', etc)
     * @return array
     */
    public function getAllLeagues(?string $type = null): array {
        $pdo = $this->db->getPdo();
        
        $sql = 'SELECT * FROM leagues';
        if ($type) {
            $sql .= ' WHERE type = ?';
        }
        $sql .= ' ORDER BY start_date DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute($type ? [$type] : []);
        return $stmt->fetchAll();
    }

    /**
     * Get a complete league with events, players, and teams.
     *
     * @param int $leagueId
     * @return array|false League with nested data or false if not found
     */
    public function getLeague(int $leagueId) {
        $pdo = $this->db->getPdo();
        
        $stmt = $pdo->prepare('SELECT * FROM leagues WHERE id = ?');
        $stmt->execute([$leagueId]);
        $league = $stmt->fetch();
        
        if (!$league) {
            return false;
        }

        // Fetch events
        $stmt = $pdo->prepare(
            'SELECT e.*, l.name as location_name 
             FROM events e 
             LEFT JOIN locations l ON e.location_id = l.id 
             WHERE e.league_id = ? 
             ORDER BY e.event_date ASC'
        );
        $stmt->execute([$leagueId]);
        $league['events'] = $stmt->fetchAll();

        // Fetch event matchups
        $stmt = $pdo->prepare(
            'SELECT em.*, 
                    p1.player_name as home_player_name, 
                    p2.player_name as away_player_name,
                    w.player_name as winner_name
             FROM event_matchups em
             JOIN players p1 ON em.home_player_id = p1.id
             LEFT JOIN players p2 ON em.away_player_id = p2.id
             LEFT JOIN players w ON em.winner_id = w.id
             WHERE em.event_id IN (SELECT id FROM events WHERE league_id = ?)
             ORDER BY em.id ASC'
        );
        $stmt->execute([$leagueId]);
        $matchups = $stmt->fetchAll();
        
        $matchupsByEvent = [];
        foreach ($matchups as $m) {
            $matchupsByEvent[(int)$m['event_id']][] = $m;
        }
        
        foreach ($league['events'] as &$event) {
            $event['matchups'] = $matchupsByEvent[(int)$event['id']] ?? [];
        }

        // Fetch players
        $stmt = $pdo->prepare(
            'SELECT p.id, p.player_name as playerName, p.ifpa_id as ifpaId, u.id as user_id 
             FROM players p 
             JOIN league_players lp ON p.id = lp.player_id 
             LEFT JOIN users u ON p.id = u.player_id 
             WHERE lp.league_id = ? 
             ORDER BY p.player_name ASC'
        );
        $stmt->execute([$leagueId]);
        $league['players'] = $stmt->fetchAll();

        // Fetch teams with members
        $stmt = $pdo->prepare(
            'SELECT t.*, 
                    GROUP_CONCAT(p.id, ":", p.player_name SEPARATOR "|") as member_data
             FROM teams t
             JOIN league_teams lt ON t.id = lt.team_id
             LEFT JOIN team_members tm ON t.id = tm.team_id
             LEFT JOIN players p ON tm.player_id = p.id
             WHERE lt.league_id = ?
             GROUP BY t.id'
        );
        $stmt->execute([$leagueId]);
        $teams = $stmt->fetchAll();
        
        foreach ($teams as &$t) {
            $t['members'] = $this->parseTeamMembers($t['member_data'] ?? '');
        }
        $league['teams'] = $teams;

        return $league;
    }

    /**
     * Get all events, optionally for a specific league.
     *
     * @param int|null $leagueId
     * @return array
     */
    public function getAllEvents(?int $leagueId = null): array {
        $pdo = $this->db->getPdo();
        $sql = 'SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id';
        if ($leagueId) {
            $sql .= ' WHERE e.league_id = ?';
        }
        $sql .= ' ORDER BY e.event_date ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($leagueId ? [$leagueId] : []);
        return $stmt->fetchAll();
    }

    /**
     * Get all leagues with nested events, players, and teams in bulk (avoids N+1).
     *
     * @param string|null $type
     * @return array
     */
    public function getAllLeaguesWithDetails(?string $type = null): array {
        $pdo = $this->db->getPdo();

        $sql = 'SELECT * FROM leagues';
        if ($type) $sql .= ' WHERE type = ?';
        $sql .= ' ORDER BY start_date DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($type ? [$type] : []);
        $leagues = $stmt->fetchAll();

        $emStmt = $pdo->query(
            'SELECT em.*, 
                    p1.player_name as home_player_name, 
                    p2.player_name as away_player_name,
                    w.player_name as winner_name
             FROM event_matchups em
             JOIN players p1 ON em.home_player_id = p1.id
             LEFT JOIN players p2 ON em.away_player_id = p2.id
             LEFT JOIN players w ON em.winner_id = w.id
             ORDER BY em.id ASC'
        );
        $matchupsByEvent = [];
        foreach ($emStmt->fetchAll() as $em) {
            $matchupsByEvent[(int)$em['event_id']][] = $em;
        }

        $allEvents = $this->getAllEvents();
        $eventsByLeague = [];
        foreach ($allEvents as $event) {
            $event['matchups'] = $matchupsByEvent[(int)$event['id']] ?? [];
            $eventsByLeague[(int)$event['league_id']][] = $event;
        }

        $lpStmt = $pdo->query(
            'SELECT lp.league_id, p.id, p.player_name as playerName, p.ifpa_id as ifpaId, u.id as user_id
             FROM players p
             JOIN league_players lp ON p.id = lp.player_id
             LEFT JOIN users u ON p.id = u.player_id
             ORDER BY p.player_name ASC'
        );
        $playersByLeague = [];
        foreach ($lpStmt->fetchAll() as $lp) {
            $playersByLeague[(int)$lp['league_id']][] = $lp;
        }

        $ltStmt = $pdo->query(
            'SELECT lt.league_id, t.*,
                    GROUP_CONCAT(p.id, ":", p.player_name SEPARATOR "|") as member_data
             FROM teams t
             JOIN league_teams lt ON t.id = lt.team_id
             LEFT JOIN team_members tm ON t.id = tm.team_id
             LEFT JOIN players p ON tm.player_id = p.id
             GROUP BY lt.league_id, t.id
             ORDER BY t.name ASC'
        );
        $teamsByLeague = [];
        foreach ($ltStmt->fetchAll() as $lt) {
            $lt['members'] = $this->parseTeamMembers($lt['member_data'] ?? '');
            $teamsByLeague[(int)$lt['league_id']][] = $lt;
        }

        foreach ($leagues as &$league) {
            $id = (int)$league['id'];
            $league['events']  = $eventsByLeague[$id]  ?? [];
            $league['players'] = $playersByLeague[$id] ?? [];
            $league['teams']   = $teamsByLeague[$id]   ?? [];
        }

        return $leagues;
    }

    /**
     * Get the type and scoring_format of a league.
     *
     * @param int $leagueId
     * @return array|false ['type' => ..., 'scoring_format' => ...] or false
     */
    public function getLeagueMeta(int $leagueId) {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('SELECT type, scoring_format FROM leagues WHERE id = ?');
        $stmt->execute([$leagueId]);
        return $stmt->fetch();
    }

    /**
     * Get the user_id linked to a player (null if unregistered).
     *
     * @param int $playerId
     * @return int|null
     */
    public function getPlayerUserId(int $playerId): ?int {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('SELECT u.id FROM players p JOIN users u ON p.id = u.player_id WHERE p.id = ?');
        $stmt->execute([$playerId]);
        $result = $stmt->fetchColumn();
        return ($result !== false) ? (int)$result : null;
    }

    /**
     * Count the number of players currently in a league.
     *
     * @param int $leagueId
     * @return int
     */
    public function getLeaguePlayerCount(int $leagueId): int {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM league_players WHERE league_id = ?');
        $stmt->execute([$leagueId]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Create a new league.
     *
     * @param string $name
     * @param string|null $startDate
     * @param string $type
     * @param string $participants
     * @param string $scoringFormat
     * @param string $seasonScoring
     * @param int $dropLowestWeeks
     * @param int|null $weeksInSeason
     * @param int $inningsPerGame
     * @return array Created league data
     */
    public function createLeague(
        string $name,
        ?string $startDate = null,
        string $type = 'standard',
        string $participants = 'individual',
        string $scoringFormat = 'bowling',
        string $seasonScoring = 'weekly',
        int $dropLowestWeeks = 0,
        ?int $weeksInSeason = null,
        int $inningsPerGame = 2
    ): array {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare(
            'INSERT INTO leagues (name, start_date, type, participants, scoring_format, season_scoring, drop_lowest_weeks, weeks_in_season, innings_per_game)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$name, $startDate, $type, $participants, $scoringFormat, $seasonScoring, $dropLowestWeeks, $weeksInSeason, $inningsPerGame]);
        return $this->getLeague((int)$pdo->lastInsertId());
    }

    /**
     * Update an existing league.
     *
     * @param int $leagueId
     * @param string $name
     * @param string|null $startDate
     * @param string $participants
     * @param string $scoringFormat
     * @param string $seasonScoring
     * @param int $dropLowestWeeks
     * @param int|null $weeksInSeason
     * @param int $inningsPerGame
     * @return array Updated league data
     */
    public function updateLeague(
        int $leagueId,
        string $name,
        ?string $startDate = null,
        string $participants = 'individual',
        string $scoringFormat = 'bowling',
        string $seasonScoring = 'weekly',
        int $dropLowestWeeks = 0,
        ?int $weeksInSeason = null,
        int $inningsPerGame = 2
    ): array {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare(
            'UPDATE leagues SET name = ?, start_date = ?, participants = ?, scoring_format = ?, season_scoring = ?, drop_lowest_weeks = ?, weeks_in_season = ?, innings_per_game = ? WHERE id = ?'
        );
        $stmt->execute([$name, $startDate, $participants, $scoringFormat, $seasonScoring, $dropLowestWeeks, $weeksInSeason, $inningsPerGame, $leagueId]);
        return $this->getLeague($leagueId);
    }

    /**
     * Delete a league and all associated data.
     *
     * @param int $leagueId
     * @return bool Success
     */
    public function deleteLeague(int $leagueId): bool {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

            // Fetch and delete all events associated with this league
            $stmt = $pdo->prepare("SELECT id FROM events WHERE league_id = ?");
            $stmt->execute([$leagueId]);
            $eventIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

            foreach ($eventIds as $eventId) {
                $this->deleteEvent((int)$eventId);
            }

            // Clean up league associations
            $pdo->prepare("DELETE FROM league_players WHERE league_id = ?")->execute([$leagueId]);
            $pdo->prepare("DELETE FROM league_teams WHERE league_id = ?")->execute([$leagueId]);
            $pdo->prepare("DELETE FROM league_staff WHERE league_id = ?")->execute([$leagueId]);

            // Finally delete the league
            $stmt = $pdo->prepare("DELETE FROM leagues WHERE id = ?");
            $result = $stmt->execute([$leagueId]);

            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            $pdo->commit();
            return $result;
        } catch (\PDOException $e) {
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw new \Exception("Failed to delete league {$leagueId}: " . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Add a player to a league.
     *
     * @param int $leagueId
     * @param int $playerId
     * @return bool Success
     */
    public function addPlayerToLeague(int $leagueId, int $playerId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('INSERT IGNORE INTO league_players (league_id, player_id) VALUES (?, ?)');
        return $stmt->execute([$leagueId, $playerId]);
    }

    /**
     * Remove a player from a league, including their scores for all events in that league.
     *
     * @param int $leagueId
     * @param int $playerId
     * @return bool Success
     */
    public function removePlayerFromLeague(int $leagueId, int $playerId): bool {
        $pdo = $this->db->getPdo();
        $pdo->prepare('DELETE FROM scores WHERE player_id = ? AND event_id IN (SELECT id FROM events WHERE league_id = ?)')
            ->execute([$playerId, $leagueId]);
        $stmt = $pdo->prepare('DELETE FROM league_players WHERE league_id = ? AND player_id = ?');
        return $stmt->execute([$leagueId, $playerId]);
    }

    /**
     * Create a new event for a league.
     *
     * @param int $leagueId
     * @param string $eventName
     * @param string|null $eventDate
     * @param int|null $locationId
     * @param string|null $scoringFormat  If null, inherits from the league.
     * @return array Created event row
     */
    public function createEvent(int $leagueId, string $eventName, ?string $eventDate = null, ?int $locationId = null, ?string $scoringFormat = null): array {
        $pdo = $this->db->getPdo();
        if (!$scoringFormat) {
            $meta = $this->getLeagueMeta($leagueId);
            $scoringFormat = $meta['scoring_format'] ?? 'bowling';
        }
        $stmt = $pdo->prepare(
            'INSERT INTO events (league_id, location_id, event_name, event_date, scoring_format) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$leagueId, $locationId, $eventName, $eventDate, $scoringFormat]);
        return $this->getEvent((int)$pdo->lastInsertId());
    }

    /**
     * Get a single event by id.
     *
     * @param int $eventId
     * @return array|false
     */
    public function getEvent(int $eventId) {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare(
            'SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id WHERE e.id = ?'
        );
        $stmt->execute([$eventId]);
        return $stmt->fetch();
    }

    /**
     * Update an existing event.
     *
     * @param int $eventId
     * @param string|null $eventName
     * @param string|null $eventDate
     * @param int|null $locationId
     * @param string $scoringFormat
     * @return array|false Updated event row
     */
    public function updateEvent(int $eventId, ?string $eventName = null, ?string $eventDate = null, ?int $locationId = null, string $scoringFormat = 'bowling') {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare(
            'UPDATE events SET location_id = ?, event_name = ?, event_date = ?, scoring_format = ? WHERE id = ?'
        );
        $stmt->execute([$locationId, $eventName, $eventDate, $scoringFormat, $eventId]);
        return $this->getEvent($eventId);
    }

    /**
     * Delete a single event and its associated matchups, scores, and target scores.
     *
     * @param int $eventId
     * @return bool
     */
    public function deleteEvent(int $eventId): bool {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
            
            $pdo->prepare('DELETE FROM matchups WHERE event_id = ?')->execute([$eventId]);
            $pdo->prepare('DELETE FROM event_matchups WHERE event_id = ?')->execute([$eventId]);
            $pdo->prepare('DELETE FROM scores WHERE event_id = ?')->execute([$eventId]);
            $pdo->prepare('DELETE FROM target_scores WHERE event_id = ?')->execute([$eventId]);

            $stmt = $pdo->prepare('DELETE FROM events WHERE id = ?');
            $result = $stmt->execute([$eventId]);
            
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            return $result;
        } catch (\PDOException $e) {
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            throw new \Exception("Failed to delete event {$eventId}: " . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Check whether an event exists and return its league_id, or false.
     *
     * @param int $eventId
     * @return int|false
     */
    public function getEventLeagueId(int $eventId) {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('SELECT league_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $result = $stmt->fetchColumn();
        return ($result !== false) ? (int)$result : false;
    }

    /**
     * Helper to parse team member data from GROUP_CONCAT.
     *
     * @param string $memberData
     * @return array
     */
    private function parseTeamMembers(string $memberData): array {
        if (!$memberData) {
            return [];
        }
        
        return array_filter(array_map(function($m) {
            $parts = explode(":", $m);
            return count($parts) === 2 ? ['id' => (int)$parts[0], 'playerName' => $parts[1]] : null;
        }, explode("|", $memberData)));
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
            
            // 1. Fetch league details
            $league = $this->getLeague($leagueId);
            if (!$league) {
                throw new \Exception("League not found.");
            }
            if ($league['status'] !== 'setup') {
                throw new \Exception("Season has already been started or is completed.");
            }
            
            $weeksInSeason = (int)($league['weeks_in_season'] ?? $league['weeksInSeason'] ?? 0);
            if ($weeksInSeason <= 0) {
                throw new \Exception("Weeks in season must be greater than 0.");
            }
            
            $inningsPerGame = (int)($league['innings_per_game'] ?? $league['inningsPerGame'] ?? 2);
            $players = $league['players'] ?? [];
            if (count($players) < 2) {
                throw new \Exception("At least 2 players are required to start a head-to-head season.");
            }
            
            // 2. Fetch all available machines
            $machinesStmt = $pdo->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(\PDO::FETCH_COLUMN);
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
            $startDate = $league['startDate'] ?: date('Y-m-d');
            for ($w = 1; $w <= $weeksInSeason; $w++) {
                // Calculate week date (7 days per week)
                $eventDate = date('Y-m-d', strtotime($startDate . " + " . (($w - 1) * 7) . " days"));
                
                // Create Weekly Event
                $event = $this->createEvent($leagueId, "Week " . $w, $eventDate, null, 'baseball');
                $eventId = (int)$event['id'];
                
                // Get matchups for this week
                $pairings = $pairingsByRound[($w - 1) % $roundsCount];
                foreach ($pairings as $pair) {
                    $homePlayer = $pair['home'];
                    $awayPlayer = $pair['away'];
                    
                    if ($awayPlayer === null) {
                        // BYE Week matchup
                        $stmt = $pdo->prepare(
                            'INSERT INTO event_matchups (event_id, home_player_id, away_player_id, home_runs, away_runs, winner_id, status, game_number)
                             VALUES (?, ?, NULL, 0, 0, NULL, \'completed\', 1)'
                        );
                        $stmt->execute([$eventId, $homePlayer['id']]);
                    } else {
                        // Normal pending matchup
                        $stmt = $pdo->prepare(
                            'INSERT INTO event_matchups (event_id, home_player_id, away_player_id, status, game_number)
                             VALUES (?, ?, ?, \'pending\', 1)'
                        );
                        $stmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id']]);
                        $eventMatchupId = (int)$pdo->lastInsertId();
                        
                        // Select random machines for this matchup
                        $neededMachines = $inningsPerGame * 2;
                        $matchupMachines = [];
                        $shuffledMachines = $allMachineIds;
                        shuffle($shuffledMachines);
                        while (count($matchupMachines) < $neededMachines) {
                            foreach ($shuffledMachines as $mId) {
                                $matchupMachines[] = $mId;
                                if (count($matchupMachines) >= $neededMachines) {
                                    break;
                                }
                            }
                        }
                        
                        // Populate matchups detailed innings
                        $matchupStmt = $pdo->prepare(
                            'INSERT INTO matchups (event_id, event_matchup_id, order_number, player_id, machine_id, player_order)
                             VALUES (?, ?, ?, ?, ?, ?)'
                        );
                        
                        for ($inning = 1; $inning <= $inningsPerGame; $inning++) {
                            $topMachineId = $matchupMachines[($inning - 1) * 2];
                            $matchupStmt->execute([
                                $eventId,
                                $eventMatchupId,
                                $inning,
                                $homePlayer['id'],
                                $topMachineId,
                                1
                            ]);
                            
                            $bottomMachineId = $matchupMachines[($inning - 1) * 2 + 1];
                            $matchupStmt->execute([
                                $eventId,
                                $eventMatchupId,
                                $inning,
                                $awayPlayer['id'],
                                $bottomMachineId,
                                2
                            ]);
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
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
            
            // 1. Fetch league details
            $league = $this->getLeague($leagueId);
            if (!$league) {
                throw new \Exception("League not found.");
            }
            if ($league['status'] !== 'active') {
                throw new \Exception("League must be active to update the season schedule.");
            }
            
            $inningsPerGame = (int)($league['innings_per_game'] ?? $league['inningsPerGame'] ?? 2);
            $players = $league['players'] ?? [];
            if (count($players) < 2) {
                throw new \Exception("At least 2 players are required to update a head-to-head season.");
            }
            
            // Fetch all available machines
            $machinesStmt = $pdo->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(\PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception("No machines found in database. Please register machines first.");
            }
            
            // 2. Classify events as played or unplayed
            $events = $league['events'] ?? [];
            // Filter to only regular season weeks (ignore Playoffs)
            $regSeasonEvents = array_filter($events, function($e) {
                return !str_starts_with($e['eventName'] ?? '', 'Playoffs:');
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
                     WHERE event_id = ? AND status = 'completed' AND away_player_id IS NOT NULL"
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
                $dateA = $a['eventDate'] ?? '';
                $dateB = $b['eventDate'] ?? '';
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
                $pdo->prepare('DELETE FROM matchups WHERE event_id = ?')->execute([$eventId]);
                $pdo->prepare('DELETE FROM event_matchups WHERE event_id = ?')->execute([$eventId]);
                
                // Get new pairings for this week (using the weekNum)
                $pairings = $pairingsByRound[($weekNum - 1) % $roundsCount];
                foreach ($pairings as $pair) {
                    $homePlayer = $pair['home'];
                    $awayPlayer = $pair['away'];
                    
                    if ($awayPlayer === null) {
                        // BYE Week matchup
                        $stmt = $pdo->prepare(
                            "INSERT INTO event_matchups (event_id, home_player_id, away_player_id, home_runs, away_runs, winner_id, status, game_number)
                             VALUES (?, ?, NULL, 0, 0, NULL, 'completed', 1)"
                        );
                        $stmt->execute([$eventId, $homePlayer['id']]);
                    } else {
                        // Normal pending matchup
                        $stmt = $pdo->prepare(
                            "INSERT INTO event_matchups (event_id, home_player_id, away_player_id, status, game_number)
                             VALUES (?, ?, ?, 'pending', 1)"
                        );
                        $stmt->execute([$eventId, $homePlayer['id'], $awayPlayer['id']]);
                        $eventMatchupId = (int)$pdo->lastInsertId();
                        
                        // Select random machines for this matchup
                        $neededMachines = $inningsPerGame * 2;
                        $matchupMachines = [];
                        $shuffledMachines = $allMachineIds;
                        shuffle($shuffledMachines);
                        while (count($matchupMachines) < $neededMachines) {
                            foreach ($shuffledMachines as $mId) {
                                $matchupMachines[] = $mId;
                                if (count($matchupMachines) >= $neededMachines) {
                                    break;
                                }
                            }
                        }
                        
                        // Populate matchups detailed innings
                        $matchupStmt = $pdo->prepare(
                            "INSERT INTO matchups (event_id, event_matchup_id, order_number, player_id, machine_id, player_order)
                             VALUES (?, ?, ?, ?, ?, ?)"
                        );
                        
                        for ($inning = 1; $inning <= $inningsPerGame; $inning++) {
                            $topMachineId = $matchupMachines[($inning - 1) * 2];
                            $matchupStmt->execute([
                                $eventId,
                                $eventMatchupId,
                                $inning,
                                $homePlayer['id'],
                                $topMachineId,
                                1
                            ]);
                            
                            $bottomMachineId = $matchupMachines[($inning - 1) * 2 + 1];
                            $matchupStmt->execute([
                                $eventId,
                                $eventMatchupId,
                                $inning,
                                $awayPlayer['id'],
                                $bottomMachineId,
                                2
                            ]);
                        }
                    }
                }
            }
            
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            $pdo->commit();
            return true;
        } catch (\Exception $e) {
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Start the postseason playoffs for a league.
     *
     * @param int $leagueId
     * @param array $seeds Sorted list of player IDs (Index 0 is Seed 1, etc.)
     * @param int $seriesLength 1, 3, or 5
     * @return bool Success
     */
    public function startPlayoffs(int $leagueId, array $seeds, int $seriesLength): bool {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();
            
            $league = $this->getLeague($leagueId);
            if (!$league) {
                throw new \Exception("League not found.");
            }
            
            $qualifierCount = count($seeds);
            if ($qualifierCount !== 2 && $qualifierCount !== 4 && $qualifierCount !== 8) {
                throw new \Exception("Qualifiers count must be 2, 4, or 8.");
            }
            
            if ($seriesLength !== 1 && $seriesLength !== 3 && $seriesLength !== 5) {
                throw new \Exception("Series length must be 1, 3, or 5.");
            }
            
            $roundName = '';
            if ($qualifierCount === 8) {
                $roundName = 'Quarterfinals';
            } elseif ($qualifierCount === 4) {
                $roundName = 'Semifinals';
            } else {
                $roundName = 'Finals';
            }
            
            // 1. Create a Playoffs Event for this round
            $event = $this->createEvent($leagueId, "Playoffs: " . $roundName, null, null, 'baseball');
            $eventId = (int)$event['id'];
            
            // 2. Fetch all available machines
            $machinesStmt = $pdo->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(\PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception("No machines found in database.");
            }
            
            $inningsPerGame = (int)($league['innings_per_game'] ?? $league['inningsPerGame'] ?? 2);
            
            // 3. Generate seed pairings
            $pairings = [];
            if ($qualifierCount === 8) {
                $pairings[] = ['home' => $seeds[0], 'away' => $seeds[7], 'series_id' => 1];
                $pairings[] = ['home' => $seeds[3], 'away' => $seeds[4], 'series_id' => 2];
                $pairings[] = ['home' => $seeds[1], 'away' => $seeds[6], 'series_id' => 3];
                $pairings[] = ['home' => $seeds[2], 'away' => $seeds[5], 'series_id' => 4];
            } elseif ($qualifierCount === 4) {
                $pairings[] = ['home' => $seeds[0], 'away' => $seeds[3], 'series_id' => 1];
                $pairings[] = ['home' => $seeds[1], 'away' => $seeds[2], 'series_id' => 2];
            } else {
                $pairings[] = ['home' => $seeds[0], 'away' => $seeds[1], 'series_id' => 1];
            }
            
            // 4. Create Game 1 for each series
            foreach ($pairings as $pair) {
                $stmt = $pdo->prepare(
                    'INSERT INTO event_matchups (event_id, home_player_id, away_player_id, status, game_number, round_name, series_id)
                     VALUES (?, ?, ?, \'pending\', 1, ?, ?)'
                );
                $stmt->execute([$eventId, $pair['home'], $pair['away'], $roundName, $pair['series_id']]);
                $eventMatchupId = (int)$pdo->lastInsertId();
                
                $neededMachines = $inningsPerGame * 2;
                $matchupMachines = [];
                $shuffledMachines = $allMachineIds;
                shuffle($shuffledMachines);
                while (count($matchupMachines) < $neededMachines) {
                    foreach ($shuffledMachines as $mId) {
                        $matchupMachines[] = $mId;
                        if (count($matchupMachines) >= $neededMachines) {
                            break;
                        }
                    }
                }
                
                $matchupStmt = $pdo->prepare(
                    'INSERT INTO matchups (event_id, event_matchup_id, order_number, player_id, machine_id, player_order)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                
                for ($inning = 1; $inning <= $inningsPerGame; $inning++) {
                    $topMachineId = $matchupMachines[($inning - 1) * 2];
                    $matchupStmt->execute([
                        $eventId,
                        $eventMatchupId,
                        $inning,
                        $pair['home'],
                        $topMachineId,
                        1
                    ]);
                    
                    $bottomMachineId = $matchupMachines[($inning - 1) * 2 + 1];
                    $matchupStmt->execute([
                        $eventId,
                        $eventMatchupId,
                        $inning,
                        $pair['away'],
                        $bottomMachineId,
                        2
                    ]);
                }
            }
            
            // 5. Update league status and playoff series length
            $stmt = $pdo->prepare('UPDATE leagues SET status = \'active\', playoff_series_length = ? WHERE id = ?');
            $stmt->execute([$seriesLength, $leagueId]);
            
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
