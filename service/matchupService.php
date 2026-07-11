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
     * Get a specific matchup.
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
     *   eventId, orderNumber (inning/slot index), playerId, machineId, playerOrder (1=home, 2=away).
     * The unique key (event_id, order_number, player_order) drives the upsert.
     *
     * @param array $matchups Array of matchup data
     * @return bool
     */
    public function saveMatchups(array $matchups): bool {
        $pdo = $this->db->getPdo();

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare(
                'INSERT INTO matchups (event_id, order_number, player_id, machine_id, player_order)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE player_id = VALUES(player_id), machine_id = VALUES(machine_id), player_order = VALUES(player_order)'
            );

            foreach ($matchups as $m) {
                $stmt->execute([
                    $m['eventId'] ?? 0,
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
