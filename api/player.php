<?php
/**
 * Player Management REST API Endpoint.
 * HTTP controller that delegates to the PlayerService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Includes\Serializer;
use App\Service\PlayerService;

class PlayerController extends ApiController {
    private PlayerService $playerService;

    public function __construct($container) {
        parent::__construct($container);
        $this->playerService = $container->get(PlayerService::class);
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                $user = \App\Service\AuthService::getCurrentUser();
                if ($user && $user['role'] === 'player') {
                    // Requirement: Players only see their own info
                    $player = $this->playerService->getPlayer($user['player_id']);
                    $this->sendJson($player ? Serializer::player($player) : null);
                } else {
                    $players = $this->playerService->getAllPlayers();
                    $this->sendJson(array_map([Serializer::class, 'player'], $players));
                }
                break;

            case 'POST':
                $this->validateAdminAccess();

                if ($this->task === 'merge') {
                    $playerAId = $this->input['playerAId'] ?? null;
                    $playerBId = $this->input['playerBId'] ?? null;
                    if (!$playerAId || !$playerBId) {
                        $this->sendError('playerAId and playerBId are required', 400);
                    }
                    $this->playerService->mergePlayers((int)$playerAId, (int)$playerBId);
                    $this->sendJson(['success' => true]);
                    break;
                }
                
                if (empty($this->input['playerName'])) {
                    $this->sendError('playerName is required', 400);
                }

                $ifpa_id = $this->input['ifpaId'] ?? null;
                $matchplay_id = $this->input['matchplayId'] ?? null;
                $ifpa_rating = isset($this->input['ifpaRating']) ? (float)$this->input['ifpaRating'] : null;
                $ifpa_ranking = isset($this->input['ifpaRanking']) ? (int)$this->input['ifpaRanking'] : null;

                try {
                    $player = $this->playerService->createPlayer($this->input['playerName'], $ifpa_id, $matchplay_id, $ifpa_rating, $ifpa_ranking);
                    $this->sendJson(Serializer::player($player));
                } catch (\PDOException $error) {
                    if ($error->errorInfo[1] === 1062) {
                        $players = $this->playerService->getAllPlayers();
                        $existing = current(array_filter($players, fn($p) => $p['player_name'] === $this->input['playerName']));
                        if ($existing) {
                            $this->sendJson(Serializer::player($existing), 409); // Conflict: Player name already exists
                            break;
                        }
                    }
                    throw $error;
                }
                break;

            case 'PUT':
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) {
                    $this->sendError('id query parameter is required', 400);
                }

                $existing = $this->playerService->getPlayer($id);
                if (!$existing) {
                    $this->sendError('Player not found', 404);
                }

                $currentUser = \App\Service\AuthService::getCurrentUser();
                $isOwner = $currentUser && !empty($existing['user_id']) && $currentUser['id'] == $existing['user_id'];

                $newName = $this->input['playerName'] ?? $existing['player_name'];
                $ifpa_id = array_key_exists('ifpaId', $this->input) ? $this->input['ifpaId'] : $existing['ifpa_id'];
                $matchplay_id = array_key_exists('matchplayId', $this->input) ? $this->input['matchplayId'] : $existing['matchplay_id'];
                $ifpa_rating = array_key_exists('ifpaRating', $this->input) ? (float)$this->input['ifpaRating'] : (isset($existing['ifpa_rating']) ? (float)$existing['ifpa_rating'] : null);
                $ifpa_ranking = array_key_exists('ifpaRanking', $this->input) ? (int)$this->input['ifpaRanking'] : (isset($existing['ifpa_ranking']) ? (int)$existing['ifpa_ranking'] : null);
                $newUsername = $this->input['username'] ?? null;
                $newEmail = $this->input['email'] ?? null;
                $newRole = $this->input['userRole'] ?? null;

                // Rule: Setting/Changing userRole requires ADMIN Access.
                if ($newRole !== null && $newRole !== $existing['role']) {
                    $this->validateAdminAccess();
                    $this->playerService->updateUserRole((int)$existing['user_id'], $newRole);
                }

                // Rule: Changing playerName, IFPA, or MatchPlay ID requires TD/Admin Access OR being the profile owner.
                if ($newName !== $existing['player_name'] || $ifpa_id !== $existing['ifpa_id'] || $matchplay_id !== $existing['matchplay_id']) {
                    if (!$isOwner) {
                        $this->validateTDAccess();
                    }
                }

                if (empty($newName)) {
                    $this->sendError('playerName is required', 400);
                }

                if ($newUsername !== null && !empty($existing['user_id']) && $newUsername !== $existing['username']) {
                    if (!$isOwner) {
                        $this->validateTDAccess();
                    }
                    $this->playerService->updateUserUsername((int)$existing['user_id'], $newUsername);
                }
                if ($newEmail !== null && !empty($existing['user_id']) && $newEmail !== $existing['email']) {
                    if (!$isOwner) {
                        $this->validateTDAccess();
                    }
                    $this->playerService->updateUserEmail((int)$existing['user_id'], $newEmail);
                }
                $player = $this->playerService->updatePlayer($id, $newName, $ifpa_id, $matchplay_id, $ifpa_rating, $ifpa_ranking);
                $this->sendJson(Serializer::player($player));
                break;

            case 'DELETE':
                $this->validateAdminAccess();
                
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) {
                    $this->sendError('id query parameter is required', 400);
                }

                $player = $this->playerService->getPlayer($id);
                if (!$player) {
                    $this->sendError('Player not found', 404);
                }

                $this->playerService->deletePlayer($id);
                $this->sendJson(['success' => true, 'deleted' => $player]);
                break;

            default:
                $this->sendError('Unsupported request method', 405);
        }
    }
}

// Prevent immediate execution during unit testing
$container = $GLOBALS['container'];
if (!defined('PHPUNIT_RUNNING') || PHPUNIT_RUNNING !== true) {
    (new PlayerController($container))->dispatch();
}
