<?php

namespace App\Service;

/**
 * Service managing database maintenance, pruning old session-based leagues and abandoned guest players.
 */
class CleanupService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Clean up sessions older than retention period.
     *
     * @param int $retentionDays Number of days to retain sessions (default 30)
     * @return array Result with count of deleted sessions
     */
    public function cleanupOldSessionLeagues(int $retentionDays = 30): array {
        if ($retentionDays <= 0) {
            $retentionDays = 30;
        }

        $cutoffDate = date('Y-m-d', strtotime("-$retentionDays days"));

        // Identify sessions that have passed the retention threshold
        $stmt = $this->db->query(
            "SELECT id FROM sessions WHERE created_at IS NULL OR created_at <= ?",
            [$cutoffDate . ' 23:59:59']
        );
        $results = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        $sessionIds = array_map('intval', $results);

        if (empty($sessionIds)) {
            return [
                'success' => true,
                'message' => "No sessions older than $retentionDays days were found.",
                'deletedCount' => 0,
                'sessions_cleaned' => 0
            ];
        }

        $pdo = $this->db;
        
        try {
            $pdo->beginTransaction();
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

            $idPlaceholders = implode(',', array_fill(0, count($sessionIds), '?'));

            // 1. Remove player scores for events within these sessions
            $sql = "DELETE FROM scores WHERE event_id IN (SELECT id FROM events WHERE session_id IN ($idPlaceholders))";
            $pdo->prepare($sql)->execute($sessionIds);

            // 2. Remove matchups
            $sql = "DELETE FROM matchups WHERE event_matchup_id IN (SELECT id FROM event_matchups WHERE event_id IN (SELECT id FROM events WHERE session_id IN ($idPlaceholders)))";
            $pdo->prepare($sql)->execute($sessionIds);

            // 3. Remove event matchups
            $sql = "DELETE FROM event_matchups WHERE event_id IN (SELECT id FROM events WHERE session_id IN ($idPlaceholders))";
            $pdo->prepare($sql)->execute($sessionIds);

            // 4. Remove target scores
            $sql = "DELETE FROM target_scores WHERE event_id IN (SELECT id FROM events WHERE session_id IN ($idPlaceholders))";
            $pdo->prepare($sql)->execute($sessionIds);

            // 5. Remove the events
            $sql = "DELETE FROM events WHERE session_id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($sessionIds);

            // 6. Remove session players
            $sql = "DELETE FROM session_players WHERE session_id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($sessionIds);

            // 7. Remove session locations
            $sql = "DELETE FROM session_locations WHERE session_id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($sessionIds);

            // 8. Finally, delete the sessions
            $sql = "DELETE FROM sessions WHERE id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($sessionIds);

            $pdo->commit();

            return [
                'success' => true,
                'message' => count($sessionIds) . " session(s) older than $retentionDays days have been deleted.",
                'deletedCount' => count($sessionIds),
                'sessions_cleaned' => count($sessionIds)
            ];
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        }
    }

    /**
     * Clean up abandoned session player records (no associated user or events).
     *
     * @return array Result with count of deleted players
     */
    public function cleanupAbandonedPlayers(): array {
        $pdo = $this->db;
        
        try {
            $pdo->beginTransaction();
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

            // Find players with no user account and no scores
            $stmt = $pdo->query(
                "SELECT p.id FROM players p 
                 LEFT JOIN users u ON p.id = u.player_id 
                 LEFT JOIN scores s ON p.id = s.player_id
                 WHERE u.id IS NULL AND s.id IS NULL
                 GROUP BY p.id"
            );
            $playerIds = array_map('intval', $stmt->fetchAll(\PDO::FETCH_COLUMN));

            if (empty($playerIds)) {
                $pdo->commit();
                return [
                    'success' => true,
                    'message' => 'No abandoned players found.',
                    'deletedCount' => 0
                ];
            }

            $idPlaceholders = implode(',', array_fill(0, count($playerIds), '?'));

            // Delete league player registrations
            $sql = "DELETE FROM league_players WHERE player_id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($playerIds);

            // Delete player team memberships
            $sql = "DELETE FROM team_members WHERE player_id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($playerIds);

            // Delete abandoned players
            $sql = "DELETE FROM players WHERE id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($playerIds);

            $pdo->commit();

            return [
                'success' => true,
                'message' => count($playerIds) . ' abandoned player(s) have been deleted.',
                'deletedCount' => count($playerIds)
            ];
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        } finally {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        }
    }
}
