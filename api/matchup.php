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
                $serialized = serializeEventMatchup($matchupInfo);
                $serialized['innings'] = array_map('serializeMatchup', $innings);
                
                sendJson($serialized);
            } else {
                $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
                if (!$eventId) {
                    sendJson(['error' => 'eventId or eventMatchupId query parameter is required'], 400);
                }

                $matchups = $matchupService->getEventMatchups($eventId);

                // Normalize the response shape so callers always receive a list
                // of event-matchup wrappers, each with an `innings` array — the
                // same structure returned when fetching by eventMatchupId.
                //
                // League sessions already store parent event_matchups rows and
                // child matchups rows linked via event_matchup_id; those are
                // grouped under their parent. One-off sessions have no parent
                // rows (event_matchup_id is NULL), so we synthesize a single
                // wrapper around all of their innings.
                $grouped = [];
                $ungrouped = [];
                foreach ($matchups as $row) {
                    $emId = $row['event_matchup_id'] ?? null;
                    if ($emId !== null) {
                        $grouped[(int)$emId][] = $row;
                    } else {
                        $ungrouped[] = $row;
                    }
                }

                $result = [];
                foreach ($grouped as $emId => $inningRows) {
                    $emInfo = $matchupService->getEventMatchup($emId);
                    $serialized = $emInfo
                        ? serializeEventMatchup($emInfo)
                        : ['id' => $emId, 'eventId' => $eventId];
                    $serialized['innings'] = array_map('serializeMatchup', $inningRows);
                    $result[] = $serialized;
                }
                if (!empty($ungrouped)) {
                    $result[] = [
                        'id' => null,
                        'eventId' => $eventId,
                        'leagueId' => null,
                        'homePlayerId' => 0,
                        'awayPlayerId' => 0,
                        'homePlayerName' => null,
                        'awayPlayerName' => null,
                        'homeRuns' => 0,
                        'awayRuns' => 0,
                        'winnerId' => null,
                        'status' => 'pending',
                        'gameNumber' => 1,
                        'roundName' => null,
                        'seriesId' => null,
                        'innings' => array_map('serializeMatchup', $ungrouped)
                    ];
                }

                sendJson($result);
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
