<?php

namespace App\Service;

use PDO;

class TeamPlayoffService extends BasePlayoffService
{
    protected string $entryTable = 'team_event_matchups';
    protected string $slotTable = 'team_matchups';
    protected string $scoresTable = 'team_scores';
    protected string $homeCol = 'team1_id';
    protected string $awayCol = 'team2_id';
    protected string $winnerCol = 'team_winner_id';
    protected string $homeScoreCol = 'team1_score';
    protected string $awayScoreCol = 'team2_score';
    protected string $scoreFkCol = 'team_event_matchup_id';

    protected function alternateHomeAway(): bool
    {
        return true;
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
        $this->createTeamGameSlots($db, $matchupId, $eventId, $machineIds, $rounds, $homeId, $awayId);
    }

    private function createTeamGameSlots(
        DatabaseService $db,
        int $temId,
        int $eventId,
        array $machineIds,
        int $rounds,
        int $homeTeamId,
        int $awayTeamId
    ): void {
        shuffle($machineIds);
        $machineCount = count($machineIds);
        for ($orderNum = 1; $orderNum <= $rounds * 2; $orderNum++) {
            $isTop = ($orderNum % 2 === 1);
            $pitcherTeamId = $isTop ? $homeTeamId : $awayTeamId;
            $batterTeamId = $isTop ? $awayTeamId : $homeTeamId;

            $machineIdx = ($orderNum - 1) % max($machineCount, 1);
            $machines = [$machineIds[$machineIdx]];

            MatchupGenerator::createTeamMatchups(
                $db, $temId, $machines, $eventId, null,
                $pitcherTeamId, $batterTeamId, $orderNum
            );
        }
    }
}
