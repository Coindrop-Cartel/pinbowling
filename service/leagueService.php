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

    public function __construct(
        DatabaseService $db,
        EventService $eventService,
        RosterService $rosterService,
        SeasonService $seasonService,
        PlayoffService $playoffService
    ) {
        $this->db = $db;
        $this->eventService = $eventService;
        $this->rosterService = $rosterService;
        $this->seasonService = $seasonService;
        $this->playoffService = $playoffService;
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
            'SELECT p.id, p.player_name, p.ifpa_id, u.id as user_id 
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
            'SELECT lp.league_id, p.id, p.player_name, p.ifpa_id, u.id as user_id
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
        ?int $inningsPerGame = 2,
        ?int $weeklyPoints = null,
        ?int $pointSpread = null
    ): array {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare(
            'INSERT INTO leagues (name, start_date, type, participants, scoring_format, season_scoring, drop_lowest_weeks, weeks_in_season, innings_per_game, weekly_points, point_spread)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$name, $startDate, $type, $participants, $scoringFormat, $seasonScoring, $dropLowestWeeks, $weeksInSeason, $inningsPerGame, $weeklyPoints, $pointSpread]);
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
        ?int $inningsPerGame = 2,
        ?int $weeklyPoints = null,
        ?int $pointSpread = null
    ): array {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare(
            'UPDATE leagues SET name = ?, start_date = ?, participants = ?, scoring_format = ?, season_scoring = ?, drop_lowest_weeks = ?, weeks_in_season = ?, innings_per_game = ?, weekly_points = ?, point_spread = ? WHERE id = ?'
        );
        $stmt->execute([$name, $startDate, $participants, $scoringFormat, $seasonScoring, $dropLowestWeeks, $weeksInSeason, $inningsPerGame, $weeklyPoints, $pointSpread, $leagueId]);
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

            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

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

            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

            $pdo->commit();
            return $result;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw new \Exception("Failed to delete league {$leagueId}: " . $e->getMessage(), 0, $e);
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
}
