<?php

namespace App\Service;

use PDO;

/**
 * Service managing player CRUD operations, database queries, and role/profile updates.
 */
class PlayerService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Get all players, optionally filtered by role.
     *
     * @param string|null $role Optional role filter (e.g., 'player', 'admin')
     * @return array
     */
    public function getAllPlayers(?string $role = null): array {
        if ($role) {
            $stmt = $this->db->query(
                "SELECT p.*, u.role, u.id as user_id, u.username, u.email 
                 FROM players p 
                 LEFT JOIN users u ON p.id = u.player_id 
                 WHERE u.role = ?
                 ORDER BY p.player_name ASC",
                [$role]
            );
        } else {
            $stmt = $this->db->query(
                "SELECT p.*, u.role, u.id as user_id, u.username, u.email 
                 FROM players p 
                 LEFT JOIN users u ON p.id = u.player_id 
                 ORDER BY p.player_name ASC"
            );
        }
        return $stmt->fetchAll();
    }

    /**
     * Get a specific player by ID.
     *
     * @param int $playerId
     * @return array|false
     */
    public function getPlayer(int $playerId) {
        $stmt = $this->db->query(
            "SELECT p.*, u.id as user_id, u.role, u.username, u.email 
             FROM players p 
             LEFT JOIN users u ON p.id = u.player_id 
             WHERE p.id = ?",
            [$playerId]
        );
        return $stmt->fetch();
    }

    /**
     * Create a new player.
     *
     * @param string $playerName
     * @param string|null $ifpaId
     * @param string|null $matchplayId
     * @return array Created player data with user_id and role
     * @throws \PDOException on duplicate name (error code 1062)
     */
    public function createPlayer(string $playerName, ?string $ifpaId = null, ?string $matchplayId = null): array {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare("INSERT INTO players (player_name, ifpa_id, matchplay_id) VALUES (?, ?, ?)");
        $stmt->execute([$playerName, $ifpaId, $matchplayId]);
        $id = (int)$pdo->lastInsertId();

        $stmt = $pdo->prepare(
            "SELECT p.*, u.id as user_id, u.role 
             FROM players p 
             LEFT JOIN users u ON p.id = u.player_id 
             WHERE p.id = ?"
        );
        $stmt->execute([$id]);
        $player = $stmt->fetch();
        
        if (!$player) {
            throw new \RuntimeException("Player created but could not be retrieved.");
        }
        
        return $player;
    }

    /**
     * Update an existing player.
     *
     * @param int $playerId
     * @param string|null $playerName
     * @param string|null $ifpaId
     * @param string|null $matchplayId
     * @return array Updated player data
     */
    public function updatePlayer(int $playerId, ?string $playerName = null, ?string $ifpaId = null, ?string $matchplayId = null): array {
        $fields = [];
        $params = [];

        if ($playerName !== null) {
            $fields[] = "player_name = ?";
            $params[] = $playerName;

            // Sync the 1-person wrapper team name if one exists for this player
            $pdo = $this->db->getPdo();
            $stmtWrapper = $pdo->prepare("
                UPDATE teams t
                JOIN team_members tm ON t.id = tm.team_id
                SET t.name = ?
                WHERE tm.player_id = ? AND t.is_individual_wrapper = 1
            ");
            $stmtWrapper->execute([$playerName, $playerId]);
        }
        if ($ifpaId !== null) {
            $fields[] = "ifpa_id = ?";
            $params[] = $ifpaId;
        }
        if ($matchplayId !== null) {
            $fields[] = "matchplay_id = ?";
            $params[] = $matchplayId;
        }

        if (empty($fields)) {
            return $this->getPlayer($playerId);
        }

        $params[] = $playerId;
        $sql = "UPDATE players SET " . implode(", ", $fields) . " WHERE id = ?";
        $stmt = $this->db->getPdo()->prepare($sql);
        $stmt->execute($params);

        return $this->getPlayer($playerId);
    }

    /**
     * Delete a player and all their associated data.
     * Cascades to users, scores, league memberships, etc.
     *
     * @param int $playerId
     * @return bool Success
     */
    public function deletePlayer(int $playerId): bool {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();

            // Delete user account associated with this player
            $stmt = $pdo->prepare("DELETE FROM users WHERE player_id = ?");
            $stmt->execute([$playerId]);

            // Delete scores for this player across all events
            $stmt = $pdo->prepare("DELETE FROM scores WHERE player_id = ?");
            $stmt->execute([$playerId]);

            // Finally delete the player record
            $stmt = $pdo->prepare("DELETE FROM players WHERE id = ?");
            $result = $stmt->execute([$playerId]);

            $pdo->commit();
            return $result;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Update a user's role.
     *
     * @param int $userId
     * @param string $role ('player', 'td', 'admin')
     * @return bool Success
     */
    public function updateUserRole(int $userId, string $role): bool {
        if (!in_array($role, ['player', 'td', 'admin'])) {
            throw new \InvalidArgumentException("Invalid role: $role");
        }
        
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare("UPDATE users SET role = ? WHERE id = ?");
        return $stmt->execute([$role, $userId]);
    }

    /**
     * Update a user's username.
     *
     * @param int $userId
     * @param string $username
     * @return bool Success
     */
    public function updateUserUsername(int $userId, string $username): bool {
        $username = trim($username);
        if (empty($username)) {
            throw new \InvalidArgumentException("Username cannot be empty");
        }
        
        $pdo = $this->db->getPdo();
        // Check if username already exists for a different user
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ? AND id != ?");
        $stmt->execute([$username, $userId]);
        if ($stmt->fetch()) {
            throw new \RuntimeException("Username already exists");
        }

        $stmt = $pdo->prepare("UPDATE users SET username = ? WHERE id = ?");
        return $stmt->execute([$username, $userId]);
    }

    /**
     * Update a user's email.
     *
     * @param int $userId
     * @param string|null $email
     * @return bool Success
     */
    public function updateUserEmail(int $userId, ?string $email): bool {
        $email = $email !== null ? trim($email) : null;
        if ($email === '') {
            $email = null;
        }
        
        $pdo = $this->db->getPdo();
        if ($email !== null) {
            // Check if email already exists for a different user
            $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND id != ?");
            $stmt->execute([$email, $userId]);
            if ($stmt->fetch()) {
                throw new \RuntimeException("Email address already exists");
            }
        }

        $stmt = $pdo->prepare("UPDATE users SET email = ? WHERE id = ?");
        return $stmt->execute([$email, $userId]);
    }

    /**
     * Merge player B into player A, updating all references and deleting player B.
     *
     * @param int $playerAId The player to keep
     * @param int $playerBId The player to merge and delete
     * @throws \Exception
     */
    public function mergePlayers(int $playerAId, int $playerBId): void {
        if ($playerAId === $playerBId) {
            throw new \InvalidArgumentException("Cannot merge a player into themselves.");
        }

        $pdo = $this->db->getPdo();
        try {
            $pdo->beginTransaction();

            // Update player A's IFPA and MatchPlay IDs if A doesn't have them but B does
            $playerA = $this->getPlayer($playerAId);
            $playerB = $this->getPlayer($playerBId);
            if ($playerA && $playerB) {
                $updateFields = [];
                $updateParams = [];
                if (empty($playerA['ifpa_id']) && !empty($playerB['ifpa_id'])) {
                    $updateFields[] = "ifpa_id = ?";
                    $updateParams[] = $playerB['ifpa_id'];
                }
                if (empty($playerA['matchplay_id']) && !empty($playerB['matchplay_id'])) {
                    $updateFields[] = "matchplay_id = ?";
                    $updateParams[] = $playerB['matchplay_id'];
                }
                if (!empty($updateFields)) {
                    $updateParams[] = $playerAId;
                    $stmt = $pdo->prepare("UPDATE players SET " . implode(", ", $updateFields) . " WHERE id = ?");
                    $stmt->execute($updateParams);
                }
            }

            // 1. Handle Users merge
            $stmt = $pdo->prepare("SELECT id, role FROM users WHERE player_id = ?");
            $stmt->execute([$playerBId]);
            $userB = $stmt->fetch();

            if ($userB) {
                $stmt = $pdo->prepare("SELECT id, role FROM users WHERE player_id = ?");
                $stmt->execute([$playerAId]);
                $userA = $stmt->fetch();

                if ($userA) {
                    // Both have user accounts. Promote A's role if B's role is higher.
                    $rolesOrder = ['player' => 1, 'td' => 2, 'admin' => 3];
                    $roleA = $userA['role'] ?? 'player';
                    $roleB = $userB['role'] ?? 'player';
                    if (($rolesOrder[$roleB] ?? 0) > ($rolesOrder[$roleA] ?? 0)) {
                        $stmt = $pdo->prepare("UPDATE users SET role = ? WHERE id = ?");
                        $stmt->execute([$roleB, $userA['id']]);
                    }

                    // Transfer league staff associations
                    $stmt = $pdo->prepare("
                        DELETE ls_b FROM league_staff ls_b
                        INNER JOIN league_staff ls_a ON ls_b.league_id = ls_a.league_id
                        WHERE ls_b.user_id = ? AND ls_a.user_id = ?
                    ");
                    $stmt->execute([$userB['id'], $userA['id']]);

                    $stmt = $pdo->prepare("UPDATE league_staff SET user_id = ? WHERE user_id = ?");
                    $stmt->execute([$userA['id'], $userB['id']]);

                    // Delete player B's user row
                    $stmt = $pdo->prepare("DELETE FROM users WHERE id = ?");
                    $stmt->execute([$userB['id']]);
                } else {
                    // Player A does not have a user account. Transfer B's user account to A.
                    $stmt = $pdo->prepare("UPDATE users SET player_id = ? WHERE id = ?");
                    $stmt->execute([$playerAId, $userB['id']]);
                }
            }

            // 2. Merge Scores
            // Delete scores of player B that conflict with player A's existing scores
            $stmt = $pdo->prepare("
                DELETE s_b FROM scores s_b
                INNER JOIN scores s_a ON s_b.event_id = s_a.event_id AND s_b.order_number = s_a.order_number
                WHERE s_b.player_id = ? AND s_a.player_id = ?
            ");
            $stmt->execute([$playerBId, $playerAId]);

            // Update remaining scores of player B to player A
            $stmt = $pdo->prepare("UPDATE scores SET player_id = ? WHERE player_id = ?");
            $stmt->execute([$playerAId, $playerBId]);

            // 3. Merge Team Members
            // Delete duplicate team member rows for player B
            $stmt = $pdo->prepare("
                DELETE tm_b FROM team_members tm_b
                INNER JOIN team_members tm_a ON tm_b.team_id = tm_a.team_id
                WHERE tm_b.player_id = ? AND tm_a.player_id = ?
            ");
            $stmt->execute([$playerBId, $playerAId]);

            // Update remaining team member rows to player A
            $stmt = $pdo->prepare("UPDATE team_members SET player_id = ? WHERE player_id = ?");
            $stmt->execute([$playerAId, $playerBId]);

            // 5. Merge Event Matchups
            // event_matchups has three player-referencing columns. All must be
            // reassigned before player B is deleted, because player1_id is
            // NOT NULL with ON DELETE CASCADE — cascade would silently wipe rows.
            //
            // Edge case: if A and B appeared against each other in the same matchup
            // (possible with duplicate accounts), we skip the player1/player2 swap to avoid
            // creating a self-referential row, but we still promote winner_id to A.

            // 5a. Rows where B is player1 and A is NOT already player2
            $stmt = $pdo->prepare("
                UPDATE event_matchups
                SET player1_id = ?
                WHERE player1_id = ?
                  AND (player2_id IS NULL OR player2_id != ?)
            ");
            $stmt->execute([$playerAId, $playerBId, $playerAId]);

            // 5b. Rows where B is player2 and A is NOT already player1
            $stmt = $pdo->prepare("
                UPDATE event_matchups
                SET player2_id = ?
                WHERE player2_id = ?
                  AND player1_id != ?
            ");
            $stmt->execute([$playerAId, $playerBId, $playerAId]);

            // 5c. Promote winner references unconditionally (safe regardless of the above)
            $stmt = $pdo->prepare("UPDATE event_matchups SET winner_id = ? WHERE winner_id = ?");
            $stmt->execute([$playerAId, $playerBId]);

            // 6. Delete player B's player record
            $stmt = $pdo->prepare("DELETE FROM players WHERE id = ?");
            $stmt->execute([$playerBId]);

            $pdo->commit();
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
