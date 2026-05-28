<?php
/**
 * REST API for managing the global registry of pinball locations.
 */
require_once __DIR__ . '/../includes/config.php';
initDatabase();
$pdo = getDbConnection();

$method = getRequestMethod();
$input = getJsonInput();
$action = $_GET['action'] ?? 'location';

// GET: Retrieve all locations or a specific one by ID
if ($method === 'GET') {
    if ($action === 'machines') {
        $locationId = isset($_GET['locationId']) ? (int)$_GET['locationId'] : 0;

        if ($locationId) {
            $stmt = $pdo->prepare('
                SELECT lm.*, m.machine_name 
                FROM Location_Machines lm 
                JOIN Machines m ON lm.machine_id = m.id 
                WHERE lm.location_id = ?
            ');
            $stmt->execute([$locationId]);
        } else {
            $stmt = $pdo->query('
                SELECT lm.*, m.machine_name 
                FROM Location_Machines lm 
                JOIN Machines m ON lm.machine_id = m.id 
                ORDER BY lm.location_id ASC
            ');
        }
        sendJson($stmt->fetchAll());
    }

    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id) {
        $stmt = $pdo->prepare('SELECT * FROM Locations WHERE id = ?');
        $stmt->execute([$id]);
        $location = $stmt->fetch();
        if (!$location) {
            sendJson(['error' => 'Location not found'], 404);
        }
        // Automatically include machines when fetching a specific location
        $stmt = $pdo->prepare('SELECT lm.*, m.machine_name FROM Location_Machines lm JOIN Machines m ON lm.machine_id = m.id WHERE lm.location_id = ?');
        $stmt->execute([$id]);
        $location['machines'] = $stmt->fetchAll();
        sendJson($location);
    }

    // Fetch all locations
    $locationsStmt = $pdo->query('SELECT * FROM Locations ORDER BY name ASC');
    $locations = $locationsStmt->fetchAll();

    // Fetch all location-machine mappings
    $machinesStmt = $pdo->query('SELECT lm.*, m.machine_name FROM Location_Machines lm JOIN Machines m ON lm.machine_id = m.id ORDER BY lm.location_id ASC');
    $allMachines = $machinesStmt->fetchAll();

    // Group machines by location_id
    $machinesByLocation = [];
    foreach ($allMachines as $mach) {
        $machinesByLocation[$mach['location_id']][] = $mach;
    }

    // Attach machines to their corresponding locations
    foreach ($locations as &$loc) {
        $loc['machines'] = $machinesByLocation[$loc['id']] ?? [];
    }

    sendJson($locations);
}

// POST: Create a new location (Protected by API Secret)
if ($method === 'POST') {
    validateApiSecret();
    
    if (empty($input['name'])) {
        if ($action === 'machines') {
            if (empty($input['location_id']) || empty($input['machine_id'])) {
                sendJson(['error' => 'location_id and machine_id are required'], 400);
            }
            $sql = 'INSERT INTO Location_Machines (location_id, machine_id, score1, score2, score3, score4, score5, score6, score7, score8, score9, score10, target_easy, target_med, target_hard) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        score1=VALUES(score1), score2=VALUES(score2), score3=VALUES(score3), score4=VALUES(score4), score5=VALUES(score5), 
                        score6=VALUES(score6), score7=VALUES(score7), score8=VALUES(score8), score9=VALUES(score9), score10=VALUES(score10),
                        target_easy=VALUES(target_easy), target_med=VALUES(target_med), target_hard=VALUES(target_hard)';
            $params = [(int)$input['location_id'], (int)$input['machine_id']];
            for ($i = 1; $i <= 10; $i++) $params[] = (int)($input['values'][$i] ?? 0);
            
            $params[] = (int)($input['target_easy'] ?? 0);
            $params[] = (int)($input['target_med'] ?? 0);
            $params[] = (int)($input['target_hard'] ?? 0);

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            sendJson(['success' => true]);
        } else {
            sendJson(['error' => 'name is required'], 400);
        }
    } else {
        $stmt = $pdo->prepare('INSERT INTO Locations (name, city, state) VALUES (?, ?, ?)');
        $stmt->execute([$input['name'], $input['city'] ?? null, $input['state'] ?? null]);
        $newId = $pdo->lastInsertId();

        $stmt = $pdo->prepare('SELECT * FROM Locations WHERE id = ?');
        $stmt->execute([$newId]);
        sendJson($stmt->fetch(), 201);
    }
}

// PUT: Update an existing location (Protected by API Secret)
if ($method === 'PUT') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id || empty($input['name'])) {
        sendJson(['error' => 'id query parameter and name are required'], 400);
    }

    $stmt = $pdo->prepare('UPDATE Locations SET name = ?, city = ?, state = ? WHERE id = ?');
    $stmt->execute([$input['name'], $input['city'] ?? null, $input['state'] ?? null, $id]);

    $stmt = $pdo->prepare('SELECT * FROM Locations WHERE id = ?');
    $stmt->execute([$id]);
    sendJson($stmt->fetch());
}

// DELETE: Remove a location (Protected by API Secret)
if ($method === 'DELETE') {
    validateApiSecret();
    
    if ($action === 'machines') {
        $locationId = isset($_GET['locationId']) ? (int)$_GET['locationId'] : 0;
        $machineId = isset($_GET['machineId']) ? (int)$_GET['machineId'] : 0;
        $stmt = $pdo->prepare('DELETE FROM Location_Machines WHERE location_id = ? AND machine_id = ?');
        $stmt->execute([$locationId, $machineId]);
        sendJson(['success' => true]);
    }

    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) {
        sendJson(['error' => 'id query parameter is required'], 400);
    }

    $stmt = $pdo->prepare('DELETE FROM Locations WHERE id = ?');
    $stmt->execute([$id]);
    
    sendJson(['success' => true]);
}

sendJson(['error' => 'Unsupported request method'], 405);