<?php
require_once __DIR__ . '/../config.php';
initDatabase();
$pdo = getDbConnection();

function serializeMachine($row) {
    return [
        'id' => (int)$row['id'],
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

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM Machines ORDER BY frame_number ASC');
    $machines = array_map('serializeMachine', $stmt->fetchAll());
    sendJson($machines);
}

$input = getJsonInput();

if ($method === 'POST') {
    if (empty($input['machine_name']) || empty($input['frame_number']) || empty($input['values'])) {
        sendJson(['error' => 'machine_name, frame_number, and values are required'], 400);
    }

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

if ($method === 'PUT') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id || empty($input['machine_name']) || empty($input['frame_number']) || empty($input['values'])) {
        sendJson(['error' => 'id, machine_name, frame_number, and values are required'], 400);
    }

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

if ($method === 'DELETE') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) {
        sendJson(['error' => 'Invalid machine id'], 400);
    }
    $stmt = $pdo->prepare('DELETE FROM Machines WHERE id = ?');
    $stmt->execute([$id]);
    sendJson(['success' => true]);
}

sendJson(['error' => 'Unsupported request method'], 405);
