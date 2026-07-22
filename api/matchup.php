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
                    
                    $entries = $this->matchupService->getMatchupEntries($eventMatchupId);
                    $serialized = Serializer::eventMatchup($matchupInfo);
                    $serialized['entries'] = array_map([Serializer::class, 'matchup'], $entries);
                    
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
                    foreach ($grouped as $emId => $entryRows) {
                        $emInfo = $this->matchupService->getEventMatchup($emId);
                        $serialized = $emInfo
                            ? Serializer::eventMatchup($emInfo)
                            : ['id' => $emId, 'eventId' => $eventId];
                        $serialized['entries'] = array_map([Serializer::class, 'matchup'], $entryRows);
                        $result[] = $serialized;
                    }
                    if (!empty($ungrouped)) {
                        $result[] = [
                            'id' => null,
                            'eventId' => $eventId,
                            'leagueId' => null,
                            'player1Id' => 0,
                            'player2Id' => 0,
                            'player1Name' => null,
                            'player2Name' => null,
                            'player1Score' => 0,
                            'player2Score' => 0,
                            'winnerId' => null,
                            'status' => 'pending',
                            'gameNumber' => 1,
                            'roundName' => null,
                            'seriesId' => null,
                            'entries' => array_map([Serializer::class, 'matchup'], $ungrouped)
                        ];
                    }

                    $this->sendJson($result);
                }
                break;

            case 'POST':
                if (empty($this->input)) {
                    $this->sendError('Request body is empty', 400);
                }

                $matchups = isset($this->input[0]) ? $this->input : [$this->input];
                if (empty($matchups)) {
                    $this->sendError('Request body is empty', 400);
                }

                $firstMatchup = $matchups[0];
                $eventId = (int)($firstMatchup['eventId'] ?? $firstMatchup['event_id'] ?? 0);

                $leagueService = $this->container->get(\App\Service\LeagueService::class);
                $isSession = false;
                $scoringFormat = 'bowling';
                if ($eventId) {
                    $leagueId = $leagueService->getEventLeagueId($eventId);
                    if ($leagueId) {
                        $meta = $leagueService->getLeagueMeta($leagueId);
                        $isSession = ($meta && $meta['type'] === 'session');
                        $scoringFormat = $meta['scoring_format'] ?? 'bowling';
                    }
                }

                if ($isSession) {
                    $this->validateSessionOrSecret();
                } else {
                    $this->validateTDAccess();
                }

                $eventMatchupId = null;
                // For baseball session/quickplay games, automatically create/resolve the event_matchup record
                if ($scoringFormat === 'baseball') {
                    $providedMatchupId = isset($firstMatchup['eventMatchupId']) ? (int)$firstMatchup['eventMatchupId'] : 0;
                    if ($providedMatchupId) {
                        $eventMatchupId = $providedMatchupId;
                    } else {
                        // Check if an event_matchup already exists for this event
                        $db = $this->container->get(\App\Service\DatabaseService::class);
                        $pdo = $db->getPdo();
                        $stmt = $pdo->prepare('SELECT id FROM event_matchups WHERE event_id = ?');
                        $stmt->execute([$eventId]);
                        $existingId = $stmt->fetchColumn();

                        if ($existingId) {
                            $eventMatchupId = (int)$existingId;
                        } else {
                            // Find home (playerOrder=1) and away (playerOrder=2) players
                            $homePlayerId = 0;
                            $awayPlayerId = 0;
                            foreach ($matchups as $m) {
                                $pOrder = (int)($m['playerOrder'] ?? $m['player_order'] ?? 1);
                                $pId = (int)($m['playerId'] ?? $m['player_id'] ?? 0);
                                if ($pOrder === 1 && !$homePlayerId) {
                                    $homePlayerId = $pId;
                                } else if ($pOrder === 2 && !$awayPlayerId) {
                                    $awayPlayerId = $pId;
                                }
                            }

                            if ($homePlayerId && $awayPlayerId) {
                                $stmt = $pdo->prepare(
                                    'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number)
                                     VALUES (?, ?, ?, \'pending\', 1)'
                                );
                                $stmt->execute([$eventId, $homePlayerId, $awayPlayerId]);
                                $eventMatchupId = (int)$pdo->lastInsertId();
                            }
                        }
                    }

                    // Assign the resolved eventMatchupId to all matchup slots
                    if ($eventMatchupId) {
                        foreach ($matchups as &$m) {
                            $m['eventMatchupId'] = $eventMatchupId;
                        }
                        unset($m);
                    }
                }

                $this->matchupService->saveMatchups($matchups);
                $response = ['success' => true];
                if ($eventMatchupId !== null) {
                    $response['eventMatchupId'] = $eventMatchupId;
                }
                $this->sendJson($response);
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
