<?php
/**
 * REST API for recording and retrieving raw pinball scores.
 * 
 * Supported Methods:
 * - GET: Retrieve scores. Supports filtering by eventId + playerId (session view), 
 *        eventId (event standings), or leagueId (season summary).
 * - POST: Upsert (insert or update) a score for a specific player, event, and round.
 * - DELETE: Clear all scores recorded for a specific player across all events.
 * 
 * Query Parameters (GET):
 * - eventId: Primary filter for night-specific scores.
 * - playerId: Secondary filter for player-specific scores.
 * - leagueId: Filter for fetching scores across all events in a league.
 * 
 * Query Parameters (DELETE):
 * - playerId: Required (the ID of the player whose scores will be wiped).
 */
require_once __DIR__ . '/../includes/config.php';

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];

    // GET: Retrieve all frame scores for a specific player
    if ($method === 'GET') {
        $event_id = isset($_GET['event_id']) ? (int)$_GET['event_id'] : 0;
        $player_id = isset($_GET['player_id']) ? (int)$_GET['player_id'] : 0;
        $league_id = isset($_GET['league_id']) ? (int)$_GET['league_id'] : 0;

        /**
         * GET modes:
         * 1. league_id: Returns all scores for all players/events in a specific league (for summary view).
         * 2. event_id + player_id: Returns scores for a specific player session.
         * 3. event_id: Returns all scores for a specific night (for event standings).
         */
        if (!$event_id && !$league_id) {
            sendJson(['error' => 'event_id or league_id query parameter is required'], 400);
        }

        if ($league_id) {
            $stmt = $pdo->prepare(
                'SELECT s.id, s.player_id, s.event_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM Scores s
                 JOIN Machines m ON m.id = s.machine_id
                 JOIN Events e ON s.event_id = e.id
                 WHERE e.league_id = ?
                 ORDER BY s.event_id ASC, s.player_id ASC, s.order_number ASC'
            );
            $stmt->execute([$league_id]);
        } else if ($player_id) {
            $stmt = $pdo->prepare(
                'SELECT s.id, s.player_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM Scores s
                 JOIN Machines m ON m.id = s.machine_id
                 WHERE s.player_id = ? AND s.event_id = ?
                 ORDER BY s.order_number ASC'
            );
            $stmt->execute([$player_id, $event_id]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT s.id, s.player_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM Scores s
                 JOIN Machines m ON m.id = s.machine_id
                 WHERE s.event_id = ?
                 ORDER BY s.player_id ASC, s.order_number ASC'
            );
            $stmt->execute([$event_id]);
        }

        sendJson($stmt->fetchAll());
    }

    $input = getJsonInput();

    // POST: Save or update a score for a specific player/frame (Protected by API Secret)
    if ($method === 'POST') {
        $event_id = isset($input['event_id']) ? (int)$input['event_id'] : 0;
        validateApiSecret();
        
        $player_id = isset($input['player_id']) ? (int)$input['player_id'] : 0;
        $order_number = isset($input['order_number']) ? (int)$input['order_number'] : 0;
        $machine_id = isset($input['machine_id']) ? (int)$input['machine_id'] : 0;
        $ball1 = isset($input['ball1']) ? (int)$input['ball1'] : 0;
        $ball2 = isset($input['ball2']) ? (int)$input['ball2'] : 0;
        $ball3 = isset($input['ball3']) ? (int)$input['ball3'] : 0;

        if (!$event_id || !$player_id || !$order_number || !$machine_id) {
            sendJson(['error' => 'event_id, player_id, order_number, and machine_id are required'], 400);
        }
        
        // Basic range validation
        if ($ball1 < 0 || $ball2 < 0 || $ball3 < 0 || $ball1 > 1000000000) {
            sendJson(['error' => 'Invalid score values'], 400);
        }

        $sql = 'INSERT INTO Scores (event_id, player_id, order_number, machine_id, ball1, ball2, ball3)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE machine_id = ?, ball1 = ?, ball2 = ?, ball3 = ?';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$event_id, $player_id, $order_number, $machine_id, $ball1, $ball2, $ball3, $machine_id, $ball1, $ball2, $ball3]);

        $stmt = $pdo->prepare('SELECT * FROM Scores WHERE player_id = ? AND order_number = ? AND event_id = ?');
        $stmt->execute([$player_id, $order_number, $event_id]);
        sendJson($stmt->fetch());
    }

    // DELETE: Clear all scores for a specific player (Protected by API Secret)
    if ($method === 'DELETE') {
        validateApiSecret();
        $player_id = isset($_GET['player_id']) ? (int)$_GET['player_id'] : 0;
        if (!$player_id) {
            sendJson(['error' => 'player_id query parameter is required'], 400);
        }
        $stmt = $pdo->prepare('DELETE FROM Scores WHERE player_id = ?');
        $stmt->execute([$player_id]);
        sendJson(['success' => true]);
    }

    sendJson(['error' => 'Unsupported request method'], 405);

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
