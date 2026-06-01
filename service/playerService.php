<?php
/**
 * REST API for managing players.
 * 
 * Supported Methods:
 * - GET: Retrieve the global alphabetical list of players.
 * - POST: Create a new player record. Handles duplicate name conflicts gracefully (409).
 * - PUT: Update an existing player's name or external platform IDs (IFPA/Matchplay).
 * - DELETE: Permanently remove a player and all their recorded scores.
 * 
 * Query Parameters:
 * - id: Required for PUT and DELETE methods (the Player's primary key).
 * - action: (Optional) Future-proofing for specific player sub-actions.
 */
require_once __DIR__ . '/../includes/config.php';

/**
 * Helper to transform Players into camelCase.
 */
function serializePlayer($row) {
    return [
        'id' => (int)$row['id'],
        'playerName' => $row['player_name'],
        'ifpaId' => $row['ifpa_id'],
        'matchplayId' => $row['matchplay_id'],
        'userRole' => $row['user_role'] ?? null,
        'userId' => isset($row['user_id']) ? (int)$row['user_id'] : null
    ];
}

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $task = $_GET['task'] ?? null;

    // GET: Retrieve all registered players alphabetically
    if ($method === 'GET') {
        $stmt = $pdo->query('
            SELECT p.*, u.role as user_role, u.id as user_id 
            FROM players p 
            LEFT JOIN users u ON p.id = u.player_id 
            ORDER BY p.player_name ASC
        ');
        sendJson(array_map('serializePlayer', $stmt->fetchAll()));
    }

    $input = getJsonInput();

    // POST: Register a new player (Protected by API Secret)
    if ($method === 'POST') {
        if (empty($input['playerName'])) {
            sendJson(['error' => 'playerName is required'], 400);
        }

        $ifpa_id = $input['ifpaId'] ?? null;
        $matchplay_id = $input['matchplayId'] ?? null;

        try {
            $stmt = $pdo->prepare('INSERT INTO players (player_name, ifpa_id, matchplay_id) VALUES (?, ?, ?)');
            $stmt->execute([$input['playerName'], $ifpa_id, $matchplay_id]);
            $id = (int)$pdo->lastInsertId();
        } catch (PDOException $error) {
            // Handle duplicate names gracefully by returning the existing record
            if ($error->errorInfo[1] === 1062) {
                $stmt = $pdo->prepare('SELECT * FROM players WHERE player_name = ?');
                $stmt->execute([$input['playerName']]);
                sendJson(serializePlayer($stmt->fetch()), 409); // Conflict: Player name already exists
            }
            throw $error; // Re-throw other DB errors to global handler
        }

        $stmt = $pdo->prepare('SELECT * FROM players WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            sendJson(['error' => 'Player created but could not be retrieved.'], 500);
        }
        sendJson(serializePlayer($row));
    }

    // PUT: Update an existing player (Protected by API Secret)
    if ($method === 'PUT') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            sendJson(['error' => 'id query parameter is required'], 400);
        }

        if ($task === 'role') {
            validateAdminAccess();
            $newRole = $input['role'] ?? 'player';
            if (!in_array($newRole, ['player', 'td', 'admin'])) {
                sendJson(['error' => 'Invalid role'], 400);
            }
            // $id here is the user_id passed in the URL
            $stmt = $pdo->prepare('UPDATE users SET role = ? WHERE id = ?');
            $stmt->execute([$newRole, $id]);
            sendJson(['success' => true]);
        }

        // Fetch existing record to check if name is changing
        $stmt = $pdo->prepare('SELECT player_name FROM players WHERE id = ?');
        $stmt->execute([$id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            sendJson(['error' => 'Player not found'], 404);
        }

        $newName = $input['playerName'] ?? $existing['player_name'];
        $ifpa_id = $input['ifpaId'] ?? null;
        $matchplay_id = $input['matchplayId'] ?? null;

        // Rule: Changing the name requires Admin Access. 
        // Updating IFPA/Matchplay IDs does not.
        if ($newName !== $existing['player_name']) {
            validateAdminAccess();
        }

        if (empty($newName)) {
            sendJson(['error' => 'playerName is required'], 400);
        }

        try {
            $stmt = $pdo->prepare('UPDATE players SET player_name = ?, ifpa_id = ?, matchplay_id = ? WHERE id = ?');
            $stmt->execute([$newName, $ifpa_id, $matchplay_id, $id]);
        } catch (PDOException $error) {
            if ($error->errorInfo[1] === 1062) { // Duplicate entry
                sendJson(['error' => 'Player name already exists'], 409);
            }
            throw $error;
        }

        $stmt = $pdo->prepare('SELECT * FROM players WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            sendJson(['error' => 'Player updated but could not be retrieved.'], 500);
        }
        sendJson(serializePlayer($row));
    }

    // DELETE: Remove a player and their associated scores (Protected by API Secret)
    if ($method === 'DELETE') {
        validateAdminAccess();
        
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            sendJson(['error' => 'id query parameter is required'], 400);
        }

        $stmt = $pdo->prepare('SELECT * FROM players WHERE id = ?');
        $stmt->execute([$id]);
        $player = $stmt->fetch();
        if (!$player) {
            sendJson(['error' => 'Player not found'], 404);
        }

        $stmt = $pdo->prepare('DELETE FROM players WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(['success' => true, 'deleted' => $player]);
    }

    sendJson(['error' => 'Unsupported request method'], 405);

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
