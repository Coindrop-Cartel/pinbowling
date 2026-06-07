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
        'locationName' => $row['location_name'] ?? null,
        'scoringFormat' => $row['scoring_format'] ?? 'bowling'
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
        'matchplayId' => $row['matchplay_id'] ?? null,
        'userId' => isset($row['user_id']) ? (int)$row['user_id'] : (isset($row['userId']) ? (int)$row['userId'] : null)
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
        'participants' => $row['participants'] ?? 'individual',
        'startDate' => $row['start_date'],
        'scoringFormat' => $row['scoring_format'] ?? 'bowling',
        'seasonScoring' => $row['season_scoring'] ?? 'weekly',
        'dropLowestWeeks' => (int)($row['drop_lowest_weeks'] ?? 0),
        'teams' => isset($row['teams']) ? array_map('serializeTeamWithMembers', $row['teams']) : [],
        'events' => isset($row['events']) ? array_map('serializeEvent', $row['events']) : [],
        // Players are already standardized in playerService, keeping key consistent
        'players' => isset($row['players']) ? array_map('serializePlayer', $row['players']) : []
    ];
}

function serializeTeamWithMembers($row) {
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'city' => $row['city'] ?? null,
        'state' => $row['state'] ?? null,
        'members' => isset($row['members']) ? array_map(function($m) {
            return ['id' => (int)$m['id'], 'playerName' => $m['player_name']];
        }, $row['members']) : []
    ];
}

