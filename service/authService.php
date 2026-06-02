<?php
/**
 * Authentication and User Management Service
 * Handles login, logout, registration, and password resets.
 */
require_once __DIR__ . '/../includes/config.php';

// Protect all auth tasks with the API Secret to ensure requests come from the application
validateApiSecret();

$pdo = getDbConnection();
$task = $_GET['task'] ?? '';
$input = getJsonInput();

switch ($task) {
    case 'login':
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';

        if (!$email || !$password) {
            sendJson(['error' => 'Email and password are required.'], 400);
        }

        // Fetch user and join with players table to get display name
        $stmt = $pdo->prepare("
            SELECT u.id, u.player_id, u.email, u.password_hash, u.role, p.player_name 
            FROM users u 
            LEFT JOIN players p ON u.player_id = p.id 
            WHERE u.email = ?
        ");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && password_verify($password, $user['password_hash'])) {
            // Start session and store user data (minus the hash)
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }
            unset($user['password_hash']);
            $_SESSION['user'] = $user;
            sendJson($user);
        } else {
            sendJson(['error' => 'Invalid email or password.'], 401);
        }
        break;

    case 'logout':
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        $_SESSION = [];
        session_destroy();
        sendJson(['success' => true]);
        break;

    case 'me':
        // Returns the currently logged-in user or null
        sendJson(getCurrentUser());
        break;

    case 'register':
        $email = $input['email'] ?? '';
        $password = $input['password'] ?? '';
        $playerName = $input['playerName'] ?? '';

        if (!$email || !$password || !$playerName) {
            sendJson(['error' => 'Email, password, and player name are required.'], 400);
        }

        try {
            $pdo->beginTransaction();

            // Try to find an existing player by name to link the account to
            $stmt = $pdo->prepare("SELECT id FROM players WHERE player_name = ?");
            $stmt->execute([$playerName]);
            $playerId = $stmt->fetchColumn();

            if (!$playerId) {
                $stmt = $pdo->prepare("INSERT INTO players (player_name) VALUES (?)");
                $stmt->execute([$playerName]);
                $playerId = $pdo->lastInsertId();
            }

            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("INSERT INTO users (player_id, email, password_hash, role) VALUES (?, ?, ?, 'player')");
            $stmt->execute([$playerId, $email, $hash]);

            $pdo->commit();
            sendJson(['success' => true]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e->getCode() == 23000) {
                sendJson(['error' => 'Email or Player Name is already registered.'], 409);
            }
            sendJson(['error' => 'Registration failed: ' . $e->getMessage()], 500);
        }
        break;

    case 'reset':
        $userId = $_GET['id'] ?? null;
        $newPassword = $input['password'] ?? '';

        if (!$userId || !$newPassword) {
            sendJson(['error' => 'User ID and new password are required.'], 400);
        }

        // Permission check: Admin can reset anyone, users can reset themselves
        $currentUser = getCurrentUser();
        if (!$currentUser || ($currentUser['role'] !== 'admin' && $currentUser['id'] != $userId)) {
            sendJson(['error' => 'Unauthorized password reset.'], 403);
        }

        $hash = password_hash($newPassword, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
        $stmt->execute([$hash, $userId]);

        sendJson(['success' => true]);
        break;

    default:
        sendJson(['error' => 'Invalid authentication task.'], 400);
}