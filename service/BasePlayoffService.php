<?php

namespace App\Service;

use PDO;

abstract class BasePlayoffService
{
    protected DatabaseService $db;
    protected EventService $eventService;

    protected string $entryTable = 'event_matchups';
    protected string $slotTable = 'matchups';
    protected string $scoresTable = 'scores';
    protected string $homeCol = 'player1_id';
    protected string $awayCol = 'player2_id';
    protected string $winnerCol = 'player_winner_id';
    protected string $homeScoreCol = 'player1_score';
    protected string $awayScoreCol = 'player2_score';
    protected string $scoreFkCol = 'event_matchup_id';

    abstract protected function alternateHomeAway(): bool;

    abstract protected function createGameSlots(
        DatabaseService $db,
        int $matchupId,
        int $eventId,
        array $machineIds,
        int $rounds,
        int $matchupsPerRound,
        int $homeId,
        int $awayId
    ): void;

    public function __construct(DatabaseService $db, EventService $eventService)
    {
        $this->db = $db;
        $this->eventService = $eventService;
    }

    public function startPlayoffs(int $leagueId, array $seeds, int $seriesLength): bool
    {
        $db = $this->db;

        try {
            $db->beginTransaction();

            $stmt = $db->prepare('SELECT status, rounds_per_game, matchups_per_round FROM leagues WHERE id = ?');
            $stmt->execute([$leagueId]);
            $league = $stmt->fetch();
            if (!$league) {
                throw new \Exception('League not found.');
            }

            $qualifierCount = count($seeds);
            if ($qualifierCount !== 2 && $qualifierCount !== 4 && $qualifierCount !== 8) {
                throw new \Exception('Qualifiers count must be 2, 4, or 8.');
            }

            if ($seriesLength !== 1 && $seriesLength !== 3 && $seriesLength !== 5) {
                throw new \Exception('Series length must be 1, 3, or 5.');
            }

            $roundName = '';
            if ($qualifierCount === 8) {
                $roundName = 'Quarterfinals';
            } elseif ($qualifierCount === 4) {
                $roundName = 'Semifinals';
            } else {
                $roundName = 'Finals';
            }

            $event = $this->eventService->createEvent($leagueId, 'Playoffs: ' . $roundName, null, null, 'baseball');
            $eventId = (int)$event['id'];

            $machinesStmt = $db->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception('No machines found in database.');
            }

            $rounds = (int)($league['rounds_per_game'] ?? 2);
            $matchupsPerRound = (int)($league['matchups_per_round'] ?? 2);

            $pairings = [];
            if ($qualifierCount === 8) {
                $pairings[] = ['home' => $seeds[0], 'away' => $seeds[7], 'series_id' => 1];
                $pairings[] = ['home' => $seeds[3], 'away' => $seeds[4], 'series_id' => 2];
                $pairings[] = ['home' => $seeds[1], 'away' => $seeds[6], 'series_id' => 3];
                $pairings[] = ['home' => $seeds[2], 'away' => $seeds[5], 'series_id' => 4];
            } elseif ($qualifierCount === 4) {
                $pairings[] = ['home' => $seeds[0], 'away' => $seeds[3], 'series_id' => 1];
                $pairings[] = ['home' => $seeds[1], 'away' => $seeds[2], 'series_id' => 2];
            } else {
                $pairings[] = ['home' => $seeds[0], 'away' => $seeds[1], 'series_id' => 1];
            }

            foreach ($pairings as $pair) {
                $stmt = $db->prepare(
                    "INSERT INTO {$this->entryTable} (event_id, {$this->homeCol}, {$this->awayCol}, status, game_number, round_name, series_id)
                     VALUES (?, ?, ?, 'pending', 1, ?, ?)"
                );
                $stmt->execute([$eventId, $pair['home'], $pair['away'], $roundName, $pair['series_id']]);
                $matchupId = (int)$db->lastInsertId();

                $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);
                $this->createGameSlots($db, $matchupId, $eventId, $matchupMachineIds, $rounds, $matchupsPerRound, $pair['home'], $pair['away']);
            }

