<?php
require_once __DIR__ . '/../config.php';
initDatabase();
$pdo = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;
    if (!$playerId) {
        sendJson(['error' => 'playerId query parameter is required'], 400);
    }

    $stmt = $pdo->prepare(
        'SELECT s.id, s.player_id, s.frame, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name, m.frame_number
         FROM Scores s
         JOIN Machines m ON m.id = s.machine_id
         WHERE s.player_id = ?
         ORDER BY s.frame ASC'
    );
    $stmt->execute([$playerId]);
    sendJson($stmt->fetchAll());
}

$input = getJsonInput();

if ($method === 'POST') {
    validateApiSecret();
    
    $playerId = isset($input['playerId']) ? (int)$input['playerId'] : 0;
    $frame = isset($input['frame']) ? (int)$input['frame'] : 0;
    $machineId = isset($input['machineId']) ? (int)$input['machineId'] : 0;
    $ball1 = isset($input['ball1']) ? (int)$input['ball1'] : 0;
    $ball2 = isset($input['ball2']) ? (int)$input['ball2'] : 0;
    $ball3 = isset($input['ball3']) ? (int)$input['ball3'] : 0;

    if (!$playerId || !$frame || !$machineId) {
        sendJson(['error' => 'playerId, frame, and machineId are required'], 400);
    }
    
    // Basic range validation
    if ($ball1 < 0 || $ball2 < 0 || $ball3 < 0 || $ball1 > 1000000000) {
        sendJson(['error' => 'Invalid score values'], 400);
    }

    $sql = 'INSERT INTO Scores (player_id, frame, machine_id, ball1, ball2, ball3)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE machine_id = ?, ball1 = ?, ball2 = ?, ball3 = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$playerId, $frame, $machineId, $ball1, $ball2, $ball3, $machineId, $ball1, $ball2, $ball3]);

    $stmt = $pdo->prepare('SELECT * FROM Scores WHERE player_id = ? AND frame = ?');
    $stmt->execute([$playerId, $frame]);
    sendJson($stmt->fetch());
}

if ($method === 'DELETE') {
    validateApiSecret();
    $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;
    if (!$playerId) {
        sendJson(['error' => 'playerId query parameter is required'], 400);
    }
    $stmt = $pdo->prepare('DELETE FROM Scores WHERE player_id = ?');
    $stmt->execute([$playerId]);
    sendJson(['success' => true]);
}

sendJson(['error' => 'Unsupported request method'], 405);
