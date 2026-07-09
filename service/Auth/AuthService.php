<?php

namespace App\Service;

use PDO;
use App\Service\DatabaseService;
use App\Service\SettingsService;

class AuthService {
    private DatabaseService $db;
    private SettingsService $settings;

    public function __construct(DatabaseService $db, SettingsService $settings) {
        $this->db = $db;
        $this->settings = $settings;
    }

    /**
     * Authenticate a user with username and password.
     * Returns user data (without password hash) or false on failure.
     *
     * @param string $username
     * @param string $password
     * @return array|false User data or false
     */
    public function login(string $username, string $password) {
        $stmt = $this->db->query(
            "SELECT u.id, u.player_id, u.username, u.password_hash, u.role, p.player_name 
             FROM users u 
             LEFT JOIN players p ON u.player_id = p.id 
             WHERE u.username = ?",
            [$username]
        );
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            unset($user['password_hash']);
            return $user;
        }
        return false;
    }

    /**
     * Register a new user with a corresponding player record.
     * Returns result array with user data on success, error on failure.
     *
     * @param string $username
     * @param string $password
     * @param string $playerName
     * @param bool $confirmClaim
     * @return array Result with 'error' and 'code' on failure, or user data on success
     */
    public function register(string $username, string $password, string $playerName, bool $confirmClaim = false): array {
        try {
            $pdo = $this->db->getPdo();
            $pdo->beginTransaction();

            // Check if username already exists
            $stmt = $pdo->prepare("SELECT id FROM users WHERE username = ?");
            $stmt->execute([$username]);
            if ($stmt->fetch()) {
                $pdo->rollBack();
                return ['error' => 'Username already exists', 'code' => 409];
            }

            // Check if player name exists
            $stmt = $pdo->prepare("SELECT id FROM players WHERE player_name = ?");
            $stmt->execute([$playerName]);
            $existingPlayer = $stmt->fetch();

            if ($existingPlayer) {
                // Player exists - user can claim it if they confirm
                if (!$confirmClaim) {
                    $pdo->rollBack();
                    return [
                        'error' => 'Player name already exists. Set confirmClaim to true to claim this player.',
                        'code' => 409,
                        'playerId' => $existingPlayer['id']
                    ];
                }
                $playerId = $existingPlayer['id'];
            } else {
                // Create new player
                $stmt = $pdo->prepare("INSERT INTO players (player_name) VALUES (?)");
                $stmt->execute([$playerName]);
                $playerId = (int)$pdo->lastInsertId();
            }

            // Create user account
            $passwordHash = password_hash($password, PASSWORD_BCRYPT);
            $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, player_id, role) VALUES (?, ?, ?, 'player')");
            $stmt->execute([$username, $passwordHash, $playerId]);
            $userId = (int)$pdo->lastInsertId();

            $pdo->commit();

            // Fetch and return new user data
            return $this->login($username, $password) ?: ['error' => 'User created but could not be authenticated', 'code' => 500];
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            return ['error' => 'Database error during registration: ' . $e->getMessage(), 'code' => 500];
        }
    }

    /**
     * Reset a user's password (admin or self).
     *
     * @param int $userId
     * @param string $newPassword
     * @return bool Success
     */
    public function resetPassword(int $userId, string $newPassword): bool {
        $passwordHash = password_hash($newPassword, PASSWORD_BCRYPT);
        $stmt = $this->db->getPdo()->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
        return $stmt->execute([$passwordHash, $userId]);
    }

    /**
     * Get the currently authenticated user from the session.
     *
     * @return array|null User data or null if not authenticated
     */
    public static function getCurrentUser(): ?array {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        return $_SESSION['user'] ?? null;
    }

    /**
     * Set the current user in the session.
     *
     * @param array $user User data
     */
    public static function setCurrentUser(array $user): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        $_SESSION['user'] = $user;
    }

    /**
     * Clear the current user session.
     */
    public static function logout(): void {
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        $_SESSION = [];
        session_destroy();
    }
}
