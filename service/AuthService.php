<?php

namespace App\Service;

use PDO;
use App\Service\DatabaseService;
use App\Service\SettingsService;

/**
 * Service handling authentication, user accounts, claims, registration, and password management.
 */
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
            "SELECT u.id, u.player_id, u.username, u.email, u.password_hash, u.role, p.player_name 
             FROM users u 
             LEFT JOIN players p ON u.player_id = p.id 
             WHERE u.username = ? OR u.email = ?",
            [$username, $username]
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
     * @param string|null $email
     * @param bool $confirmClaim
     * @return array Result with 'error' and 'code' on failure, or user data on success
     */
    public function register(string $username, string $password, string $playerName, ?string $email = null, bool $confirmClaim = false): array {
        try {
            $pdo = $this->db;
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
            $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, email, player_id, role) VALUES (?, ?, ?, ?, 'player')");
            $stmt->execute([$username, $passwordHash, $email, $playerId]);
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
        $stmt = $this->db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
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

    /**
     * Generate password reset token, update user table, and send simulated email.
     * Always returns true if email input is received, to prevent user harvesting.
     *
     * @param string $email
     * @param string $baseUrl
     * @return bool
     */
    public function forgotPassword(string $email, string $baseUrl): bool {
        $pdo = $this->db;
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user) {
            $token = bin2hex(random_bytes(16));
            $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));

            $update = $pdo->prepare("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?");
            $update->execute([$token, $expires, $user['id']]);

            $resetLink = $baseUrl . "?reset_token=" . $token;

            // Send simulated email
            $to = $email;
            $subject = "Password Reset Request - PinBowling";
            $message = "You requested a password reset. Please click the following link to reset your password:\n\n$resetLink\n\nThis link will expire in 1 hour.";
            $headers = "From: no-reply@" . ($_SERVER['HTTP_HOST'] ?? 'localhost') . "\r\n";

            $sent = mail($to, $subject, $message, $headers);
            if (!$sent) {
                $lastError = error_get_last();
                error_log(sprintf(
                    "[AuthService] mail() failed to send to %s. Headers: %s. Last PHP Error: %s",
                    $to,
                    trim($headers),
                    $lastError ? $lastError['message'] : 'No PHP error message.'
                ));
            } else {
                error_log(sprintf("[AuthService] mail() successfully dispatched to %s. Reset link: %s", $to, $resetLink));
            }
        }
        return true;
    }

    /**
     * Resets user password using reset token.
     *
     * @param string $token
     * @param string $password
     * @return bool Success
     */
    public function resetWithToken(string $token, string $password): bool {
        $pdo = $this->db;
        $now = date('Y-m-d H:i:s');
        $stmt = $pdo->prepare("SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?");
        $stmt->execute([$token, $now]);
        $user = $stmt->fetch();

        if (!$user) {
            return false;
        }

        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        $update = $pdo->prepare("UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?");
        return $update->execute([$passwordHash, $user['id']]);
    }
}
