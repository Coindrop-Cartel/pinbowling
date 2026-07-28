<?php

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Service\TeamMatchupService;
use App\Includes\Serializer;

class TeamMatchupController extends ApiController {
    private TeamMatchupService $teamMatchupService;

    public function __construct($container) {
        parent::__construct($container);
        $this->teamMatchupService = $container->get(TeamMatchupService::class);
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                $teamEventMatchupId = isset($_GET['teamEventMatchupId']) ? (int)$_GET['teamEventMatchupId'] : 0;
                if ($teamEventMatchupId) {
                    $matchupInfo = $this->teamMatchupService->getTeamEventMatchup($teamEventMatchupId);
                    if (!$matchupInfo) {
                        $this->sendError('Team matchup not found', 404);
                    }
                    $entries = $this->teamMatchupService->getTeamMatchupEntries($teamEventMatchupId);
                    $matchupInfo['entries'] = array_map('App\Includes\Serializer::teamMatchup', $entries);
                    $this->sendJson(Serializer::teamEventMatchup($matchupInfo));
                } else {
                    $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
                    if (!$eventId) {
                        $this->sendError('eventId or teamEventMatchupId query parameter is required', 400);
                    }

                    $rows = $this->teamMatchupService->getEventTeamMatchups($eventId);
                    $grouped = [];
                    foreach ($rows as $row) {
                        $temId = $row['team_event_matchup_id'] ?? null;
                        if ($temId !== null) {
                            $grouped[(int)$temId][] = $row;
                        }
                    }

                    $result = [];
                    foreach ($grouped as $temId => $entryRows) {
                        $emInfo = $this->teamMatchupService->getTeamEventMatchup($temId);
                        if ($emInfo) {
                            $emInfo['entries'] = array_map('App\Includes\Serializer::teamMatchup', $entryRows);
                            $result[] = Serializer::teamEventMatchup($emInfo);
                        }
                    }

                    error_log("[PinBowling DEBUG] GET /api/team-matchup.php?eventId=$eventId — returning " . count($result) . " teamEventMatchups: " . json_encode(array_map(function($r) {
                        return ['id' => $r['id'] ?? null, 'roundName' => $r['roundName'] ?? null, 'team1Id' => $r['team1Id'] ?? null, 'team2Id' => $r['team2Id'] ?? null, 'team1Score' => $r['team1Score'] ?? null, 'team2Score' => $r['team2Score'] ?? null, 'status' => $r['status'] ?? null];
                    }, $result)));

                    $this->sendJson($result);
                }
                break;

            case 'POST':
                $this->validateTDAccess();
                if (empty($this->input)) {
                    $this->sendError('Request body is empty', 400);
                }

                $matchups = isset($this->input[0]) ? $this->input : [$this->input];
                if (empty($matchups)) {
                    $this->sendError('Request body is empty', 400);
                }

                $this->teamMatchupService->saveTeamMatchups($matchups);
                $this->sendJson(['success' => true]);
                break;

            case 'DELETE':
                $this->validateAdminAccess();
                $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
                if (!$eventId) {
                    $this->sendError('eventId query parameter is required', 400);
                }
                $this->teamMatchupService->deleteEventTeamMatchups($eventId);
                $this->sendJson(['success' => true]);
                break;

            default:
                $this->sendError('Unsupported request method', 405);
        }
    }
}

$container = $GLOBALS['container'];
if (!defined('PHPUNIT_RUNNING') || PHPUNIT_RUNNING !== true) {
    (new TeamMatchupController($container))->dispatch();
}
