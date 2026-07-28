<?php

namespace App\Service;

use PDO;

/**
 * Service managing leagues, seasons, events, rosters, and event schedules/fixtures.
 * Acts as a coordinator/facade delegating to specialized sub-services.
 */
class LeagueService {
    private DatabaseService $db;
    private EventService $eventService;
    private RosterService $rosterService;
    private SeasonService $seasonService;
    private PlayoffService $playoffService;
    private TeamPlayoffService $teamPlayoffService;

    public function __construct(
        DatabaseService $db,
        EventService $eventService,
        RosterService $rosterService,
        SeasonService $seasonService,
        PlayoffService $playoffService,
        TeamPlayoffService $teamPlayoffService
    ) {
        $this->db = $db;
        $this->eventService = $eventService;
        $this->rosterService = $rosterService;
        $this->seasonService = $seasonService;
        $this->playoffService = $playoffService;
        $this->teamPlayoffService = $teamPlayoffService;
    }

    /**
     * Get all leagues.
     * NOTE: This is used internally by getAllLeaguesWithDetails(). External callers
     * should prefer that method to get events, players, and teams in a single pass.
     *
     * @return array
     */
    public function getAllLeagues(): array {
        $pdo = $this->db->getPdo();
        return $pdo->query('SELECT * FROM leagues ORDER BY start_date DESC')->fetchAll();
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
                    p1.player_name as player1_name,
                    p2.player_name as player2_name,
                    p3.player_name as player3_name,
                    p4.player_name as player4_name,
                    w.player_name as winner_name
             FROM event_matchups em
             JOIN events e ON em.event_id = e.id
             LEFT JOIN leagues l ON e.league_id = l.id
             LEFT JOIN players p1 ON em.player1_id = p1.id
             LEFT JOIN players p2 ON em.player2_id = p2.id
             LEFT JOIN players p3 ON em.player3_id = p3.id
             LEFT JOIN players p4 ON em.player4_id = p4.id
             LEFT JOIN players w ON em.player_winner_id = w.id
             WHERE em.event_id IN (SELECT id FROM events WHERE league_id = ?)
             ORDER BY em.id ASC'
        );
        $stmt->execute([$leagueId]);
        $matchups = $stmt->fetchAll();
        
        $matchupsByEvent = [];
        foreach ($matchups as $m) {
            $matchupsByEvent[(int)$m['event_id']][] = $m;
        }

        // Fetch team event matchups for team leagues
        $isTeam = ($league['participation_type'] ?? 'individual') === 'team';
        if ($isTeam) {
            $temStmt = $pdo->prepare(
                'SELECT tem.*,
                        t1.name as team1_name,
                        t2.name as team2_name
                 FROM team_event_matchups tem
                 LEFT JOIN teams t1 ON tem.team1_id = t1.id
                 LEFT JOIN teams t2 ON tem.team2_id = t2.id
                 WHERE tem.event_id IN (SELECT id FROM events WHERE league_id = ?)
                 ORDER BY tem.id ASC'
            );
            $temStmt->execute([$leagueId]);
            $allTems = $temStmt->fetchAll();
            error_log("[PinBowling DEBUG] LeagueService::getLeague — leagueId=$leagueId fetched " . count($allTems) . " team_event_matchups: " . json_encode(array_map(function($t) {
                return ['id' => $t['id'], 'eventId' => $t['event_id'], 'team1Id' => $t['team1_id'], 'team2Id' => $t['team2_id'], 'team1Score' => $t['team1_score'], 'team2Score' => $t['team2_score'], 'status' => $t['status']];
            }, $allTems)));
            foreach ($allTems as $tem) {
                $matchupsByEvent[(int)$tem['event_id']][] = $tem;
            }
        }
        
        foreach ($league['events'] as &$event) {
            $event['matchups'] = $matchupsByEvent[(int)$event['id']] ?? [];
        }

