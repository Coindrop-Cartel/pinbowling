<?php

namespace App\Service;

use PDO;

class TeamPlayoffService {
    private DatabaseService $db;
    private EventService $eventService;

    public function __construct(DatabaseService $db, EventService $eventService) {
        $this->db = $db;
        $this->eventService = $eventService;
    }

    /**
     * Start postseason playoffs for a team league.
     *
     * @param int   $leagueId
     * @param array $seeds   Sorted list of team IDs (Index 0 = Seed 1, etc.)
     * @param int   $seriesLength 1, 3, or 5
     * @return bool Success
     */
    public function startPlayoffs(int $leagueId, array $seeds, int $seriesLength): bool {
        $pdo = $this->db;

        try {
            $db->beginTransaction();

            $stmt = $db->prepare('SELECT status, rounds_per_game, matchups_per_round FROM leagues WHERE id = ?');
            $stmt->execute([$leagueId]);
            $league = $stmt->fetch();
            if (!$league) {
                throw new \Exception("League not found.");
            }

            $qualifierCount = count($seeds);
            if ($qualifierCount !== 2 && $qualifierCount !== 4 && $qualifierCount !== 8) {
                throw new \Exception("Qualifiers count must be 2, 4, or 8.");
            }

            if ($seriesLength !== 1 && $seriesLength !== 3 && $seriesLength !== 5) {
                throw new \Exception("Series length must be 1, 3, or 5.");
            }

            $roundName = '';
            if ($qualifierCount === 8) {
                $roundName = 'Quarterfinals';
            } elseif ($qualifierCount === 4) {
                $roundName = 'Semifinals';
            } else {
                $roundName = 'Finals';
            }

            $event = $this->eventService->createEvent($leagueId, "Playoffs: " . $roundName, null, null, 'baseball');
            $eventId = (int)$event['id'];

            $machinesStmt = $db->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception("No machines found in database.");
            }

            $rounds = (int)($league['rounds_per_game'] ?? 2);

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
                    'INSERT INTO team_event_matchups (event_id, team1_id, team2_id, status, game_number, round_name, series_id)
                     VALUES (?, ?, ?, \'pending\', 1, ?, ?)'
                );
                $stmt->execute([$eventId, $pair['home'], $pair['away'], $roundName, $pair['series_id']]);
                $temId = (int)$db->lastInsertId();

                $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);
                $this->createTeamGameSlots($pdo, $temId, $eventId, $matchupMachineIds, $rounds, $pair['home'], $pair['away']);
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

    /**
     * Handle bracket progression when a team playoff game finishes.
     *
     * @param int $teamEventMatchupId
     */
    public function handlePlayoffAdvancement(int $teamEventMatchupId): void {
        $stmt = $this->db->prepare(
            'SELECT tem.*, e.league_id
             FROM team_event_matchups tem
             JOIN events e ON tem.event_id = e.id
             WHERE tem.id = ?'
        );
        $stmt->execute([$teamEventMatchupId]);
        $matchup = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$matchup || !$matchup['round_name']) {
            return;
        }

        $eventId = (int)$matchup['event_id'];
        $leagueId = (int)$matchup['league_id'];
        $roundName = $matchup['round_name'];
        $seriesId = (int)$matchup['series_id'];
        $gameNumber = (int)$matchup['game_number'];
        $homeTeamId = (int)$matchup['team1_id'];
        $awayTeamId = (int)$matchup['team2_id'];

        $leagueStmt = $this->db->prepare(
            'SELECT playoff_series_length, rounds_per_game, matchups_per_round FROM leagues WHERE id = ?'
        );
        $leagueStmt->execute([$leagueId]);
        $league = $leagueStmt->fetch(\PDO::FETCH_ASSOC);
        $seriesLength = (int)($league['playoff_series_length'] ?? 1);
        $rounds = (int)($league['rounds_per_game'] ?? 2);

        $seriesStmt = $this->db->prepare(
            'SELECT team_winner_id FROM team_event_matchups
             WHERE event_id = ? AND round_name = ? AND series_id = ? AND status = \'completed\''
        );
        $seriesStmt->execute([$eventId, $roundName, $seriesId]);
        $games = $seriesStmt->fetchAll(\PDO::FETCH_ASSOC);

