<?php

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Service\TeamScoreService;

class TeamScoreController extends ApiController {
    private TeamScoreService $teamScoreService;

    public function __construct($container) {
        parent::__construct($container);
        $this->teamScoreService = $container->get(TeamScoreService::class);
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                $teamEventMatchupId = isset($_GET['teamEventMatchupId']) ? (int)$_GET['teamEventMatchupId'] : 0;
                $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;

                if ($teamEventMatchupId) {
                    $scores = $this->teamScoreService->getTeamEventMatchupScores($teamEventMatchupId);
                } else if ($eventId) {
                    $scores = $this->teamScoreService->getEventTeamScores($eventId);
                } else {
                    $this->sendError('eventId or teamEventMatchupId query parameter is required', 400);
                }

                $this->sendJson(array_map('App\Includes\Serializer::teamScore', $scores));
                break;

            case 'POST':
                if (empty($this->input['eventId']) || empty($this->input['teamId']) || empty($this->input['machineId']) || !isset($this->input['orderNumber'])) {
                    $this->sendError('eventId, teamId, machineId, and orderNumber are required', 400);
                }

                $currentUser = \App\Service\AuthService::getCurrentUser();
                if (!$currentUser) {
                    $this->sendError('Unauthorized: Login required to record team scores.', 401);
                }

                $isTD = $currentUser && in_array($currentUser['role'] ?? '', ['admin', 'td']);
                if (!$isTD) {
                    $pdo = $this->container->get(\App\Service\DatabaseService::class)->getPdo();
                    $stmt = $pdo->prepare(
                        'SELECT 1 FROM team_members tm WHERE tm.team_id = ? AND tm.player_id = ?'
                    );
                    $stmt->execute([(int)$this->input['teamId'], (int)$currentUser['player_id']]);
                    if (!$stmt->fetchColumn()) {
                        $this->sendError('Unauthorized: You are not a member of this team.', 401);
                    }
                }

                $this->teamScoreService->saveTeamScore(
                    (int) $this->input['eventId'],
                    (int) $this->input['teamId'],
                    (int) $this->input['machineId'],
                    (int) $this->input['orderNumber'],
                    $this->input['ball1'] ?? null,
                    $this->input['ball2'] ?? null,
                    $this->input['ball3'] ?? null,
                    isset($this->input['teamEventMatchupId']) ? (int) $this->input['teamEventMatchupId'] : null,
                    isset($this->input['ball1PlayerId']) ? (int) $this->input['ball1PlayerId'] : null,
                    isset($this->input['ball2PlayerId']) ? (int) $this->input['ball2PlayerId'] : null,
                    isset($this->input['ball3PlayerId']) ? (int) $this->input['ball3PlayerId'] : null
                );

                $this->sendJson(['success' => true]);
                break;

            default:
                $this->sendError('Unsupported request method', 405);
        }
    }
}

$container = $GLOBALS['container'];
if (!defined('PHPUNIT_RUNNING') || PHPUNIT_RUNNING !== true) {
    (new TeamScoreController($container))->dispatch();
}
