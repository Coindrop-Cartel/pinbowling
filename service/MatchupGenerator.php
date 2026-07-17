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
     * head-to-head event matchup.
     *
     * Each inning produces two rows: one for the home player (player_order = 1)
     * and one for the away player (player_order = 2), using alternating machines
     * from the pre-selected pool (top machine / bottom machine per inning).
     *
     * @param PDO   $pdo             Active PDO connection (already in a transaction).
     * @param int   $eventId         The parent event ID.
     * @param int   $eventMatchupId  The event_matchup ID these innings belong to.
     * @param int   $homePlayerId    Player occupying the home role.
     * @param int   $awayPlayerId    Player occupying the away role.
     * @param int   $inningsPerGame  Number of innings in the matchup.
     * @param array $allMachineIds   Full pool of machine IDs to draw from.
     */
    public static function createInningSlots(
        PDO $pdo,
        int $eventId,
        int $eventMatchupId,
        int $homePlayerId,
        int $awayPlayerId,
        int $inningsPerGame,
        array $allMachineIds
    ): void {
        $machineSlots = self::selectMachines($allMachineIds, $inningsPerGame * 2);

        $stmt = $pdo->prepare(
            'INSERT INTO matchups (event_id, event_matchup_id, order_number, player_id, machine_id, player_order)
             VALUES (?, ?, ?, ?, ?, ?)'
        );

        for ($inning = 1; $inning <= $inningsPerGame; $inning++) {
            $topMachineId    = $machineSlots[($inning - 1) * 2];
            $bottomMachineId = $machineSlots[($inning - 1) * 2 + 1];

            // Top half: home player bats on top machine
            $stmt->execute([$eventId, $eventMatchupId, $inning, $homePlayerId, $topMachineId, 1]);

            // Bottom half: away player bats on bottom machine
            $stmt->execute([$eventId, $eventMatchupId, $inning, $awayPlayerId, $bottomMachineId, 2]);
        }
    }
}
