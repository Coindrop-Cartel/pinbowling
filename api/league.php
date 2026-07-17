<?php
/**
 * League Management REST API Endpoint.
 * HTTP controller that delegates to the LeagueService class.
 *
 * Supported Methods:
 * - GET: Retrieve leagues, events (fixtures), or full league details
 * - POST: Create leagues, events, or add players to leagues
 * - PUT: Update leagues or events
 * - DELETE: Remove leagues, events, or players from leagues
 */

require_once __DIR__ . '/../includes/bootstrap.php';

// Prevent immediate execution during unit testing
if (defined('PHPUNIT_RUNNING') && PHPUNIT_RUNNING === true) {
    return;
}

try {
    $container = $GLOBALS['container'];
    $leagueService = $container->get(\App\Service\LeagueService::class);
    $method = $_SERVER['REQUEST_METHOD'];
    $input = getJsonInput();
    // Use 'task' parameter (formerly 'action') to avoid ad-blocker filters
    $task = $_GET['task'] ?? 'league';

    switch ($method) {
        case 'GET':
            if ($task === 'fixture') {
                $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : null;
                $events = $leagueService->getAllEvents($leagueId);
                sendJson(array_map('serializeEvent', $events));
            } else {
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if ($id) {
                    $league = $leagueService->getLeague($id);
                    if (!$league) sendJson(['error' => 'League not found'], 404);
                    sendJson(serializeLeague($league));
                } else {
                    $leagues = $leagueService->getAllLeaguesWithDetails($_GET['type'] ?? null);
                    sendJson(array_map('serializeLeague', $leagues));
                }
            }
            break;

        case 'POST':
            if ($task === 'member') {
                if (empty($input['leagueId']) || empty($input['playerId'])) {
                    sendJson(['error' => 'leagueId and playerId are required'], 400);
                }

                $leagueId = (int)$input['leagueId'];
                $playerId = (int)$input['playerId'];
                $meta = $leagueService->getLeagueMeta($leagueId);
                $playerUserId = $leagueService->getPlayerUserId($playerId);

                if ($meta['type'] === 'session') {
                    if ($playerUserId !== null) validateSessionOrSecret();
                } else {
                    if ($playerUserId !== null) validateTDAccess();
                }

                if ($meta['scoring_format'] === 'baseball' && $meta['type'] === 'session') {
                    if ($leagueService->getLeaguePlayerCount($leagueId) >= 2) {
                        sendJson(['error' => 'Baseball sessions are limited to 2 players'], 400);
                    }
                }

                $leagueService->addPlayerToLeague($leagueId, $playerId);
                sendJson(['success' => true]);

            } elseif ($task === 'start_season') {
                validateTDAccess();
                if (empty($input['leagueId'])) {
                    sendJson(['error' => 'leagueId is required'], 400);
                }
                $leagueService->startSeason((int)$input['leagueId']);
                sendJson(['success' => true]);

            } elseif ($task === 'update_season') {
                validateTDAccess();
                if (empty($input['leagueId'])) {
                    sendJson(['error' => 'leagueId is required'], 400);
                }
                $leagueService->updateSeason((int)$input['leagueId']);
                sendJson(['success' => true]);

            } elseif ($task === 'start_playoffs') {
                validateTDAccess();
                if (empty($input['leagueId']) || empty($input['seeds']) || empty($input['seriesLength'])) {
                    sendJson(['error' => 'leagueId, seeds, and seriesLength are required'], 400);
                }
                $leagueService->startPlayoffs(
                    (int)$input['leagueId'],
                    $input['seeds'],
                    (int)$input['seriesLength']
                );
                sendJson(['success' => true]);

            } elseif ($task === 'fixture') {
                validateTDAccess();
                if (empty($input['leagueId']) || empty($input['eventName'])) {
                    sendJson(['error' => 'leagueId and eventName are required'], 400);
                }

                $event = $leagueService->createEvent(
                    (int)$input['leagueId'],
                    $input['eventName'],
                    $input['eventDate'] ?? null,
                    !empty($input['locationId']) ? (int)$input['locationId'] : null,
                    $input['scoringFormat'] ?? null
                );
                if (!$event) sendJson(['error' => 'Event created but could not be retrieved.'], 500);
                sendJson(serializeEvent($event));

            } else {
                if (empty($input['name'])) sendJson(['error' => 'name is required'], 400);

                $league = $leagueService->createLeague(
                    $input['name'],
                    $input['startDate'] ?? null,
                    $input['type'] ?? 'standard',
                    $input['participants'] ?? 'individual',
                    $input['scoringFormat'] ?? 'bowling',
                    $input['seasonScoring'] ?? 'weekly',
                    (int)($input['dropLowestWeeks'] ?? 0),
                    isset($input['weeksInSeason']) ? (int)$input['weeksInSeason'] : null,
                    isset($input['inningsPerGame']) && $input['inningsPerGame'] !== '' ? (int)$input['inningsPerGame'] : null,
                    isset($input['weeklyPoints']) && $input['weeklyPoints'] !== '' ? (int)$input['weeklyPoints'] : null,
                    isset($input['pointSpread']) && $input['pointSpread'] !== '' ? (int)$input['pointSpread'] : null
                );
                if (!$league) sendJson(['error' => 'League created but could not be retrieved.'], 500);
                sendJson(serializeLeague($league));
            }
            break;

        case 'PUT':
            validateTDAccess();

            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) sendJson(['error' => 'id query parameter is required'], 400);

            if ($task === 'fixture') {
                $event = $leagueService->updateEvent(
                    $id,
                    $input['eventName'] ?? null,
                    $input['eventDate'] ?? null,
                    !empty($input['locationId']) ? (int)$input['locationId'] : null,
                    $input['scoringFormat'] ?? 'bowling'
                );
                if (!$event) sendJson(['error' => 'Resource updated but could not be retrieved.'], 500);
                sendJson(serializeEvent($event));
            } else {
                $league = $leagueService->updateLeague(
                    $id,
                    $input['name'],
                    $input['startDate'] ?? null,
                    $input['participants'] ?? 'individual',
                    $input['scoringFormat'] ?? 'bowling',
                    $input['seasonScoring'] ?? 'weekly',
                    (int)($input['dropLowestWeeks'] ?? 0),
                    isset($input['weeksInSeason']) ? (int)$input['weeksInSeason'] : null,
                    isset($input['inningsPerGame']) && $input['inningsPerGame'] !== '' ? (int)$input['inningsPerGame'] : null,
                    isset($input['weeklyPoints']) && $input['weeklyPoints'] !== '' ? (int)$input['weeklyPoints'] : null,
                    isset($input['pointSpread']) && $input['pointSpread'] !== '' ? (int)$input['pointSpread'] : null
                );
                if (!$league) sendJson(['error' => 'Resource updated but could not be retrieved.'], 500);
                sendJson(serializeLeague($league));
            }
            break;

        case 'DELETE':
            if ($task === 'member') {
                $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
                $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;

                $meta = $leagueService->getLeagueMeta($leagueId);
                if ($meta['type'] === 'session') {
                    validateSessionOrSecret();
                } else {
                    validateTDAccess();
                }

                $leagueService->removePlayerFromLeague($leagueId, $playerId);
            } else {
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) sendJson(['error' => 'id query parameter is required'], 400);

                if ($task === 'fixture') {
                    if ($leagueService->getEventLeagueId($id) === false) {
                        sendJson(['error' => 'Event not found'], 404);
                    }
                    validateTDAccess();
                    $leagueService->deleteEvent($id);
                } else {
                    validateAdminAccess();
                    $leagueService->deleteLeague($id);
                }
            }
            sendJson(['success' => true]);
            break;

        default:
            sendJson(['error' => 'Unsupported request method'], 405);
    }

} catch (\Throwable $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
