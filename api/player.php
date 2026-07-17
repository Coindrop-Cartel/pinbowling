<?php
/**
 * Player Management REST API Endpoint.
 * HTTP controller that delegates to the PlayerService class.
 * 
 * Supported Methods:
 * - GET: Retrieve all players or a specific player
 * - POST: Create a new player
 * - PUT: Update player details or user role
 * - DELETE: Remove a player permanently
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $container = $GLOBALS['container'];
    $playerService = $container->get(\App\Service\PlayerService::class);
    $method = $_SERVER['REQUEST_METHOD'];
    $task = $_GET['task'] ?? null;
    $input = getJsonInput();

    switch ($method) {
        case 'GET':
            $user = \App\Service\AuthService::getCurrentUser();
            if ($user && $user['role'] === 'player') {
                // Requirement: Players only see their own info
                $player = $playerService->getPlayer($user['player_id']);
                sendJson($player ? serializePlayer($player) : null);
            } else {
                $players = $playerService->getAllPlayers();
                sendJson(array_map('serializePlayer', $players));
            }
            break;

        case 'POST':
            validateAdminAccess();

            if ($task === 'merge') {
                $playerAId = $input['playerAId'] ?? null;
                $playerBId = $input['playerBId'] ?? null;
                if (!$playerAId || !$playerBId) {
                    sendJson(['error' => 'playerAId and playerBId are required'], 400);
                }
                try {
                    $playerService->mergePlayers((int)$playerAId, (int)$playerBId);
                    sendJson(['success' => true]);
                } catch (\Exception $e) {
                    sendJson(['error' => $e->getMessage()], 400);
                }
                break;
            }
            
            if (empty($input['playerName'])) {
                sendJson(['error' => 'playerName is required'], 400);
            }

            $ifpa_id = $input['ifpaId'] ?? null;
            $matchplay_id = $input['matchplayId'] ?? null;

            try {
                $player = $playerService->createPlayer($input['playerName'], $ifpa_id, $matchplay_id);
                sendJson(serializePlayer($player));
            } catch (\PDOException $error) {
                // Handle duplicate names gracefully by returning the existing record
                if ($error->errorInfo[1] === 1062) {
                    $players = $playerService->getAllPlayers();
                    $existing = current(array_filter($players, fn($p) => $p['player_name'] === $input['playerName']));
                    if ($existing) {
                        sendJson(serializePlayer($existing), 409); // Conflict: Player name already exists
                    }
                }
                throw $error;
            }
            break;

        case 'PUT':
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) {
                sendJson(['error' => 'id query parameter is required'], 400);
            }

            // Handle role updates
            if ($task === 'role') {
                validateTDAccess();
                $newRole = $input['role'] ?? 'player';
                if (!in_array($newRole, ['player', 'td', 'admin'])) {
                    sendJson(['error' => 'Invalid role'], 400);
                }

                $user = \App\Service\AuthService::getCurrentUser();
                if ($user && $user['role'] === 'td' && $newRole === 'admin') {
                    sendJson(['error' => 'Unauthorized: TDs cannot assign Admin role'], 403);
                }

                // $id here is the user_id passed in the URL
                $playerService->updateUserRole($id, $newRole);
                sendJson(['success' => true]);
                break;
            }

            // Update player details
            $existing = $playerService->getPlayer($id);
            if (!$existing) {
                sendJson(['error' => 'Player not found'], 404);
            }

            $newName = $input['playerName'] ?? $existing['player_name'];
            $ifpa_id = $input['ifpaId'] ?? null;
            $matchplay_id = $input['matchplayId'] ?? null;
            $newUsername = $input['username'] ?? null;
            $newEmail = $input['email'] ?? null;

            $user = \App\Service\AuthService::getCurrentUser();
            $isOwner = $user && (int)$user['player_id'] === $id;

            // Rule: Changing the name requires TD/Admin Access OR being the profile owner.
            if ($newName !== $existing['player_name']) {
                if (!$isOwner) {
                    validateTDAccess();
                }
            } else if (!$isOwner) {
                validateTDAccess();
            }

            // Rule: Changing username requires TD/Admin Access OR being the profile owner.
            if ($newUsername !== null && !empty($existing['user_id']) && $newUsername !== $existing['username']) {
                if (!$isOwner) {
                    validateTDAccess();
                }
            }

            // Rule: Changing email requires TD/Admin Access OR being the profile owner.
            if ($newEmail !== null && !empty($existing['user_id']) && $newEmail !== $existing['email']) {
                if (!$isOwner) {
                    validateTDAccess();
                }
            }

            if (empty($newName)) {
                sendJson(['error' => 'playerName is required'], 400);
            }

            try {
                if ($newUsername !== null && !empty($existing['user_id']) && $newUsername !== $existing['username']) {
                    $playerService->updateUserUsername((int)$existing['user_id'], $newUsername);
                }
                if ($newEmail !== null && !empty($existing['user_id']) && $newEmail !== $existing['email']) {
                    $playerService->updateUserEmail((int)$existing['user_id'], $newEmail);
                }
                $player = $playerService->updatePlayer($id, $newName, $ifpa_id, $matchplay_id);
                sendJson(serializePlayer($player));
            } catch (\Exception $error) {
                if ($error instanceof \PDOException && $error->errorInfo[1] === 1062) { // Duplicate entry
                    sendJson(['error' => 'Player name already exists'], 409);
                } else {
                    sendJson(['error' => $error->getMessage()], 400);
                }
            }
            break;

        case 'DELETE':
            validateAdminAccess();
            
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) {
                sendJson(['error' => 'id query parameter is required'], 400);
            }

            $player = $playerService->getPlayer($id);
            if (!$player) {
                sendJson(['error' => 'Player not found'], 404);
            }

            $playerService->deletePlayer($id);
            sendJson(['success' => true, 'deleted' => $player]);
            break;

        default:
            sendJson(['error' => 'Unsupported request method'], 405);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}

