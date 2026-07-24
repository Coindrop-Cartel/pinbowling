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
            'SELECT m.*, mac.machine_name, em.event_id,
                    p.player_name as player_name
             FROM matchups m
             JOIN event_matchups em ON m.event_matchup_id = em.id
             JOIN machines mac ON m.machine_id = mac.id
             LEFT JOIN players p ON m.player_id = p.id
             WHERE em.event_id = ?
             ORDER BY m.order_number ASC, m.id ASC',
            [$eventId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Get all individual matchup entries for a specific event matchup.
     *
     * @param int $eventMatchupId
     * @return array
     */
    public function getMatchupEntries(int $eventMatchupId): array {
        $stmt = $this->db->query(
            'SELECT m.*, mac.machine_name,
                    p.player_name as player_name
             FROM matchups m
             JOIN machines mac ON m.machine_id = mac.id
             LEFT JOIN players p ON m.player_id = p.id
             WHERE m.event_matchup_id = ?
             ORDER BY m.order_number ASC, m.id ASC',
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
                    COALESCE(p1.player_name, t1.name) as player1_name, 
                    COALESCE(p2.player_name, t2.name) as player2_name,
                    COALESCE(p3.player_name, t3.name) as player3_name,
                    COALESCE(p4.player_name, t4.name) as player4_name,
                    w.player_name as winner_name
             FROM event_matchups em
             JOIN events e ON em.event_id = e.id
             LEFT JOIN players p1 ON em.player1_id = p1.id
             LEFT JOIN players p2 ON em.player2_id = p2.id
             LEFT JOIN players p3 ON em.player3_id = p3.id
             LEFT JOIN players p4 ON em.player4_id = p4.id
             LEFT JOIN teams t1 ON em.player1_id = t1.id
             LEFT JOIN teams t2 ON em.player2_id = t2.id
             LEFT JOIN teams t3 ON em.player3_id = t3.id
             LEFT JOIN teams t4 ON em.player4_id = t4.id
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
            'SELECT m.*, mac.machine_name,
                    p.player_name as player_name
             FROM matchups m
             JOIN machines mac ON m.machine_id = mac.id
             LEFT JOIN players p ON m.player_id = p.id
             WHERE m.id = ?',
            [$matchupId]
        );
        return $stmt->fetch();
    }

    /**
     * Save or update multiple matchups.
     *
     * Each matchup row represents a machine assigned to a half-inning slot:
     *   eventMatchupId, orderNumber, machineId.
     * The unique key (event_matchup_id, order_number) drives the upsert.
     *
     * @param array $matchups Array of matchup data
     * @return bool
     */
    public function saveMatchups(array $matchups): bool {
        $pdo = $this->db->getPdo();

        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare(
                'INSERT INTO matchups (event_matchup_id, order_number, machine_id, player_id)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE machine_id = VALUES(machine_id), player_id = VALUES(player_id)'
            );

            foreach ($matchups as $m) {
                $stmt->execute([
                    $m['eventMatchupId'] ?? null,
                    $m['orderNumber'] ?? 0,
                    $m['machineId'] ?? 0,
                    $m['playerId'] ?? null
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
        $stmt = $pdo->prepare('DELETE FROM matchups WHERE event_matchup_id IN (SELECT id FROM event_matchups WHERE event_id = ?)');
        return $stmt->execute([$eventId]);
    }
}
