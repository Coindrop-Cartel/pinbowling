<?php
require_once __DIR__ . '/../includes/config.php';

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $task = $_GET['task'] ?? 'me';

    if ($method === 'GET') {
        if ($task === 'me') {
            sendJson(getCurrentUser());
        }
    }

    if ($method === 'POST') {
        $input = getJsonInput();

        if ($task === 'login') {
            $email = $input['email'] ?? '';
            $password = $input['password'] ?? '';

            $stmt = $pdo->prepare("SELECT u.*, p.player_name FROM users u LEFT JOIN players p ON u.player_id = p.id WHERE u.email = ?");
            $stmt->execute([$email]);
            $user = $stmt->fetch();

            if ($user && password_verify($password, $user['password_hash'])) {
                unset($user['password_hash']);
                if (session_status() === PHP_SESSION_NONE) session_start();
                $_SESSION['user'] = $user;
                sendJson($user);
            } else {
                sendJson(['error' => 'Invalid email or password'], 401);
            }
        }

        if ($task === 'register') {
            $email = $input['email'] ?? '';
            $password = $input['password'] ?? '';
            $playerName = $input['playerName'] ?? '';
            $confirmClaim = $input['confirmClaim'] ?? false;
            
            if (!$email || !$password || !$playerName) {
                sendJson(['error' => 'All fields are required'], 400);
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
                $stmt = $pdo->prepare("INSERT INTO users (player_id, email, password_hash, role) VALUES (?, ?, ?, 'player')");
                $stmt->execute([$playerId, $email, $hash]);
                $userId = $pdo->lastInsertId();

                $pdo->commit();
                sendJson(['success' => true, 'userId' => $userId]);
            } catch (Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                sendJson(['error' => 'Email already registered or registration failed'], 400);
            }
        }

        if ($task === 'reset') {
            validateAdminAccess();
            $userId = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            $newPassword = $input['password'] ?? '';
            
            if (!$userId || !$newPassword) {
                sendJson(['error' => 'User ID and password are required'], 400);
            }

            $hash = password_hash($newPassword, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
            $stmt->execute([$hash, $userId]);
            sendJson(['success' => true]);
        }

        if ($task === 'logout') {
            if (session_status() === PHP_SESSION_NONE) session_start();
            session_destroy();
            sendJson(['success' => true]);
        }
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}