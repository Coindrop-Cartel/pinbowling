<?php
/**
 * Data service for configuring PinBowling machines and their scoring thresholds.
 * 
 * Supported Methods:
 * - GET: Fetch master machine registry or event-specific target scores.
 * - POST: Add master machines, create target scores, or bulk-reorder rounds.
 * - PUT: Update master machine names or specific target score thresholds.
 * - DELETE: Remove machines from global registry or targets from specific events.
 * 
 * Query Parameters:
 * - task: 'machine' (default), 'threshold', or 'sort'
 * - eventId: Filter targets by event
 * - leagueId: Filter targets by league
 */
require_once __DIR__ . '/../includes/config.php';

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
        'eventId' => isset($row['event_id']) ? (int)$row['event_id'] : null,
        'machineId' => (int)$row['machine_id'], // This is the ID of the master machine
        'machineName' => $row['machine_name'], // Joined from Machines table
        'orderNumber' => (int)$row['order_number'],
        'value1' => (int)($row['value1'] ?? 0),
        'value2' => (int)($row['value2'] ?? 0),
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
        'machineId' => (int)$row['id'],
        'machineName' => $row['machine_name'],
        'year' => $row['year'] ? (int)$row['year'] : null,
        'manufacturer' => $row['manufacturer'] ?? null,
    ];
}

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $task = $_GET['task'] ?? 'machine';
    $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
    $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;

    // GET: Retrieve the configuration for all rounds
    if ($method === 'GET') {
        if ($leagueId) { // Fetch all target scores for all events in a league
            $stmt = $pdo->prepare('
                SELECT ts.*, m.machine_name 
                FROM target_scores ts 
                JOIN machines m ON ts.machine_id = m.id 
                JOIN events e ON ts.event_id = e.id
                WHERE e.league_id = ? 
                ORDER BY ts.event_id ASC, ts.order_number ASC
            ');
            $stmt->execute([$leagueId]);
            $machines = array_map('serializeTargetScore', $stmt->fetchAll());
        } else if ($eventId) { // Fetch event-specific target scores
            $stmt = $pdo->prepare('
                SELECT ts.*, m.machine_name 
                FROM target_scores ts 
                JOIN machines m ON ts.machine_id = m.id 
                WHERE ts.event_id = ? 
                ORDER BY ts.order_number ASC
            ');
            $stmt->execute([$eventId]);
            $machines = array_map('serializeTargetScore', $stmt->fetchAll());
        } else { // Fetch master list of machines (titles only)
            $stmt = $pdo->query('SELECT id, machine_name, year, manufacturer FROM machines ORDER BY machine_name ASC');
            $machines = array_map('serializeMasterMachine', $stmt->fetchAll());
        }
        sendJson($machines);
    }

    $input = getJsonInput();

    // POST: Add a new round/machine configuration (Protected by API Secret)
    if ($method === 'POST') {
        if ($task === 'sort') {
            if (!is_array($input)) sendJson(['error' => 'Input must be an array of updates'], 400);

            // Fetch the event_id for the targets we are reordering.
            $stmtAuth = $pdo->prepare('
                SELECT e.league_id, ts.event_id 
                FROM target_scores ts 
                JOIN events e ON ts.event_id = e.id 
                WHERE ts.id = ?
            ');
            $stmtAuth->execute([(int)$input[0]['id']]);
            $auth = $stmtAuth->fetch();

            if (!$auth) sendJson(['error' => 'Invalid target ID'], 400);
            
            validateLeagueAccess($pdo, $auth['league_id']);
            $eventId = $auth['event_id'];

            $pdo->beginTransaction();
            try {
                // To safely reorder across both target_scores and scores tables without unique key
                // violations, we use a two-step "high-number shift" approach.
                
                // Step 1: Shift existing order_numbers to a high range (current + 1000)
                // We fetch current numbers first to ensure we can map the Scores table correctly.
                $stmtMap = $pdo->prepare('SELECT id, order_number FROM target_scores WHERE event_id = ?');
                $stmtMap->execute([$eventId]);
                $currentMapping = $stmtMap->fetchAll(PDO::FETCH_KEY_PAIR); // [id => old_order]

                $stmtShiftTarget = $pdo->prepare('UPDATE target_scores SET order_number = order_number + 1000 WHERE event_id = ?');
                $stmtShiftTarget->execute([$eventId]);
                
                $stmtShiftScores = $pdo->prepare('UPDATE scores SET order_number = order_number + 1000 WHERE event_id = ?');
                $stmtShiftScores->execute([$eventId]);

                // Step 2: Apply the new normalized incremental order numbers
                $stmtUpdateTarget = $pdo->prepare('UPDATE target_scores SET order_number = ? WHERE id = ?');
                $stmtUpdateScores = $pdo->prepare('UPDATE scores SET order_number = ? WHERE event_id = ? AND order_number = ?');

                foreach ($input as $item) {
                    $id = (int)$item['id'];
                    $newOrder = (int)$item['orderNumber'];
                    $oldOrderShifted = (int)($currentMapping[$id] ?? 0) + 1000;

                    $stmtUpdateTarget->execute([$newOrder, $id]);
                    if ($oldOrderShifted > 1000) {
                        $stmtUpdateScores->execute([$newOrder, $eventId, $oldOrderShifted]);
                    }
                }

                $pdo->commit();
                sendJson(['success' => true]);
            } catch (Exception $e) {
                $pdo->rollBack();
                sendJson(['error' => $e->getMessage()], 500);
            }
        }

        // Task 'threshold' handles event-specific target scores (target_scores table)
        if ($task === 'threshold') {
            $batch = isset($input[0]) ? $input : [$input];
            $pdo->beginTransaction();
            try {
                // Validate access for the target league (Setup change)
                $firstEventId = $batch[0]['eventId'] ?? 0;
                $stmtL = $pdo->prepare('SELECT league_id FROM events WHERE id = ?');
                $stmtL->execute([(int)$firstEventId]);
                validateLeagueAccess($pdo, $stmtL->fetchColumn());

                // If batch updating, shift all current records to high range to avoid unique key collisions during reorder
                if (count($batch) > 1) {
                    $eventIds = array_unique(array_column($batch, 'eventId'));
                    foreach ($eventIds as $eid) {
                        $pdo->prepare('UPDATE target_scores SET order_number = order_number + 1000 WHERE event_id = ?')->execute([(int)$eid]);
                        $pdo->prepare('UPDATE scores SET order_number = order_number + 1000 WHERE event_id = ?')->execute([(int)$eid]);
                    }
                }

                foreach ($batch as $item) {
                    if (empty($item['eventId']) || empty($item['machineId'])) throw new Exception('eventId and machineId are required');
                    $id = (int)($item['id'] ?? 0);
                    if ($id) {
                        // Find the "shifted" original order number to correctly update the scores table
                        $stmtOrig = $pdo->prepare('SELECT order_number FROM target_scores WHERE id = ?');
                        $stmtOrig->execute([$id]);
                        $shiftedOldOrder = (int)$stmtOrig->fetchColumn();

                        $sql = 'UPDATE target_scores SET machine_id = ?, order_number = ?, value1 = ?, value2 = ?, score1 = ?, score2 = ?, score3 = ?, score4 = ?, score5 = ?, score6 = ?, score7 = ?, score8 = ?, score9 = ?, score10 = ? WHERE id = ?';
                        $params = [(int)$item['machineId'], (int)$item['orderNumber'], (int)($item['value1'] ?? 0), (int)($item['value2'] ?? 0)];
                        for ($i = 1; $i <= 10; $i++) $params[] = (int)($item['values'][$i] ?? 0);
                        $params[] = $id;

                        // Update Scores table to match the new order number
                        $stmtScores = $pdo->prepare('UPDATE scores SET order_number = ? WHERE event_id = ? AND order_number = ?');
                        $stmtScores->execute([(int)$item['orderNumber'], (int)$item['eventId'], $shiftedOldOrder]);
                    } else {
                        $sql = 'INSERT INTO target_scores (event_id, machine_id, order_number, value1, value2, score1, score2, score3, score4, score5, score6, score7, score8, score9, score10) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE machine_id = VALUES(machine_id), value1=VALUES(value1), value2=VALUES(value2), score1=VALUES(score1), score2=VALUES(score2), score3=VALUES(score3), score4=VALUES(score4), score5=VALUES(score5), score6=VALUES(score6), score7=VALUES(score7), score8=VALUES(score8), score9=VALUES(score9), score10=VALUES(score10)';
                        $params = [(int)$item['eventId'], (int)$item['machineId'], (int)$item['orderNumber'], (int)($item['value1'] ?? 0), (int)($item['value2'] ?? 0)];
                        for ($i = 1; $i <= 10; $i++) $params[] = (int)($item['values'][$i] ?? 0);
                    }
                    $pdo->prepare($sql)->execute($params);
                }
                $pdo->commit();
                sendJson(['success' => true]); // Logic exits here for 'threshold'
            } catch (Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                sendJson(['error' => $e->getMessage()], 400);
            }
        }

        // Default behavior: Create a new master machine (Machines table)
        // Standard: 'machineName'. Fallback: 'name' (to be deprecated).
        $name = $input['machineName'] ?? $input['name'] ?? null; 
        if (!$name) {
            sendJson(['error' => 'machineName is required'], 400);
        }
        $year = isset($input['year']) ? (int)$input['year'] : null;
        $mfg = $input['manufacturer'] ?? null;

        try {
            $stmt = $pdo->prepare('INSERT INTO machines (machine_name, year, manufacturer) VALUES (?, ?, ?)');
            $stmt->execute([$name, $year, $mfg]);
        } catch (PDOException $error) {
            if ($error->errorInfo[1] === 1062) {
                $stmt = $pdo->prepare('SELECT id, machine_name, year, manufacturer FROM machines WHERE machine_name = ?');
                $stmt->execute([$name]);
                sendJson(serializeMasterMachine($stmt->fetch()), 409);
            }
            throw $error;
        }
        $id = (int)$pdo->lastInsertId();

        $stmt = $pdo->prepare('SELECT id, machine_name, year, manufacturer FROM machines WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            sendJson(['error' => 'Machine created but could not be retrieved.'], 500);
        }
        sendJson(serializeMasterMachine($row));
    }

    // PUT: Update an existing round configuration (Protected by API Secret)
    if ($method === 'PUT') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) sendJson(['error' => 'id query parameter is required'], 400);
        
        // Task 'threshold' handles target_scores, default handles master machines
        if ($task === 'threshold') {
            if (empty($input['machineId']) || empty($input['orderNumber']) || empty($input['values'])) {
                sendJson(['error' => 'machineId, orderNumber, and values are required for target scores'], 400);
            }

            // Setup change: Admin or League access required
            $stmtL = $pdo->prepare('SELECT e.league_id FROM target_scores ts JOIN events e ON ts.event_id = e.id WHERE ts.id = ?');
            $stmtL->execute([$id]);
            $lId = $stmtL->fetchColumn();
            validateLeagueAccess($pdo, $lId);

            $sql = 'UPDATE target_scores SET machine_id = ?, order_number = ?, value1 = ?, value2 = ?, score1 = ?, score2 = ?, score3 = ?, score4 = ?, score5 = ?, score6 = ?, score7 = ?, score8 = ?, score9 = ?, score10 = ? WHERE id = ?';
            $params = [(int)$input['machineId'], (int)$input['orderNumber'], (int)($input['value1'] ?? 0), (int)($input['value2'] ?? 0)];
            for ($i = 1; $i <= 10; $i++) $params[] = (int)($input['values'][$i] ?? 0);
            $params[] = $id;
            $pdo->prepare($sql)->execute($params);
            $stmt = $pdo->prepare('SELECT ts.*, m.machine_name FROM target_scores ts JOIN machines m ON ts.machine_id = m.id WHERE ts.id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                sendJson(['error' => 'Target score updated but could not be retrieved.'], 500);
            }
            sendJson(serializeTargetScore($row));
        } else { // Update a master machine (title only)
            // Master DB modification: TD or Admin access required
            validateTDAccess();

            $name = $input['machineName'] ?? $input['name'] ?? null;
            if (!$name) sendJson(['error' => 'machineName is required'], 400);
            $year = isset($input['year']) ? (int)$input['year'] : null;
            $mfg = $input['manufacturer'] ?? null;

            try {
                $sql = 'UPDATE machines SET machine_name = ?, year = ?, manufacturer = ? WHERE id = ?';
                $pdo->prepare($sql)->execute([$name, $year, $mfg, $id]);
            } catch (PDOException $error) {
                if ($error->errorInfo[1] === 1062) {
                    sendJson(['error' => 'Machine name already exists'], 409);
                }
                throw $error;
            }

            // Fetch the updated master machine
            $stmt = $pdo->prepare('SELECT id, machine_name, year, manufacturer FROM machines WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                sendJson(['error' => 'Machine updated but could not be retrieved.'], 500);
            }
            sendJson(serializeMasterMachine($row));
        }
    }

    // DELETE: Remove a round configuration (Protected by API Secret)
    if ($method === 'DELETE') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) { // ID of the entity to delete
            sendJson(['error' => 'id query parameter is required'], 400);
        }
        
        if ($task === 'threshold') {
            // Setup change: Admin or League access required
            $stmtL = $pdo->prepare('SELECT e.league_id FROM target_scores ts JOIN events e ON ts.event_id = e.id WHERE ts.id = ?');
            $stmtL->execute([$id]);
            $lId = $stmtL->fetchColumn();
            validateLeagueAccess($pdo, $lId);
            $table = 'target_scores';
        } else {
            // Master DB modification: Admin access required
            validateAdminAccess();
            $table = 'machines';
        }

        $stmt = $pdo->prepare("DELETE FROM $table WHERE id = ?");
        $stmt->execute([$id]);
        sendJson(['success' => true]);
    }

    sendJson(['error' => 'Unsupported request method'], 405);

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}