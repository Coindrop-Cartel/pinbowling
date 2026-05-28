<?php
/**
 * REST API for managing players.
 */
require_once __DIR__ . '/../includes/config.php';
initDatabase();
$pdo = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];

// GET: Retrieve all registered players alphabetically
if ($method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM Players ORDER BY player_name ASC');
    sendJson($stmt->fetchAll());
}

$input = getJsonInput();

// POST: Register a new player (Protected by API Secret)
if ($method === 'POST') {
    validateApiSecret();
    
    if (empty($input['player_name'])) {
        sendJson(['error' => 'player_name is required'], 400);
    }

    $ifpa_id = $input['ifpa_id'] ?? null;
    $matchplay_id = $input['matchplay_id'] ?? null;

    try {
        $stmt = $pdo->prepare('INSERT INTO Players (player_name, ifpa_id, matchplay_id) VALUES (?, ?, ?)');
        $stmt->execute([$input['player_name'], $ifpa_id, $matchplay_id]);
        $id = (int)$pdo->lastInsertId();
    } catch (PDOException $error) {
        // Handle duplicate names gracefully by returning the existing record
        if ($error->errorInfo[1] === 1062) {
            $stmt = $pdo->prepare('SELECT * FROM Players WHERE player_name = ?');
            $stmt->execute([$input['player_name']]);
            sendJson($stmt->fetch(), 409); // Conflict: Player name already exists
        }
        sendJson(['error' => 'Unable to add player: ' . $error->getMessage()], 500);
    }

    $stmt = $pdo->prepare('SELECT * FROM Players WHERE id = ?');
    $stmt->execute([$id]);
    sendJson($stmt->fetch());
}

// PUT: Update an existing player (Protected by API Secret)
if ($method === 'PUT') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) {
        sendJson(['error' => 'id query parameter is required'], 400);
    }
    if (empty($input['player_name'])) {
        sendJson(['error' => 'player_name is required'], 400);
    }

    $ifpa_id = $input['ifpa_id'] ?? null;
    $matchplay_id = $input['matchplay_id'] ?? null;

    try {
        $stmt = $pdo->prepare('UPDATE Players SET player_name = ?, ifpa_id = ?, matchplay_id = ? WHERE id = ?');
        $stmt->execute([$input['player_name'], $ifpa_id, $matchplay_id, $id]);
    } catch (PDOException $error) {
        if ($error->errorInfo[1] === 1062) { // Duplicate entry
            sendJson(['error' => 'Player name already exists'], 409);
        }
        sendJson(['error' => 'Unable to update player: ' . $error->getMessage()], 500);
    }

    $stmt = $pdo->prepare('SELECT * FROM Players WHERE id = ?');
    $stmt->execute([$id]);
    sendJson($stmt->fetch());
}

// DELETE: Remove a player and their associated scores (Protected by API Secret)
if ($method === 'DELETE') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) {
        sendJson(['error' => 'id query parameter is required'], 400);
    }

    $stmt = $pdo->prepare('SELECT * FROM Players WHERE id = ?');
    $stmt->execute([$id]);
    $player = $stmt->fetch();
    if (!$player) {
        sendJson(['error' => 'Player not found'], 404);
    }

    $stmt = $pdo->prepare('DELETE FROM Players WHERE id = ?');
    $stmt->execute([$id]);
    sendJson(['success' => true, 'deleted' => $player]);
}

sendJson(['error' => 'Unsupported request method'], 405);
