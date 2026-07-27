<?php

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Includes\Serializer;
use App\Service\SessionService;

class SessionController extends ApiController {
    private SessionService $sessionService;

    public function __construct($container) {
        parent::__construct($container);
        $this->sessionService = $container->get(SessionService::class);
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if ($id) {
                    $session = $this->sessionService->getSession($id);
                    if (!$session) $this->sendError('Session not found', 404);
                    $this->sendJson(Serializer::session($session));
                } else {
                    $sessions = $this->sessionService->getAllSessions();
                    $this->sendJson(array_map([Serializer::class, 'session'], $sessions));
                }
                break;

            case 'POST':
                if ($this->task === 'addPlayer') {
                    $sessionId = (int)($this->input['sessionId'] ?? 0);
                    $playerId = (int)($this->input['playerId'] ?? 0);
                    if (!$sessionId || !$playerId) {
                        $this->sendError('sessionId and playerId are required', 400);
                    }
                    $this->sessionService->addPlayerToSession($sessionId, $playerId);
                    $this->sendJson(['success' => true]);
                } elseif ($this->task === 'removePlayer') {
                    $sessionId = (int)($this->input['sessionId'] ?? 0);
                    $playerId = (int)($this->input['playerId'] ?? 0);
                    if (!$sessionId || !$playerId) {
                        $this->sendError('sessionId and playerId are required', 400);
                    }
                    $this->sessionService->removePlayerFromSession($sessionId, $playerId);
                    $this->sendJson(['success' => true]);
                } elseif ($this->task === 'delete') {
                    $id = (int)($this->input['id'] ?? 0);
                    if (!$id) $this->sendError('id is required', 400);
                    $this->sessionService->deleteSession($id);
                    $this->sendJson(['success' => true]);
                } else {
                    $name = $this->input['name'] ?? '';
                    if (!$name) $this->sendError('name is required', 400);

                    $session = $this->sessionService->createSession(
                        $name,
                        $this->input['scoringFormat'] ?? 'bowling',
                        $this->input['competitionFormat'] ?? 'group',
                        isset($this->input['roundsPerGame']) ? (int)$this->input['roundsPerGame'] : null,
                        isset($this->input['matchupsPerRound']) ? (int)$this->input['matchupsPerRound'] : null,
                        !empty($this->input['locationId']) ? (int)$this->input['locationId'] : null,
                        $this->input['eventName'] ?? null,
                        $this->input['eventDate'] ?? null
                    );
                    if (!$session) $this->sendError('Session created but could not be retrieved.', 500);
                    $this->sendJson(Serializer::session($session));
                }
                break;

            default:
                $this->sendError('Unsupported request method', 405);
        }
    }
}

$container = $GLOBALS['container'];
if (!defined('PHPUNIT_RUNNING') || PHPUNIT_RUNNING !== true) {
    (new SessionController($container))->dispatch();
}
