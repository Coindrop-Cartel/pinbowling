<?php
/**
 * REST API for managing Leagues and their associated Events.
 * 
 * Supported Methods:
 * - GET: Fetch leagues (bulk), single league with roster/events, or event list.
 * - POST: Create new leagues, events, or associate players with leagues (rosters).
 * - PUT: Update league/event details or reset league passwords.
 * - DELETE: Remove leagues, events, or players from rosters.
 * 
 * Query Parameters:
 * - action: 'league' (default), 'event', or 'player'
 * - id: Primary key of the entity being acted upon
 * - leagueId: Foreign key filter for events/players
 * - playerId: Foreign key filter for league roster deletions
 */
require_once __DIR__ . '/../includes/config.php';
$pdo = getDbConnection();

$method = $_SERVER['REQUEST_METHOD'];
$input = getJsonInput();
// Use 'task' parameter (formerly 'action') to avoid ad-blocker filters
$task = $_GET['task'] ?? 'league'; 

// GET: Retrieve Leagues or Events
if ($method === 'GET') {
    if ($task === 'fixture') {
        $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
        if ($leagueId) { // Fetch events for a specific league
            $stmt = $pdo->prepare('SELECT e.*, l.name as location_name FROM Events e LEFT JOIN Locations l ON e.location_id = l.id WHERE e.league_id = ? ORDER BY e.event_date ASC');
            $stmt->execute([$leagueId]);
        } else { // Fetch all events
            $stmt = $pdo->query('SELECT e.*, l.name as location_name FROM Events e LEFT JOIN Locations l ON e.location_id = l.id ORDER BY e.event_date ASC');
        }
        sendJson($stmt->fetchAll());
    } else {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id) {
            $stmt = $pdo->prepare('SELECT * FROM Leagues WHERE id = ?');
            $stmt->execute([$id]);
            $league = $stmt->fetch();
            if ($league) {
                // Automatically include events when fetching a specific league
                $stmt = $pdo->prepare('SELECT id, league_id, location_id, event_name, event_date FROM Events WHERE league_id = ? ORDER BY event_date ASC');
                $stmt->execute([$id]);
                $league['events'] = $stmt->fetchAll();

                $stmt = $pdo->prepare('SELECT p.* FROM Players p JOIN League_Players lp ON p.id = lp.player_id WHERE lp.league_id = ? ORDER BY p.player_name ASC');
                $stmt->execute([$id]);
                $league['players'] = $stmt->fetchAll();

                unset($league['password']); // Never return hashes
                sendJson($league);
            }
            sendJson(['error' => 'League not found'], 404);
        }

        // --- Performance Optimization: Bulk Fetching ---
        // To prevent the "N+1" query problem on the management page, we 
        // fetch all leagues, events, and rosters in broad queries and 
        // group them in memory before returning the final JSON structure.
        
        // Fetch all leagues (excluding password)
        $leaguesStmt = $pdo->query('SELECT id, name, start_date FROM Leagues ORDER BY start_date DESC');
        $leagues = $leaguesStmt->fetchAll();

        // Fetch all events
        $eventsStmt = $pdo->query('SELECT e.*, l.name as location_name FROM Events e LEFT JOIN Locations l ON e.location_id = l.id ORDER BY e.event_date ASC');
        $allEvents = $eventsStmt->fetchAll();

        // Fetch all league players
        $lpStmt = $pdo->query('SELECT lp.league_id, p.* FROM Players p JOIN League_Players lp ON p.id = lp.player_id ORDER BY p.player_name ASC');
        $allLeaguePlayers = $lpStmt->fetchAll();

        // Group events by their league_id
        $eventsByLeague = [];
        foreach ($allEvents as $event) {
            $eventsByLeague[(int)$event['league_id']][] = $event;
        }

        // Group players by league_id
        $playersByLeague = [];
        foreach ($allLeaguePlayers as $lp) {
            $lId = $lp['league_id'];
            unset($lp['league_id']);
            $playersByLeague[$lId][] = $lp;
        }

        // Attach events to their corresponding leagues
        foreach ($leagues as &$league) {
            $league['events'] = $eventsByLeague[(int)$league['id']] ?? [];
            $league['players'] = $playersByLeague[(int)$league['id']] ?? [];
        }

        sendJson($leagues);
    }
}

