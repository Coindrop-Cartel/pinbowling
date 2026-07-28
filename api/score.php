<?php
/**
 * Score Management REST API Endpoint.
 * HTTP controller that delegates to the ScoreService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Includes\Serializer;
use App\Service\ScoreService;

class ScoreController extends ApiController {
    private ScoreService $scoreService;

    public function __construct($container) {
        parent::__construct($container);
        $this->scoreService = $container->get(ScoreService::class);
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                $eventMatchupId = isset($_GET['eventMatchupId']) ? (int) $_GET['eventMatchupId'] : 0;
                if ($eventMatchupId) {
                    $scores = $this->scoreService->getMatchupScores($eventMatchupId);
                } else {
                    $eventId = isset($_GET['eventId']) ? (int) $_GET['eventId'] : 0;
                    $playerId = isset($_GET['playerId']) ? (int) $_GET['playerId'] : 0;
                    $leagueId = isset($_GET['leagueId']) ? (int) $_GET['leagueId'] : 0;

                    if (!$eventId && !$leagueId) {
                        $this->sendError('eventId, leagueId, or eventMatchupId query parameter is required', 400);
                    }

                    if ($leagueId) {
                        $scores = $this->scoreService->getLeagueScores($leagueId);
                    } else {
                        $scores = $this->scoreService->getEventScores($eventId, $playerId ? $playerId : null);
                    }
                }

                $count = is_array($scores) ? count($scores) : 0;
                error_log("[PinBowling DEBUG] GET /api/score.php — eventMatchupId=$eventMatchupId eventId=$eventId playerId=$playerId leagueId=$leagueId — returning $count scores");
                $this->sendJson(array_map([Serializer::class, 'score'], $scores));
                break;

            case 'POST':
                if (empty($this->input['playerId']) || empty($this->input['eventId']) || empty($this->input['machineId']) || !isset($this->input['orderNumber'])) {
                    $this->sendError('playerId, eventId, machineId, and orderNumber are required', 400);
                }

                $playerService = $this->container->get(\App\Service\PlayerService::class);
                $targetPlayer = $playerService->getPlayer((int)$this->input['playerId']);
                if (!$targetPlayer) {
                    $this->sendError('Player not found.', 404);
                }

                $isTargetUnregistered = ($targetPlayer['user_id'] === null);

                $apiSecret = \Configuration::getInstance()->getApiSecret();
                $providedSecret = getHeader('X-PB-Secret');
                $hasSecret = ($providedSecret && $providedSecret === $apiSecret);
                $currentUser = \App\Service\AuthService::getCurrentUser();

                if ($hasSecret) {
                } else if ($currentUser) {
                    $role = $currentUser['role'] ?? 'player';
                    if ($role === 'admin' || $role === 'td') {
                    } else {
                        $isSelf = ((int)$targetPlayer['id'] === (int)$currentUser['player_id']);
                        if (!$isSelf && !$isTargetUnregistered) {
                            $this->sendError('Unauthorized: Players can only score themselves or unregistered players.', 401);
                        }
                    }
                } else {
                    if (!$isTargetUnregistered) {
                        $this->sendError('Unauthorized: Guests can only score unregistered players.', 401);
                    }
                }

                $eventId = (int) $this->input['eventId'];
                $playerId = (int) $this->input['playerId'];
                $machineId = (int) $this->input['machineId'];
                $orderNumber = (int) $this->input['orderNumber'];
                $ball1 = $this->input['ball1'] ?? null;
                $ball2 = $this->input['ball2'] ?? null;
                $ball3 = $this->input['ball3'] ?? null;
                $eventMatchupId = isset($this->input['eventMatchupId']) ? (int) $this->input['eventMatchupId'] : null;
                $player1Score = isset($this->input['player1Score']) ? (int) $this->input['player1Score'] : null;
                $player2Score = isset($this->input['player2Score']) ? (int) $this->input['player2Score'] : null;

                error_log("[PinBowling DEBUG] POST /api/score.php — eventId=$eventId playerId=$playerId machineId=$machineId order=$orderNumber balls=$ball1/$ball2/$ball3 matchupId=$eventMatchupId p1Score=$player1Score p2Score=$player2Score");

                $this->scoreService->saveScore(
                    $eventId, $playerId, $machineId, $orderNumber,
                    $ball1, $ball2, $ball3,
                    $eventMatchupId, $player1Score, $player2Score
                );

                $this->sendJson(['success' => true]);
                break;


            case 'DELETE':
                $eventId = isset($_GET['eventId']) ? (int) $_GET['eventId'] : 0;
                $playerId = isset($_GET['playerId']) ? (int) $_GET['playerId'] : 0;

                $this->validateAdminAccess();

                if ($playerId && $eventId) {
                    // Delete scores for player in event
                    $this->scoreService->deletePlayerEventScores($eventId, $playerId);
                } else if ($playerId) {
                    // Delete all scores for player
                    $this->scoreService->deletePlayerScores($playerId);
                } else if ($eventId) {
                    // Delete all scores for event
                    $this->scoreService->deleteEventScores($eventId);
                } else {
                    $this->sendError('eventId or playerId query parameter is required', 400);
                }

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
    (new ScoreController($container))->dispatch();
}
