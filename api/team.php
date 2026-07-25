<?php
/**
 * Team Management REST API Endpoint.
 * HTTP controller that delegates to the TeamService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Includes\Serializer;
use App\Service\TeamService;

class TeamController extends ApiController {
    private TeamService $teamService;

    public function __construct($container) {
        parent::__construct($container);
        $this->teamService = $container->get(TeamService::class);
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                $includeWrappers = isset($_GET['includeWrappers']) && $_GET['includeWrappers'] === 'true';
                $teams = $this->teamService->getAllTeams($includeWrappers);
                $this->sendJson(array_map([Serializer::class, 'team'], $teams));
                break;

            case 'POST':
                $this->validateTDAccess();
                
                if ($this->task === 'member') {
                    // Add player to team
                    if (empty($this->input['teamId']) || empty($this->input['playerId'])) {
                        $this->sendError('teamId and playerId are required', 400);
                    }
                    
                    $this->teamService->addPlayerToTeam(
                        (int)$this->input['teamId'],
                        (int)$this->input['playerId']
                    );
                    $this->sendJson(['success' => true]);
                    
                } else if ($this->task === 'league') {
                    // Add team to league
                    if (empty($this->input['leagueId']) || empty($this->input['teamId'])) {
                        $this->sendError('leagueId and teamId are required', 400);
                    }
                    
                    $this->teamService->addTeamToLeague(
                        (int)$this->input['leagueId'],
                        (int)$this->input['teamId']
                    );
                    $this->sendJson(['success' => true]);
                    
                } else {
                    // Create new team
                    if (empty($this->input['name'])) {
                        $this->sendError('name is required', 400);
                    }
                    
                    $team = $this->teamService->createTeam(
                        $this->input['name'],
                        $this->input['city'] ?? null,
                        $this->input['state'] ?? null
                    );
                    $this->sendJson(Serializer::team($team));
                }
                break;

            case 'PUT':
                $this->validateTDAccess();
                
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) {
                    $this->sendError('id query parameter is required', 400);
                }
                
                $team = $this->teamService->updateTeam(
                    $id,
                    $this->input['name'] ?? null,
                    $this->input['city'] ?? null,
                    $this->input['state'] ?? null
                );
                $this->sendJson(Serializer::team($team));
                break;

            case 'DELETE':
                $this->validateTDAccess();
                
                if ($this->task === 'member') {
                    // Remove player from team
                    if (empty($_GET['teamId']) || empty($_GET['playerId'])) {
                        $this->sendError('teamId and playerId are required', 400);
                    }
                    
                    $this->teamService->removePlayerFromTeam(
                        (int)$_GET['teamId'],
                        (int)$_GET['playerId']
                    );
                    $this->sendJson(['success' => true]);
                    
                } else if ($this->task === 'league') {
                    // Remove team from league
                    if (empty($_GET['leagueId']) || empty($_GET['teamId'])) {
                        $this->sendError('leagueId and teamId are required', 400);
                    }
                    
                    $this->teamService->removeTeamFromLeague(
                        (int)$_GET['leagueId'],
                        (int)$_GET['teamId']
                    );
                    $this->sendJson(['success' => true]);
                    
                } else {
                    // Delete team
                    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                    if (!$id) {
                        $this->sendError('id query parameter is required', 400);
                    }
                    
                    $this->teamService->deleteTeam($id);
                    $this->sendJson(['success' => true]);
                }
                break;

            default:
                $this->sendError('Unsupported request method', 405);
        }
    }
}

// Prevent immediate execution during unit testing
$container = $GLOBALS['container'];
if (!defined('PHPUNIT_RUNNING') || PHPUNIT_RUNNING !== true) {
    (new TeamController($container))->dispatch();
}
