<?php
/**
 * League Management REST API Endpoint.
 * HTTP controller that delegates to the LeagueService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Includes\Serializer;
use App\Service\LeagueService;

class LeagueController extends ApiController {
    private LeagueService $leagueService;

    public function __construct($container) {
        parent::__construct($container);
        $this->leagueService = $container->get(LeagueService::class);
    }

    private function authorizeLeagueAccess(int $leagueId): void {
        $meta = $this->leagueService->getLeagueMeta($leagueId);
        if ($meta['type'] === 'session') {
            $this->validateSessionOrSecret();
        } else {
            $this->validateTDAccess();
        }
    }

    private function buildLeagueParams(): array {
        return [
            'name' => $this->input['name'],
            'startDate' => $this->input['startDate'] ?? null,
            'participants' => $this->input['participants'] ?? 'individual',
            'scoringFormat' => $this->input['scoringFormat'] ?? 'bowling',
            'seasonScoring' => $this->input['seasonScoring'] ?? 'weekly',
            'dropLowestWeeks' => (int)($this->input['dropLowestWeeks'] ?? 0),
            'weeksInSeason' => isset($this->input['weeksInSeason']) ? (int)$this->input['weeksInSeason'] : null,
            'roundsPerGame' => isset($this->input['roundsPerGame']) && $this->input['roundsPerGame'] !== '' ? (int)$this->input['roundsPerGame'] : null,
            'matchupsPerRound' => isset($this->input['matchupsPerRound']) && $this->input['matchupsPerRound'] !== '' ? (int)$this->input['matchupsPerRound'] : null,
            'weeklyPoints' => isset($this->input['weeklyPoints']) && $this->input['weeklyPoints'] !== '' ? (int)$this->input['weeklyPoints'] : null,
            'pointSpread' => isset($this->input['pointSpread']) && $this->input['pointSpread'] !== '' ? (int)$this->input['pointSpread'] : null,
            'locationIds' => $this->input['locationIds'] ?? [],
        ];
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                if ($this->task === 'fixture') {
                    $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : null;
                    $events = $this->leagueService->getAllEvents($leagueId);
                    $this->sendJson(array_map([Serializer::class, 'event'], $events));
                } else {
                    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                    if ($id) {
                        $league = $this->leagueService->getLeague($id);
                        if (!$league) $this->sendError('League not found', 404);
                        $this->sendJson(Serializer::league($league));
                    } else {
                        $leagues = $this->leagueService->getAllLeaguesWithDetails($_GET['type'] ?? null);
                        $this->sendJson(array_map([Serializer::class, 'league'], $leagues));
                    }
                }
                break;

            case 'POST':
                if ($this->task === 'member') {
                    if (empty($this->input['leagueId']) || empty($this->input['playerId'])) {
                        $this->sendError('leagueId and playerId are required', 400);
                    }

                    $meta = $this->leagueService->getLeagueMeta((int)$this->input['leagueId']);
                    if ($meta['type'] === 'session') {
                        $apiSecret = \Configuration::getInstance()->getApiSecret();
                        $providedSecret = getHeader('X-PB-Secret');
                        $hasSecret = ($providedSecret && $providedSecret === $apiSecret);
                        $currentUser = \App\Service\AuthService::getCurrentUser();

                        if ($hasSecret || $currentUser) {
                            $this->validateSessionOrSecret();
                        } else {
                            $playerService = $this->container->get(\App\Service\PlayerService::class);
                            $player = $playerService->getPlayer((int)$this->input['playerId']);
                            if (!$player || $player['user_id'] !== null) {
                                $this->sendError('Unauthorized: Guests can only join unregistered players.', 401);
                            }
                        }
                    } else {
                        $this->validateTDAccess();
                    }

                    $this->leagueService->addPlayerToLeague((int)$this->input['leagueId'], (int)$this->input['playerId']);
                    $this->sendJson(['success' => true]);

                } else if ($this->task === 'team') {
                    if (empty($this->input['leagueId']) || empty($this->input['teamId'])) {
                        $this->sendError('leagueId and teamId are required', 400);
                    }

                    $this->authorizeLeagueAccess((int)$this->input['leagueId']);

                    $this->leagueService->addTeamToLeague((int)$this->input['leagueId'], (int)$this->input['teamId']);
                    $this->sendJson(['success' => true]);

                } else if ($this->task === 'start_season') {
                    if (empty($this->input['leagueId'])) {
                        $this->sendError('leagueId is required', 400);
                    }

                    $this->authorizeLeagueAccess((int)$this->input['leagueId']);

                    $this->leagueService->startSeason((int)$this->input['leagueId']);
                    $this->sendJson(['success' => true]);

                } else if ($this->task === 'update_season') {
                    if (empty($this->input['leagueId'])) {
                        $this->sendError('leagueId is required', 400);
                    }

                    $this->validateTDAccess();
                    $this->leagueService->updateSeason((int)$this->input['leagueId']);
                    $this->sendJson(['success' => true]);

                } else if ($this->task === 'start_playoffs') {
                    if (empty($this->input['leagueId']) || empty($this->input['seeds']) || !isset($this->input['seriesLength'])) {
                        $this->sendError('leagueId, seeds, and seriesLength are required', 400);
                    }

                    $this->validateTDAccess();
                    $this->leagueService->startPlayoffs(
                        (int)$this->input['leagueId'],
                        $this->input['seeds'],
                        (int)$this->input['seriesLength']
                    );
                    $this->sendJson(['success' => true]);

                } else if ($this->task === 'fixture') {
                    if (empty($this->input['leagueId']) || empty($this->input['eventName'])) {
                        $this->sendError('leagueId and eventName are required', 400);
                    }

                    $this->authorizeLeagueAccess((int)$this->input['leagueId']);

                    $event = $this->leagueService->createEvent(
                        (int)$this->input['leagueId'],
                        $this->input['eventName'],
                        $this->input['eventDate'] ?? null,
                        !empty($this->input['locationId']) ? (int)$this->input['locationId'] : null,
                        $this->input['scoringFormat'] ?? null
                    );
                    if (!$event) $this->sendError('Event created but could not be retrieved.', 500);
                    $this->sendJson(Serializer::event($event));

                } else {
                    if (empty($this->input['name'])) $this->sendError('name is required', 400);

                    $p = $this->buildLeagueParams();
                    $league = $this->leagueService->createLeague(
                        $p['name'],
                        $p['startDate'],
                        $this->input['type'] ?? 'standard',
                        $p['participants'],
                        $p['scoringFormat'],
                        $p['seasonScoring'],
                        $p['dropLowestWeeks'],
                        $p['weeksInSeason'],
                        $p['roundsPerGame'],
                        $p['matchupsPerRound'],
                        $p['weeklyPoints'],
                        $p['pointSpread'],
                        $p['locationIds']
                    );
                    if (!$league) $this->sendError('League created but could not be retrieved.', 500);
                    $this->sendJson(Serializer::league($league));
                }
                break;

            case 'PUT':
                $this->validateTDAccess();

                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) $this->sendError('id query parameter is required', 400);

                if ($this->task === 'fixture') {
                    $event = $this->leagueService->updateEvent(
                        $id,
                        $this->input['eventName'] ?? null,
                        $this->input['eventDate'] ?? null,
                        !empty($this->input['locationId']) ? (int)$this->input['locationId'] : null,
                        $this->input['scoringFormat'] ?? 'bowling'
                    );
                    if (!$event) $this->sendError('Resource updated but could not be retrieved.', 500);
                    $this->sendJson(Serializer::event($event));
                } else {
                    $p = $this->buildLeagueParams();
                    $league = $this->leagueService->updateLeague(
                        $id,
                        $p['name'],
                        $p['startDate'],
                        $p['participants'],
                        $p['scoringFormat'],
                        $p['seasonScoring'],
                        $p['dropLowestWeeks'],
                        $p['weeksInSeason'],
                        $p['roundsPerGame'],
                        $p['matchupsPerRound'],
                        $p['weeklyPoints'],
                        $p['pointSpread'],
                        $p['locationIds']
                    );
                    if (!$league) $this->sendError('Resource updated but could not be retrieved.', 500);
                    $this->sendJson(Serializer::league($league));
                }
                break;

            case 'DELETE':
                if ($this->task === 'member') {
                    $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
                    $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;

                    $this->authorizeLeagueAccess($leagueId);

                    $this->leagueService->removePlayerFromLeague($leagueId, $playerId);
                } else {
                    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                    if (!$id) $this->sendError('id query parameter is required', 400);

                    if ($this->task === 'fixture') {
                        if ($this->leagueService->getEventLeagueId($id) === false) {
                            $this->sendError('Event not found', 404);
                        }
                        $this->validateTDAccess();
                        $this->leagueService->deleteEvent($id);
                    } else {
                        $this->validateAdminAccess();
                        $this->leagueService->deleteLeague($id);
                    }
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
    (new LeagueController($container))->dispatch();
}
