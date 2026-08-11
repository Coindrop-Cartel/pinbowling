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

                    error_log("[PinBowling DEBUG] GET /api/matchup.php?eventId=$eventId — returning " . count($result) . " matchups: " . json_encode(array_map(function($r) {
                        return ['id' => $r['id'] ?? null, 'player1Id' => $r['player1Id'] ?? null, 'player2Id' => $r['player2Id'] ?? null, 'player1Score' => $r['player1Score'] ?? null, 'player2Score' => $r['player2Score'] ?? null, 'winnerId' => $r['winnerId'] ?? null, 'status' => $r['status'] ?? null, 'roundName' => $r['roundName'] ?? null];
                    }, $result)));

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

                $scoringFormat = 'bowling';
                if ($eventId) {
                    $pdo = $this->container->get(\App\Service\DatabaseService::class);

                    // Check the event's own scoring_format first (handles sessions)
                    $stmt = $pdo->prepare('SELECT scoring_format FROM events WHERE id = ?');
                    $stmt->execute([$eventId]);
                    $scoringFormat = $stmt->fetchColumn() ?: 'bowling';

                    // Fall back to league scoring_format if event doesn't specify one
                    if ($scoringFormat === 'bowling') {
                        $leagueId = $this->container->get(\App\Service\LeagueService::class)->getEventLeagueId($eventId);
                        if ($leagueId) {
                            $stmt = $pdo->prepare('SELECT scoring_format FROM leagues WHERE id = ?');
                            $stmt->execute([$leagueId]);
                            $scoringFormat = $stmt->fetchColumn() ?: 'bowling';
                        }
                    }
                }

                $this->validateTDAccess();

                $task = isset($_GET['task']) ? $_GET['task'] : ($this->input['task'] ?? null);
                if ($task === 'add_extra_inning' || $task === 'extra_inning') {
                    $matchupId = (int)($this->input['matchupId'] ?? $_GET['matchupId'] ?? 0);
                    $isTeam = !empty($this->input['isTeam']) || !empty($_GET['isTeam']);
                    if (!$matchupId) {
                        $this->sendError('matchupId is required', 400);
                    }
                    $extraRoundsService = $this->container->get(\App\Service\ExtraRoundsService::class);
                    $res = $extraRoundsService->addExtraInning($matchupId, $isTeam);
                    $this->sendJson($res);
                    return;
                }

                $eventMatchupId = null;
                $__lg = function ($msg) { error_log("[pinbowling] $msg\n", 3, sys_get_temp_dir() . '/pinbowling-debug.log'); };
                $__lg("matchup POST: eventId=$eventId scoringFormat=$scoringFormat matchups=" . json_encode(array_map(function($m) { return ['teamId' => $m['teamId'] ?? null, 'playerId' => $m['playerId'] ?? null, 'eventMatchupId' => $m['eventMatchupId'] ?? null]; }, $matchups)));

                // For baseball or golf_skins session/quickplay games, automatically create/resolve the event_matchup record
                if ($scoringFormat === 'baseball' || $scoringFormat === 'golf_skins') {
                    $providedMatchupId = isset($firstMatchup['eventMatchupId']) ? (int)$firstMatchup['eventMatchupId'] : 0;
                    if ($providedMatchupId) {
                        $eventMatchupId = $providedMatchupId;
                    } else {
                        // Check if an event_matchup already exists for this event
                        $db = $this->container->get(\App\Service\DatabaseService::class);
                        $pdo = $db;
                        $stmt = $pdo->prepare('SELECT id FROM event_matchups WHERE event_id = ?');
                        $stmt->execute([$eventId]);
                        $existingId = $stmt->fetchColumn();

                        if ($existingId) {
                            $eventMatchupId = (int)$existingId;
                            $__lg("RESOLVED existing event_matchup id=$eventMatchupId for eventId=$eventId");
                        } else {
                            $p1 = (int)($firstMatchup['player1Id'] ?? $firstMatchup['player1_id'] ?? 0);
                            $p2 = (int)($firstMatchup['player2Id'] ?? $firstMatchup['player2_id'] ?? 0);
                            $p3 = (int)($firstMatchup['player3Id'] ?? $firstMatchup['player3_id'] ?? 0);
                            $p4 = (int)($firstMatchup['player4Id'] ?? $firstMatchup['player4_id'] ?? 0);

                            if (!$p1 || !$p2) {
                                foreach ($matchups as $m) {
                                    $pOrder = (int)($m['playerOrder'] ?? $m['player_order'] ?? 1);
                                    $pId = (int)($m['playerId'] ?? $m['player_id'] ?? 0);
                                    if ($pOrder === 1 && !$p1) $p1 = $pId;
                                    else if ($pOrder === 2 && !$p2) $p2 = $pId;
                                }
                            }

                            if ($p1 && $p2) {
                                $stmt = $pdo->prepare(
                                    'INSERT INTO event_matchups (event_id, player1_id, player2_id, player3_id, player4_id, status, game_number)
                                     VALUES (?, ?, ?, ?, ?, \'pending\', 1)'
                                );
                                $stmt->execute([$eventId, $p1, $p2, $p3 ?: null, $p4 ?: null]);
                                $eventMatchupId = (int)$pdo->lastInsertId();
                                $__lg("CREATED individual event_matchup id=$eventMatchupId p1=$p1 p2=$p2 p3=$p3 p4=$p4");
                            } else {
                                $__lg("FAILED to create individual event_matchup: p1=$p1 p2=$p2");
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
