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

    switch ($method) {
        case 'GET':
            $eventMatchupId = isset($_GET['eventMatchupId']) ? (int)$_GET['eventMatchupId'] : 0;
            if ($eventMatchupId) {
                $matchupInfo = $matchupService->getEventMatchup($eventMatchupId);
                if (!$matchupInfo) {
                    sendJson(['error' => 'Matchup not found'], 404);
                }
                
                $innings = $matchupService->getMatchupInnings($eventMatchupId);
                $matchupInfo['innings'] = array_map('serializeMatchup', $innings);
                
                sendJson($matchupInfo);
            } else {
                $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
                if (!$eventId) {
                    sendJson(['error' => 'eventId or eventMatchupId query parameter is required'], 400);
                }

                $matchups = $matchupService->getEventMatchups($eventId);
                sendJson(array_map('serializeMatchup', $matchups));
            }
            break;

        case 'POST':
            validateTDAccess();
            
            $input = getJsonInput();
            if (empty($input)) {
                sendJson(['error' => 'Request body is empty'], 400);
            }

            // Standardize input as list
            $matchups = isset($input[0]) ? $input : [$input];

            $matchupService->saveMatchups($matchups);
            sendJson(['success' => true]);
            break;

        case 'DELETE':
            validateTDAccess();
            
            $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
            if (!$eventId) {
                sendJson(['error' => 'eventId query parameter is required'], 400);
            }

            $matchupService->deleteEventMatchups($eventId);
            sendJson(['success' => true]);
            break;

        default:
            sendJson(['error' => 'Unsupported request method'], 405);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
