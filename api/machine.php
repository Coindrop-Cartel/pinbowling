<?php
/**
 * Machine Management REST API Endpoint.
 * HTTP controller that delegates to the MachineService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Includes\Serializer;
use App\Service\MachineService;

class MachineController extends ApiController {
    private MachineService $machineService;

    public function __construct($container) {
        parent::__construct($container);
        $this->machineService = $container->get(MachineService::class);
    }

    protected function handle(): void {
        $eventId = isset($_GET['eventId']) ? (int)$_GET['eventId'] : 0;
        $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
        $matchupRefId = isset($_GET['matchupRefId']) ? (int)$_GET['matchupRefId'] : 0;

        switch ($this->method) {
            case 'GET':
                if ($leagueId) {
                    // Get target scores for league
                    $targets = $this->machineService->getLeagueTargetScores($leagueId);
                    $this->sendJson(array_map([Serializer::class, 'targetScore'], $targets));
                } else if ($eventId) {
                    // Get target scores for event (optionally scoped to a specific matchup)
                    $targets = $this->machineService->getEventTargetScores($eventId, $matchupRefId);
                    $this->sendJson(array_map([Serializer::class, 'targetScore'], $targets));
                } else {
                    // Get master machine list
                    $machines = $this->machineService->getAllMachines();
                    $this->sendJson(Serializer::masterMachinesGrouped($machines));
                }
                break;

            case 'POST':
                if ($this->task === 'sort') {
                    // Reorder target scores
                    if (!is_array($this->input)) {
                        $this->sendError('Input must be an array', 400);
                    }
                    
                    $this->validateTDAccess();
                    $this->machineService->reorderTargetScores($this->input);
                    $this->sendJson(['success' => true]);
                    
                } else if ($eventId) {
                    // Create/update target scores for event
                    $this->validateTDAccess();
                    
                    $saveInput = is_array($this->input) && isset($this->input[0]) ? $this->input : [$this->input];
                    $this->machineService->saveTargetScores($eventId, $saveInput, $matchupRefId);
                    $this->sendJson(['success' => true]);
                    
                } else {
                    // Create new master machine
                    if (empty($this->input['machineName'])) {
                        $this->sendError('machineName is required', 400);
                    }
                    
                    $this->validateTDAccess();
                    
                    $machine = $this->machineService->createMachine(
                        $this->input['machineName'],
                        $this->input['year'] ?? null,
                        $this->input['manufacturer'] ?? null,
                        $this->input['scores'] ?? null
                    );
                    $this->sendJson(Serializer::masterMachine($machine));
                }
                break;

            case 'PUT':
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) {
                    $this->sendError('id query parameter is required', 400);
                }
                
                $this->validateTDAccess();
                
                if ($eventId) {
                    // Update target scores
                    $this->machineService->saveTargetScores($eventId, [$this->input]);
                } else {
                    // Update machine
                    $this->machineService->updateMachine(
                        $id,
                        $this->input['machineName'] ?? null,
                        $this->input['year'] ?? null,
                        $this->input['manufacturer'] ?? null,
                        $this->input['scores'] ?? null
                    );
                }
                
                $this->sendJson(['success' => true]);
                break;

            case 'DELETE':
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) {
                    $this->sendError('id query parameter is required', 400);
                }
                
                if ($eventId) {
                    // Delete event target scores
                    $this->validateTDAccess();
                    $this->machineService->deleteEventTargetScores($eventId);
                } else {
                    // Delete machine
                    $this->validateAdminAccess();
                    $this->machineService->deleteMachine($id);
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
    (new MachineController($container))->dispatch();
}
