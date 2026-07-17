<?php

namespace App\Service;

use PDO;

/**
 * Service managing weekly events and matches.
 */
class EventService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
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
            $stmt = $pdo->prepare('SELECT scoring_format FROM leagues WHERE id = ?');
            $stmt->execute([$leagueId]);
            $meta = $stmt->fetch();
            $scoringFormat = $meta['scoring_format'] ?? 'bowling';
        }
        $stmt = $pdo->prepare(
            'INSERT INTO events (league_id, location_id, event_name, event_date, scoring_format) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$leagueId, $locationId, $eventName, $eventDate, $scoringFormat]);
        return $this->getEvent((int)$pdo->lastInsertId());
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

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

        $pdo->prepare('DELETE FROM scores WHERE event_id = ?')->execute([$eventId]);
        $pdo->prepare('DELETE FROM matchups WHERE event_id = ?')->execute([$eventId]);
        $pdo->prepare('DELETE FROM event_matchups WHERE event_id = ?')->execute([$eventId]);
        $pdo->prepare('DELETE FROM target_scores WHERE event_id = ?')->execute([$eventId]);

        $stmt = $pdo->prepare('DELETE FROM events WHERE id = ?');
        $res = $stmt->execute([$eventId]);

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        return $res;
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
}
