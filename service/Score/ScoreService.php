<?php

namespace App\Service;

class ScoreService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Get scores for a league.
     *
     * @param int $leagueId
     * @return array
     */
    public function getLeagueScores(int $leagueId): array {
        $stmt = $this->db->query(
            'SELECT s.id, s.player_id, s.event_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
             FROM scores s
             JOIN machines m ON m.id = s.machine_id
             JOIN events e ON s.event_id = e.id
             WHERE e.league_id = ?
             ORDER BY s.event_id ASC, s.player_id ASC, s.order_number ASC',
            [$leagueId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Get scores for a specific event.
     *
     * @param int $eventId
     * @param int|null $playerId Optional filter by player
     * @return array
     */
    public function getEventScores(int $eventId, ?int $playerId = null): array {
        if ($playerId) {
            $stmt = $this->db->query(
                'SELECT s.id, s.player_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM scores s
                 JOIN machines m ON m.id = s.machine_id
                 WHERE s.player_id = ? AND s.event_id = ?
                 ORDER BY s.order_number ASC',
                [$playerId, $eventId]
            );
        } else {
            $stmt = $this->db->query(
                'SELECT s.id, s.player_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM scores s
                 JOIN machines m ON m.id = s.machine_id
                 WHERE s.event_id = ?
                 ORDER BY s.player_id ASC, s.order_number ASC',
                [$eventId]
            );
        }
        return $stmt->fetchAll();
    }

    /**
     * Save or update a score.
     *
     * @param int $eventId
     * @param int $playerId
     * @param int $machineId
     * @param int $orderNumber
     * @param int|null $ball1
     * @param int|null $ball2
     * @param int|null $ball3
     * @return bool
     */
    public function saveScore(int $eventId, int $playerId, int $machineId, int $orderNumber, 
                             ?int $ball1 = null, ?int $ball2 = null, ?int $ball3 = null): bool {
        $pdo = $this->db->getPdo();

        // 1. Get the league_id from the event
        $stmt = $pdo->prepare('SELECT league_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $leagueId = $stmt->fetchColumn();
        if (!$leagueId) {
            throw new \Exception('Event not found.');
        }

        // 2. Check if player is a member of the league roster (directly or via team)
        $stmt = $pdo->prepare(
            'SELECT 1 FROM league_players WHERE league_id = ? AND player_id = ?
             UNION
             SELECT 1 FROM league_teams lt 
             JOIN team_members tm ON lt.team_id = tm.team_id 
             WHERE lt.league_id = ? AND tm.player_id = ?'
        );
        $stmt->execute([$leagueId, $playerId, $leagueId, $playerId]);
        if (!$stmt->fetchColumn()) {
            throw new \Exception('Player is not registered in this league.');
        }
        
        $stmt = $pdo->prepare(
            'INSERT INTO scores (event_id, player_id, machine_id, order_number, ball1, ball2, ball3)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ball1 = VALUES(ball1), ball2 = VALUES(ball2), ball3 = VALUES(ball3)'
        );
        
        return $stmt->execute([$eventId, $playerId, $machineId, $orderNumber, $ball1, $ball2, $ball3]);
    }

    /**
     * Delete a specific score.
     *
     * @param int $scoreId
     * @return bool
     */
    public function deleteScore(int $scoreId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM scores WHERE id = ?');
        return $stmt->execute([$scoreId]);
    }

    /**
     * Delete all scores for a player.
     *
     * @param int $playerId
     * @return bool
     */
    public function deletePlayerScores(int $playerId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM scores WHERE player_id = ?');
        return $stmt->execute([$playerId]);
    }

    /**
     * Delete all scores for an event.
     *
     * @param int $eventId
     * @return bool
     */
    public function deleteEventScores(int $eventId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM scores WHERE event_id = ?');
        return $stmt->execute([$eventId]);
    }

    /**
     * Delete all scores for a player in a specific event.
     *
     * @param int $eventId
     * @param int $playerId
     * @return bool
     */
    public function deletePlayerEventScores(int $eventId, int $playerId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM scores WHERE event_id = ? AND player_id = ?');
        return $stmt->execute([$eventId, $playerId]);
    }
}
