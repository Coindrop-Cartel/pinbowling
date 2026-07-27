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

                $this->scoreService->saveScore(
                    (int) $this->input['eventId'],
                    (int) $this->input['playerId'],
                    (int) $this->input['machineId'],
                    (int) $this->input['orderNumber'],
                    $this->input['ball1'] ?? null,
                    $this->input['ball2'] ?? null,
                    $this->input['ball3'] ?? null,
                    isset($this->input['eventMatchupId']) ? (int) $this->input['eventMatchupId'] : null,
                    isset($this->input['player1Score']) ? (int) $this->input['player1Score'] : null,
                    isset($this->input['player2Score']) ? (int) $this->input['player2Score'] : null,
                    isset($this->input['ball1PlayerId']) ? (int) $this->input['ball1PlayerId'] : null,
                    isset($this->input['ball2PlayerId']) ? (int) $this->input['ball2PlayerId'] : null,
                    isset($this->input['ball3PlayerId']) ? (int) $this->input['ball3PlayerId'] : null
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