        $homeWins = 0;
        $awayWins = 0;
        foreach ($games as $g) {
            $winId = isset($g['team_winner_id']) ? (int)$g['team_winner_id'] : null;
            if ($winId === $homeTeamId) {
                $homeWins++;
            } elseif ($winId === $awayTeamId) {
                $awayWins++;
            }
        }

        $clinchCount = (int)ceil($seriesLength / 2);
        $seriesWinnerId = null;
        if ($homeWins >= $clinchCount) {
            $seriesWinnerId = $homeTeamId;
        } elseif ($awayWins >= $clinchCount) {
            $seriesWinnerId = $awayTeamId;
        }

        if ($seriesWinnerId !== null) {
            $expectedSeriesCount = 1;
            if ($roundName === 'Quarterfinals') {
                $expectedSeriesCount = 4;
            } elseif ($roundName === 'Semifinals') {
                $expectedSeriesCount = 2;
            }

            $allRoundStmt = $this->db->prepare(
                'SELECT series_id, team_winner_id, team1_id, team2_id FROM team_event_matchups
                 WHERE event_id = ? AND round_name = ? AND status = \'completed\''
            );
            $allRoundStmt->execute([$eventId, $roundName]);
            $allRoundGames = $allRoundStmt->fetchAll(\PDO::FETCH_ASSOC);

            $seriesWinners = [];
            foreach ($allRoundGames as $g) {
                $sId = (int)$g['series_id'];
                $hId = (int)$g['team1_id'];
                $aId = (int)$g['team2_id'];

                if (!isset($seriesWinners[$sId])) {
                    $specStmt = $this->db->prepare(
                        'SELECT team_winner_id FROM team_event_matchups
                         WHERE event_id = ? AND round_name = ? AND series_id = ? AND status = \'completed\''
                    );
                    $specStmt->execute([$eventId, $roundName, $sId]);
                    $specGames = $specStmt->fetchAll(\PDO::FETCH_ASSOC);

                    $sHomeWins = 0;
                    $sAwayWins = 0;
                    foreach ($specGames as $sg) {
                        $sgWinId = isset($sg['team_winner_id']) ? (int)$sg['team_winner_id'] : null;
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
                $pdo = $this->db;
                if ($roundName === 'Quarterfinals') {
                    $this->advanceToPlayoffRound(
                        $pdo, $leagueId, 'Semifinals', $rounds, $seriesLength, [
                            ['home' => $seriesWinners[1], 'away' => $seriesWinners[2], 'series_id' => 1],
                            ['home' => $seriesWinners[3], 'away' => $seriesWinners[4], 'series_id' => 2],
                        ]
                    );
                } elseif ($roundName === 'Semifinals') {
                    $this->advanceToPlayoffRound(
                        $pdo, $leagueId, 'Finals', $rounds, $seriesLength, [
                            ['home' => $seriesWinners[1], 'away' => $seriesWinners[2], 'series_id' => 1],
                        ]
                    );
                } else {
                    $stmt = $this->db->prepare('UPDATE leagues SET status = \'completed\' WHERE id = ?');
                    $stmt->execute([$leagueId]);
                }
            }
        } else {
            $nextGameNumber = $gameNumber + 1;

            // Alternate home/away each game (home bats bottom)
            $nextHomeId = ($nextGameNumber % 2 === 0) ? $awayTeamId : $homeTeamId;
            $nextAwayId = ($nextGameNumber % 2 === 0) ? $homeTeamId : $awayTeamId;

            $pdo = $this->db;

            $insertStmt = $db->prepare(
                'INSERT INTO team_event_matchups (event_id, team1_id, team2_id, status, game_number, round_name, series_id)
                 VALUES (?, ?, ?, \'pending\', ?, ?, ?)'
            );
            $insertStmt->execute([$eventId, $nextHomeId, $nextAwayId, $nextGameNumber, $roundName, $seriesId]);
            $nextTemId = (int)$db->lastInsertId();

            $machinesStmt = $db->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(\PDO::FETCH_COLUMN);
            $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);

            $this->createTeamGameSlots($pdo, $nextTemId, $eventId, $matchupMachineIds, $rounds, $nextHomeId, $nextAwayId);
        }
    }

    /**
     * Advance to the next playoff round.
     */
    private function advanceToPlayoffRound(
        DatabaseService $db,
        int $leagueId,
        string $nextRoundName,
        int $rounds,
        int $seriesLength,
        array $pairings
    ): void {
        $stmt = $db->prepare('SELECT id FROM events WHERE league_id = ? AND event_name = ?');
        $stmt->execute([$leagueId, "Playoffs: " . $nextRoundName]);
        $nextEventId = $stmt->fetchColumn();

        if ($nextEventId) {
            $nextEventId = (int)$nextEventId;
        } else {
            $event = $this->eventService->createEvent($leagueId, "Playoffs: " . $nextRoundName, null, null, 'baseball');
            $nextEventId = (int)$event['id'];
        }

        $machinesStmt = $db->query('SELECT id FROM machines');
        $allMachineIds = $machinesStmt->fetchAll(\PDO::FETCH_COLUMN);

        foreach ($pairings as $pair) {
            $stmt = $db->prepare(
                'SELECT id, team1_id, team2_id FROM team_event_matchups
                 WHERE event_id = ? AND series_id = ? AND game_number = 1'
            );
            $stmt->execute([$nextEventId, $pair['series_id']]);
            $existingMatchup = $stmt->fetch(\PDO::FETCH_ASSOC);

            if ($existingMatchup) {
                $temId = (int)$existingMatchup['id'];
                $oldHome = (int)$existingMatchup['team1_id'];
                $oldAway = (int)$existingMatchup['team2_id'];

                if ($oldHome !== (int)$pair['home'] || $oldAway !== (int)$pair['away']) {
                    $updateStmt = $db->prepare(
                        'UPDATE team_event_matchups
                         SET team1_id = ?, team2_id = ?, team_winner_id = NULL, team1_score = 0, team2_score = 0, status = \'pending\'
                         WHERE id = ?'
                    );
                    $updateStmt->execute([$pair['home'], $pair['away'], $temId]);

                    $delScoresStmt = $db->prepare('DELETE FROM team_scores WHERE team_event_matchup_id = ?');
                    $delScoresStmt->execute([$temId]);

                    $subStmt = $db->prepare(
                        'SELECT id FROM team_event_matchups WHERE event_id = ? AND series_id = ? AND game_number > 1'
                    );
                    $subStmt->execute([$nextEventId, $pair['series_id']]);
                    $subMatchupIds = $subStmt->fetchAll(\PDO::FETCH_COLUMN);

                    if (!empty($subMatchupIds)) {
                        $placeholders = implode(',', array_fill(0, count($subMatchupIds), '?'));

                        $delSubScores = $db->prepare("DELETE FROM team_scores WHERE team_event_matchup_id IN ($placeholders)");
                        $delSubScores->execute($subMatchupIds);

                        $delSubMatchups = $db->prepare("DELETE FROM team_matchups WHERE team_event_matchup_id IN ($placeholders)");
                        $delSubMatchups->execute($subMatchupIds);

                        $delSubTems = $db->prepare("DELETE FROM team_event_matchups WHERE id IN ($placeholders)");
                        $delSubTems->execute($subMatchupIds);
                    }
                }
            } else {
                $stmt = $db->prepare(
                    'INSERT INTO team_event_matchups (event_id, team1_id, team2_id, status, game_number, round_name, series_id)
                     VALUES (?, ?, ?, \'pending\', 1, ?, ?)'
                );
                $stmt->execute([$nextEventId, $pair['home'], $pair['away'], $nextRoundName, $pair['series_id']]);
                $newTemId = (int)$db->lastInsertId();

                $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);
                $this->createTeamGameSlots($pdo, $newTemId, $nextEventId, $matchupMachineIds, $rounds, $pair['home'], $pair['away']);
            }
        }
    }

    /**
     * Create team_matchup slots for a single game, with alternating pitcher/batter roles per half-inning.
     */
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
                $pdo, $temId, $machines, $eventId, null,
                $pitcherTeamId, $batterTeamId, $orderNum
            );
        }
    }

    /**
     * Get target machine pool for a matchup, restricted to a single randomly picked location.
     */
    private function getMatchupMachinePool(int $leagueId, array $allMachineIds): array {
        $pdo = $this->db;

        $llStmt = $db->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
        $llStmt->execute([$leagueId]);
        $assignedLocationIds = $llStmt->fetchAll(\PDO::FETCH_COLUMN);

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
