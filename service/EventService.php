<?php

namespace App\Service;

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
        $sql = 'SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id';
        if ($leagueId) {
            $sql .= ' WHERE e.league_id = ?';
        }
        $sql .= ' ORDER BY e.event_date ASC';
        $stmt = $this->db->prepare($sql);
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
        $stmt = $this->db->prepare(
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
        if (!$scoringFormat) {
            $stmt = $this->db->prepare('SELECT scoring_format FROM leagues WHERE id = ?');
            $stmt->execute([$leagueId]);
            $meta = $stmt->fetch();
            $scoringFormat = $meta['scoring_format'] ?? 'bowling';
        }
        $stmt = $this->db->prepare(
            'INSERT INTO events (league_id, location_id, event_name, event_date, scoring_format) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$leagueId, $locationId, $eventName, $eventDate, $scoringFormat]);
        return $this->getEvent((int)$this->db->lastInsertId());
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
        $stmt = $this->db->prepare(
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
        $pdo = $this->db;
        $inTx = $pdo->inTransaction();
        
        try {
            if (!$inTx) {
                $pdo->beginTransaction();
            }
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

            $pdo->prepare('DELETE FROM scores WHERE event_id = ?')->execute([$eventId]);
            $pdo->prepare('DELETE FROM matchups WHERE event_matchup_id IN (SELECT id FROM event_matchups WHERE event_id = ?)')->execute([$eventId]);
            $pdo->prepare('DELETE FROM event_matchups WHERE event_id = ?')->execute([$eventId]);
            $pdo->prepare('DELETE FROM target_scores WHERE event_id = ?')->execute([$eventId]);

            $stmt = $pdo->prepare('DELETE FROM events WHERE id = ?');
            $res = $stmt->execute([$eventId]);

            if (!$inTx) {
                $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
                $pdo->commit();
            }

            return $res;
        } catch (\PDOException $e) {
            if (!$inTx && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Check whether an event exists and return its league_id, or false.
     *
     * @param int $eventId
     * @return int|false
     */
    public function getEventLeagueId(int $eventId) {
        $stmt = $this->db->prepare('SELECT league_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $result = $stmt->fetchColumn();
        return ($result !== false) ? (int)$result : false;
    }
}
