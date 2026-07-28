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

                $count = is_array($scores) ? count($scores) : 0;
                error_log("[PinBowling DEBUG] GET /api/team-score.php — teamEventMatchupId=$teamEventMatchupId eventId=$eventId — returning $count team scores");
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

                $eventId = (int) $this->input['eventId'];
                $teamId = (int) $this->input['teamId'];
                $machineId = (int) $this->input['machineId'];
                $orderNumber = (int) $this->input['orderNumber'];
                $ball1 = $this->input['ball1'] ?? null;
                $ball2 = $this->input['ball2'] ?? null;
                $ball3 = $this->input['ball3'] ?? null;
                $teamEventMatchupId = isset($this->input['teamEventMatchupId']) ? (int) $this->input['teamEventMatchupId'] : null;
                $ball1PlayerId = isset($this->input['ball1PlayerId']) ? (int) $this->input['ball1PlayerId'] : null;
                $ball2PlayerId = isset($this->input['ball2PlayerId']) ? (int) $this->input['ball2PlayerId'] : null;
                $ball3PlayerId = isset($this->input['ball3PlayerId']) ? (int) $this->input['ball3PlayerId'] : null;

                error_log("[PinBowling DEBUG] POST /api/team-score.php — eventId=$eventId teamId=$teamId machineId=$machineId order=$orderNumber balls=$ball1/$ball2/$ball3 temId=$teamEventMatchupId ballPlayers=$ball1PlayerId/$ball2PlayerId/$ball3PlayerId");

                $this->teamScoreService->saveTeamScore(
                    $eventId, $teamId, $machineId, $orderNumber,
                    $ball1, $ball2, $ball3,
                    $teamEventMatchupId,
                    $ball1PlayerId, $ball2PlayerId, $ball3PlayerId
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
