<?php
/**
 * Location Management REST API Endpoint.
 * HTTP controller that delegates to the LocationService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Includes\Serializer;
use App\Service\LocationService;

class LocationController extends ApiController {
    private LocationService $locationService;

    public function __construct($container) {
        parent::__construct($container);
        $this->locationService = $container->get(LocationService::class);
    }

    protected function handle(): void {
        switch ($this->method) {
            case 'GET':
                if ($this->task === 'units') {
                    // Get machines at locations
                    $locationId = isset($_GET['locationId']) ? (int)$_GET['locationId'] : null;
                    $machines = $this->locationService->getLocationMachines($locationId);
                    $this->sendJson(Serializer::locationMachinesGrouped($machines));
                } else {
                    $id = isset($_GET['id']) ? (int)$_GET['id'] : null;
                    if ($id) {
                        $location = $this->locationService->getLocation($id);
                        if ($location) {
                            $this->sendJson(Serializer::location($location));
                        } else {
                            $this->sendError('Location not found', 404);
                        }
                    } else {
                        $locations = $this->locationService->getAllLocations();
                        $this->sendJson(array_map([Serializer::class, 'location'], $locations));
                    }
                }
                break;

            case 'POST':
                if ($this->task === 'units') {
                    // Add machine to location
                    if (empty($this->input['locationId']) || empty($this->input['machineId'])) {
                        $this->sendError('locationId and machineId are required', 400);
                    }
                    
                    $user = \App\Service\AuthService::getCurrentUser();
                    $isPlayer = $user && in_array($user['role'], ['player', 'td', 'admin']);
                    if (!$isPlayer) $this->validateTDAccess();
                    
                    $allowed = ['format', 'target_easy', 'target_med', 'target_hard'];
                    $data = array_intersect_key($this->input, array_flip($allowed));
                    $this->locationService->addMachineToLocation(
                        (int)$this->input['locationId'],
                        (int)$this->input['machineId'],
                        $data
                    );
                    $this->sendJson(['success' => true]);
                } else {
                    // Create new location
                    if (empty($this->input['name'])) {
                        $this->sendError('name is required', 400);
                    }
                    
                    $currentUser = \App\Service\AuthService::getCurrentUser();
                    if (!$currentUser || !in_array($currentUser['role'], ['admin', 'td', 'player'])) {
                        $this->sendError('Unauthorized to add locations', 403);
                    }
                    
                    $location = $this->locationService->createLocation(
                        $this->input['name'],
                        $this->input['city'] ?? null,
                        $this->input['state'] ?? null
                    );
                    $this->sendJson(Serializer::location($location), 201);
                }
                break;

            case 'PUT':
                $currentUser = \App\Service\AuthService::getCurrentUser();
                if (!$currentUser || !in_array($currentUser['role'], ['admin', 'td', 'player'])) {
                    $this->sendError('Unauthorized to update locations/machines', 403);
                }

                if ($this->task === 'units') {
                    if (empty($this->input['locationId']) || empty($this->input['machineId'])) {
                        $this->sendError('locationId and machineId are required', 400);
                    }
                    $allowed = ['format', 'target_easy', 'target_med', 'target_hard'];
                    $data = array_intersect_key($this->input, array_flip($allowed));
                    $this->locationService->updateLocationMachine((int)$this->input['locationId'], (int)$this->input['machineId'], $data);
                    $this->sendJson(['success' => true]);
                } else {
                    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                    if (!$id) {
                        $this->sendError('id query parameter is required', 400);
                    }
                    $location = $this->locationService->updateLocation($id, $this->input);
                    $this->sendJson(Serializer::location($location));
                }
                break;

            case 'DELETE':
                if ($this->task === 'units') {
                    // Remove machine from location
                    if (empty($_GET['locationId']) || empty($_GET['machineId'])) {
                        $this->sendError('locationId and machineId are required', 400);
                    }
                    
                    $this->validateTDAccess();
                    
                    $this->locationService->removeMachineFromLocation(
                        (int)$_GET['locationId'],
                        (int)$_GET['machineId']
                    );
                    $this->sendJson(['success' => true]);
                } else {
                    // Delete location
                    $this->validateAdminAccess();
                    
                    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                    if (!$id) {
                        $this->sendError('id query parameter is required', 400);
                    }
                    
                    $this->locationService->deleteLocation($id);
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
    (new LocationController($container))->dispatch();
}
