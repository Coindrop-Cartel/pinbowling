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

/**
 * Helper to transform flat database rows into camelCase JSON.
 * @param array $row
 * @return array
 */
function serializeScore($row) {
    return [
        'id' => (int)$row['id'],
        'playerId' => (int)$row['player_id'],
        'eventId' => isset($row['event_id']) ? (int)$row['event_id'] : null,
        'orderNumber' => (int)$row['order_number'],
        'machineId' => (int)$row['machine_id'],
        'machineName' => $row['machine_name'] ?? null,
        'ball1' => (int)$row['ball1'],
        'ball2' => (int)$row['ball2'],
        'ball3' => (int)$row['ball3'],
        'status' => $row['status'] ?? 'approved'
    ];
}

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $task = $_GET['task'] ?? 'score';

    // GET: Retrieve all frame scores for a specific player
    if ($method === 'GET') {
        $event_id = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
        $player_id = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;
        $league_id = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;

        /**
         * GET modes:
         * 1. leagueId: Returns all scores for all players/events in a specific league (for summary view).
         * 2. eventId + playerId: Returns scores for a specific player session.
         * 3. eventId: Returns all scores for a specific night (for event standings).
         */
        if (!$event_id && !$league_id) {
            sendJson(['error' => 'eventId or leagueId query parameter is required'], 400);
        }

        if ($league_id) {
            $stmt = $pdo->prepare(
                'SELECT s.id, s.player_id, s.event_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM scores s
                 JOIN machines m ON m.id = s.machine_id
                 JOIN events e ON s.event_id = e.id
                 WHERE e.league_id = ?
                 ORDER BY s.event_id ASC, s.player_id ASC, s.order_number ASC'
            );
            $stmt->execute([$league_id]);
        } else if ($player_id) {
            $stmt = $pdo->prepare(
                'SELECT s.id, s.player_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM scores s
                 JOIN machines m ON m.id = s.machine_id
                 WHERE s.player_id = ? AND s.event_id = ?
                 ORDER BY s.order_number ASC'
            );
            $stmt->execute([$player_id, $event_id]);
        } else {
            $stmt = $pdo->prepare(
                'SELECT s.id, s.player_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM scores s
                 JOIN machines m ON m.id = s.machine_id
                 WHERE s.event_id = ?
                 ORDER BY s.player_id ASC, s.order_number ASC'
            );
            $stmt->execute([$event_id]);
        }

        sendJson(array_map('serializeScore', $stmt->fetchAll()));
    }

    $input = getJsonInput();

    // POST: Save or update a score for a specific player/frame (Protected by API Secret)
    if ($method === 'POST') {
        $event_id = isset($input['eventId']) ? (int)$input['eventId'] : 0;
        
        $player_id = isset($input['playerId']) ? (int)$input['playerId'] : 0;
        $order_number = isset($input['orderNumber']) ? (int)$input['orderNumber'] : 0;
        $machine_id = isset($input['machineId']) ? (int)$input['machineId'] : 0;
        $ball1 = isset($input['ball1']) ? (int)$input['ball1'] : 0;
        $ball2 = isset($input['ball2']) ? (int)$input['ball2'] : 0;
        $ball3 = isset($input['ball3']) ? (int)$input['ball3'] : 0;
        $status = $input['status'] ?? 'approved';

        if (!$event_id || !$player_id || !$order_number || !$machine_id) {
            sendJson(['error' => 'eventId, playerId, orderNumber, and machineId are required'], 400);
        }
        
        // Basic range validation
        if ($ball1 < 0 || $ball2 < 0 || $ball3 < 0 || $ball1 > 1000000000) {
            sendJson(['error' => 'Invalid score values'], 400);
        }

        // Security Rule: If updating an existing score in a protected 'standard' league,
        // verify League or Admin credentials.
        $stmtL = $pdo->prepare('SELECT l.id, l.password, l.type FROM events e JOIN leagues l ON e.league_id = l.id WHERE e.id = ?');
        $stmtL->execute([$event_id]);
        $leagueInfo = $stmtL->fetch();

        if ($leagueInfo) {
            $league_id = (int)$leagueInfo['id'];
            $hasPassword = !empty($leagueInfo['password']);
            $isStandard = ($leagueInfo['type'] === 'standard');

            // Check if a score record already exists for this slot
            $stmtCheck = $pdo->prepare('SELECT id FROM scores WHERE event_id = ? AND player_id = ? AND order_number = ?');
            $stmtCheck->execute([$event_id, $player_id, $order_number]);
            $existingScoreId = $stmtCheck->fetchColumn();

            if ($existingScoreId && $hasPassword && $isStandard) {
                validateLeagueAccess($pdo, $league_id);
            }
        }

        $pdo->beginTransaction();
        try {
            // Log history for existing record before update
            if ($existingScoreId) {
                $stmtFetch = $pdo->prepare('SELECT * FROM scores WHERE id = ?');
                $stmtFetch->execute([$existingScoreId]);
                $old = $stmtFetch->fetch();
                if ($old) {
                    $stmtHistory = $pdo->prepare('INSERT INTO score_history (score_id, event_id, player_id, order_number, machine_id, ball1, ball2, ball3, status, change_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "UPDATE")');
                    $stmtHistory->execute([$old['id'], $old['event_id'], $old['player_id'], $old['order_number'], $old['machine_id'], $old['ball1'], $old['ball2'], $old['ball3'], $old['status']]);
                }
            }

            $sql = 'INSERT INTO scores (event_id, player_id, `order_number`, machine_id, ball1, ball2, ball3, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE machine_id = VALUES(machine_id), ball1 = VALUES(ball1), ball2 = VALUES(ball2), ball3 = VALUES(ball3), status = VALUES(status)';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$event_id, $player_id, $order_number, $machine_id, $ball1, $ball2, $ball3, $status]);

            // Log history for the new record after insert
            if (!$existingScoreId) {
                $newId = $pdo->lastInsertId();
                $stmtHistory = $pdo->prepare('INSERT INTO score_history (score_id, event_id, player_id, order_number, machine_id, ball1, ball2, ball3, status, change_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "INSERT")');
                $stmtHistory->execute([$newId, $event_id, $player_id, $order_number, $machine_id, $ball1, $ball2, $ball3, $status]);
            }

            $pdo->commit();
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }

        // Fetch the newly created/updated row with the machine name joined for UI consistency
        $stmt = $pdo->prepare('
            SELECT s.*, m.machine_name 
            FROM scores s 
            LEFT JOIN machines m ON s.machine_id = m.id 
            WHERE s.player_id = ? AND s.`order_number` = ? AND s.event_id = ?
        ');
        $stmt->execute([$player_id, $order_number, $event_id]);
        
        $row = $stmt->fetch();
        if (!$row) {
            sendJson(['error' => "Score saved but could not be retrieved (Event: $event_id, Player: $player_id, Round: $order_number). This usually indicates duplicate rows in the 'scores' table or missing Unique Constraints."], 500);
        }
        sendJson(serializeScore($row));
    }

    // DELETE: Clear all scores for a specific player (Protected by API Secret)
    if ($method === 'DELETE') {
        validateAdminAccess();
        $player_id = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;
        if (!$player_id) {
            sendJson(['error' => 'playerId query parameter is required'], 400);
        }

        $pdo->beginTransaction();
        try {
            // Log all scores to history as DELETE before removal
            $stmtFetch = $pdo->prepare('SELECT * FROM scores WHERE player_id = ?');
            $stmtFetch->execute([$player_id]);
            $rows = $stmtFetch->fetchAll();

            $stmtHistory = $pdo->prepare('INSERT INTO score_history (score_id, event_id, player_id, order_number, machine_id, ball1, ball2, ball3, status, change_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "DELETE")');
            foreach ($rows as $row) {
                $stmtHistory->execute([$row['id'], $row['event_id'], $row['player_id'], $row['order_number'], $row['machine_id'], $row['ball1'], $row['ball2'], $row['ball3'], $row['status']]);
            }

            $stmt = $pdo->prepare('DELETE FROM scores WHERE player_id = ?');
            $stmt->execute([$player_id]);
            
            $pdo->commit();
            sendJson(['success' => true]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    sendJson(['error' => 'Unsupported request method'], 405);

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
