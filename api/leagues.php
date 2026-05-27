<?php
/**
 * REST API for managing Leagues and their associated Events.
 * Handles CRUD operations for the Leagues and Events tables.
 */
require_once __DIR__ . '/../includes/config.php';
initDatabase();
$pdo = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];
$input = getJsonInput();
// Use 'action' parameter to distinguish between league and event operations
$action = $_GET['action'] ?? 'league'; 

// GET: Retrieve Leagues or Events
if ($method === 'GET') {
    if ($action === 'event') {
        $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
        if ($leagueId) {
            $stmt = $pdo->prepare('SELECT * FROM Events WHERE league_id = ? ORDER BY event_date ASC');
            $stmt->execute([$leagueId]);
        } else {
            $stmt = $pdo->query('SELECT * FROM Events ORDER BY event_date ASC');
        }
        sendJson($stmt->fetchAll());
    } else {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id) {
            $stmt = $pdo->prepare('SELECT * FROM Leagues WHERE id = ?');
            $stmt->execute([$id]);
            $league = $stmt->fetch();
            if ($league) {
                // Automatically include events when fetching a specific league
                $stmt = $pdo->prepare('SELECT * FROM Events WHERE league_id = ? ORDER BY event_date ASC');
                $stmt->execute([$id]);
                $league['events'] = $stmt->fetchAll();
                sendJson($league);
            }
            sendJson(['error' => 'League not found'], 404);
        }
        $stmt = $pdo->query('SELECT * FROM Leagues ORDER BY start_date DESC');
        sendJson($stmt->fetchAll());
    }
}

// POST: Create new League or Event (Protected by API Secret)
if ($method === 'POST') {
    validateApiSecret();
    
    if ($action === 'event') {
        if (empty($input['league_id']) || empty($input['event_name'])) {
            sendJson(['error' => 'league_id and event_name are required'], 400);
        }
        $sql = 'INSERT INTO Events (league_id, location_id, event_name, event_date) VALUES (?, ?, ?, ?)';
        $params = [(int)$input['league_id'], $input['location_id'] ?? null, $input['event_name'], $input['event_date'] ?? null];
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $newId = $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM Events WHERE id = ?');
        $stmt->execute([$newId]);
        sendJson($stmt->fetch());
    } else {
        if (empty($input['name'])) {
            sendJson(['error' => 'name is required'], 400);
        }
        $sql = 'INSERT INTO Leagues (name, start_date, total_events) VALUES (?, ?, ?)';
        $params = [$input['name'], $input['start_date'] ?? null, (int)($input['total_events'] ?? 1)];
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $newId = $pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM Leagues WHERE id = ?');
        $stmt->execute([$newId]);
        sendJson($stmt->fetch());
    }
}

// PUT: Update League or Event (Protected by API Secret)
if ($method === 'PUT') {
    validateApiSecret();
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) sendJson(['error' => 'id query parameter is required'], 400);

    if ($action === 'event') {
        $sql = 'UPDATE Events SET league_id = ?, location_id = ?, event_name = ?, event_date = ? WHERE id = ?';
        $params = [(int)$input['league_id'], $input['location_id'] ?? null, $input['event_name'], $input['event_date'] ?? null, $id];
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM Events WHERE id = ?');
    } else {
        $sql = 'UPDATE Leagues SET name = ?, start_date = ?, total_events = ? WHERE id = ?';
        $params = [$input['name'], $input['start_date'] ?? null, (int)($input['total_events'] ?? 1), $id];
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM Leagues WHERE id = ?');
    }
    $stmt->execute([$id]);
    sendJson($stmt->fetch());
}

// DELETE: Remove League or Event (Protected by API Secret)
if ($method === 'DELETE') {
    validateApiSecret();
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) sendJson(['error' => 'id query parameter is required'], 400);
    
    $table = ($action === 'event') ? 'Events' : 'Leagues';
    // Note: Deleting a league will cascade delete events due to the FOREIGN KEY constraint in initDatabase()
    $stmt = $pdo->prepare("DELETE FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    sendJson(['success' => true]);
}

sendJson(['error' => 'Unsupported request method'], 405);