            $stmt = $db->prepare('UPDATE leagues SET status = \'active\', playoff_series_length = ? WHERE id = ?');
            $stmt->execute([$seriesLength, $leagueId]);

            $db->commit();
            return true;
        } catch (\Exception $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    public function handlePlayoffAdvancement(int $matchupId): void
    {
        $stmt = $this->db->prepare(
            "SELECT {$this->entryTable}.*, e.league_id
             FROM {$this->entryTable}
             JOIN events e ON {$this->entryTable}.event_id = e.id
             WHERE {$this->entryTable}.id = ?"
        );
        $stmt->execute([$matchupId]);
        $matchup = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$matchup || !$matchup['round_name']) {
            return;
        }

        $eventId = (int)$matchup['event_id'];
        $leagueId = (int)$matchup['league_id'];
        $roundName = $matchup['round_name'];
        $seriesId = (int)$matchup['series_id'];
        $gameNumber = (int)$matchup['game_number'];
        $homeId = (int)$matchup[$this->homeCol];
        $awayId = (int)$matchup[$this->awayCol];

        $leagueStmt = $this->db->prepare('SELECT playoff_series_length, rounds_per_game, matchups_per_round FROM leagues WHERE id = ?');
        $leagueStmt->execute([$leagueId]);
        $league = $leagueStmt->fetch(PDO::FETCH_ASSOC);
        $seriesLength = (int)($league['playoff_series_length'] ?? 1);
        $rounds = (int)($league['rounds_per_game'] ?? 2);
        $matchupsPerRound = (int)($league['matchups_per_round'] ?? 2);

        $seriesStmt = $this->db->prepare(
            "SELECT {$this->winnerCol} FROM {$this->entryTable}
             WHERE event_id = ? AND round_name = ? AND series_id = ? AND status = 'completed'"
        );
        $seriesStmt->execute([$eventId, $roundName, $seriesId]);
        $games = $seriesStmt->fetchAll(PDO::FETCH_ASSOC);

        $homeWins = 0;
        $awayWins = 0;
        foreach ($games as $g) {
            $winId = isset($g[$this->winnerCol]) ? (int)$g[$this->winnerCol] : null;
            if ($winId === $homeId) {
                $homeWins++;
            } elseif ($winId === $awayId) {
                $awayWins++;
            }
        }

        $clinchCount = (int)ceil($seriesLength / 2);
        $seriesWinnerId = null;
        if ($homeWins >= $clinchCount) {
            $seriesWinnerId = $homeId;
        } elseif ($awayWins >= $clinchCount) {
            $seriesWinnerId = $awayId;
        }

        if ($seriesWinnerId !== null) {
            $expectedSeriesCount = 1;
            if ($roundName === 'Quarterfinals') {
                $expectedSeriesCount = 4;
            } elseif ($roundName === 'Semifinals') {
                $expectedSeriesCount = 2;
            }

            $allRoundStmt = $this->db->prepare(
                "SELECT series_id, {$this->winnerCol}, {$this->homeCol}, {$this->awayCol} FROM {$this->entryTable}
                 WHERE event_id = ? AND round_name = ? AND status = 'completed'"
            );
            $allRoundStmt->execute([$eventId, $roundName]);
            $allRoundGames = $allRoundStmt->fetchAll(PDO::FETCH_ASSOC);

            $seriesWinners = [];
            foreach ($allRoundGames as $g) {
                $sId = (int)$g['series_id'];
                $hId = (int)$g[$this->homeCol];
                $aId = (int)$g[$this->awayCol];

                if (!isset($seriesWinners[$sId])) {
                    $specStmt = $this->db->prepare(
                        "SELECT {$this->winnerCol} FROM {$this->entryTable}
                         WHERE event_id = ? AND round_name = ? AND series_id = ? AND status = 'completed'"
                    );
                    $specStmt->execute([$eventId, $roundName, $sId]);
                    $specGames = $specStmt->fetchAll(PDO::FETCH_ASSOC);

                    $sHomeWins = 0;
                    $sAwayWins = 0;
                    foreach ($specGames as $sg) {
                        $sgWinId = isset($sg[$this->winnerCol]) ? (int)$sg[$this->winnerCol] : null;
                        if ($sgWinId === $hId) {
                            $sHomeWins++;
                        } elseif ($sgWinId === $aId) {
                            $sAwayWins++;
                        }
                    }

                    if ($sHomeWins >= $clinchCount) {
                        $seriesWinners[$sId] = $hId;
                    } elseif ($sAwayWins >= $clinchCount) {
                        $seriesWinners[$sId] = $aId;
                    }
                }
            }

            if (count($seriesWinners) === $expectedSeriesCount) {
                if ($roundName === 'Quarterfinals') {
                    $this->advanceToPlayoffRound($leagueId, 'Semifinals', [
                        ['home' => $seriesWinners[1], 'away' => $seriesWinners[2], 'series_id' => 1],
                        ['home' => $seriesWinners[3], 'away' => $seriesWinners[4], 'series_id' => 2],
                    ], $rounds, $matchupsPerRound, $seriesLength);
                } elseif ($roundName === 'Semifinals') {
                    $this->advanceToPlayoffRound($leagueId, 'Finals', [
                        ['home' => $seriesWinners[1], 'away' => $seriesWinners[2], 'series_id' => 1],
                    ], $rounds, $matchupsPerRound, $seriesLength);
                } else {
                    $stmt = $this->db->prepare('UPDATE leagues SET status = \'completed\' WHERE id = ?');
                    $stmt->execute([$leagueId]);
                }
            }
        } else {
            $nextGameNumber = $gameNumber + 1;

            // Safety: never create a game beyond the series length.
            if ($nextGameNumber > $seriesLength) {
                return;
            }

            // Guard against duplicate game creation. handlePlayoffAdvancement can run
            // more than once for the same game (e.g. score edits), which would otherwise
            // insert another copy of the next game every time.
            $existsStmt = $this->db->prepare(
                "SELECT id FROM {$this->entryTable}
                 WHERE event_id = ? AND round_name = ? AND series_id = ? AND game_number = ?"
            );
            $existsStmt->execute([$eventId, $roundName, $seriesId, $nextGameNumber]);
            if ($existsStmt->fetchColumn()) {
                return;
            }

            if ($this->alternateHomeAway()) {
                $nextHomeId = ($nextGameNumber % 2 === 0) ? $awayId : $homeId;
                $nextAwayId = ($nextGameNumber % 2 === 0) ? $homeId : $awayId;
            } else {
                $nextHomeId = $homeId;
                $nextAwayId = $awayId;
            }

            $insertStmt = $this->db->prepare(
                "INSERT INTO {$this->entryTable} (event_id, {$this->homeCol}, {$this->awayCol}, status, game_number, round_name, series_id)
                 VALUES (?, ?, ?, 'pending', ?, ?, ?)"
            );
            $insertStmt->execute([$eventId, $nextHomeId, $nextAwayId, $nextGameNumber, $roundName, $seriesId]);
            $nextMatchupId = (int)$this->db->lastInsertId();

            $machinesStmt = $this->db->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);
            $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);

            $this->createGameSlots($this->db, $nextMatchupId, $eventId, $matchupMachineIds, $rounds, $matchupsPerRound, $nextHomeId, $nextAwayId);
        }
    }

    protected function advanceToPlayoffRound(
        int $leagueId,
        string $nextRoundName,
        array $pairings,
        int $rounds,
        int $matchupsPerRound,
        int $seriesLength
    ): void {
        $db = $this->db;

        $stmt = $db->prepare('SELECT id FROM events WHERE league_id = ? AND event_name = ?');
        $stmt->execute([$leagueId, 'Playoffs: ' . $nextRoundName]);
        $nextEventId = $stmt->fetchColumn();

        if ($nextEventId) {
            $nextEventId = (int)$nextEventId;
        } else {
            $event = $this->eventService->createEvent($leagueId, 'Playoffs: ' . $nextRoundName, null, null, 'baseball');
            $nextEventId = (int)$event['id'];
        }

        $machinesStmt = $db->query('SELECT id FROM machines');
        $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);

        foreach ($pairings as $pair) {
            $stmt = $db->prepare(
                "SELECT id, {$this->homeCol}, {$this->awayCol} FROM {$this->entryTable}
                 WHERE event_id = ? AND series_id = ? AND game_number = 1"
            );
            $stmt->execute([$nextEventId, $pair['series_id']]);
            $existingMatchup = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existingMatchup) {
                $emId = (int)$existingMatchup['id'];
                $oldHome = (int)$existingMatchup[$this->homeCol];
                $oldAway = (int)$existingMatchup[$this->awayCol];

                if ($oldHome !== (int)$pair['home'] || $oldAway !== (int)$pair['away']) {
                    $updateStmt = $db->prepare(
                        "UPDATE {$this->entryTable}
                         SET {$this->homeCol} = ?, {$this->awayCol} = ?, {$this->winnerCol} = NULL, {$this->homeScoreCol} = 0, {$this->awayScoreCol} = 0, status = 'pending'
                         WHERE id = ?"
                    );
                    $updateStmt->execute([$pair['home'], $pair['away'], $emId]);

                    $delScoresStmt = $db->prepare("DELETE FROM {$this->scoresTable} WHERE {$this->scoreFkCol} = ?");
                    $delScoresStmt->execute([$emId]);

                    $subStmt = $db->prepare(
                        "SELECT id FROM {$this->entryTable} WHERE event_id = ? AND series_id = ? AND game_number > 1"
                    );
                    $subStmt->execute([$nextEventId, $pair['series_id']]);
                    $subMatchupIds = $subStmt->fetchAll(PDO::FETCH_COLUMN);

                    if (!empty($subMatchupIds)) {
                        $placeholders = implode(',', array_fill(0, count($subMatchupIds), '?'));

                        $delSubScores = $db->prepare("DELETE FROM {$this->scoresTable} WHERE {$this->scoreFkCol} IN ($placeholders)");
                        $delSubScores->execute($subMatchupIds);

                        $delSubMatchups = $db->prepare("DELETE FROM {$this->slotTable} WHERE {$this->scoreFkCol} IN ($placeholders)");
                        $delSubMatchups->execute($subMatchupIds);

                        $delSubEntry = $db->prepare("DELETE FROM {$this->entryTable} WHERE id IN ($placeholders)");
                        $delSubEntry->execute($subMatchupIds);
                    }
                }
            } else {
                $stmt = $db->prepare(
                    "INSERT INTO {$this->entryTable} (event_id, {$this->homeCol}, {$this->awayCol}, status, game_number, round_name, series_id)
                     VALUES (?, ?, ?, 'pending', 1, ?, ?)"
                );
                $stmt->execute([$nextEventId, $pair['home'], $pair['away'], $nextRoundName, $pair['series_id']]);
                $newMatchupId = (int)$db->lastInsertId();

                $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);
                $this->createGameSlots($db, $newMatchupId, $nextEventId, $matchupMachineIds, $rounds, $matchupsPerRound, $pair['home'], $pair['away']);
            }
        }
    }

    protected function getMatchupMachinePool(int $leagueId, array $allMachineIds): array
    {
        $db = $this->db;

        $llStmt = $db->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
        $llStmt->execute([$leagueId]);
        $assignedLocationIds = $llStmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($assignedLocationIds)) {
            return $allMachineIds;
        }

        $lmStmt = $db->query('SELECT location_id, machine_id FROM location_machines');
        $machinesByLocation = [];
        foreach ($lmStmt->fetchAll() as $row) {
            $machinesByLocation[(int)$row['location_id']][] = (int)$row['machine_id'];
        }

        $chosenLocId = (int)$assignedLocationIds[array_rand($assignedLocationIds)];
        if (!empty($machinesByLocation[$chosenLocId])) {
            return $machinesByLocation[$chosenLocId];
        }

        return $allMachineIds;
    }
}