// Prevent immediate execution during unit testing
if (defined('PHPUNIT_RUNNING') && PHPUNIT_RUNNING === true) {
    return;
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

                    $stmt = $pdo->prepare('
                        SELECT p.*, u.id as user_id 
                        FROM players p 
                        JOIN league_players lp ON p.id = lp.player_id 
                        LEFT JOIN users u ON p.id = u.player_id 
                        WHERE lp.league_id = ? 
                        ORDER BY p.player_name ASC');
                    $stmt->execute([$id]);
                    $league['players'] = $stmt->fetchAll();

                    $stmt = $pdo->prepare('
                        SELECT t.*, 
                               GROUP_CONCAT(p.id, ":", p.player_name SEPARATOR "|") as member_data
                        FROM teams t
                        JOIN league_teams lt ON t.id = lt.team_id
                        LEFT JOIN team_members tm ON t.id = tm.team_id
                        LEFT JOIN players p ON tm.player_id = p.id
                        WHERE lt.league_id = ?
                        GROUP BY t.id');
                    $stmt->execute([$id]);
                    $teams = $stmt->fetchAll();
                    foreach ($teams as &$t) {
                        $t['members'] = array_filter(array_map(function($m) {
                            $parts = explode(":", $m);
                            return count($parts) === 2 ? ['id' => $parts[0], 'player_name' => $parts[1]] : null;
                        }, explode("|", $t['member_data'] ?? '')));
                    }
                    $league['teams'] = $teams;

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
            $sql = 'SELECT * FROM leagues';
            if ($typeFilter) $sql .= ' WHERE type = ?';
            $sql .= ' ORDER BY start_date DESC';
            
            $leaguesStmt = $pdo->prepare($sql);
            $leaguesStmt->execute($typeFilter ? [$typeFilter] : []);
            $leagues = $leaguesStmt->fetchAll();

            // Fetch all events
            $eventsStmt = $pdo->query('SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id ORDER BY e.event_date ASC');
            $allEvents = $eventsStmt->fetchAll();

            // Fetch all league players
            $lpStmt = $pdo->query('
                SELECT lp.league_id, p.*, u.id as user_id 
                FROM players p 
                JOIN league_players lp ON p.id = lp.player_id 
                LEFT JOIN users u ON p.id = u.player_id 
                ORDER BY p.player_name ASC');
            $allLeaguePlayers = $lpStmt->fetchAll();

            // Fetch all league teams
            $ltStmt = $pdo->query('
                SELECT lt.league_id, t.*, 
                       GROUP_CONCAT(p.id, ":", p.player_name SEPARATOR "|") as member_data
                FROM teams t 
                JOIN league_teams lt ON t.id = lt.team_id 
                LEFT JOIN team_members tm ON t.id = tm.team_id
                LEFT JOIN players p ON tm.player_id = p.id
                GROUP BY lt.league_id, t.id
                ORDER BY t.name ASC');
            $allLeagueTeams = $ltStmt->fetchAll();

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

            // Group teams by league_id
            $teamsByLeague = [];
            foreach ($allLeagueTeams as $lt) {
                $lId = (int)$lt['league_id'];

                // Parse the GROUP_CONCAT member data into an array of objects for the serializer
                $lt['members'] = array_filter(array_map(function($m) {
                    $parts = explode(":", $m);
                    return count($parts) === 2 ? ['id' => $parts[0], 'player_name' => $parts[1]] : null;
                }, explode("|", $lt['member_data'] ?? '')));

                $teamsByLeague[$lId][] = $lt;
            }

            // Attach events to their corresponding leagues
            foreach ($leagues as &$league) {
                $league['events'] = $eventsByLeague[(int)$league['id']] ?? [];
                $league['players'] = $playersByLeague[(int)$league['id']] ?? [];
                $league['teams'] = $teamsByLeague[(int)$league['id']] ?? [];
            }

            sendJson(array_map('serializeLeague', $leagues));
        }
    }

    // POST: Create new League or Event (Protected by API Secret and Role)
    if ($method === 'POST') {
        // Enforce that only TDs or Admins can perform creation tasks
        validateTDAccess();

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

            // If no scoring format is provided for the event, inherit it from the league
            $format = $input['scoringFormat'] ?? null;
            if (!$format) {
                $stmtL = $pdo->prepare('SELECT scoring_format FROM leagues WHERE id = ?');
                $stmtL->execute([(int)$input['leagueId']]);
                $format = $stmtL->fetchColumn() ?: 'bowling';
            }

            $sql = 'INSERT INTO events (league_id, location_id, event_name, event_date, scoring_format) VALUES (?, ?, ?, ?, ?)';
            $params = [
                (int)$input['leagueId'], 
                !empty($input['locationId']) ? (int)$input['locationId'] : null, 
                $input['eventName'], 
                $input['eventDate'] ?? null,
                $format
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
            
            $sql = 'INSERT INTO leagues (name, start_date, type, participants, scoring_format, season_scoring, drop_lowest_weeks) VALUES (?, ?, ?, ?, ?, ?, ?)';
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $input['name'], 
                $input['startDate'] ?? null, 
                $input['type'] ?? 'standard',
                $input['participants'] ?? 'individual',
                $input['scoringFormat'] ?? 'bowling',
                $input['seasonScoring'] ?? 'weekly',
                (int)($input['dropLowestWeeks'] ?? 0)
            ]);
            $newId = $pdo->lastInsertId();

            $stmt = $pdo->prepare('SELECT * FROM leagues WHERE id = ?');
            $stmt->execute([$newId]);
            $row = $stmt->fetch();
            if (!$row) {
                sendJson(['error' => 'League created but could not be retrieved.'], 500);
            }
            sendJson(serializeLeague($row));
        }
    }

    // PUT: Update League or Event (Protected by API Secret and Role)
    if ($method === 'PUT') {
        // Enforce that only TDs or Admins can perform update tasks
        validateTDAccess();

        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) sendJson(['error' => 'id query parameter is required'], 400);

        if ($task === 'fixture') {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $stmt = $pdo->prepare('SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id WHERE e.id = ?');
        } else {
            $sql = 'UPDATE leagues SET name = ?, start_date = ?, scoring_format = ?, season_scoring = ?, drop_lowest_weeks = ? WHERE id = ?';
            $params = [
                $input['name'], 
                $input['startDate'] ?? null, 
                $input['scoringFormat'] ?? 'bowling',
                $input['seasonScoring'] ?? 'weekly',
                (int)($input['dropLowestWeeks'] ?? 0),
                $id
            ];
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

    // DELETE: Remove League or Event (Protected by API Secret and Role)
    if ($method === 'DELETE') {
        if ($task === 'member') {
            // Removing players from a roster requires TD access
            validateTDAccess();

            $leagueId = isset($_GET['leagueId']) ? (int)$_GET['leagueId'] : 0;
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
                validateTDAccess(); // TDs can delete events
            } else {
                validateAdminAccess(); // Only Admins can delete a whole league
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