        // Fetch players (path depends on participation_type)
        if ($isTeam) {
            $stmt = $pdo->prepare(
                'SELECT DISTINCT p.id, p.player_name, p.ifpa_id, u.id as user_id 
                 FROM players p 
                 JOIN team_members tm ON p.id = tm.player_id
                 JOIN league_teams lt ON tm.team_id = lt.team_id
                 LEFT JOIN users u ON p.id = u.player_id 
                 WHERE lt.league_id = ? 
                 ORDER BY p.player_name ASC'
            );
            $stmt->execute([$leagueId]);
            $league['players'] = $stmt->fetchAll();
        } else {
            $stmt = $pdo->prepare(
                'SELECT DISTINCT p.id, p.player_name, p.ifpa_id, u.id as user_id 
                 FROM players p 
                 JOIN league_players lp ON p.id = lp.player_id
                 LEFT JOIN users u ON p.id = u.player_id 
                 WHERE lp.league_id = ? 
                 ORDER BY p.player_name ASC'
            );
            $stmt->execute([$leagueId]);
            $league['players'] = $stmt->fetchAll();
        }

        // Fetch teams with members (team leagues only)
        if ($isTeam) {
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
        } else {
            $league['teams'] = [];
        }

        // Fetch locations
        $stmt = $pdo->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
        $stmt->execute([$leagueId]);
        $league['location_ids'] = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

