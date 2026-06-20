<?php
/**
 * REST API for managing player matchups (PinBaseball pairings).
 * 
 * Supported Methods:
 * - GET: Retrieve matchups for a specific eventId.
 * - POST: Save (insert or update) matchups for an event.
 * - DELETE: Delete matchups for an event.
 * 
 * Query Parameters:
 * - eventId: Required for GET and DELETE.
 */
require_once __DIR__ . '/../includes/config.php';

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];

    // GET: Retrieve all matchups for an event
    if ($method === 'GET') {
        $event_id = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
        if (!$event_id) {
            sendJson(['error' => 'eventId query parameter is required'], 400);
        }

        $stmt = $pdo->prepare('
            SELECT m.*, p1.player_name AS player1_name, p2.player_name AS player2_name, mac.machine_name
            FROM matchups m
            JOIN players p1 ON m.player1_id = p1.id
            JOIN players p2 ON m.player2_id = p2.id
            JOIN machines mac ON m.machine_id = mac.id
            WHERE m.event_id = ?
            ORDER BY m.order_number ASC, m.id ASC
        ');
        $stmt->execute([$event_id]);
        sendJson(array_map('serializeMatchup', $stmt->fetchAll()));
    }

    // POST: Save or update matchups (Protected by TD/Admin Access)
    if ($method === 'POST') {
        $input = getJsonInput();
        if (empty($input)) {
            sendJson(['error' => 'Request body is empty'], 400);
        }

        // Standardize input as list of items
        $matchups = isset($input[0]) ? $input : [$input];

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('
                INSERT INTO matchups (event_id, order_number, player1_id, player2_id, machine_id)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE machine_id = VALUES(machine_id)
            ');

            foreach ($matchups as $m) {
                $event_id = isset($m['eventId']) ? (int)$m['eventId'] : 0;
                $order_number = isset($m['orderNumber']) ? (int)$m['orderNumber'] : 0;
                $p1_id = isset($m['player1Id']) ? (int)$m['player1Id'] : 0;
                $p2_id = isset($m['player2Id']) ? (int)$m['player2Id'] : 0;
                $machine_id = isset($m['machineId']) ? (int)$m['machineId'] : 0;

                if (!$event_id || !$order_number || !$p1_id || !$p2_id || !$machine_id) {
                    throw new Exception('eventId, orderNumber, player1Id, player2Id, and machineId are required');
                }

                $stmt->execute([$event_id, $order_number, $p1_id, $p2_id, $machine_id]);
            }
            $pdo->commit();
            sendJson(['success' => true]);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    // DELETE: Clear all matchups for an event (Protected by Admin Access)
    if ($method === 'DELETE') {
        $event_id = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
        if (!$event_id) {
            sendJson(['error' => 'eventId query parameter is required'], 400);
        }

        $stmt = $pdo->prepare('DELETE FROM matchups WHERE event_id = ?');
        $stmt->execute([$event_id]);
        sendJson(['success' => true]);
    }

    sendJson(['error' => 'Unsupported request method'], 405);

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
