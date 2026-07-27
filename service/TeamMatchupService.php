<?php

namespace App\Service;

class TeamMatchupService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    public function getEventTeamMatchups(int $eventId): array {
        $stmt = $this->db->query(
            'SELECT tm.*, mac.machine_name, tem.event_id
             FROM team_matchups tm
             JOIN team_event_matchups tem ON tm.team_event_matchup_id = tem.id
             JOIN machines mac ON tm.machine_id = mac.id
             WHERE tem.event_id = ?
             ORDER BY tm.order_number ASC, tm.id ASC',
            [$eventId]
        );
        return $stmt->fetchAll();
    }

    public function getTeamMatchupEntries(int $teamEventMatchupId): array {
        $stmt = $this->db->query(
            'SELECT tm.*, mac.machine_name
             FROM team_matchups tm
             JOIN machines mac ON tm.machine_id = mac.id
             WHERE tm.team_event_matchup_id = ?
             ORDER BY tm.order_number ASC, tm.id ASC',
            [$teamEventMatchupId]
        );
        return $stmt->fetchAll();
    }

    public function getTeamEventMatchup(int $teamEventMatchupId) {
        $stmt = $this->db->query(
            'SELECT tem.*,
                    e.league_id,
                    t1.name as team1_name, t2.name as team2_name,
                    t3.name as team3_name, t4.name as team4_name,
                    w.name as team_winner_name,
                    loc.name as location_name
             FROM team_event_matchups tem
             JOIN events e ON tem.event_id = e.id
             LEFT JOIN locations loc ON COALESCE(tem.location_id, e.location_id, (SELECT ll.location_id FROM league_locations ll WHERE ll.league_id = e.league_id LIMIT 1)) = loc.id
             LEFT JOIN teams t1 ON tem.team1_id = t1.id
             LEFT JOIN teams t2 ON tem.team2_id = t2.id
             LEFT JOIN teams t3 ON tem.team3_id = t3.id
             LEFT JOIN teams t4 ON tem.team4_id = t4.id
             LEFT JOIN teams w ON tem.team_winner_id = w.id
             WHERE tem.id = ?',
            [$teamEventMatchupId]
        );
        return $stmt->fetch();
    }

    public function deleteEventTeamMatchups(int $eventId): void {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('SELECT id FROM team_event_matchups WHERE event_id = ?');
        $stmt->execute([$eventId]);
        $ids = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        if (!empty($ids)) {
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $pdo->prepare("DELETE FROM team_matchups WHERE team_event_matchup_id IN ($placeholders)")->execute($ids);
            $pdo->prepare("DELETE FROM team_event_matchups WHERE id IN ($placeholders)")->execute($ids);
        }
    }
}
