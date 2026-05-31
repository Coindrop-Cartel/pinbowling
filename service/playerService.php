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
        'matchplayId' => $row['matchplay_id']
    ];
}

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];

    // GET: Retrieve all registered players alphabetically
    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT * FROM players ORDER BY player_name ASC');
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
        sendJson(serializePlayer($stmt->fetch()));
    }

    // PUT: Update an existing player (Protected by API Secret)
    if ($method === 'PUT') {
        validateApiSecret();
        
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            sendJson(['error' => 'id query parameter is required'], 400);
        }
        if (empty($input['playerName'])) {
            sendJson(['error' => 'playerName is required'], 400);
        }

        $ifpa_id = $input['ifpaId'] ?? null;
        $matchplay_id = $input['matchplayId'] ?? null;

        try {
            $stmt = $pdo->prepare('UPDATE players SET player_name = ?, ifpa_id = ?, matchplay_id = ? WHERE id = ?');
            $stmt->execute([$input['playerName'], $ifpa_id, $matchplay_id, $id]);
        } catch (PDOException $error) {
            if ($error->errorInfo[1] === 1062) { // Duplicate entry
                sendJson(['error' => 'Player name already exists'], 409);
            }
            throw $error;
        }

        $stmt = $pdo->prepare('SELECT * FROM players WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(serializePlayer($stmt->fetch()));
    }

    // DELETE: Remove a player and their associated scores (Protected by API Secret)
    if ($method === 'DELETE') {
        validateApiSecret();
        
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
