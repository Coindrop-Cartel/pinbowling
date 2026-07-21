<?php

namespace App\Service;

use PDO;

/**
 * Shared helper for building head-to-head matchup fixtures.
 *
 * Extracted from LeagueService (startSeason, updateSeason, startPlayoffs)
 * and ScoreService (handlePlayoffAdvancement, advanceToPlayoffRound) to
 * eliminate five near-identical copies of the machine selection and
 * inning-slot creation logic.
 */
class MatchupGenerator {

    /**
     * Select a random set of machine IDs for a matchup, cycling through the
     * available pool if more slots are needed than there are distinct machines.
     *
     * @param array $allMachineIds Full pool of machine IDs to draw from.
     * @param int   $count         Number of machine slots needed (innings * 2).
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
     * Insert the per-inning slot rows into the `matchups` table for one
     * head-to-head event matchup, and populate default/machine target_scores for the event.
     *
     * Each inning produces two rows (top/bottom half-inning) with sequential order numbers.
     *
     * @param PDO   $pdo             Active PDO connection (already in a transaction).
     * @param int   $eventMatchupId  The event_matchup ID these innings belong to.
     * @param int   $matchupsPerGame  Number of matchups (half-innings) per game.
     * @param array $allMachineIds   Full pool of machine IDs to draw from.
     */
    public static function createInningSlots(
        PDO $pdo,
        int $eventMatchupId,
        int $matchupsPerGame,
        array $allMachineIds
    ): void {
        $machineSlots = self::selectMachines($allMachineIds, $matchupsPerGame * 2);

        // Fetch event_id from event_matchups
        $stmt = $pdo->prepare('SELECT event_id FROM event_matchups WHERE id = ?');
        $stmt->execute([$eventMatchupId]);
        $eventId = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare(
            'INSERT INTO matchups (event_matchup_id, order_number, machine_id)
             VALUES (?, ?, ?)'
        );

        $tsStmt = $pdo->prepare(
            'INSERT INTO target_scores (event_id, machine_id, order_number, value1, value2)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE machine_id = VALUES(machine_id), value1 = VALUES(value1), value2 = VALUES(value2)'
        );

        foreach ($machineSlots as $i => $machineId) {
            $orderNum = $i + 1;
            $stmt->execute([$eventMatchupId, $orderNum, $machineId]);

            if ($eventId) {
                $targetScores = self::getBaseballTargetScoreForMachine($pdo, $machineId);
                $value1 = $targetScores['value1'] ?? 5000000;
                $value2 = $targetScores['value2'] ?? 1.5;

                $tsStmt->execute([$eventId, $machineId, $orderNum, $value1, $value2]);
            }
        }
    }

    /**
     * Helper to retrieve machine-specific target scores for baseball or default to 5,000,000 / 1.5.
     */
    private static function getBaseballTargetScoreForMachine(PDO $pdo, int $machineId): array {
        // 1. Check location_machine_scores
        $stmt = $pdo->prepare(
            'SELECT lms.target_easy, lms.target_med
             FROM location_machine_scores lms
             JOIN location_machines lm ON lms.location_machine_id = lm.id
             WHERE lm.machine_id = ? AND lms.format = \'baseball\'
             LIMIT 1'
        );
        $stmt->execute([$machineId]);
        $row = $stmt->fetch();
        if ($row && !empty($row['target_easy'])) {
            return [
                'value1' => (int)$row['target_easy'],
                'value2' => !empty($row['target_med']) ? (float)$row['target_med'] : 1.5
            ];
        }

        // 2. Check machine_scores
        $stmt = $pdo->prepare(
            'SELECT target_easy, target_med
             FROM machine_scores
             WHERE machine_id = ? AND format = \'baseball\'
             LIMIT 1'
        );
        $stmt->execute([$machineId]);
        $row = $stmt->fetch();
        if ($row && !empty($row['target_easy'])) {
            return [
                'value1' => (int)$row['target_easy'],
                'value2' => !empty($row['target_med']) ? (float)$row['target_med'] : 1.5
            ];
        }

        return ['value1' => 5000000, 'value2' => 1.5];
    }
}

