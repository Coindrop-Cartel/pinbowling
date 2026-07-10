<?php
/**
 * Matchup Management REST API Endpoint.
 * HTTP controller that delegates to the MatchupService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $container = $GLOBALS['container'];
    $matchupService = $container->get(\App\Service\MatchupService::class);
    
    $method = $_SERVER['REQUEST_METHOD'];

    // GET: Retrieve matchups for an event
    if ($method === 'GET') {
        $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
        if (!$eventId) {
            sendJson(['error' => 'eventId query parameter is required'], 400);
        }

        $matchups = $matchupService->getEventMatchups($eventId);
        sendJson(array_map('serializeMatchup', $matchups));
    }

    // POST: Save matchups
    if ($method === 'POST') {
        validateTDAccess();
        
        $input = getJsonInput();
        if (empty($input)) {
            sendJson(['error' => 'Request body is empty'], 400);
        }

        // Standardize input as list
        $matchups = isset($input[0]) ? $input : [$input];

        $matchupService->saveMatchups($matchups);
        sendJson(['success' => true]);
    }

    // DELETE: Delete matchups
    if ($method === 'DELETE') {
        validateTDAccess();
        
        $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
        if (!$eventId) {
            sendJson(['error' => 'eventId query parameter is required'], 400);
        }

        $matchupService->deleteEventMatchups($eventId);
        sendJson(['success' => true]);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
