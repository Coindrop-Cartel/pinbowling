<?php

namespace App\Service;

use PDO;

/**
 * Service managing extra rounds/innings for tied head-to-head matchups.
 */
class ExtraRoundsService
{
    private DatabaseService $db;

    public function __construct(DatabaseService $db)
    {
        $this->db = $db;
    }

    /**
     * Adds an extra inning (2 half-inning slots: Top and Bottom) to a head-to-head matchup.
     * Picks a random machine from the league's assigned location pool.
     *
     * @param int $matchupId ID of the event_matchup or team_event_matchup.
     * @param bool $isTeam Whether this is a team matchup.
     * @return array
     * @throws \Exception
     */
    public function addExtraInning(int $matchupId, bool $isTeam = false): array
    {
        $db = $this->db;

        if ($isTeam) {
            return $this->addTeamExtraInning($matchupId);
        }

        return $this->addIndividualExtraInning($matchupId);
    }

    /**
     * Handles individual mode extra inning generation.
     */
    private function addIndividualExtraInning(int $matchupId): array
    {
        $db = $this->db;

        // 1. Fetch event matchup details
        $stmt = $db->prepare(
            'SELECT em.id, em.event_id, em.player1_id, em.player2_id, e.league_id, e.location_id
             FROM event_matchups em
             JOIN events e ON em.event_id = e.id
             WHERE em.id = ?'
        );
        $stmt->execute([$matchupId]);
        $em = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$em) {
            throw new \Exception('Matchup not found.');
        }

        $leagueId = (int)$em['league_id'];
        $eventId = (int)$em['event_id'];
        $p1Id = isset($em['player1_id']) ? (int)$em['player1_id'] : null;
        $p2Id = isset($em['player2_id']) ? (int)$em['player2_id'] : null;

        // 2. Determine max current order_number in matchups
        $maxStmt = $db->prepare(
            'SELECT MAX(order_number) FROM matchups WHERE event_matchup_id = ?'
        );
        $maxStmt->execute([$matchupId]);
        $maxOrder = (int)($maxStmt->fetchColumn() ?: 0);

        // 3. Select a random machine from the assigned location pool
        $machineId = $this->getRandomLocationMachine($leagueId);

        // 4. Insert Top and Bottom of Extra Inning (2 order_numbers)
        $insertStmt = $db->prepare(
            'INSERT INTO matchups (event_matchup_id, order_number, machine_id, player1_id, player2_id)
             VALUES (?, ?, ?, ?, ?)'
        );

        $topOrder = $maxOrder + 1;
        $bottomOrder = $maxOrder + 2;

        $insertStmt->execute([$matchupId, $topOrder, $machineId, $p1Id, $p2Id]);
        $insertStmt->execute([$matchupId, $bottomOrder, $machineId, $p1Id, $p2Id]);

        // 5. Populate target scores for the new extra inning slots
        $eventLocationId = !empty($em['location_id']) ? (int)$em['location_id'] : null;
        MatchupGenerator::createMatchupSlots(
            $db,
            $matchupId,
            1, // 1 extra inning (2 half-innings)
            2,
            [$machineId, $machineId],
            [],
            [$p1Id, $p1Id],
            [$p2Id, $p2Id]
        );

        $extraInningNumber = (int)floor($topOrder / 2) + 1;

        return [
            'success' => true,
            'matchupId' => $matchupId,
            'extraInning' => $extraInningNumber,
            'topOrderNumber' => $topOrder,
            'bottomOrderNumber' => $bottomOrder,
            'machineId' => $machineId
        ];
    }

    /**
     * Handles team mode extra inning generation.
     */
    private function addTeamExtraInning(int $matchupId): array
    {
        $db = $this->db;

        // 1. Fetch team event matchup details
        $stmt = $db->prepare(
            'SELECT tem.id, tem.event_id, tem.team1_id, tem.team2_id, e.league_id, e.location_id
             FROM team_event_matchups tem
             JOIN events e ON tem.event_id = e.id
             WHERE tem.id = ?'
        );
        $stmt->execute([$matchupId]);
        $tem = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$tem) {
            throw new \Exception('Team matchup not found.');
        }

        $leagueId = (int)$tem['league_id'];
        $eventId = (int)$tem['event_id'];
        $team1Id = isset($tem['team1_id']) ? (int)$tem['team1_id'] : null;
        $team2Id = isset($tem['team2_id']) ? (int)$tem['team2_id'] : null;

        // 2. Determine max current order_number in team_matchups
        $maxStmt = $db->prepare(
            'SELECT MAX(order_number) FROM team_matchups WHERE team_event_matchup_id = ?'
        );
        $maxStmt->execute([$matchupId]);
        $maxOrder = (int)($maxStmt->fetchColumn() ?: 0);

        // 3. Select a random machine from the assigned location pool
        $machineId = $this->getRandomLocationMachine($leagueId);

        // 4. Insert Top and Bottom of Extra Inning (2 order_numbers)
        $topOrder = $maxOrder + 1;
        $bottomOrder = $maxOrder + 2;

        MatchupGenerator::createTeamMatchups(
            $db,
            $matchupId,
            [$machineId, $machineId],
            $eventId,
            $tem['location_id'] ? (int)$tem['location_id'] : null,
            $team1Id,
            $team2Id,
            $topOrder
        );

        $extraInningNumber = (int)floor($topOrder / 2) + 1;

        return [
            'success' => true,
            'matchupId' => $matchupId,
            'extraInning' => $extraInningNumber,
            'topOrderNumber' => $topOrder,
            'bottomOrderNumber' => $bottomOrder,
            'machineId' => $machineId
        ];
    }

    /**
     * Selects a random machine ID from the machines assigned to the league's designated location.
     * Falls back to any available machine if no location machines are configured.
     *
     * @param int $leagueId
     * @return int Machine ID.
     * @throws \Exception If no machines are available in the system.
     */
    private function getRandomLocationMachine(int $leagueId): int
    {
        $db = $this->db;

        // Query league assigned location IDs
        $llStmt = $db->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
        $llStmt->execute([$leagueId]);
        $locationIds = $llStmt->fetchAll(PDO::FETCH_COLUMN);

        $machinePool = [];

        if (!empty($locationIds)) {
            $placeholders = implode(',', array_fill(0, count($locationIds), '?'));
            $lmStmt = $db->prepare(
                "SELECT DISTINCT machine_id FROM location_machines WHERE location_id IN ($placeholders)"
            );
            $lmStmt->execute($locationIds);
            $machinePool = $lmStmt->fetchAll(PDO::FETCH_COLUMN);
        }

        // Fallback: all machines if location machine pool is empty
        if (empty($machinePool)) {
            $mStmt = $db->query('SELECT id FROM machines');
            $machinePool = $mStmt->fetchAll(PDO::FETCH_COLUMN);
        }

        if (empty($machinePool)) {
            throw new \Exception('No machines available to select for extra inning.');
        }

        // Pick one random machine from pool
        $randomKey = array_rand($machinePool);
        return (int)$machinePool[$randomKey];
    }
}
