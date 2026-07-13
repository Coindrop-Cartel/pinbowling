<?php
/**
 * Score Management REST API Endpoint.
 * HTTP controller that delegates to the ScoreService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $container = $GLOBALS['container'];
    $scoreService = $container->get(\App\Service\ScoreService::class);
    
    $method = $_SERVER['REQUEST_METHOD'];
    $input = getJsonInput();

    switch ($method) {
        case 'GET':
            $eventMatchupId = isset($_GET['eventMatchupId']) ? (int)$_GET['eventMatchupId'] : 0;
            if ($eventMatchupId) {
                $scores = $scoreService->getMatchupScores($eventMatchupId);
            } else {
                $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
                $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;
                $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;

                if (!$eventId && !$leagueId) {
                    sendJson(['error' => 'eventId, leagueId, or eventMatchupId query parameter is required'], 400);
                }

                if ($leagueId) {
                    $scores = $scoreService->getLeagueScores($leagueId);
                } else {
                    $scores = $scoreService->getEventScores($eventId, $playerId ? $playerId : null);
                }
            }

            sendJson(array_map('serializeScore', $scores));
            break;

        case 'POST':
            if (empty($input['eventId']) || empty($input['playerId']) || empty($input['machineId']) || !isset($input['orderNumber'])) {
                sendJson(['error' => 'eventId, playerId, machineId, and orderNumber are required'], 400);
            }

            validateSessionOrSecret();

            $scoreService->saveScore(
                (int)$input['eventId'],
                (int)$input['playerId'],
                (int)$input['machineId'],
                (int)$input['orderNumber'],
                $input['ball1'] ?? null,
                $input['ball2'] ?? null,
                $input['ball3'] ?? null,
                isset($input['eventMatchupId']) ? (int)$input['eventMatchupId'] : null
            );

            sendJson(['success' => true]);
            break;

        case 'DELETE':
            $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
            $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;

            validateAdminAccess();

            if ($playerId && $eventId) {
                // Delete scores for player in event
                $scoreService->deletePlayerEventScores($eventId, $playerId);
            } else if ($playerId) {
                // Delete all scores for player
                $scoreService->deletePlayerScores($playerId);
            } else if ($eventId) {
                // Delete all scores for event
                $scoreService->deleteEventScores($eventId);
            } else {
                sendJson(['error' => 'eventId or playerId query parameter is required'], 400);
            }

            sendJson(['success' => true]);
            break;

        default:
            sendJson(['error' => 'Unsupported request method'], 405);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
