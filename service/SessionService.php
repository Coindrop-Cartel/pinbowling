<?php

namespace App\Service;

use PDO;

class SessionService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    public function getAllSessions(): array {
        $pdo = $this->db;
        $sessions = $pdo->query('SELECT * FROM sessions ORDER BY created_at DESC')->fetchAll();

        $evtStmt = $pdo->query(
            'SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id WHERE e.session_id IS NOT NULL ORDER BY e.event_date ASC'
        );
        $eventsBySession = [];
        foreach ($evtStmt->fetchAll() as $evt) {
            $eventsBySession[(int)$evt['session_id']][] = $evt;
        }

        $plStmt = $pdo->query(
            'SELECT sp.session_id, p.*, u.id as user_id, u.role, u.username, u.email
             FROM players p
             JOIN session_players sp ON p.id = sp.player_id
             LEFT JOIN users u ON p.id = u.player_id
             ORDER BY p.player_name ASC'
        );
        $playersBySession = [];
        foreach ($plStmt->fetchAll() as $pl) {
            $playersBySession[(int)$pl['session_id']][] = $pl;
        }

        $llStmt = $pdo->query('SELECT session_id, location_id FROM session_locations');
        $locationsBySession = [];
        foreach ($llStmt->fetchAll() as $ll) {
            $locationsBySession[(int)$ll['session_id']][] = (int)$ll['location_id'];
        }

        $teamStmt = $pdo->query(
            'SELECT st.session_id, t.*,
                    GROUP_CONCAT(p.id, ":", p.player_name SEPARATOR "|") as member_data
             FROM session_teams st
             JOIN teams t ON st.team_id = t.id
             LEFT JOIN team_members tm ON t.id = tm.team_id
             LEFT JOIN players p ON tm.player_id = p.id
             GROUP BY st.session_id, t.id
             ORDER BY t.name ASC'
        );
        $teamsBySession = [];
        foreach ($teamStmt->fetchAll() as $t) {
            $t['members'] = $this->parseTeamMembers($t['member_data'] ?? '');
            $teamsBySession[(int)$t['session_id']][] = $t;
        }

        foreach ($sessions as &$session) {
            $id = (int)$session['id'];
            $session['events']  = $eventsBySession[$id]  ?? [];
            $session['players'] = $playersBySession[$id] ?? [];
            $session['location_ids'] = $locationsBySession[$id] ?? [];
            $session['teams'] = $teamsBySession[$id] ?? [];
        }

