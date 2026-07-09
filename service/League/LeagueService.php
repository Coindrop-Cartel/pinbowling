<?php

namespace App\Service;

use PDO;

class LeagueService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Get all leagues, optionally filtered by type.
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

        $allEvents = $this->getAllEvents();
        $eventsByLeague = [];
        foreach ($allEvents as $event) {
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
     * @return array Created league data
     */
    public function createLeague(
        string $name,
        ?string $startDate = null,
        string $type = 'standard',
        string $participants = 'individual',
        string $scoringFormat = 'bowling',
        string $seasonScoring = 'weekly',
        int $dropLowestWeeks = 0
    ): array {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare(
            'INSERT INTO leagues (name, start_date, type, participants, scoring_format, season_scoring, drop_lowest_weeks)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$name, $startDate, $type, $participants, $scoringFormat, $seasonScoring, $dropLowestWeeks]);
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
     * @return array Updated league data
     */
    public function updateLeague(
        int $leagueId,
        string $name,
        ?string $startDate = null,
        string $participants = 'individual',
        string $scoringFormat = 'bowling',
        string $seasonScoring = 'weekly',
        int $dropLowestWeeks = 0
    ): array {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare(
            'UPDATE leagues SET name = ?, start_date = ?, participants = ?, scoring_format = ?, season_scoring = ?, drop_lowest_weeks = ? WHERE id = ?'
        );
        $stmt->execute([$name, $startDate, $participants, $scoringFormat, $seasonScoring, $dropLowestWeeks, $leagueId]);
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
        $log = [];
        $log[] = "Starting deleteLeague for ID: " . $leagueId;
        
        try {
            $pdo->beginTransaction();

            // Fetch and delete all events associated with this league
            $stmt = $pdo->prepare("SELECT id FROM events WHERE league_id = ?");
            $stmt->execute([$leagueId]);
            $eventIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $log[] = "Found " . count($eventIds) . " events for league $leagueId: [" . implode(",", $eventIds) . "]";

            foreach ($eventIds as $eventId) {
                $log[] = "Attempting to delete event " . $eventId;
                $this->deleteEvent((int)$eventId, $log);
            }

            // Clean up league associations
            $stmt = $pdo->prepare("DELETE FROM league_players WHERE league_id = ?");
            $stmt->execute([$leagueId]);
            $log[] = "Deleted league_players. Affected: " . $stmt->rowCount();

            $stmt = $pdo->prepare("DELETE FROM league_teams WHERE league_id = ?");
            $stmt->execute([$leagueId]);
            $log[] = "Deleted league_teams. Affected: " . $stmt->rowCount();

            $stmt = $pdo->prepare("DELETE FROM league_staff WHERE league_id = ?");
            $stmt->execute([$leagueId]);
            $log[] = "Deleted league_staff. Affected: " . $stmt->rowCount();

            // Finally delete the league
            $stmt = $pdo->prepare("DELETE FROM leagues WHERE id = ?");
            $result = $stmt->execute([$leagueId]);
            $log[] = "Deleted league row. Affected: " . $stmt->rowCount();

            $pdo->commit();
            $log[] = "Transaction committed successfully.";
            error_log(implode("\n", $log));
            return $result;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $log[] = "Error deleting league: " . $e->getMessage();
            $detailedMessage = implode("\n", $log);
            error_log($detailedMessage);
            throw new \Exception($detailedMessage, 0, $e);
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
     * Delete a single event.
     *
     * @param int $eventId
     * @return bool
     */
    public function deleteEvent(int $eventId, array &$log = []): bool {
        $pdo = $this->db->getPdo();
        $log[] = "Starting deleteEvent for ID: " . $eventId;
        
        try {
            // Count matching matchups
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM matchups WHERE event_id = ?");
            $stmt->execute([$eventId]);
            $matchupCount = $stmt->fetchColumn();
            $log[] = "Matchups found for event $eventId before delete: " . $matchupCount;

            $stmt = $pdo->prepare('DELETE FROM matchups WHERE event_id = ?');
            $stmt->execute([$eventId]);
            $log[] = "Deleted matchups. Affected: " . $stmt->rowCount();

            // Count matching scores
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM scores WHERE event_id = ?");
            $stmt->execute([$eventId]);
            $scoreCount = $stmt->fetchColumn();
            $log[] = "Scores found for event $eventId before delete: " . $scoreCount;

            $stmt = $pdo->prepare('DELETE FROM scores WHERE event_id = ?');
            $stmt->execute([$eventId]);
            $log[] = "Deleted scores. Affected: " . $stmt->rowCount();

            // Count target scores
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM target_scores WHERE event_id = ?");
            $stmt->execute([$eventId]);
            $targetCount = $stmt->fetchColumn();
            $log[] = "Target scores found for event $eventId before delete: " . $targetCount;

            $stmt = $pdo->prepare('DELETE FROM target_scores WHERE event_id = ?');
            $stmt->execute([$eventId]);
            $log[] = "Deleted target_scores. Affected: " . $stmt->rowCount();

            // Finally delete event
            $stmt = $pdo->prepare('DELETE FROM events WHERE id = ?');
            $result = $stmt->execute([$eventId]);
            $log[] = "Deleted event $eventId. Affected: " . $stmt->rowCount();

            return $result;
        } catch (\PDOException $e) {
            $log[] = "Error deleting event $eventId: " . $e->getMessage();
            throw new \Exception(implode("\n", $log), 0, $e);
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
}
