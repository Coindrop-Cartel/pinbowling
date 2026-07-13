<?php

namespace App\Service;

/**
 * Service managing head-to-head match fixtures (used primarily in the PinBaseball format).
 */
class MatchupService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Get all matchups for an event.
     *
     * @param int $eventId
     * @return array
     */
    public function getEventMatchups(int $eventId): array {
        $stmt = $this->db->query(
            'SELECT m.*, p.player_name AS player_name, mac.machine_name
             FROM matchups m
             JOIN players p ON m.player_id = p.id
             JOIN machines mac ON m.machine_id = mac.id
             WHERE m.event_id = ?
             ORDER BY m.order_number ASC, m.player_order ASC, m.id ASC',
            [$eventId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Get all detailed matchups/innings for a specific event matchup.
     *
     * @param int $eventMatchupId
     * @return array
     */
    public function getMatchupInnings(int $eventMatchupId): array {
        $stmt = $this->db->query(
            'SELECT m.*, p.player_name AS player_name, mac.machine_name
             FROM matchups m
             JOIN players p ON m.player_id = p.id
             JOIN machines mac ON m.machine_id = mac.id
             WHERE m.event_matchup_id = ?
             ORDER BY m.order_number ASC, m.player_order ASC, m.id ASC',
            [$eventMatchupId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Fetch a single event matchup row with player names.
     *
     * @param int $eventMatchupId
     * @return array|false
     */
    public function getEventMatchup(int $eventMatchupId) {
        $stmt = $this->db->query(
            'SELECT em.*, 
                    e.league_id,
                    p1.player_name as home_player_name, 
                    p2.player_name as away_player_name,
                    w.player_name as winner_name
             FROM event_matchups em
             JOIN events e ON em.event_id = e.id
             LEFT JOIN players p1 ON em.home_player_id = p1.id
             LEFT JOIN players p2 ON em.away_player_id = p2.id
             LEFT JOIN players w ON em.winner_id = w.id
             WHERE em.id = ?',
            [$eventMatchupId]
        );
        return $stmt->fetch();
    }

    /**
     * Get a specific matchup detail row.
     *
     * @param int $matchupId
     * @return array|false
     */
    public function getMatchup(int $matchupId) {
        $stmt = $this->db->query(
            'SELECT m.*, p.player_name AS player_name, mac.machine_name
             FROM matchups m
             JOIN players p ON m.player_id = p.id
             JOIN machines mac ON m.machine_id = mac.id
             WHERE m.id = ?',
            [$matchupId]
        );
        return $stmt->fetch();
    }

    /**
     * Save or update multiple matchups.
     *
     * Each matchup row represents a single player's slot in a half-inning:
     *   eventId, eventMatchupId, orderNumber (inning/slot index), playerId, machineId, playerOrder (1=home, 2=away).
     * The unique key (match_key, player_order) drives the upsert.
     *
     * @param array $matchups Array of matchup data
     * @return bool
     */
    public function saveMatchups(array $matchups): bool {
        $pdo = $this->db->getPdo();

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare(
                'INSERT INTO matchups (event_id, event_matchup_id, order_number, player_id, machine_id, player_order)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE player_id = VALUES(player_id), machine_id = VALUES(machine_id), player_order = VALUES(player_order)'
            );

            foreach ($matchups as $m) {
                $stmt->execute([
                    $m['eventId'] ?? 0,
                    $m['eventMatchupId'] ?? null,
                    $m['orderNumber'] ?? 0,
                    $m['playerId'] ?? 0,
                    $m['machineId'] ?? 0,
                    $m['playerOrder'] ?? 1
                ]);
            }

            $pdo->commit();
            return true;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Delete a matchup.
     *
     * @param int $matchupId
     * @return bool
     */
    public function deleteMatchup(int $matchupId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM matchups WHERE id = ?');
        return $stmt->execute([$matchupId]);
    }

    /**
     * Delete all matchups for an event.
     *
     * @param int $eventId
     * @return bool
     */
    public function deleteEventMatchups(int $eventId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM matchups WHERE event_id = ?');
        return $stmt->execute([$eventId]);
    }
}
