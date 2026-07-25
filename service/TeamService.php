<?php

namespace App\Service;

/**
 * Service managing team registration, team rosters, and league-to-team memberships.
 */
class TeamService {
    private DatabaseService $db;

    public function __construct(DatabaseService $db) {
        $this->db = $db;
    }

    /**
     * Get all teams with their members, excluding individual wrapper teams by default.
     *
     * @param bool $includeWrappers Whether to include 1-person individual wrapper teams
     * @return array
     */
    public function getAllTeams(bool $includeWrappers = false): array {
        $pdo = $this->db->getPdo();
        
        $sql = 'SELECT * FROM teams';
        if (!$includeWrappers) {
            $sql .= ' WHERE (is_individual_wrapper = 0 OR is_individual_wrapper IS NULL)';
        }
        $sql .= ' ORDER BY name ASC';
        $stmt = $pdo->query($sql);
        $teams = $stmt->fetchAll();
        
        $stmt = $pdo->query(
            'SELECT tm.team_id, p.id, p.player_name FROM players p 
             JOIN team_members tm ON p.id = tm.player_id'
        );
        $allMembers = $stmt->fetchAll();
        
        $membersByTeam = [];
        foreach ($allMembers as $m) {
            $membersByTeam[(int)$m['team_id']][] = $m;
        }
        
        foreach ($teams as &$team) {
            $team['members'] = $membersByTeam[(int)$team['id']] ?? [];
        }
        
        return $teams;
    }

    /**
     * Get a specific team with its members.
     *
     * @param int $teamId
     * @return array|false
     */
    public function getTeam(int $teamId) {
        $pdo = $this->db->getPdo();
        
        $stmt = $pdo->prepare('SELECT * FROM teams WHERE id = ?');
        $stmt->execute([$teamId]);
        $team = $stmt->fetch();
        
        if (!$team) {
            return false;
        }
        
        $stmt = $pdo->prepare(
            'SELECT tm.team_id, p.id, p.player_name FROM players p 
             JOIN team_members tm ON p.id = tm.player_id 
             WHERE tm.team_id = ?'
        );
        $stmt->execute([$teamId]);
        $team['members'] = $stmt->fetchAll();
        
        return $team;
    }

    /**
     * Create a new team.
     *
     * @param string $name
     * @param string|null $city
     * @param string|null $state
     * @return array Created team
     */
    public function createTeam(string $name, ?string $city = null, ?string $state = null): array {
        $pdo = $this->db->getPdo();
        
        $stmt = $pdo->prepare('INSERT INTO teams (name, city, state) VALUES (?, ?, ?)');
        $stmt->execute([$name, $city, $state]);
        
        return $this->getTeam((int)$pdo->lastInsertId());
    }

    /**
     * Update a team.
     *
     * @param int $teamId
     * @param string|null $name
     * @param string|null $city
     * @param string|null $state
     * @return array Updated team
     */
    public function updateTeam(int $teamId, ?string $name = null, ?string $city = null, ?string $state = null): array {
        $pdo = $this->db->getPdo();
        
        $fields = [];
        $params = [];
        
        if ($name !== null) {
            $fields[] = 'name = ?';
            $params[] = $name;
        }
        if ($city !== null) {
            $fields[] = 'city = ?';
            $params[] = $city;
        }
        if ($state !== null) {
            $fields[] = 'state = ?';
            $params[] = $state;
        }
        
        if (!empty($fields)) {
            $params[] = $teamId;
            $sql = "UPDATE teams SET " . implode(", ", $fields) . " WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
        }
        
        return $this->getTeam($teamId);
    }

    /**
     * Delete a team.
     *
     * @param int $teamId
     * @return bool
     */
    public function deleteTeam(int $teamId): bool {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();
            
            // Delete team members
            $stmt = $pdo->prepare('DELETE FROM team_members WHERE team_id = ?');
            $stmt->execute([$teamId]);
            
            // Delete league team associations
            $stmt = $pdo->prepare('DELETE FROM league_teams WHERE team_id = ?');
            $stmt->execute([$teamId]);
            
            // Delete the team
            $stmt = $pdo->prepare('DELETE FROM teams WHERE id = ?');
            $result = $stmt->execute([$teamId]);
            
            $pdo->commit();
            return $result;
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Add a player to a team.
     *
     * @param int $teamId
     * @param int $playerId
     * @return bool
     */
    public function addPlayerToTeam(int $teamId, int $playerId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('INSERT IGNORE INTO team_members (team_id, player_id) VALUES (?, ?)');
        return $stmt->execute([$teamId, $playerId]);
    }

    /**
     * Remove a player from a team.
     *
     * @param int $teamId
     * @param int $playerId
     * @return bool
     */
    public function removePlayerFromTeam(int $teamId, int $playerId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM team_members WHERE team_id = ? AND player_id = ?');
        return $stmt->execute([$teamId, $playerId]);
    }

    /**
     * Add a team to a league.
     *
     * @param int $leagueId
     * @param int $teamId
     * @return bool
     */
    public function addTeamToLeague(int $leagueId, int $teamId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('INSERT IGNORE INTO league_teams (league_id, team_id) VALUES (?, ?)');
        return $stmt->execute([$leagueId, $teamId]);
    }

    /**
     * Remove a team from a league.
     *
     * @param int $leagueId
     * @param int $teamId
     * @return bool
     */
    public function removeTeamFromLeague(int $leagueId, int $teamId): bool {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM league_teams WHERE league_id = ? AND team_id = ?');
        return $stmt->execute([$leagueId, $teamId]);
    }
}
