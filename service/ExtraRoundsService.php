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
     * Picks random machines from the league's assigned location pool for Top and Bottom half-innings.
     *
     * @param int $matchupId ID of the event_matchup or team_event_matchup.
     * @param bool $isTeam Whether this is a team matchup.
     * @return array
     * @throws \Exception
     */
    public function addExtraInning(int $matchupId, bool $isTeam = false): array
    {
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
            'SELECT em.id, em.event_id, em.player1_id, em.player2_id, e.league_id, e.location_id, e.scoring_format as event_format, l.scoring_format as league_format
             FROM event_matchups em
             JOIN events e ON em.event_id = e.id
             LEFT JOIN leagues l ON e.league_id = l.id
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
        $locationId = !empty($em['location_id']) ? (int)$em['location_id'] : null;
        $format = !empty($em['event_format']) ? $em['event_format'] : (!empty($em['league_format']) ? $em['league_format'] : 'baseball');

        // 2. Determine max current order_number in matchups
        $maxStmt = $db->prepare(
            'SELECT MAX(order_number) FROM matchups WHERE event_matchup_id = ?'
        );
        $maxStmt->execute([$matchupId]);
        $maxOrder = (int)($maxStmt->fetchColumn() ?: 0);

        // 3. Select 2 machine slots from location pool (Top and Bottom)
        $machines = MatchupGenerator::selectMachines($this->getLocationMachinePool($leagueId), 2);
        $topMachineId = $machines[0];
        $bottomMachineId = $machines[1] ?? $machines[0];

        $topOrder = $maxOrder + 1;
        $bottomOrder = $maxOrder + 2;

        // 4. Insert Top and Bottom of Extra Inning (2 order_numbers)
        $insertStmt = $db->prepare(
            'INSERT INTO matchups (event_matchup_id, order_number, machine_id, player1_id, player2_id)
             VALUES (?, ?, ?, ?, ?)'
        );

        $insertStmt->execute([$matchupId, $topOrder, $topMachineId, $p1Id, $p2Id]);
        $insertStmt->execute([$matchupId, $bottomOrder, $bottomMachineId, $p1Id, $p2Id]);

        // 5. Populate target scores for the new extra inning slots
        $tsStmt = $db->prepare(
            'INSERT INTO target_scores
                (event_id, matchup_ref_id, machine_id, order_number, value1, value2,
                 score1, score2, score3, score4, score5,
                 score6, score7, score8, score9, score10)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                machine_id = VALUES(machine_id),
                value1 = VALUES(value1),
                value2 = VALUES(value2),
                score1 = VALUES(score1),  score2  = VALUES(score2),
                score3 = VALUES(score3),  score4  = VALUES(score4),
                score5 = VALUES(score5),  score6  = VALUES(score6),
                score7 = VALUES(score7),  score8  = VALUES(score8),
                score9 = VALUES(score9),  score10 = VALUES(score10)'
        );

        MatchupGenerator::insertTargetScore($tsStmt, $db, $topMachineId, $eventId, $topOrder, $format, $locationId, $matchupId);
        MatchupGenerator::insertTargetScore($tsStmt, $db, $bottomMachineId, $eventId, $bottomOrder, $format, $locationId, $matchupId);

        $extraInningNumber = (int)floor($topOrder / 2) + 1;

        return [
            'success' => true,
            'matchupId' => $matchupId,
            'extraInning' => $extraInningNumber,
            'topOrderNumber' => $topOrder,
            'bottomOrderNumber' => $bottomOrder,
            'topMachineId' => $topMachineId,
            'bottomMachineId' => $bottomMachineId
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
        $team1Id = isset($tem['team1_id']) ? (int)$tem['team1_id'] : null; // Home team
        $team2Id = isset($tem['team2_id']) ? (int)$tem['team2_id'] : null; // Away team
        $locationId = !empty($tem['location_id']) ? (int)$tem['location_id'] : null;

        // 2. Determine max current order_number in team_matchups
        $maxStmt = $db->prepare(
            'SELECT MAX(order_number) FROM team_matchups WHERE team_event_matchup_id = ?'
        );
        $maxStmt->execute([$matchupId]);
        $maxOrder = (int)($maxStmt->fetchColumn() ?: 0);

        // 3. Select 2 machine slots from location pool (Top and Bottom)
        $machines = MatchupGenerator::selectMachines($this->getLocationMachinePool($leagueId), 2);
        $topMachineId = $machines[0];
        $bottomMachineId = $machines[1] ?? $machines[0];

        // 4. Insert Top and Bottom of Extra Inning (2 order_numbers)
        $topOrder = $maxOrder + 1;
        $bottomOrder = $maxOrder + 2;

        // Top half-inning: Home team ($team1Id) pitches/defends, Away team ($team2Id) bats
        MatchupGenerator::createTeamMatchups(
            $db,
            $matchupId,
            [$topMachineId],
            $eventId,
            $locationId,
            $team1Id, // Pitcher
            $team2Id, // Batter
            $topOrder
        );

        // Bottom half-inning: Away team ($team2Id) pitches/defends, Home team ($team1Id) bats
        MatchupGenerator::createTeamMatchups(
            $db,
            $matchupId,
            [$bottomMachineId],
            $eventId,
            $locationId,
            $team2Id, // Pitcher
            $team1Id, // Batter
            $bottomOrder
        );

        $extraInningNumber = (int)floor($topOrder / 2) + 1;

        return [
            'success' => true,
            'matchupId' => $matchupId,
            'extraInning' => $extraInningNumber,
            'topOrderNumber' => $topOrder,
            'bottomOrderNumber' => $bottomOrder,
            'topMachineId' => $topMachineId,
            'bottomMachineId' => $bottomMachineId
        ];
    }

    /**
     * Gets array of available machine IDs assigned to the league's designated location(s).
     * Falls back to all available machines if no location machines are configured.
     *
     * @param int $leagueId
     * @return array Array of machine IDs.
     * @throws \Exception If no machines are available in the system.
     */
    private function getLocationMachinePool(int $leagueId): array
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

        return array_map('intval', $machinePool);
    }
}
