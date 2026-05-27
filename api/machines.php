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
 * Handles rows from both Machines and Target_Scores tables.
 * @param array $row
 * @return array
 */
function serializeMachine($row) {
    return [
        'id' => (int)$row['id'],
        'event_id' => isset($row['event_id']) ? (int)$row['event_id'] : null,
        'machine_id' => isset($row['machine_id']) ? (int)$row['machine_id'] : null,
        'machine_name' => $row['machine_name'],
        'frame_number' => (int)$row['frame_number'],
        'values' => [
            1 => (int)$row['score1'],
            2 => (int)$row['score2'],
            3 => (int)$row['score3'],
            4 => (int)$row['score4'],
            5 => (int)$row['score5'],
            6 => (int)$row['score6'],
            7 => (int)$row['score7'],
            8 => (int)$row['score8'],
            9 => (int)$row['score9'],
            10 => (int)$row['score10'],
        ],
    ];
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'machine';
$eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;

// GET: Retrieve the configuration for all frames
if ($method === 'GET') {
    if ($eventId) {
        $stmt = $pdo->prepare('
            SELECT ts.*, m.machine_name 
            FROM Target_Scores ts 
            JOIN Machines m ON ts.machine_id = m.id 
            WHERE ts.event_id = ? 
            ORDER BY ts.frame_number ASC
        ');
        $stmt->execute([$eventId]);
    } else {
        $stmt = $pdo->query('SELECT * FROM Machines ORDER BY frame_number ASC');
    }
    $machines = array_map('serializeMachine', $stmt->fetchAll());
    sendJson($machines);
}

$input = getJsonInput();

// POST: Add a new frame/machine configuration (Protected by API Secret)
if ($method === 'POST') {
    validateApiSecret();
    
    if (empty($input['machine_name']) || empty($input['frame_number']) || empty($input['values'])) {
        sendJson(['error' => 'machine_name, frame_number, and values are required'], 400);
    }

    if ($action === 'target') {
        if (empty($input['event_id']) || empty($input['machine_id'])) {
            sendJson(['error' => 'event_id and machine_id are required for target scores'], 400);
        }
        $sql = 'INSERT INTO Target_Scores (event_id, machine_id, frame_number, score1, score2, score3, score4, score5, score6, score7, score8, score9, score10) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE machine_id = VALUES(machine_id), 
                   score1=VALUES(score1), score2=VALUES(score2), score3=VALUES(score3), score4=VALUES(score4), score5=VALUES(score5),
                   score6=VALUES(score6), score7=VALUES(score7), score8=VALUES(score8), score9=VALUES(score9), score10=VALUES(score10)';
        $params = [(int)$input['event_id'], (int)$input['machine_id'], (int)$input['frame_number']];
        for ($i = 1; $i <= 10; $i++) $params[] = (int)($input['values'][$i] ?? 0);

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        
        $stmt = $pdo->prepare('SELECT ts.*, m.machine_name FROM Target_Scores ts JOIN Machines m ON ts.machine_id = m.id WHERE ts.event_id = ? AND ts.frame_number = ?');
        $stmt->execute([(int)$input['event_id'], (int)$input['frame_number']]);
        sendJson(serializeMachine($stmt->fetch()));
    } else {
        $sql = 'INSERT INTO Machines (machine_name, frame_number, score1, score2, score3, score4, score5, score6, score7, score8, score9, score10) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $params = [
            $input['machine_name'],
            (int)$input['frame_number'],
        ];

        for ($i = 1; $i <= 10; $i++) {
            $params[] = isset($input['values'][$i]) ? (int)$input['values'][$i] : 0;
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $id = (int)$pdo->lastInsertId();

        $stmt = $pdo->prepare('SELECT * FROM Machines WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(serializeMachine($stmt->fetch()));
    }
}

// PUT: Update an existing frame configuration (Protected by API Secret)
if ($method === 'PUT') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id || empty($input['machine_name']) || empty($input['frame_number']) || empty($input['values'])) {
        sendJson(['error' => 'id, machine_name, frame_number, and values are required'], 400);
    }

    if ($action === 'target') {
        $sql = 'UPDATE Target_Scores SET machine_id = ?, frame_number = ?, score1 = ?, score2 = ?, score3 = ?, score4 = ?, score5 = ?, score6 = ?, score7 = ?, score8 = ?, score9 = ?, score10 = ? WHERE id = ?';
        $params = [(int)$input['machine_id'], (int)$input['frame_number']];
        for ($i = 1; $i <= 10; $i++) $params[] = (int)($input['values'][$i] ?? 0);
        $params[] = $id;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $stmt = $pdo->prepare('SELECT ts.*, m.machine_name FROM Target_Scores ts JOIN Machines m ON ts.machine_id = m.id WHERE ts.id = ?');
        $stmt->execute([$id]);
        sendJson(serializeMachine($stmt->fetch()));
    } else {
        $sql = 'UPDATE Machines SET machine_name = ?, frame_number = ?, score1 = ?, score2 = ?, score3 = ?, score4 = ?, score5 = ?, score6 = ?, score7 = ?, score8 = ?, score9 = ?, score10 = ? WHERE id = ?';
        $params = [
            $input['machine_name'],
            (int)$input['frame_number'],
        ];

        for ($i = 1; $i <= 10; $i++) {
            $params[] = isset($input['values'][$i]) ? (int)$input['values'][$i] : 0;
        }
        $params[] = $id;

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $stmt = $pdo->prepare('SELECT * FROM Machines WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(serializeMachine($stmt->fetch()));
    }
}

// DELETE: Remove a frame configuration (Protected by API Secret)
if ($method === 'DELETE') {
    validateApiSecret();
    
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) {
        sendJson(['error' => 'Invalid machine id'], 400);
    }
    
    $table = ($action === 'target') ? 'Target_Scores' : 'Machines';
    $stmt = $pdo->prepare("DELETE FROM $table WHERE id = ?");
    $stmt->execute([$id]);
    sendJson(['success' => true]);
}

sendJson(['error' => 'Unsupported request method'], 405);
