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
     * Add a player to a league.
     *
     * @param int $leagueId
     * @param int $playerId
     * @return bool Success
     */
    public function addPlayerToLeague(int $leagueId, int $playerId): bool {
        $stmt = $this->db->prepare('INSERT IGNORE INTO league_players (league_id, player_id) VALUES (?, ?)');
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
        $this->db->prepare('DELETE FROM scores WHERE player_id = ? AND event_id IN (SELECT id FROM events WHERE league_id = ?)')
            ->execute([$playerId, $leagueId]);
        $stmt = $this->db->prepare('DELETE FROM league_players WHERE league_id = ? AND player_id = ?');
        return $stmt->execute([$leagueId, $playerId]);
    }

    /**
     * Count the number of players currently in a league.
     *
     * @param int $leagueId
     * @return int
     */
    public function getLeaguePlayerCount(int $leagueId): int {
        $stmt = $this->db->prepare('SELECT COUNT(*) FROM league_players WHERE league_id = ?');
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
