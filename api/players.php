<?php
require_once __DIR__ . '/../config.php';
initDatabase();
$pdo = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->query('SELECT * FROM Players ORDER BY player_name ASC');
    sendJson($stmt->fetchAll());
}

$input = getJsonInput();

if ($method === 'POST') {
    if (empty($input['player_name'])) {
        sendJson(['error' => 'player_name is required'], 400);
    }

    try {
        $stmt = $pdo->prepare('INSERT INTO Players (player_name) VALUES (?)');
        $stmt->execute([$input['player_name']]);
        $id = (int)$pdo->lastInsertId();
    } catch (PDOException $error) {
        if ($error->errorInfo[1] === 1062) {
            $stmt = $pdo->prepare('SELECT * FROM Players WHERE player_name = ?');
            $stmt->execute([$input['player_name']]);
            sendJson($stmt->fetch());
        }
        sendJson(['error' => 'Unable to add player'], 500);
    }

    $stmt = $pdo->prepare('SELECT * FROM Players WHERE id = ?');
    $stmt->execute([$id]);
    sendJson($stmt->fetch());
}

sendJson(['error' => 'Unsupported request method'], 405);
