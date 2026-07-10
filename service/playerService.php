<?php

namespace App\Service;

use PDO;

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
            $stmt = $this->db->getPdo()->query(
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

            // Remove from league rosters
            $stmt = $pdo->prepare("DELETE FROM league_players WHERE player_id = ?");
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
}
