<?php
/**
 * Matchup Management REST API Endpoint.
 * HTTP controller that delegates to the MatchupService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Includes\Serializer;
use App\Service\MatchupService;

class MatchupController extends ApiController {
    private MatchupService $matchupService;

    public function __construct($container) {
        parent::__construct($container);
        $this->matchupService = $container->get(MatchupService::class);
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                $eventMatchupId = isset($_GET['eventMatchupId']) ? (int)$_GET['eventMatchupId'] : 0;
                if ($eventMatchupId) {
                    $matchupInfo = $this->matchupService->getEventMatchup($eventMatchupId);
                    if (!$matchupInfo) {
                        $this->sendError('Matchup not found', 404);
                    }
                    
                    $innings = $this->matchupService->getMatchupInnings($eventMatchupId);
                    $serialized = Serializer::eventMatchup($matchupInfo);
                    $serialized['innings'] = array_map([Serializer::class, 'matchup'], $innings);
                    
                    $this->sendJson($serialized);
                } else {
                    $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
                    if (!$eventId) {
                        $this->sendError('eventId or eventMatchupId query parameter is required', 400);
                    }

                    $matchups = $this->matchupService->getEventMatchups($eventId);

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
                        $emInfo = $this->matchupService->getEventMatchup($emId);
                        $serialized = $emInfo
                            ? Serializer::eventMatchup($emInfo)
                            : ['id' => $emId, 'eventId' => $eventId];
                        $serialized['innings'] = array_map([Serializer::class, 'matchup'], $inningRows);
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
                            'innings' => array_map([Serializer::class, 'matchup'], $ungrouped)
                        ];
                    }

                    $this->sendJson($result);
                }
                break;

            case 'POST':
                $this->validateTDAccess();
                
                if (empty($this->input)) {
                    $this->sendError('Request body is empty', 400);
                }

                $matchups = isset($this->input[0]) ? $this->input : [$this->input];
                $this->matchupService->saveMatchups($matchups);
                $this->sendJson(['success' => true]);
                break;

            case 'DELETE':
                $this->validateTDAccess();
                
                $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
                if (!$eventId) {
                    $this->sendError('eventId query parameter is required', 400);
                }

                $this->matchupService->deleteEventMatchups($eventId);
                $this->sendJson(['success' => true]);
                break;

            default:
                $this->sendError('Unsupported request method', 405);
        }
    }
}

// Prevent immediate execution during unit testing
$container = $GLOBALS['container'];
if (!defined('PHPUNIT_RUNNING') || PHPUNIT_RUNNING !== true) {
    (new MatchupController($container))->dispatch();
}
