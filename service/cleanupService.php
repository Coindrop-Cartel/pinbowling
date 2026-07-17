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
     * Clean up session leagues older than retention period.
     *
     * @param int $retentionDays Number of days to retain session leagues (default 30)
     * @return array Result with count of deleted leagues
     */
    public function cleanupOldSessionLeagues(int $retentionDays = 30): array {
        if ($retentionDays <= 0) {
            $retentionDays = 30;
        }

        $cutoffDate = date('Y-m-d', strtotime("-$retentionDays days"));

        // Identify session leagues that have passed the retention threshold
        $stmt = $this->db->query(
            "SELECT id FROM leagues WHERE type = 'session' AND start_date < ?",
            [$cutoffDate]
        );
        $results = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        $leagueIds = array_map('intval', $results);

        if (empty($leagueIds)) {
            return [
                'success' => true,
                'message' => "No session leagues older than $retentionDays days were found.",
                'deletedCount' => 0
            ];
        }

        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();

            $idPlaceholders = implode(',', array_fill(0, count($leagueIds), '?'));

            // 1. Remove player scores for events within these leagues
            $sql = "DELETE FROM scores WHERE event_id IN (SELECT id FROM events WHERE league_id IN ($idPlaceholders))";
            $pdo->prepare($sql)->execute($leagueIds);

            // 2. Remove target score templates
            $sql = "DELETE FROM target_scores WHERE event_id IN (SELECT id FROM events WHERE league_id IN ($idPlaceholders))";
            $pdo->prepare($sql)->execute($leagueIds);

            // 3. Remove the events themselves
            $sql = "DELETE FROM events WHERE league_id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($leagueIds);

            // 4. Remove player-to-league roster mappings
            $sql = "DELETE FROM league_players WHERE league_id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($leagueIds);

            // 5. Remove league team associations
            $sql = "DELETE FROM league_teams WHERE league_id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($leagueIds);

            // 6. Finally, delete the leagues
            $sql = "DELETE FROM leagues WHERE id IN ($idPlaceholders)";
            $pdo->prepare($sql)->execute($leagueIds);

            $pdo->commit();

            return [
                'success' => true,
                'message' => count($leagueIds) . " session league(s) older than $retentionDays days have been deleted.",
                'deletedCount' => count($leagueIds)
            ];
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Clean up abandoned session player records (no associated user or events).
     *
     * @return array Result with count of deleted players
     */
    public function cleanupAbandonedPlayers(): array {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();

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

            // Delete player league memberships
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
        }
    }
}
