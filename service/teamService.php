<?php
require_once __DIR__ . '/../includes/config.php';

function serializeTeam($row) {
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'city' => $row['city'],
        'state' => $row['state'],
        'members' => isset($row['members']) ? array_map(function($m) {
            return ['id' => (int)$m['id'], 'playerName' => $m['player_name']];
        }, $row['members']) : []
    ];
}

try {
    $pdo = getDbConnection();
    $method = $_SERVER['REQUEST_METHOD'];
    $input = getJsonInput();
    $task = $_GET['task'] ?? 'team';

    if ($method === 'GET') {
        $stmt = $pdo->query('SELECT * FROM teams ORDER BY name ASC');
        $teams = $stmt->fetchAll();
        $stmt = $pdo->query('SELECT tm.team_id, p.id, p.player_name FROM players p JOIN team_members tm ON p.id = tm.player_id');
        $allMembers = $stmt->fetchAll();
        $membersByTeam = [];
        foreach ($allMembers as $m) { $membersByTeam[$m['team_id']][] = $m; }
        foreach ($teams as &$team) { $team['members'] = $membersByTeam[$team['id']] ?? []; }
        sendJson(array_map('serializeTeam', $teams));
    }

    if ($method === 'POST') {
        validateTDAccess();
        if ($task === 'member') {
            $stmt = $pdo->prepare('INSERT IGNORE INTO team_members (team_id, player_id) VALUES (?, ?)');
            $stmt->execute([$input['teamId'], $input['playerId']]);
            sendJson(['success' => true]);
        } elseif ($task === 'league') {
             $stmt = $pdo->prepare('INSERT IGNORE INTO league_teams (league_id, team_id) VALUES (?, ?)');
             $stmt->execute([$input['leagueId'], $input['teamId']]);
             sendJson(['success' => true]);
        } else {
            $stmt = $pdo->prepare('INSERT INTO teams (name, city, state) VALUES (?, ?, ?)');
            $stmt->execute([$input['name'], $input['city'] ?? null, $input['state'] ?? null]);
            $newId = $pdo->lastInsertId();
            $stmt = $pdo->prepare('SELECT * FROM teams WHERE id = ?');
            $stmt->execute([$newId]);
            sendJson(serializeTeam($stmt->fetch()));
        }
    }

    if ($method === 'PUT') {
        validateTDAccess();
        $id = (int)$_GET['id'];
        $stmt = $pdo->prepare('UPDATE teams SET name = ?, city = ?, state = ? WHERE id = ?');
        $stmt->execute([$input['name'], $input['city'] ?? null, $input['state'] ?? null, $id]);
        $stmt = $pdo->prepare('SELECT * FROM teams WHERE id = ?');
        $stmt->execute([$id]);
        sendJson(serializeTeam($stmt->fetch()));
    }

    if ($method === 'DELETE') {
        validateTDAccess();
        if ($task === 'member') {
            $stmt = $pdo->prepare('DELETE FROM team_members WHERE team_id = ? AND player_id = ?');
            $stmt->execute([$_GET['teamId'], $_GET['playerId']]);
        } elseif ($task === 'league') {
             $stmt = $pdo->prepare('DELETE FROM league_teams WHERE league_id = ? AND team_id = ?');
             $stmt->execute([$_GET['leagueId'], $_GET['teamId']]);
        } else {
            $stmt = $pdo->prepare('DELETE FROM teams WHERE id = ?');
            $stmt->execute([$_GET['id']]);
        }
        sendJson(['success' => true]);
    }
} catch (Exception $e) { sendJson(['error' => $e->getMessage()], 500); }