// POST: Create new League or Event (Protected by API Secret)
if ($method === 'POST') {
    if ($task === 'member') {
        validateLeagueAccess($pdo, $input['league_id']);
        if (empty($input['league_id']) || empty($input['player_id'])) {
            sendJson(['error' => 'league_id and player_id are required'], 400);
        }
        $stmt = $pdo->prepare('INSERT IGNORE INTO League_Players (league_id, player_id) VALUES (?, ?)');
        $stmt->execute([(int)$input['league_id'], (int)$input['player_id']]);
        sendJson(['success' => true]);
    } else if ($task === 'fixture') {
        validateLeagueAccess($pdo, $input['league_id']);
        if (empty($input['league_id']) || empty($input['event_name'])) {
            sendJson(['error' => 'league_id and event_name are required'], 400);
        }
        $sql = 'INSERT INTO Events (league_id, location_id, event_name, event_date) VALUES (?, ?, ?, ?)';
        $params = [
            (int)$input['league_id'], 
            !empty($input['location_id']) ? (int)$input['location_id'] : null, 
            $input['event_name'], 
            $input['event_date'] ?? null
        ];
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $newId = $pdo->lastInsertId();
        
        $stmt = $pdo->prepare('SELECT e.*, l.name as location_name FROM Events e LEFT JOIN Locations l ON e.location_id = l.id WHERE e.id = ?');
        $stmt->execute([$newId]);
        sendJson($stmt->fetch());
    } else {
        validateApiSecret(); // League creation is global admin only
        if (empty($input['name'])) sendJson(['error' => 'name is required'], 400);
        
        $password = !empty($input['password']) ? password_hash($input['password'], PASSWORD_DEFAULT) : null;
        $sql = 'INSERT INTO Leagues (name, start_date, password) VALUES (?, ?, ?)';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$input['name'], $input['start_date'] ?? null, $password]);
        $newId = $pdo->lastInsertId();

        $stmt = $pdo->prepare('SELECT id, name, start_date FROM Leagues WHERE id = ?');
        $stmt->execute([$newId]);
        sendJson($stmt->fetch());
    }
}

// PUT: Update League or Event (Protected by API Secret)
if ($method === 'PUT') {
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if (!$id) sendJson(['error' => 'id query parameter is required'], 400);

    if ($task === 'fixture') {
        validateLeagueAccess($pdo, $input['league_id']);
        $sql = 'UPDATE Events SET league_id = ?, location_id = ?, event_name = ?, event_date = ? WHERE id = ?';
        $params = [
            (int)$input['league_id'], 
            !empty($input['location_id']) ? (int)$input['location_id'] : null, 
            $input['event_name'], 
            $input['event_date'] ?? null, 
            $id
        ];
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM Events WHERE id = ?');
    } else {
        // Handle password reset separately (Requires Global Admin)
        if (isset($input['reset_password'])) {
            validateApiSecret();
            $newPass = !empty($input['password']) ? password_hash($input['password'], PASSWORD_DEFAULT) : null;
            $pdo->prepare('UPDATE Leagues SET password = ? WHERE id = ?')->execute([$newPass, $id]);
            sendJson(['success' => true]);
        }

        validateLeagueAccess($pdo, $id);
        $sql = 'UPDATE Leagues SET name = ?, start_date = ? WHERE id = ?';
        $params = [$input['name'], $input['start_date'] ?? null, $id];
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM Leagues WHERE id = ?');
    }
    $stmt->execute([$id]);
    sendJson($stmt->fetch());
}

// DELETE: Remove League or Event (Protected by API Secret)
if ($method === 'DELETE') {
    try {
        if ($task === 'member') {
            $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
            validateLeagueAccess($pdo, $leagueId);
            $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;
            $pdo->prepare("DELETE FROM League_Players WHERE league_id = ? AND player_id = ?")->execute([$leagueId, $playerId]);
        } else {
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) sendJson(['error' => 'id query parameter is required'], 400);

            if ($task === 'fixture') {
                // Verify the event exists and retrieve its league_id for security validation
                $stmt = $pdo->prepare('SELECT league_id FROM Events WHERE id = ?');
                $stmt->execute([$id]);
                $eventLeagueId = $stmt->fetchColumn();
                if ($eventLeagueId === false) {
                    sendJson(['error' => 'Event not found'], 404);
                }
                validateLeagueAccess($pdo, $eventLeagueId);
            } else {
                validateLeagueAccess($pdo, $id); // Deleting a League
            }

            $table = ($task === 'fixture') ? 'Events' : 'Leagues';
            $stmt = $pdo->prepare("DELETE FROM $table WHERE id = ?");
            $stmt->execute([$id]);
        }
        sendJson(['success' => true]);
    } catch (PDOException $e) {
        // Return clear database errors (e.g., foreign key violations) instead of crashing
        sendJson(['error' => 'Database error: ' . $e->getMessage()], 500);
    }
}

sendJson(['error' => 'Unsupported request method'], 405);