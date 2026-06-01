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

/**
 * Helper to transform Events into camelCase.
 */
function serializeEvent($row) {
    return [
        'id' => (int)$row['id'],
        'leagueId' => (int)$row['league_id'],
        'locationId' => isset($row['location_id']) ? (int)$row['location_id'] : null,
        'eventName' => $row['event_name'],
        'eventDate' => $row['event_date'],
        'locationName' => $row['location_name'] ?? null
    ];
}

/**
 * Helper to transform Players into camelCase.
 */
function serializePlayer($row) {
    return [
        'id' => (int)$row['id'],
        'playerName' => $row['player_name'],
        'ifpaId' => $row['ifpa_id'] ?? null,
        'matchplayId' => $row['matchplay_id'] ?? null
    ];
}

/**
 * Helper to transform Leagues into camelCase.
 */
function serializeLeague($row) {
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'type' => $row['type'] ?? 'standard',
        'startDate' => $row['start_date'],
        'events' => isset($row['events']) ? array_map('serializeEvent', $row['events']) : [],
        // Players are already standardized in playerService, keeping key consistent
        'players' => isset($row['players']) ? array_map('serializePlayer', $row['players']) : []
    ];
}

try {
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
                $stmt = $pdo->prepare('SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id WHERE e.league_id = ? ORDER BY e.event_date ASC');
                $stmt->execute([$leagueId]);
            } else { // Fetch all events
                $stmt = $pdo->query('SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id ORDER BY e.event_date ASC');
            }
            sendJson(array_map('serializeEvent', $stmt->fetchAll()));
        } else {
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id) {
                $stmt = $pdo->prepare('SELECT * FROM leagues WHERE id = ?');
                $stmt->execute([$id]);
                $league = $stmt->fetch();
                if ($league) {
                    // Automatically include events when fetching a specific league
                    $stmt = $pdo->prepare('SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id WHERE e.league_id = ? ORDER BY e.event_date ASC');
                    $stmt->execute([$id]);
                    $league['events'] = $stmt->fetchAll();

                    $stmt = $pdo->prepare('SELECT p.* FROM players p JOIN league_players lp ON p.id = lp.player_id WHERE lp.league_id = ? ORDER BY p.player_name ASC');
                    $stmt->execute([$id]);
                    $league['players'] = $stmt->fetchAll();

                    unset($league['password']); // Never return hashes
                    sendJson(serializeLeague($league));
                }
                sendJson(['error' => 'League not found'], 404);
            }

            // --- Performance Optimization: Bulk Fetching ---
            // To prevent the "N+1" query problem on the management page, we 
            // fetch all leagues, events, and rosters in broad queries and 
            // group them in memory before returning the final JSON structure.
            
            // Fetch leagues (optionally filtered by type)
            $typeFilter = $_GET['type'] ?? null;
            $sql = 'SELECT id, name, start_date, type FROM leagues';
            if ($typeFilter) $sql .= ' WHERE type = ?';
            $sql .= ' ORDER BY start_date DESC';
            
            $leaguesStmt = $pdo->prepare($sql);
            $leaguesStmt->execute($typeFilter ? [$typeFilter] : []);
            $leagues = $leaguesStmt->fetchAll();

            // Fetch all events
            $eventsStmt = $pdo->query('SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id ORDER BY e.event_date ASC');
            $allEvents = $eventsStmt->fetchAll();

            // Fetch all league players
            $lpStmt = $pdo->query('SELECT lp.league_id, p.* FROM players p JOIN league_players lp ON p.id = lp.player_id ORDER BY p.player_name ASC');
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
                // We keep the raw row here and let serializeLeague handle the 
                // conversion to camelCase to avoid double-serialization errors.
                $playersByLeague[$lId][] = $lp;
            }

            // Attach events to their corresponding leagues
            foreach ($leagues as &$league) {
                $league['events'] = $eventsByLeague[(int)$league['id']] ?? [];
                $league['players'] = $playersByLeague[(int)$league['id']] ?? [];
            }

            sendJson(array_map('serializeLeague', $leagues));
        }
    }

    // POST: Create new League or Event (Protected by API Secret)
    if ($method === 'POST') {
        if ($task === 'member') {
            if (empty($input['leagueId']) || empty($input['playerId'])) {
                sendJson(['error' => 'leagueId and playerId are required'], 400);
            }
            $stmt = $pdo->prepare('INSERT IGNORE INTO league_players (league_id, player_id) VALUES (?, ?)');
            $stmt->execute([(int)$input['leagueId'], (int)$input['playerId']]);
            sendJson(['success' => true]);
        } else if ($task === 'fixture') {
            if (empty($input['leagueId']) || empty($input['eventName'])) {
                sendJson(['error' => 'leagueId and eventName are required'], 400);
            }
            validateLeagueAccess($pdo, $input['leagueId']);
            $sql = 'INSERT INTO events (league_id, location_id, event_name, event_date) VALUES (?, ?, ?, ?)';
            $params = [
                (int)$input['leagueId'], 
                !empty($input['locationId']) ? (int)$input['locationId'] : null, 
                $input['eventName'], 
                $input['eventDate'] ?? null
            ];
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $newId = $pdo->lastInsertId();
            
            $stmt = $pdo->prepare('SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id WHERE e.id = ?');
            $stmt->execute([$newId]);
            $row = $stmt->fetch();
            if (!$row) {
                sendJson(['error' => 'Event created but could not be retrieved.'], 500);
            }
            sendJson(serializeEvent($row));
        } else {
            if (empty($input['name'])) sendJson(['error' => 'name is required'], 400);
            
            $password = !empty($input['password']) ? password_hash($input['password'], PASSWORD_DEFAULT) : null;
            $sql = 'INSERT INTO leagues (name, start_date, password, type) VALUES (?, ?, ?, ?)';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$input['name'], $input['startDate'] ?? null, $password, $input['type'] ?? 'standard']);
            $newId = $pdo->lastInsertId();

            $stmt = $pdo->prepare('SELECT id, name, start_date, type FROM leagues WHERE id = ?');
            $stmt->execute([$newId]);
            $row = $stmt->fetch();
            if (!$row) {
                sendJson(['error' => 'League created but could not be retrieved.'], 500);
            }
            sendJson(serializeLeague($row));
        }
    }

    // PUT: Update League or Event (Protected by API Secret)
    if ($method === 'PUT') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) sendJson(['error' => 'id query parameter is required'], 400);

        if ($task === 'fixture') {
            validateLeagueAccess($pdo, $input['leagueId']);
            $sql = 'UPDATE events SET league_id = ?, location_id = ?, event_name = ?, event_date = ? WHERE id = ?';
            $params = [
                (int)$input['leagueId'], 
                !empty($input['locationId']) ? (int)$input['locationId'] : null, 
                $input['eventName'], 
                $input['eventDate'] ?? null, 
                $id
            ];
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $stmt = $pdo->prepare('SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id WHERE e.id = ?');
        } else {
            // Handle password reset separately (Requires Global Admin)
            if (isset($input['resetPassword'])) {
                // Resetting a league password is a system-wide administrative task
                validateAdminAccess();
                $newPass = !empty($input['password']) ? password_hash($input['password'], PASSWORD_DEFAULT) : null;
                $pdo->prepare('UPDATE leagues SET password = ? WHERE id = ?')->execute([$newPass, $id]);
                sendJson(['success' => true]);
            }

            validateLeagueAccess($pdo, $id);
            $sql = 'UPDATE leagues SET name = ?, start_date = ? WHERE id = ?';
            $params = [$input['name'], $input['startDate'] ?? null, $id];
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $stmt = $pdo->prepare('SELECT * FROM leagues WHERE id = ?');
        }
        $stmt->execute([$id]);

        $row = $stmt->fetch();
        if (!$row) {
            sendJson(['error' => 'Resource updated but could not be retrieved.'], 500);
        }
        if ($task === 'fixture') {
            sendJson(serializeEvent($row));
        } else {
            sendJson(serializeLeague($row));
        }
    }

    // DELETE: Remove League or Event (Protected by API Secret)
    if ($method === 'DELETE') {
        if ($task === 'member') {
            $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
            validateLeagueAccess($pdo, $leagueId);
            $playerId = isset($_GET['playerId']) ? (int)$_GET['playerId'] : 0;

            // Remove player scores for all events within this specific league
            $pdo->prepare("DELETE FROM scores WHERE player_id = ? AND event_id IN (SELECT id FROM events WHERE league_id = ?)")
                ->execute([$playerId, $leagueId]);

            // Remove from league roster
            $pdo->prepare("DELETE FROM league_players WHERE league_id = ? AND player_id = ?")->execute([$leagueId, $playerId]);
        } else {
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if (!$id) sendJson(['error' => 'id query parameter is required'], 400);

            if ($task === 'fixture') {
                // Verify the event exists and retrieve its league_id for security validation
                $stmt = $pdo->prepare('SELECT league_id FROM events WHERE id = ?');
                $stmt->execute([$id]);
                $eventLeagueId = $stmt->fetchColumn();
                if ($eventLeagueId === false) {
                    sendJson(['error' => 'Event not found'], 404);
                }
                validateLeagueAccess($pdo, $eventLeagueId);
            } else {
                validateLeagueAccess($pdo, $id); // Deleting a League
            }

            $table = ($task === 'fixture') ? 'events' : 'leagues';
            $stmt = $pdo->prepare("DELETE FROM $table WHERE id = ?");
            $stmt->execute([$id]);
        }
        sendJson(['success' => true]);
    }

    sendJson(['error' => 'Unsupported request method'], 405);

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}