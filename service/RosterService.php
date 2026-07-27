<?php

namespace App\Service;

/**
 * Service managing league players, registrations, and roster stats.
 *
 * Individual-participation leagues use league_players (direct player-to-league).
 * Team-participation leagues use league_teams (team-to-league, with members via team_members).
 */
class RosterService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Add a player to an individual-participation league.
     *
     * @param int $leagueId
     * @param int $playerId
     * @return bool Success
     * @throws \Exception If the league uses team participation
     */
    public function addPlayerToLeague(int $leagueId, int $playerId): bool {
        $pdo = $this->db->getPdo();

        $stmt = $pdo->prepare('SELECT participation_type FROM leagues WHERE id = ?');
        $stmt->execute([$leagueId]);
        $participationType = $stmt->fetchColumn();

        if ($participationType === 'team') {
            throw new \Exception("Cannot add a player directly to a team-participation league. Add the player to a team first.");
        }

        $stmt = $pdo->prepare('INSERT IGNORE INTO league_players (league_id, player_id) VALUES (?, ?)');
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
        $pdo = $this->db->getPdo();

        $pdo->prepare('DELETE FROM scores WHERE player_id = ? AND event_id IN (SELECT id FROM events WHERE league_id = ?)')
            ->execute([$playerId, $leagueId]);

        $stmt = $pdo->prepare('SELECT participation_type FROM leagues WHERE id = ?');
        $stmt->execute([$leagueId]);
        $participationType = $stmt->fetchColumn();

        if ($participationType === 'team') {
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
        } else {
            $stmt = $pdo->prepare('DELETE FROM league_players WHERE league_id = ? AND player_id = ?');
            $stmt->execute([$leagueId, $playerId]);
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
        $pdo = $this->db->getPdo();

        $stmt = $pdo->prepare('SELECT participation_type FROM leagues WHERE id = ?');
        $stmt->execute([$leagueId]);
        $participationType = $stmt->fetchColumn();

        if ($participationType === 'team') {
            $stmt = $pdo->prepare(
                'SELECT COUNT(DISTINCT tm.player_id) 
                 FROM league_teams lt 
                 JOIN team_members tm ON lt.team_id = tm.team_id 
                 WHERE lt.league_id = ?'
            );
        } else {
            $stmt = $pdo->prepare(
                'SELECT COUNT(*) FROM league_players WHERE league_id = ?'
            );
        }

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