        return $sessions;
    }

    public function getSession(int $id) {
        $pdo = $this->db;
        $stmt = $pdo->prepare('SELECT * FROM sessions WHERE id = ?');
        $stmt->execute([$id]);
        $session = $stmt->fetch();
        if (!$session) return false;

        $stmt = $pdo->prepare(
            'SELECT e.*, l.name as location_name FROM events e LEFT JOIN locations l ON e.location_id = l.id WHERE e.session_id = ? ORDER BY e.event_date ASC'
        );
        $stmt->execute([$id]);
        $session['events'] = $stmt->fetchAll();

        // Attach individual matchups to events (same pattern as LeagueService)
        $eventIds = array_column($session['events'], 'id');
        if (!empty($eventIds)) {
            $placeholders = implode(',', array_fill(0, count($eventIds), '?'));
            $mStmt = $pdo->prepare(
                "SELECT em.*,
                        p1.player_name as player1_name,
                        p2.player_name as player2_name,
                        p3.player_name as player3_name,
                        p4.player_name as player4_name,
                        w.player_name as winner_name
                 FROM event_matchups em
                 LEFT JOIN players p1 ON em.player1_id = p1.id
                 LEFT JOIN players p2 ON em.player2_id = p2.id
                 LEFT JOIN players p3 ON em.player3_id = p3.id
                 LEFT JOIN players p4 ON em.player4_id = p4.id
                 LEFT JOIN players w ON em.player_winner_id = w.id
                 WHERE em.event_id IN ($placeholders)"
            );
            $mStmt->execute($eventIds);
            $matchupsByEvent = [];
            foreach ($mStmt->fetchAll() as $m) {
                $matchupsByEvent[(int)$m['event_id']][] = $m;
            }
            foreach ($session['events'] as &$event) {
                $event['matchups'] = $matchupsByEvent[(int)$event['id']] ?? [];
            }
        }

        $stmt = $pdo->prepare(
            'SELECT p.*, u.id as user_id, u.role, u.username, u.email
             FROM players p
             JOIN session_players sp ON p.id = sp.player_id
             LEFT JOIN users u ON p.id = u.player_id
             WHERE sp.session_id = ?
             ORDER BY p.player_name ASC'
        );
        $stmt->execute([$id]);
        $session['players'] = $stmt->fetchAll();

        $stmt = $pdo->prepare('SELECT location_id FROM session_locations WHERE session_id = ?');
        $stmt->execute([$id]);
        $session['location_ids'] = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

        $stmt = $pdo->prepare(
            'SELECT t.*,
                    GROUP_CONCAT(p.id, ":", p.player_name SEPARATOR "|") as member_data
             FROM teams t
             JOIN session_teams st ON t.id = st.team_id
             LEFT JOIN team_members tm ON t.id = tm.team_id
             LEFT JOIN players p ON tm.player_id = p.id
             WHERE st.session_id = ?
             GROUP BY t.id
             ORDER BY t.name ASC'
        );
        $stmt->execute([$id]);
        $teams = $stmt->fetchAll();
        foreach ($teams as &$t) {
            $t['members'] = $this->parseTeamMembers($t['member_data'] ?? '');
        }
        $session['teams'] = $teams;

        return $session;
    }

    private function parseTeamMembers(string $memberData): array {
        if (empty($memberData)) return [];
        $members = [];
        foreach (explode('|', $memberData) as $item) {
            $parts = explode(':', $item, 2);
            if (count($parts) === 2 && !empty($parts[0])) {
                $members[] = [
                    'id' => (int)$parts[0],
                    'player_name' => $parts[1]
                ];
            }
        }
        return $members;
    }

    public function createSession(string $name, string $scoringFormat = 'bowling', string $competitionFormat = 'group', string $participationType = 'individual', int $teamSize = 1, ?int $roundsPerGame = null, ?int $matchupsPerRound = null, ?int $locationId = null, string $eventName = null, string $eventDate = null): array {
        $pdo = $this->db;
        try {
            $pdo->beginTransaction();

            $stmt = $pdo->prepare(
                'INSERT INTO sessions (name, scoring_format, competition_format, participation_type, team_size, rounds_per_game, matchups_per_round, location_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$name, $scoringFormat, $competitionFormat, $participationType, $teamSize, $roundsPerGame, $matchupsPerRound, $locationId]);
            $sessionId = (int)$pdo->lastInsertId();

            if ($locationId) {
                $stmt = $pdo->prepare('INSERT INTO session_locations (session_id, location_id) VALUES (?, ?)');
                $stmt->execute([$sessionId, $locationId]);
            }

            // Create the session's single event
            $eventName = $eventName ?? $name;
            $eventDate = $eventDate ?? date('Y-m-d');
            $stmt = $pdo->prepare(
                'INSERT INTO events (session_id, location_id, event_name, event_date, scoring_format) VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$sessionId, $locationId, $eventName, $eventDate, $scoringFormat]);

            $pdo->commit();
            return $this->getSession($sessionId);
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    public function deleteSession(int $id): bool {
        $pdo = $this->db;
        try {
            $pdo->beginTransaction();
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

            $stmt = $pdo->prepare('SELECT id FROM events WHERE session_id = ?');
            $stmt->execute([$id]);
            $eventIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

            foreach ($eventIds as $eventId) {
                $pdo->prepare('DELETE FROM scores WHERE event_id = ?')->execute([$eventId]);
                $pdo->prepare('DELETE FROM target_scores WHERE event_id = ?')->execute([$eventId]);
                $pdo->prepare('DELETE FROM matchups WHERE event_matchup_id IN (SELECT id FROM event_matchups WHERE event_id = ?)')->execute([$eventId]);
                $pdo->prepare('DELETE FROM event_matchups WHERE event_id = ?')->execute([$eventId]);
            }

            $pdo->prepare('DELETE FROM events WHERE session_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM session_players WHERE session_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM session_teams WHERE session_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM session_locations WHERE session_id = ?')->execute([$id]);
            $stmt = $pdo->prepare('DELETE FROM sessions WHERE id = ?');
            $result = $stmt->execute([$id]);

            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
            $pdo->commit();
            return $result;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    public function addPlayerToSession(int $sessionId, int $playerId): bool {
        $pdo = $this->db;
        $stmt = $pdo->prepare('INSERT IGNORE INTO session_players (session_id, player_id) VALUES (?, ?)');
        return $stmt->execute([$sessionId, $playerId]);
    }

    public function removePlayerFromSession(int $sessionId, int $playerId): bool {
        $pdo = $this->db;
        $stmt = $pdo->prepare('DELETE FROM session_players WHERE session_id = ? AND player_id = ?');
        return $stmt->execute([$sessionId, $playerId]);
    }

    public function addTeamToSession(int $sessionId, int $teamId): bool {
        $pdo = $this->db;
        $stmt = $pdo->prepare('INSERT IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)');
        return $stmt->execute([$sessionId, $teamId]);
    }

    public function removeTeamFromSession(int $sessionId, int $teamId): bool {
        $pdo = $this->db;
        $stmt = $pdo->prepare('DELETE FROM session_teams WHERE session_id = ? AND team_id = ?');
        return $stmt->execute([$sessionId, $teamId]);
    }

    public function getSessionByEventId(int $eventId) {
        $pdo = $this->db;
        $stmt = $pdo->prepare('SELECT session_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $sessionId = $stmt->fetchColumn();
        if (!$sessionId) return false;
        return $this->getSession((int)$sessionId);
    }
}
