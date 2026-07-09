<?php
/**
 * Team Management REST API Endpoint.
 * HTTP controller that delegates to the TeamService class.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $container = $GLOBALS['container'];
    $teamService = $container->get(\App\Service\TeamService::class);
    
    $method = $_SERVER['REQUEST_METHOD'];
    $task = $_GET['task'] ?? 'team';
    $input = getJsonInput();

    // GET: Retrieve teams
    if ($method === 'GET') {
        $teams = $teamService->getAllTeams();
        sendJson(array_map('serializeTeam', $teams));
    }

    // POST: Create team, add member, or add to league
    if ($method === 'POST') {
        validateTDAccess();
        
        if ($task === 'member') {
            // Add player to team
            if (empty($input['teamId']) || empty($input['playerId'])) {
                sendJson(['error' => 'teamId and playerId are required'], 400);
            }
            
            $teamService->addPlayerToTeam(
                (int)$input['teamId'],
                (int)$input['playerId']
            );
            sendJson(['success' => true]);
            
        } else if ($task === 'league') {
            // Add team to league
            if (empty($input['leagueId']) || empty($input['teamId'])) {
                sendJson(['error' => 'leagueId and teamId are required'], 400);
            }
            
            $teamService->addTeamToLeague(
                (int)$input['leagueId'],
                (int)$input['teamId']
            );
            sendJson(['success' => true]);
            
        } else {
            // Create new team
            if (empty($input['name'])) {
                sendJson(['error' => 'name is required'], 400);
            }
            
            $team = $teamService->createTeam(
                $input['name'],
                $input['city'] ?? null,
                $input['state'] ?? null
            );
            sendJson(serializeTeam($team));
        }
    }

    // PUT: Update team
    if ($method === 'PUT') {
        validateTDAccess();
        
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            sendJson(['error' => 'id query parameter is required'], 400);
        }
        
        $team = $teamService->updateTeam(
            $id,
            $input['name'] ?? null,
            $input['city'] ?? null,
            $input['state'] ?? null
        );
        sendJson(serializeTeam($team));
    }

    // DELETE: Remove team, member, or league association
    if ($method === 'DELETE') {
        validateTDAccess();
        
        if ($task === 'member') {
            // Remove player from team
            if (empty($_GET['teamId']) || empty($_GET['playerId'])) {
                sendJson(['error' => 'teamId and playerId are required'], 400);
            }
            
            $teamService->removePlayerFromTeam(
                (int)$_GET['teamId'],
                (int)$_GET['playerId']
            );
            sendJson(['success' => true]);
            
        } else if ($task === 'league') {
            // Remove team from league
            if (empty($_GET['leagueId']) || empty($_GET['teamId'])) {
                sendJson(['error' => 'leagueId and teamId are required'], 400);
            }
            
            $teamService->removeTeamFromLeague(
                (int)$_GET['leagueId'],
                (int)$_GET['teamId']
            );
            sendJson(['success' => true]);
            
        } else {
            // Delete team
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) {
                sendJson(['error' => 'id query parameter is required'], 400);
            }
            
            $teamService->deleteTeam($id);
            sendJson(['success' => true]);
        }
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
