<?php
/**
 * REST API for managing the global registry of pinball locations.
 */
require_once __DIR__ . '/../includes/config.php';

/**
 * Helper to transform database rows from Location_Machines into camelCase JSON.
 * @param array $row
 * @return array
 */
function serializeLocationMachine($row) {
    return [
        'locationId' => (int)$row['location_id'],
        'machineId' => (int)$row['machine_id'],
        'machineName' => $row['machine_name'],
        'value1' => (int)($row['value1'] ?? 0),
        'value2' => (int)($row['value2'] ?? 0),
        'values' => [
            1 => (int)$row['score1'], 2 => (int)$row['score2'], 3 => (int)$row['score3'], 4 => (int)$row['score4'], 5 => (int)$row['score5'],
            6 => (int)$row['score6'], 7 => (int)$row['score7'], 8 => (int)$row['score8'], 9 => (int)$row['score9'], 10 => (int)$row['score10'],
        ],
        'targetEasy' => (int)$row['target_easy'],
        'targetMed' => (int)$row['target_med'],
        'targetHard' => (int)$row['target_hard']
    ];
}

/**
 * Helper to transform database rows from Locations into camelCase JSON.
 * @param array $row
 * @return array
 */
function serializeLocation($row) {
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'city' => $row['city'],
        'state' => $row['state']
    ];
}

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $input = getJsonInput();
    $task = $_GET['task'] ?? 'location';

    // GET: Retrieve all locations or a specific one by ID
    if ($method === 'GET') {
        if ($task === 'units') {
            $location_id = isset($_GET['locationId']) ? (int)$_GET['locationId'] : 0;

            if ($location_id) {
                $stmt = $pdo->prepare('
                    SELECT lm.*, m.machine_name 
                    FROM location_machines lm 
                    JOIN machines m ON lm.machine_id = m.id 
                    WHERE lm.location_id = ?
                ');
                $stmt->execute([$location_id]);
            } else {
                $stmt = $pdo->query('
                    SELECT lm.*, m.machine_name 
                    FROM location_machines lm 
                    JOIN machines m ON lm.machine_id = m.id 
                    ORDER BY lm.location_id ASC
                ');
            }
            sendJson(array_map('serializeLocationMachine', $stmt->fetchAll()));
        }

        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id) {
            $stmt = $pdo->prepare('SELECT * FROM locations WHERE id = ?');
            $stmt->execute([$id]);
            $location = $stmt->fetch();
            if (!$location) {
                sendJson(['error' => 'Location not found'], 404);
            }
            $result = serializeLocation($location);
            // Automatically include machines when fetching a specific location
            $stmt = $pdo->prepare('SELECT lm.*, m.machine_name FROM location_machines lm JOIN machines m ON lm.machine_id = m.id WHERE lm.location_id = ?');
            $stmt->execute([$id]);
            $result['machines'] = array_map('serializeLocationMachine', $stmt->fetchAll());
            sendJson($result);
        }

        // Fetch all locations
        $locationsStmt = $pdo->query('SELECT * FROM locations ORDER BY name ASC');
        $locations = array_map('serializeLocation', $locationsStmt->fetchAll());

        // Fetch all location-machine mappings
        $machinesStmt = $pdo->query('SELECT lm.*, m.machine_name FROM location_machines lm JOIN machines m ON lm.machine_id = m.id ORDER BY lm.location_id ASC');
        $allMachines = $machinesStmt->fetchAll();

        // Group machines by location_id
        $machinesByLocation = [];
        foreach ($allMachines as $mach) {
            $machinesByLocation[$mach['location_id']][] = serializeLocationMachine($mach);
        }

        // Attach machines to their corresponding locations
        foreach ($locations as &$loc) {
            $loc['machines'] = $machinesByLocation[$loc['id']] ?? [];
        }

        sendJson($locations);
    }

    // POST: Create a new location (Protected by API Secret)
    if ($method === 'POST') {
        $user = getCurrentUser();
        $isPlayer = $user && in_array($user['role'], ['player', 'td', 'admin']);
        $isTD = $user && in_array($user['role'], ['td', 'admin']);

        if (empty($input['name'])) {
            if ($task === 'units') {
                if (empty($input['locationId']) || empty($input['machineId'])) {
                    sendJson(['error' => 'locationId and machineId are required'], 400);
                }
                // Players, TDs, and Admins can add machines to venues
                if (!$isPlayer) validateTDAccess();

                $sql = 'INSERT INTO location_machines (location_id, machine_id, value1, value2, score1, score2, score3, score4, score5, score6, score7, score8, score9, score10, target_easy, target_med, target_hard) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                            value1=VALUES(value1), value2=VALUES(value2),
                            score1=VALUES(score1), score2=VALUES(score2), score3=VALUES(score3), score4=VALUES(score4), score5=VALUES(score5), 
                            score6=VALUES(score6), score7=VALUES(score7), score8=VALUES(score8), score9=VALUES(score9), score10=VALUES(score10),
                            target_easy=VALUES(target_easy), target_med=VALUES(target_med), target_hard=VALUES(target_hard)';
                $params = [(int)$input['locationId'], (int)$input['machineId'], (int)($input['value1'] ?? 0), (int)($input['value2'] ?? 0)];
                for ($i = 1; $i <= 10; $i++) $params[] = (int)($input['values'][$i] ?? 0);
                
                $params[] = (int)($input['targetEasy'] ?? 0);
                $params[] = (int)($input['targetMed'] ?? 0);
                $params[] = (int)($input['targetHard'] ?? 0);

                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                sendJson(['success' => true]);
            } else {
                sendJson(['error' => 'name is required'], 400);
            }
        } else {
            // Only TDs and Admins can create new locations
            if (!$isTD) validateTDAccess();

            $stmt = $pdo->prepare('INSERT INTO locations (name, city, state) VALUES (?, ?, ?)');
            $stmt->execute([$input['name'], $input['city'] ?? null, $input['state'] ?? null]);
            $newId = $pdo->lastInsertId();

            $stmt = $pdo->prepare('SELECT * FROM locations WHERE id = ?');
            $stmt->execute([$newId]);
            $row = $stmt->fetch();
            if (!$row) {
                sendJson(['error' => 'Location created but could not be retrieved.'], 500);
            }
            sendJson(serializeLocation($row), 201);
        }
    }

    // PUT: Update an existing location (Protected by API Secret)
    if ($method === 'PUT') {
        validateTDAccess(); // TDs and Admins can edit locations
        
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id || empty($input['name'])) {
            sendJson(['error' => 'id query parameter and name are required'], 400);
        }

        $stmt = $pdo->prepare('UPDATE locations SET name = ?, city = ?, state = ? WHERE id = ?');
        $stmt->execute([$input['name'], $input['city'] ?? null, $input['state'] ?? null, $id]);

        $stmt = $pdo->prepare('SELECT * FROM locations WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            sendJson(['error' => 'Location updated but could not be retrieved.'], 500);
        }
        sendJson(serializeLocation($row));
    }

    // DELETE: Remove a location (Protected by API Secret)
    if ($method === 'DELETE') {
        if ($task === 'units') {
            validateTDAccess(); // Restricting removal to TD+ to prevent griefing
            
            $location_id = isset($_GET['locationId']) ? (int)$_GET['locationId'] : 0;
            $machine_id = isset($_GET['machineId']) ? (int)$_GET['machineId'] : 0;
            $stmt = $pdo->prepare('DELETE FROM location_machines WHERE location_id = ? AND machine_id = ?');
            $stmt->execute([$location_id, $machine_id]);
            sendJson(['success' => true]);
        }

        validateTDAccess(); // TDs and Admins can delete locations

        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            sendJson(['error' => 'id query parameter is required'], 400);
        }

        $stmt = $pdo->prepare('DELETE FROM locations WHERE id = ?');
        $stmt->execute([$id]);
        
        sendJson(['success' => true]);
    }

    sendJson(['error' => 'Unsupported request method'], 405);
} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}