<?php
/**
 * REST API for configuring PinBowling machines and their scoring thresholds.
 */
require_once __DIR__ . '/../includes/config.php';
initDatabase();
$pdo = getDbConnection();

/**
 * Helper to transform flat database rows into a structured JSON format 
 * where thresholds are grouped in a 'values' object.
 * This specific serializer is for Target_Scores or Location_Machines, which contain score values.
 * @param array $row
 * @return array
 */
function serializeTargetScore($row) {
    return [
        'id' => (int)$row['id'], // This is the ID of the Target_Scores or Location_Machines entry
        'event_id' => isset($row['event_id']) ? (int)$row['event_id'] : null,
        'machine_id' => (int)$row['machine_id'], // This is the ID of the master machine
        'machine_name' => $row['machine_name'], // Joined from Machines table
        'order_number' => (int)$row['order_number'],
        'values' => [
            1 => (int)$row['score1'], 2 => (int)$row['score2'], 3 => (int)$row['score3'], 4 => (int)$row['score4'], 5 => (int)$row['score5'],
            6 => (int)$row['score6'], 7 => (int)$row['score7'], 8 => (int)$row['score8'], 9 => (int)$row['score9'], 10 => (int)$row['score10'],
        ],
    ];
}

/**
 * Helper to transform flat database rows from the master Machines table into a structured JSON format.
 * @param array $row
 * @return array
 */
