<?php
/**
 * Machine Management REST API Endpoint.
 * HTTP controller that delegates to the MachineService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $container = $GLOBALS['container'];
    $machineService = $container->get(\App\Service\MachineService::class);
    
    $method = $_SERVER['REQUEST_METHOD'];
    $task = $_GET['task'] ?? 'machine';
    $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
    $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
    $input = getJsonInput();

    // GET: Retrieve machines or target scores
    if ($method === 'GET') {
        if ($leagueId) {
            // Get target scores for league
            $targets = $machineService->getLeagueTargetScores($leagueId);
            sendJson(array_map('serializeTargetScore', $targets));
        } else if ($eventId) {
            // Get target scores for event
            $targets = $machineService->getEventTargetScores($eventId);
            sendJson(array_map('serializeTargetScore', $targets));
        } else {
            // Get master machine list
            $machines = $machineService->getAllMachines();
            sendJson(array_map('serializeMasterMachine', $machines));
        }
    }

    // POST: Create machine, target scores, or reorder
    if ($method === 'POST') {
        if ($task === 'sort') {
            // Reorder target scores
            if (!is_array($input)) {
                sendJson(['error' => 'Input must be an array'], 400);
            }
            
            validateTDAccess();
            $machineService->reorderTargetScores($input);
            sendJson(['success' => true]);
            
        } else if ($eventId) {
            // Create/update target scores for event
            validateTDAccess();
            
            if (!is_array($input)) {
                $input = [$input];
            }
            
            $machineService->saveTargetScores($eventId, $input);
            sendJson(['success' => true]);
            
        } else {
            // Create new master machine
            if (empty($input['machineName'])) {
                sendJson(['error' => 'machineName is required'], 400);
            }
            
            validateAdminAccess();
            
            $machine = $machineService->createMachine(
                $input['machineName'],
                $input['year'] ?? null,
                $input['manufacturer'] ?? null
            );
            sendJson(serializeMasterMachine($machine));
        }
    }

    // PUT: Update machine or target scores
    if ($method === 'PUT') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            sendJson(['error' => 'id query parameter is required'], 400);
        }
        
        validateTDAccess();
        
        if ($eventId) {
            // Update target scores
            $machineService->saveTargetScores($eventId, [$input]);
        } else {
            // Update machine
            validateAdminAccess();
            $machineService->updateMachine(
                $id,
                $input['machineName'] ?? null,
                $input['year'] ?? null,
                $input['manufacturer'] ?? null
            );
        }
        
        sendJson(['success' => true]);
    }

    // DELETE: Remove machine or target scores
    if ($method === 'DELETE') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            sendJson(['error' => 'id query parameter is required'], 400);
        }
        
        if ($eventId) {
            // Delete event target scores
            validateTDAccess();
            $machineService->deleteEventTargetScores($eventId);
        } else {
            // Delete machine
            validateAdminAccess();
            $machineService->deleteMachine($id);
        }
        
        sendJson(['success' => true]);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
