<?php
/**
 * REST API for recording and retrieving raw pinball scores.
 */
require_once __DIR__ . '/../includes/config.php';
initDatabase();
$pdo = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];

// GET: Retrieve all frame scores for a specific player
if ($method === 'GET') {
    $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
    $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;
    $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;

    /**
     * GET modes:
     * 1. leagueId: Returns all scores for all players/events in a specific league (for summary view).
     * 2. eventId + playerId: Returns scores for a specific player session.
     * 3. eventId: Returns all scores for a specific night (for event standings).
     */
    if (!$eventId && !$leagueId) {
        sendJson(['error' => 'eventId or leagueId query parameter is required'], 400);
    }

    if ($leagueId) {
        $stmt = $pdo->prepare(
            'SELECT s.id, s.player_id, s.event_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
             FROM Scores s
             JOIN Machines m ON m.id = s.machine_id
             JOIN Events e ON s.event_id = e.id
             WHERE e.league_id = ?
             ORDER BY s.event_id ASC, s.player_id ASC, s.order_number ASC'
        );
        $stmt->execute([$leagueId]);
    } else if ($playerId) {
        $stmt = $pdo->prepare(
            'SELECT s.id, s.player_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
             FROM Scores s
             JOIN Machines m ON m.id = s.machine_id
             WHERE s.player_id = ? AND s.event_id = ?
             ORDER BY s.order_number ASC'
        );
        $stmt->execute([$playerId, $eventId]);
    } else {
        $stmt = $pdo->prepare(
            'SELECT s.id, s.player_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
             FROM Scores s
             JOIN Machines m ON m.id = s.machine_id
             WHERE s.event_id = ?
             ORDER BY s.player_id ASC, s.order_number ASC'
        );
        $stmt->execute([$eventId]);
    }

    sendJson($stmt->fetchAll());
}

$input = getJsonInput();

// POST: Save or update a score for a specific player/frame (Protected by API Secret)
if ($method === 'POST') {
    $eventId = isset($input['eventId']) ? (int)$input['eventId'] : 0;
    validateApiSecret();
    
    $playerId = isset($input['playerId']) ? (int)$input['playerId'] : 0;
    $order_number = isset($input['order_number']) ? (int)$input['order_number'] : 0;
    $machineId = isset($input['machineId']) ? (int)$input['machineId'] : 0;
    $ball1 = isset($input['ball1']) ? (int)$input['ball1'] : 0;
    $ball2 = isset($input['ball2']) ? (int)$input['ball2'] : 0;
    $ball3 = isset($input['ball3']) ? (int)$input['ball3'] : 0;

    if (!$eventId || !$playerId || !$order_number || !$machineId) {
        sendJson(['error' => 'eventId, playerId, order_number, and machineId are required'], 400);
    }
    
    // Basic range validation
    if ($ball1 < 0 || $ball2 < 0 || $ball3 < 0 || $ball1 > 1000000000) {
        sendJson(['error' => 'Invalid score values'], 400);
    }

    $sql = 'INSERT INTO Scores (event_id, player_id, order_number, machine_id, ball1, ball2, ball3)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE machine_id = ?, ball1 = ?, ball2 = ?, ball3 = ?';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$eventId, $playerId, $order_number, $machineId, $ball1, $ball2, $ball3, $machineId, $ball1, $ball2, $ball3]);

    $stmt = $pdo->prepare('SELECT * FROM Scores WHERE player_id = ? AND order_number = ? AND event_id = ?');
    $stmt->execute([$playerId, $order_number, $eventId]);
    sendJson($stmt->fetch());
}

// DELETE: Clear all scores for a specific player (Protected by API Secret)
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
