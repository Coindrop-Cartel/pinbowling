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
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';

        if (!$username || !$password) {
            sendJson(['error' => 'Username and password are required.'], 400);
        }

        // Fetch user and join with players table to get display name
        $stmt = $pdo->prepare("
            SELECT u.id, u.player_id, u.username, u.password_hash, u.role, p.player_name 
            FROM users u 
            LEFT JOIN players p ON u.player_id = p.id 
            WHERE u.username = ?
        ");
        $stmt->execute([$username]);
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
            sendJson(['error' => 'Invalid username or password.'], 401);
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
        $username = $input['username'] ?? '';
        $password = $input['password'] ?? '';
        $playerName = $input['playerName'] ?? '';
        $confirmClaim = $input['confirmClaim'] ?? false;

        if (!$username || !$password || !$playerName) {
            sendJson(['error' => 'Username, password, and player name are required.'], 400);
        }

        $pdo->beginTransaction();
        try {
            // 1. Check if a player with this name already exists
            $stmt = $pdo->prepare("SELECT id FROM players WHERE player_name = ?");
            $stmt->execute([$playerName]);
            $existingPlayer = $stmt->fetch();

            if ($existingPlayer) {
                $playerId = (int)$existingPlayer['id'];
                
                // Check if this player is already tied to a user account
                $stmtUserCheck = $pdo->prepare("SELECT id FROM users WHERE player_id = ?");
                $stmtUserCheck->execute([$playerId]);
                if ($stmtUserCheck->fetch()) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    sendJson(['error' => 'This player name is already associated with an account.'], 409);
                }

                // If not linked and user hasn't confirmed the claim yet, send a prompt requirement
                if (!$confirmClaim) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    sendJson([
                        'claimRequired' => true,
                        'message' => "A player record for '$playerName' already exists. Is this you? Click confirm to link your new account to your existing history."
                    ]);
                }
            } else {
                // No player exists, create a new one
                $stmt = $pdo->prepare("INSERT INTO players (player_name) VALUES (?)");
                $stmt->execute([$playerName]);
                $playerId = $pdo->lastInsertId();
            }

            // 2. Create user
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("INSERT INTO users (player_id, username, password_hash, role) VALUES (?, ?, ?, 'player')");
            $stmt->execute([$playerId, $username, $hash]);
            $userId = $pdo->lastInsertId();

            $pdo->commit();
            sendJson(['success' => true, 'userId' => $userId]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e->getCode() == 23000) {
                sendJson(['error' => 'Username or Player Name is already registered.'], 409);
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