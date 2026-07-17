<?php
/**
 * Location Management REST API Endpoint.
 * HTTP controller that delegates to the LocationService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $container = $GLOBALS['container'];
    $locationService = $container->get(\App\Service\LocationService::class);
    
    $method = $_SERVER['REQUEST_METHOD'];
    $task = $_GET['task'] ?? 'location';
    $input = getJsonInput();

    switch ($method) {
        case 'GET':
            if ($task === 'units') {
                // Get machines at locations
                $locationId = isset($_GET['locationId']) ? (int)$_GET['locationId'] : null;
                $machines = $locationService->getLocationMachines($locationId);
                sendJson(serializeLocationMachinesGrouped($machines));
            } else {
                $id = isset($_GET['id']) ? (int)$_GET['id'] : null;
                if ($id) {
                    $location = $locationService->getLocation($id);
                    if ($location) {
                        sendJson(serializeLocation($location));
                    } else {
                        sendJson(['error' => 'Location not found'], 404);
                    }
                } else {
                    $locations = $locationService->getAllLocations();
                    sendJson(array_map('serializeLocation', $locations));
                }
            }
            break;

        case 'POST':
            if ($task === 'units') {
                // Add machine to location
                if (empty($input['locationId']) || empty($input['machineId'])) {
                    sendJson(['error' => 'locationId and machineId are required'], 400);
                }
                
                $user = \App\Service\AuthService::getCurrentUser();
                $isPlayer = $user && in_array($user['role'], ['player', 'td', 'admin']);
                if (!$isPlayer) validateTDAccess();
                
                $allowed = ['format', 'target_easy', 'target_med', 'target_hard'];
                $data = array_intersect_key($input, array_flip($allowed));
                $locationService->addMachineToLocation(
                    (int)$input['locationId'],
                    (int)$input['machineId'],
                    $data
                );
                sendJson(['success' => true]);
            } else {
                // Create new location
                if (empty($input['name'])) {
                    sendJson(['error' => 'name is required'], 400);
                }
                
                $currentUser = \App\Service\AuthService::getCurrentUser();
                if (!$currentUser || !in_array($currentUser['role'], ['admin', 'td', 'player'])) {
                    sendJson(['error' => 'Unauthorized to add locations'], 403);
                }
                
                $location = $locationService->createLocation(
                    $input['name'],
                    $input['city'] ?? null,
                    $input['state'] ?? null
                );
                sendJson(serializeLocation($location), 201);
            }
            break;

        case 'PUT':
            $currentUser = \App\Service\AuthService::getCurrentUser();
            if (!$currentUser || !in_array($currentUser['role'], ['admin', 'td', 'player'])) {
                sendJson(['error' => 'Unauthorized to update locations/machines'], 403);
            }

            if ($task === 'units') {
                if (empty($input['locationId']) || empty($input['machineId'])) {
                    sendJson(['error' => 'locationId and machineId are required'], 400);
                }
                $allowed = ['format', 'target_easy', 'target_med', 'target_hard'];
                $data = array_intersect_key($input, array_flip($allowed));
                $locationService->updateLocationMachine((int)$input['locationId'], (int)$input['machineId'], $data);
                sendJson(['success' => true]);
            } else {
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) {
                    sendJson(['error' => 'id query parameter is required'], 400);
                }
                $location = $locationService->updateLocation($id, $input);
                sendJson(serializeLocation($location));
            }
            break;

        case 'DELETE':
            if ($task === 'units') {
                // Remove machine from location
                if (empty($_GET['locationId']) || empty($_GET['machineId'])) {
                    sendJson(['error' => 'locationId and machineId are required'], 400);
                }
                
                validateTDAccess();
                
                $locationService->removeMachineFromLocation(
                    (int)$_GET['locationId'],
                    (int)$_GET['machineId']
                );
                sendJson(['success' => true]);
            } else {
                // Delete location
                validateAdminAccess();
                
                $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
                if (!$id) {
                    sendJson(['error' => 'id query parameter is required'], 400);
                }
                
                $locationService->deleteLocation($id);
                sendJson(['success' => true]);
            }
            break;

        default:
            sendJson(['error' => 'Unsupported request method'], 405);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