function serializeMasterMachine($row) {
    return [
        'id' => (int)$row['id'],
        'machine_name' => $row['machine_name'],
    ];
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'machine';
$eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
$leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;

// GET: Retrieve the configuration for all frames
if ($method === 'GET') {
    if ($leagueId) { // Fetch all target scores for all events in a league
        $stmt = $pdo->prepare('
            SELECT ts.*, m.machine_name 
            FROM Target_Scores ts 
            JOIN Machines m ON ts.machine_id = m.id 
            JOIN Events e ON ts.event_id = e.id
            WHERE e.league_id = ? 
            ORDER BY ts.event_id ASC, ts.order_number ASC
        ');
        $stmt->execute([$leagueId]);
        $machines = array_map('serializeTargetScore', $stmt->fetchAll());
    } else if ($eventId) { // Fetch event-specific target scores
        $stmt = $pdo->prepare('
            SELECT ts.*, m.machine_name 
            FROM Target_Scores ts 
            JOIN Machines m ON ts.machine_id = m.id 
            WHERE ts.event_id = ? 
            ORDER BY ts.order_number ASC
        ');
        $stmt->execute([$eventId]);
        $machines = array_map('serializeTargetScore', $stmt->fetchAll());
    } else { // Fetch master list of machines (titles only)
        $stmt = $pdo->query('SELECT id, machine_name FROM Machines ORDER BY machine_name ASC');
        $machines = array_map('serializeMasterMachine', $stmt->fetchAll());
    }
    sendJson($machines);
}

$input = getJsonInput();

// POST: Add a new frame/machine configuration (Protected by API Secret)
if ($method === 'POST') {
    validateApiSecret();
    
    if ($action === 'reorder') {
        if (!is_array($input)) {
            sendJson(['error' => 'Input must be an array of updates'], 400);
        }
        $pdo->beginTransaction();
        try {
            // Step 1: Temporarily shift to high order numbers to clear unique key constraints
            $stmtShift = $pdo->prepare('UPDATE Target_Scores SET order_number = order_number + 1000 WHERE id = ?');
            foreach ($input as $item) $stmtShift->execute([(int)$item['id']]);

            // Step 2: Set the final intended order numbers
            $stmtFinal = $pdo->prepare('UPDATE Target_Scores SET order_number = ? WHERE id = ?');
            foreach ($input as $item) $stmtFinal->execute([(int)$item['order_number'], (int)$item['id']]);

            $pdo->commit();
            sendJson(['success' => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            sendJson(['error' => $e->getMessage()], 500);
        }
    }

    // Action 'target' handles Target_Scores, default action handles master Machines
    if ($action === 'target') {
        if (empty($input['event_id']) || empty($input['machine_id'])) {
            sendJson(['error' => 'event_id and machine_id are required for target scores'], 400);
        }
        $sql = 'INSERT INTO Target_Scores (event_id, machine_id, order_number, score1, score2, score3, score4, score5, score6, score7, score8, score9, score10) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE machine_id = VALUES(machine_id), 
                   score1=VALUES(score1), score2=VALUES(score2), score3=VALUES(score3), score4=VALUES(score4), score5=VALUES(score5),
                   score6=VALUES(score6), score7=VALUES(score7), score8=VALUES(score8), score9=VALUES(score9), score10=VALUES(score10)';
        $params = [(int)$input['event_id'], (int)$input['machine_id'], (int)$input['order_number']];
        for ($i = 1; $i <= 10; $i++) $params[] = (int)($input['values'][$i] ?? 0);

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        $stmt = $pdo->prepare('SELECT ts.*, m.machine_name FROM Target_Scores ts JOIN Machines m ON ts.machine_id = m.id WHERE ts.event_id = ? AND ts.order_number = ?');
        $stmt->execute([(int)$input['event_id'], (int)$input['order_number']]);
        sendJson(serializeTargetScore($stmt->fetch()));
    } else { // Create a new master machine (title only)
        if (empty($input['machine_name'])) {
            sendJson(['error' => 'machine_name is required'], 400);
        }
        $sql = 'INSERT INTO Machines (machine_name) VALUES (?)';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$input['machine_name']]);
        $id = (int)$pdo->lastInsertId();

        // Fetch the newly created master machine
        $stmt = $pdo->prepare('SELECT id, machine_name FROM Machines WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(serializeMasterMachine($stmt->fetch()));
    }
}

// PUT: Update an existing frame configuration (Protected by API Secret)
if ($method === 'PUT') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0; // ID of the entity being updated
    if (!$id) sendJson(['error' => 'id query parameter is required'], 400);
    
    // Action 'target' handles Target_Scores, default action handles master Machines
    if ($action === 'target') {
        if (empty($input['machine_id']) || empty($input['order_number']) || empty($input['values'])) {
            sendJson(['error' => 'machine_id, order_number, and values are required for target scores'], 400);
        }
        $sql = 'UPDATE Target_Scores SET machine_id = ?, order_number = ?, score1 = ?, score2 = ?, score3 = ?, score4 = ?, score5 = ?, score6 = ?, score7 = ?, score8 = ?, score9 = ?, score10 = ? WHERE id = ?';
        $params = [(int)$input['machine_id'], (int)$input['order_number']];
        for ($i = 1; $i <= 10; $i++) $params[] = (int)($input['values'][$i] ?? 0);
        $params[] = $id;
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $stmt = $pdo->prepare('SELECT ts.*, m.machine_name FROM Target_Scores ts JOIN Machines m ON ts.machine_id = m.id WHERE ts.id = ?');
        $stmt->execute([$id]);
        sendJson(serializeTargetScore($stmt->fetch()));
    } else { // Update a master machine (title only)
        if (empty($input['machine_name'])) {
            sendJson(['error' => 'machine_name is required'], 400);
        }
        $sql = 'UPDATE Machines SET machine_name = ? WHERE id = ?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$input['machine_name'], $id]);

        // Fetch the updated master machine
        $stmt = $pdo->prepare('SELECT id, machine_name FROM Machines WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(serializeMasterMachine($stmt->fetch()));
    }
}

// DELETE: Remove a frame configuration (Protected by API Secret)
if ($method === 'DELETE') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) { // ID of the entity to delete
        sendJson(['error' => 'id query parameter is required'], 400);
    }
    
    $table = ($action === 'target') ? 'Target_Scores' : 'Machines';
    $stmt = $pdo->prepare("DELETE FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    sendJson(['success' => true]);
}

sendJson(['error' => 'Unsupported request method'], 405);
