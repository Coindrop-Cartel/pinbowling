<?php

namespace App\Service;

use PDO;

/**
 * Shared helper for building head-to-head matchup fixtures.
 *
 * Extracted from LeagueService (startSeason, updateSeason, startPlayoffs)
 * and ScoreService (handlePlayoffAdvancement, advanceToPlayoffRound) to
 * eliminate five near-identical copies of the machine selection and
 * matchup-slot creation logic.
 */
class MatchupGenerator {

    /**
     * Select a random set of machine IDs for a matchup, cycling through the
     * available pool if more slots are needed than there are distinct machines.
     *
     * @param array $allMachineIds Full pool of machine IDs to draw from.
     * @param int   $count         Number of machine slots needed (rounds * matchupsPerRound).
     * @return array               Ordered list of machine IDs, length === $count.
     */
    public static function selectMachines(array $allMachineIds, int $count): array {
        $selected = [];
        $shuffled  = $allMachineIds;
        shuffle($shuffled);

        while (count($selected) < $count) {
            foreach ($shuffled as $machineId) {
                $selected[] = $machineId;
                if (count($selected) >= $count) {
                    break;
                }
            }
        }

        return $selected;
    }

    /**
     * Insert rows into the `team_matchups` table for one team event matchup,
     * and populate default/machine target_scores for the event.
     *
     * @param DatabaseService $db   Database service instance.
     * @param int   $teamEventMatchupId   The team_event_matchup ID these rows belong to.
     * @param array $machineIds       Machine IDs to assign to each half-inning.
     * @param int|null $eventId      Event ID for target_scores (optional).
     * @param int|null $locationId   Location ID for target score resolution.
     * @param int|null $team1Id      Team ID for the pitching team.
     * @param int|null $team2Id      Team ID for the batting team.
     * @param int    $startOrder     Starting order number (default 1).
     */
    public static function createTeamMatchups(
        DatabaseService $db,
        int $teamEventMatchupId,
        array $machineIds,
        ?int $eventId = null,
        ?int $locationId = null,
        ?int $team1Id = null,
        ?int $team2Id = null,
        int $startOrder = 1
    ): void {
        $stmt = $db->prepare(
            'INSERT INTO team_matchups (team_event_matchup_id, order_number, machine_id, team1_id, team2_id)
             VALUES (?, ?, ?, ?, ?)'
        );

        $tsStmt = $db->prepare(
            'INSERT INTO target_scores
                (event_id, machine_id, order_number, value1, value2,
                 score1, score2, score3, score4, score5,
                 score6, score7, score8, score9, score10)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

        foreach ($machineIds as $i => $machineId) {
            $orderNum = $startOrder + $i;
            $stmt->execute([$teamEventMatchupId, $orderNum, $machineId, $team1Id, $team2Id]);

            if ($eventId) {
                $format = 'baseball';
                $targetScores = TargetResolver::resolveTarget($db, $machineId, $format, 'medium', $locationId);
                $value1 = $targetScores['value1'] ?? 5000000;
                $value2 = $targetScores['value2'] ?? 1.5;

                $scoreValues = [];
                for ($rank = 1; $rank <= 10; $rank++) {
                    $scoreValues[$rank] = (int)round($value1 * pow($value2, $rank - 1));
                }

                $tsStmt->execute([
                    $eventId, $machineId, $orderNum, $value1, $value2,
                    $scoreValues[1], $scoreValues[2], $scoreValues[3], $scoreValues[4], $scoreValues[5],
                    $scoreValues[6], $scoreValues[7], $scoreValues[8], $scoreValues[9], $scoreValues[10]
                ]);
            }
        }
    }

    public static function createMatchupSlots(
        DatabaseService $db,
        int $eventMatchupId,
        int $rounds,
        int $matchupsPerRound,
        array $allMachineIds,
        array $playerIds = [],
        array $player1Ids = [],
        array $player2Ids = []
    ): void {
        $totalSlots = $rounds * $matchupsPerRound;
        $machineSlots = self::selectMachines($allMachineIds, $totalSlots);

        // Fetch event_id, location_id, scoring_format, and player IDs from event_matchups
        $stmt = $db->prepare(
            'SELECT e.id as event_id, e.location_id, e.scoring_format as event_format, l.scoring_format as league_format
             FROM event_matchups em
             JOIN events e ON em.event_id = e.id
             LEFT JOIN leagues l ON e.league_id = l.id
             WHERE em.id = ?'
        );
        $stmt->execute([$eventMatchupId]);
        $eventRow = $stmt->fetch(PDO::FETCH_ASSOC);

        $eventId = (int)($eventRow['event_id'] ?? 0);
        $eventLocationId = !empty($eventRow['location_id']) ? (int)$eventRow['location_id'] : null;
        $format = !empty($eventRow['event_format']) ? $eventRow['event_format'] : (!empty($eventRow['league_format']) ? $eventRow['league_format'] : 'baseball');

        $stmt = $db->prepare(
            'INSERT INTO matchups (event_matchup_id, order_number, machine_id, player1_id, player2_id)
             VALUES (?, ?, ?, ?, ?)'
        );

        $tsStmt = $db->prepare(
            'INSERT INTO target_scores
                (event_id, machine_id, order_number, value1, value2,
                 score1, score2, score3, score4, score5,
                 score6, score7, score8, score9, score10)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

        foreach ($machineSlots as $i => $machineId) {
            $orderNum = $i + 1;
            $playerId = !empty($playerIds) ? ($playerIds[$i % count($playerIds)] ?? null) : null;
            $p1Id = !empty($player1Ids) ? ($player1Ids[$i % count($player1Ids)] ?? null) : $playerId;
            $p2Id = !empty($player2Ids) ? ($player2Ids[$i % count($player2Ids)] ?? null) : null;
            $stmt->execute([$eventMatchupId, $orderNum, $machineId, $p1Id, $p2Id]);

            if ($eventId) {
                $targetScores = TargetResolver::resolveTarget($db, $machineId, $format, 'medium', $eventLocationId);
                $value1 = $targetScores['value1'] ?? 5000000;
                $value2 = $targetScores['value2'] ?? 1.5;

                // Compute full 1-10 values map from baseline and multiplier
                $scoreValues = [];
                for ($rank = 1; $rank <= 10; $rank++) {
                    $scoreValues[$rank] = (int)round($value1 * pow($value2, $rank - 1));
                }

                $tsStmt->execute([
                    $eventId, $machineId, $orderNum, $value1, $value2,
                    $scoreValues[1], $scoreValues[2], $scoreValues[3], $scoreValues[4], $scoreValues[5],
                    $scoreValues[6], $scoreValues[7], $scoreValues[8], $scoreValues[9], $scoreValues[10]
                ]);
            }
        }
    }
}

