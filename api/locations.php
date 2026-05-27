<?php
/**
 * REST API for managing the global registry of pinball locations.
 */
require_once __DIR__ . '/../includes/config.php';
initDatabase();
$pdo = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];
$input = getJsonInput();

// GET: Retrieve all locations or a specific one by ID
if ($method === 'GET') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM Locations WHERE id = ?');
        $stmt->execute([$id]);
        $location = $stmt->fetch();
        if (!$location) {
            sendJson(['error' => 'Location not found'], 404);
        }
        sendJson($location);
    }
    $stmt = $pdo->query('SELECT * FROM Locations ORDER BY name ASC');
    sendJson($stmt->fetchAll());
}

// POST: Create a new location (Protected by API Secret)
if ($method === 'POST') {
    validateApiSecret();
    
    if (empty($input['name'])) {
        sendJson(['error' => 'name is required'], 400);
    }

    $stmt = $pdo->prepare('INSERT INTO Locations (name) VALUES (?)');
    $stmt->execute([$input['name']]);
    $newId = $pdo->lastInsertId();

    $stmt = $pdo->prepare('SELECT * FROM Locations WHERE id = ?');
    $stmt->execute([$newId]);
    sendJson($stmt->fetch(), 201);
}

// PUT: Update an existing location (Protected by API Secret)
if ($method === 'PUT') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id || empty($input['name'])) {
        sendJson(['error' => 'id query parameter and name are required'], 400);
    }

    $stmt = $pdo->prepare('UPDATE Locations SET name = ? WHERE id = ?');
    $stmt->execute([$input['name'], $id]);

    $stmt = $pdo->prepare('SELECT * FROM Locations WHERE id = ?');
    $stmt->execute([$id]);
    sendJson($stmt->fetch());
}

// DELETE: Remove a location (Protected by API Secret)
if ($method === 'DELETE') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) {
        sendJson(['error' => 'id query parameter is required'], 400);
    }

    $stmt = $pdo->prepare('DELETE FROM Locations WHERE id = ?');
    $stmt->execute([$id]);
    
    sendJson(['success' => true]);
}

sendJson(['error' => 'Unsupported request method'], 405);