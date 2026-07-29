<?php

namespace App\Service;

/**
 * Service managing bracket creation and seeding logic for individual player playoffs.
 */
class PlayoffService extends BasePlayoffService
{
    protected function alternateHomeAway(): bool
    {
        return false;
    }

    protected function createGameSlots(
        DatabaseService $db,
        int $matchupId,
        int $eventId,
        array $machineIds,
        int $rounds,
        int $matchupsPerRound,
        int $homeId,
        int $awayId
    ): void {
        MatchupGenerator::createMatchupSlots(
            $db, $matchupId,
            $rounds, $matchupsPerRound, $machineIds
        );
    }
}
