<?php

namespace App\Service;

/**
 * Service managing league players, registrations, and roster stats.
 */
class RosterService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Add a player to a league by linking/creating their team in league_teams.
     *
     * @param int $leagueId
     * @param int $playerId
     * @return bool Success
     */
    public function addPlayerToLeague(int $leagueId, int $playerId): bool {
        $pdo = $this->db->getPdo();
        
        $stmt = $pdo->prepare('SELECT player_name FROM players WHERE id = ?');
        $stmt->execute([$playerId]);
        $playerName = $stmt->fetchColumn();
        if (!$playerName) {
            return false;
        }

        // Find existing 1-player team or create one
        $stmt = $pdo->prepare(
            'SELECT t.id FROM teams t 
             JOIN team_members tm ON t.id = tm.team_id 
             GROUP BY t.id HAVING COUNT(tm.player_id) = 1 AND SUM(tm.player_id = ?) = 1'
        );
        $stmt->execute([$playerId]);
        $teamId = $stmt->fetchColumn();

        if (!$teamId) {
            $stmt = $pdo->prepare('INSERT INTO teams (name, is_individual_wrapper) VALUES (?, 1)');
            $stmt->execute([$playerName]);
            $teamId = (int)$pdo->lastInsertId();

            $stmt = $pdo->prepare('INSERT INTO team_members (team_id, player_id) VALUES (?, ?)');
            $stmt->execute([$teamId, $playerId]);
        } else {
            $stmt = $pdo->prepare('UPDATE teams SET name = ?, is_individual_wrapper = 1 WHERE id = ? AND is_individual_wrapper = 1');
            $stmt->execute([$playerName, $teamId]);
        }

        $stmt = $pdo->prepare('INSERT IGNORE INTO league_teams (league_id, team_id) VALUES (?, ?)');
        return $stmt->execute([$leagueId, $teamId]);
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

        $stmt = $pdo->prepare(
            'SELECT lt.team_id FROM league_teams lt 
             JOIN team_members tm ON lt.team_id = tm.team_id 
             WHERE lt.league_id = ? AND tm.player_id = ?'
        );
        $stmt->execute([$leagueId, $playerId]);
        $teamIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);

        if (!empty($teamIds)) {
            $in = implode(',', array_fill(0, count($teamIds), '?'));
            $pdo->prepare("DELETE FROM league_teams WHERE league_id = ? AND team_id IN ($in)")
                ->execute(array_merge([$leagueId], $teamIds));
        }

        return true;
    }

    /**
     * Count the number of unique players currently in a league.
     *
     * @param int $leagueId
     * @return int
     */
    public function getLeaguePlayerCount(int $leagueId): int {
        $stmt = $this->db->getPdo()->prepare(
            'SELECT COUNT(DISTINCT tm.player_id) 
             FROM league_teams lt 
             JOIN team_members tm ON lt.team_id = tm.team_id 
             WHERE lt.league_id = ?'
        );
        $stmt->execute([$leagueId]);
        return (int)$stmt->fetchColumn();
    }

    /**
     * Get the user_id linked to a player (null if unregistered).
     *
     * @param int $playerId
     * @return int|null
     */
    public function getPlayerUserId(int $playerId): ?int {
        $stmt = $this->db->prepare('SELECT u.id FROM players p JOIN users u ON p.id = u.player_id WHERE p.id = ?');
        $stmt->execute([$playerId]);
        $result = $stmt->fetchColumn();
        return ($result !== false) ? (int)$result : null;
    }
}