        return $league;
    }

    /**
     * Get all leagues with nested events, players, and teams in bulk (avoids N+1).
     *
     * @return array
     */
    public function getAllLeaguesWithDetails(): array {
        $pdo = $this->db->getPdo();

        $leagues = $pdo->query('SELECT * FROM leagues ORDER BY start_date DESC')->fetchAll();

        $emStmt = $pdo->query(
            'SELECT em.*, 
                    p1.player_name as player1_name,
                    p2.player_name as player2_name,
                    p3.player_name as player3_name,
                    p4.player_name as player4_name,
                    w.player_name as winner_name,
                    loc.name as location_name
             FROM event_matchups em
             JOIN events e ON em.event_id = e.id
             LEFT JOIN leagues l ON e.league_id = l.id
             LEFT JOIN locations loc ON COALESCE(em.location_id, e.location_id, (SELECT ll.location_id FROM league_locations ll WHERE ll.league_id = e.league_id LIMIT 1)) = loc.id
             LEFT JOIN players p1 ON em.player1_id = p1.id
             LEFT JOIN players p2 ON em.player2_id = p2.id
             LEFT JOIN players p3 ON em.player3_id = p3.id
             LEFT JOIN players p4 ON em.player4_id = p4.id
             LEFT JOIN players w ON em.player_winner_id = w.id
             ORDER BY em.id ASC'
        );
        $matchupsByEvent = [];
        foreach ($emStmt->fetchAll() as $em) {
            $matchupsByEvent[(int)$em['event_id']][] = $em;
        }

        // Fetch team event matchups for team leagues  
        $temStmt = $pdo->query(
            'SELECT tem.*,
                    t1.name as team1_name,
                    t2.name as team2_name
             FROM team_event_matchups tem
             LEFT JOIN teams t1 ON tem.team1_id = t1.id
             LEFT JOIN teams t2 ON tem.team2_id = t2.id
             ORDER BY tem.id ASC'
        );
        foreach ($temStmt->fetchAll() as $tem) {
            $matchupsByEvent[(int)$tem['event_id']][] = $tem;
        }

        $allEvents = $this->getAllEvents();
        $eventsByLeague = [];
        foreach ($allEvents as $event) {
            $event['matchups'] = $matchupsByEvent[(int)$event['id']] ?? [];
            $eventsByLeague[(int)$event['league_id']][] = $event;
        }

        // Players: union both paths — league_players for individual, team_members for team
        $lpStmt = $pdo->query(
            'SELECT lt.league_id, p.id, p.player_name, p.ifpa_id, u.id as user_id
             FROM players p
             JOIN team_members tm ON p.id = tm.player_id
             JOIN league_teams lt ON tm.team_id = lt.team_id
             LEFT JOIN users u ON p.id = u.player_id
             UNION
             SELECT lp.league_id, p.id, p.player_name, p.ifpa_id, u.id as user_id
             FROM players p
             JOIN league_players lp ON p.id = lp.player_id
             LEFT JOIN users u ON p.id = u.player_id
             ORDER BY player_name ASC'
        );
        $playersByLeague = [];
        foreach ($lpStmt->fetchAll() as $lp) {
            $playersByLeague[(int)$lp['league_id']][] = $lp;
        }

        // Teams: only for team-participation leagues
        $ltStmt = $pdo->query(
            'SELECT lt.league_id, t.*,
                    GROUP_CONCAT(p.id, ":", p.player_name SEPARATOR "|") as member_data
             FROM teams t
             JOIN league_teams lt ON t.id = lt.team_id
             JOIN leagues l ON lt.league_id = l.id
             LEFT JOIN team_members tm ON t.id = tm.team_id
             LEFT JOIN players p ON tm.player_id = p.id
             WHERE l.participation_type = \'team\'
             GROUP BY lt.league_id, t.id
             ORDER BY t.name ASC'
        );
        $teamsByLeague = [];
        foreach ($ltStmt->fetchAll() as $lt) {
            $lt['members'] = $this->parseTeamMembers($lt['member_data'] ?? '');
            $teamsByLeague[(int)$lt['league_id']][] = $lt;
        }

        $llStmt = $pdo->query('SELECT league_id, location_id FROM league_locations');
        $locationsByLeague = [];
        foreach ($llStmt->fetchAll() as $ll) {
            $locationsByLeague[(int)$ll['league_id']][] = (int)$ll['location_id'];
        }

        foreach ($leagues as &$league) {
            $id = (int)$league['id'];
            $league['events']  = $eventsByLeague[$id]  ?? [];
            $league['players'] = $playersByLeague[$id] ?? [];
            $league['teams']   = $teamsByLeague[$id]   ?? [];
            $league['location_ids'] = $locationsByLeague[$id] ?? [];
        }

        return $leagues;
    }

    /**
     * Get the scoring_format and participation_type of a league.
     *
     * @param int $leagueId
     * @return array|false or false
     */
    public function getLeagueMeta(int $leagueId) {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('SELECT scoring_format, participation_type FROM leagues WHERE id = ?');
        $stmt->execute([$leagueId]);
        return $stmt->fetch();
    }

    /**
     * Create a new league.
     *
     * @param string $name
     * @param string|null $startDate
     * @param string $competitionFormat
     * @param string $participationType
     * @param string $scoringFormat
     * @param string $seasonScoring
     * @param int $dropLowestWeeks
     * @param int|null $weeksInSeason
     * @param int|null $roundsPerGame
     * @param int|null $matchupsPerRound
     * @return array Created league data
     */
    public function createLeague(
        string $name,
        ?string $startDate = null,
        string $competitionFormat = 'group',
        string $participationType = 'individual',
        string $scoringFormat = 'bowling',
        string $seasonScoring = 'weekly',
        int $dropLowestWeeks = 0,
        ?int $weeksInSeason = null,
        ?int $roundsPerGame = null,
        ?int $matchupsPerRound = null,
        ?int $weeklyPoints = null,
        ?int $pointSpread = null,
        array $locationIds = [],
        int $dropLowestPlayerScores = 0
    ): array {
        if ($scoringFormat === 'baseball' && ($competitionFormat === 'group' || $competitionFormat === 'standard')) {
            throw new \InvalidArgumentException('Baseball scoring format is only supported for head-to-head competitions.');
        }

        if ($competitionFormat === 'head2head' || $competitionFormat === 'head_to_head' || $scoringFormat === 'baseball') {
            if ($weeksInSeason === null || $weeksInSeason <= 0) {
                throw new \InvalidArgumentException('Head-to-head competitions require weeksInSeason to be specified and greater than 0.');
            }
            if ($roundsPerGame === null || $roundsPerGame <= 0) $roundsPerGame = 2;
            if ($matchupsPerRound === null || $matchupsPerRound <= 0) $matchupsPerRound = 2;
        }

        $pdo = $this->db->getPdo();
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare(
                'INSERT INTO leagues (name, start_date, competition_format, participation_type, scoring_format, season_scoring, drop_lowest_weeks, drop_lowest_player_scores, weeks_in_season, rounds_per_game, matchups_per_round, weekly_points, point_spread)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$name, $startDate, $competitionFormat, $participationType, $scoringFormat, $seasonScoring, $dropLowestWeeks, $dropLowestPlayerScores, $weeksInSeason, $roundsPerGame, $matchupsPerRound, $weeklyPoints, $pointSpread]);
            $leagueId = (int)$pdo->lastInsertId();
            
            $this->syncLeagueLocations($pdo, $leagueId, $locationIds);
            
            $pdo->commit();
            return $this->getLeague($leagueId);
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Update an existing league.
     *
     * @param int $leagueId
     * @param string $name
     * @param string|null $startDate
     * @param string $competitionFormat
     * @param string $participationType
     * @param string $scoringFormat
     * @param string $seasonScoring
     * @param int $dropLowestWeeks
     * @param int|null $weeksInSeason
     * @param int|null $roundsPerGame
     * @param int|null $matchupsPerRound
     * @return array Updated league data
     */
    public function updateLeague(
        int $leagueId,
        string $name,
        ?string $startDate = null,
        string $competitionFormat = 'group',
        string $participationType = 'individual',
        string $scoringFormat = 'bowling',
        string $seasonScoring = 'weekly',
        int $dropLowestWeeks = 0,
        ?int $weeksInSeason = null,
        ?int $roundsPerGame = null,
        ?int $matchupsPerRound = null,
        ?int $weeklyPoints = null,
        ?int $pointSpread = null,
        array $locationIds = [],
        ?string $status = null,
        int $dropLowestPlayerScores = 0
    ): array {
        if ($scoringFormat === 'baseball' && ($competitionFormat === 'group' || $competitionFormat === 'standard')) {
            throw new \InvalidArgumentException('Baseball scoring format is only supported for head-to-head competitions.');
        }

        if ($competitionFormat === 'head2head' || $competitionFormat === 'head_to_head' || $scoringFormat === 'baseball') {
            if ($weeksInSeason === null || $weeksInSeason <= 0) {
                throw new \InvalidArgumentException('Head-to-head competitions require weeksInSeason to be specified and greater than 0.');
            }
            if ($roundsPerGame === null || $roundsPerGame <= 0) $roundsPerGame = 2;
            if ($matchupsPerRound === null || $matchupsPerRound <= 0) $matchupsPerRound = 2;
        }

        $pdo = $this->db->getPdo();
        try {
            $pdo->beginTransaction();

            $updateFields = 'SET name = ?, start_date = ?, competition_format = ?, participation_type = ?, scoring_format = ?, season_scoring = ?, drop_lowest_weeks = ?, drop_lowest_player_scores = ?, weeks_in_season = ?, rounds_per_game = ?, matchups_per_round = ?, weekly_points = ?, point_spread = ?';
            $updateParams = [$name, $startDate, $competitionFormat, $participationType, $scoringFormat, $seasonScoring, $dropLowestWeeks, $dropLowestPlayerScores, $weeksInSeason, $roundsPerGame, $matchupsPerRound, $weeklyPoints, $pointSpread];

            if ($status !== null) {
                $updateFields .= ', status = ?';
                $updateParams[] = $status;
            }

            $updateParams[] = $leagueId;
            $stmt = $pdo->prepare("UPDATE leagues {$updateFields} WHERE id = ?");
            $stmt->execute($updateParams);
            
            $this->syncLeagueLocations($pdo, $leagueId, $locationIds);
            
            // If the league is currently active, automatically update unplayed season weeks
            // to reflect updated locations, roster, or settings
            $checkStatusStmt = $pdo->prepare('SELECT status FROM leagues WHERE id = ?');
            $checkStatusStmt->execute([$leagueId]);
            if ($checkStatusStmt->fetchColumn() === 'active') {
                $this->seasonService->updateSeason($leagueId);
            }
            
            $pdo->commit();
            return $this->getLeague($leagueId);
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Update only the status of a league (archive/unarchive).
     *
     * @param int $leagueId
     * @param string $status
     * @return void
     */
    public function updateLeagueStatus(int $leagueId, string $status): void {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('UPDATE leagues SET status = ? WHERE id = ?');
        $stmt->execute([$status, $leagueId]);
    }

    /**
     * Get assigned location IDs for a league.
     *
     * @param int $leagueId
     * @return array
     */
    public function getLeagueLocations(int $leagueId): array {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
        $stmt->execute([$leagueId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    /**
     * Sync assigned locations for a league.
     */
    private function syncLeagueLocations(PDO $pdo, int $leagueId, array $locationIds): void {
        $stmt = $pdo->prepare('DELETE FROM league_locations WHERE league_id = ?');
        $stmt->execute([$leagueId]);
        if (!empty($locationIds)) {
            $stmt = $pdo->prepare('INSERT INTO league_locations (league_id, location_id) VALUES (?, ?)');
            foreach ($locationIds as $locId) {
                $stmt->execute([$leagueId, (int)$locId]);
            }
        }
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

            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

            // Fetch and delete all events associated with this league
            $stmt = $pdo->prepare("SELECT id FROM events WHERE league_id = ?");
            $stmt->execute([$leagueId]);
            $eventIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

            foreach ($eventIds as $eventId) {
                $this->deleteEvent((int)$eventId);
            }

            // Clean up league associations
            $pdo->prepare("DELETE FROM league_teams WHERE league_id = ?")->execute([$leagueId]);
            $pdo->prepare("DELETE FROM league_players WHERE league_id = ?")->execute([$leagueId]);
            $pdo->prepare("DELETE FROM league_staff WHERE league_id = ?")->execute([$leagueId]);
            $pdo->prepare("DELETE FROM league_locations WHERE league_id = ?")->execute([$leagueId]);

            // Finally delete the league
            $stmt = $pdo->prepare("DELETE FROM leagues WHERE id = ?");
            $result = $stmt->execute([$leagueId]);

            $pdo->commit();
            return $result;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw new \Exception("Failed to delete league {$leagueId}: " . $e->getMessage(), 0, $e);
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        }
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

    // ─── EventService Proxies ───────────────────────────────────────────

    public function getAllEvents(?int $leagueId = null): array {
        return $this->eventService->getAllEvents($leagueId);
    }

    public function getEvent(int $eventId) {
        return $this->eventService->getEvent($eventId);
    }

    public function createEvent(int $leagueId, string $eventName, ?string $eventDate = null, ?int $locationId = null, ?string $scoringFormat = null): array {
        return $this->eventService->createEvent($leagueId, $eventName, $eventDate, $locationId, $scoringFormat);
    }

    public function updateEvent(int $eventId, ?string $eventName = null, ?string $eventDate = null, ?int $locationId = null, string $scoringFormat = 'bowling') {
        return $this->eventService->updateEvent($eventId, $eventName, $eventDate, $locationId, $scoringFormat);
    }

    public function deleteEvent(int $eventId): bool {
        return $this->eventService->deleteEvent($eventId);
    }

    public function getEventLeagueId(int $eventId) {
        return $this->eventService->getEventLeagueId($eventId);
    }

    // ─── RosterService Proxies ──────────────────────────────────────────

    public function addPlayerToLeague(int $leagueId, int $playerId): bool {
        return $this->rosterService->addPlayerToLeague($leagueId, $playerId);
    }

    public function removePlayerFromLeague(int $leagueId, int $playerId): bool {
        return $this->rosterService->removePlayerFromLeague($leagueId, $playerId);
    }

    public function getLeaguePlayerCount(int $leagueId): int {
        return $this->rosterService->getLeaguePlayerCount($leagueId);
    }

    public function getPlayerUserId(int $playerId): ?int {
        return $this->rosterService->getPlayerUserId($playerId);
    }

    // ─── SeasonService Proxies ──────────────────────────────────────────

    public function startSeason(int $leagueId): bool {
        return $this->seasonService->startSeason($leagueId);
    }

    public function updateSeason(int $leagueId): bool {
        return $this->seasonService->updateSeason($leagueId);
    }

    // ─── PlayoffService Proxies ─────────────────────────────────────────

    public function startPlayoffs(int $leagueId, array $seeds, int $seriesLength): bool {
        return $this->playoffService->startPlayoffs($leagueId, $seeds, $seriesLength);
    }

    public function startTeamPlayoffs(int $leagueId, array $seeds, int $seriesLength): bool {
        return $this->teamPlayoffService->startPlayoffs($leagueId, $seeds, $seriesLength);
    }
}
