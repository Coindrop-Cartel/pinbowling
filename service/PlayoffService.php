<?php

namespace App\Service;

use PDO;

/**
 * Service managing bracket creation and seeding logic for postseason playoffs.
 */
class PlayoffService {
    private DatabaseService $db;
    private EventService $eventService;

    public function __construct(DatabaseService $db, EventService $eventService) {
        $this->db = $db;
        $this->eventService = $eventService;
    }

    /**
     * Start the postseason playoffs for a league.
     *
     * @param int $leagueId
     * @param array $seeds Sorted list of player IDs (Index 0 is Seed 1, etc.)
     * @param int $seriesLength 1, 3, or 5
     * @return bool Success
     */
    public function startPlayoffs(int $leagueId, array $seeds, int $seriesLength): bool {
        $pdo = $this->db->getPdo();
        
        try {
            $pdo->beginTransaction();
            
            // 1. Fetch league details directly
            $stmt = $pdo->prepare('SELECT status, matchups_per_game FROM leagues WHERE id = ?');
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
            
            // 2. Create a Playoffs Event for this round
            $event = $this->eventService->createEvent($leagueId, "Playoffs: " . $roundName, null, null, 'baseball');
            $eventId = (int)$event['id'];
            
            // 3. Fetch all available machines
            $machinesStmt = $pdo->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(PDO::FETCH_COLUMN);
            if (empty($allMachineIds)) {
                throw new \Exception("No machines found in database.");
            }
            
            $inningsPerGame = (int)($league['matchups_per_game'] ?? 2);
            
            // 4. Generate seed pairings
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
            
            // 5. Create Game 1 for each series
            foreach ($pairings as $pair) {
                $stmt = $pdo->prepare(
                    'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number, round_name, series_id)
                     VALUES (?, ?, ?, \'pending\', 1, ?, ?)'
                );
                $stmt->execute([$eventId, $pair['home'], $pair['away'], $roundName, $pair['series_id']]);
                $eventMatchupId = (int)$pdo->lastInsertId();
 
                $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);
                MatchupGenerator::createInningSlots(
                    $pdo, $eventMatchupId,
                    $inningsPerGame, $matchupMachineIds
                );
            }
            
            // 6. Update league status and playoff series length
            $stmt = $pdo->prepare('UPDATE leagues SET status = \'active\', playoff_series_length = ? WHERE id = ?');
            $stmt->execute([$seriesLength, $leagueId]);
            
            $pdo->commit();
            return true;
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Handles playoff bracket progression and next round advancement when a playoff matchup finishes.
     *
     * @param int $eventMatchupId
     */
    public function handlePlayoffAdvancement(int $eventMatchupId): void
    {
        $stmt = $this->db->prepare('SELECT em.*, e.league_id FROM event_matchups em JOIN events e ON em.event_id = e.id WHERE em.id = ?');
        $stmt->execute([$eventMatchupId]);
        $matchup = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$matchup || !$matchup['round_name']) {
            return;
        }

        $eventId = (int) $matchup['event_id'];
        $leagueId = (int) $matchup['league_id'];
        $roundName = $matchup['round_name'];
        $seriesId = (int) $matchup['series_id'];
        $gameNumber = (int) $matchup['game_number'];
        $homePlayerId = (int) $matchup['player1_id'];
        $awayPlayerId = (int) $matchup['player2_id'];

        $leagueStmt = $this->db->prepare('SELECT playoff_series_length, matchups_per_game FROM leagues WHERE id = ?');
        $leagueStmt->execute([$leagueId]);
        $league = $leagueStmt->fetch(\PDO::FETCH_ASSOC);
        $seriesLength = (int) ($league['playoff_series_length'] ?? 1);
        $inningsPerGame = (int) ($league['matchups_per_game'] ?? 2);

        $seriesStmt = $this->db->prepare(
            'SELECT winner_id FROM event_matchups 
             WHERE event_id = ? AND round_name = ? AND series_id = ? AND status = \'completed\''
        );
        $seriesStmt->execute([$eventId, $roundName, $seriesId]);
        $games = $seriesStmt->fetchAll(\PDO::FETCH_ASSOC);

        $homeWins = 0;
        $awayWins = 0;
        foreach ($games as $g) {
            $winId = isset($g['winner_id']) ? (int) $g['winner_id'] : null;
            if ($winId === $homePlayerId) {
                $homeWins++;
            } elseif ($winId === $awayPlayerId) {
                $awayWins++;
            }
        }

        $clinchCount = (int) ceil($seriesLength / 2);
        $seriesWinnerId = null;
        if ($homeWins >= $clinchCount) {
            $seriesWinnerId = $homePlayerId;
        } elseif ($awayWins >= $clinchCount) {
            $seriesWinnerId = $awayPlayerId;
        }

        if ($seriesWinnerId !== null) {
            $expectedSeriesCount = 1;
            if ($roundName === 'Quarterfinals') {
                $expectedSeriesCount = 4;
            } elseif ($roundName === 'Semifinals') {
                $expectedSeriesCount = 2;
            }

            $allRoundStmt = $this->db->prepare(
                'SELECT series_id, winner_id, player1_id, player2_id FROM event_matchups 
                 WHERE event_id = ? AND round_name = ? AND status = \'completed\''
            );
            $allRoundStmt->execute([$eventId, $roundName]);
            $allRoundGames = $allRoundStmt->fetchAll(\PDO::FETCH_ASSOC);

            $seriesWinners = [];
            foreach ($allRoundGames as $g) {
                $sId = (int) $g['series_id'];
                $hId = (int) $g['player1_id'];
                $aId = (int) $g['player2_id'];

                if (!isset($seriesWinners[$sId])) {
                    $specStmt = $this->db->prepare(
                        'SELECT winner_id FROM event_matchups 
                         WHERE event_id = ? AND round_name = ? AND series_id = ? AND status = \'completed\''
                    );
                    $specStmt->execute([$eventId, $roundName, $sId]);
                    $specGames = $specStmt->fetchAll(\PDO::FETCH_ASSOC);

                    $sHomeWins = 0;
                    $sAwayWins = 0;
                    foreach ($specGames as $sg) {
                        $sgWinId = isset($sg['winner_id']) ? (int) $sg['winner_id'] : null;
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
                        ['home' => $seriesWinners[3], 'away' => $seriesWinners[4], 'series_id' => 2]
                    ], $inningsPerGame, $seriesLength);
                } elseif ($roundName === 'Semifinals') {
                    $this->advanceToPlayoffRound($leagueId, 'Finals', [
                        ['home' => $seriesWinners[1], 'away' => $seriesWinners[2], 'series_id' => 1]
                    ], $inningsPerGame, $seriesLength);
                } else {
                    $stmt = $this->db->prepare('UPDATE leagues SET status = \'completed\' WHERE id = ?');
                    $stmt->execute([$leagueId]);
                }
            }
        } else {
            $nextGameNumber = $gameNumber + 1;

            $insertStmt = $this->db->prepare(
                'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number, round_name, series_id)
                 VALUES (?, ?, ?, \'pending\', ?, ?, ?)'
            );
            $insertStmt->execute([$eventId, $homePlayerId, $awayPlayerId, $nextGameNumber, $roundName, $seriesId]);
            $nextEventMatchupId = (int) $this->db->lastInsertId();

            $machinesStmt = $this->db->query('SELECT id FROM machines');
            $allMachineIds = $machinesStmt->fetchAll(\PDO::FETCH_COLUMN);
            $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);

            MatchupGenerator::createInningSlots(
                $this->db->getPdo(), $nextEventMatchupId,
                $inningsPerGame, $matchupMachineIds
            );
        }
    }

    /**
     * Helper to create next round events and matches.
     */
    private function advanceToPlayoffRound(int $leagueId, string $nextRoundName, array $pairings, int $inningsPerGame, int $seriesLength): void
    {
        $eventStmt = $this->db->prepare('INSERT INTO events (league_id, event_name, status, scoring_format) VALUES (?, ?, \'pending\', \'baseball\')');
        $eventStmt->execute([$leagueId, "Playoffs: " . $nextRoundName]);
        $nextEventId = (int) $this->db->lastInsertId();

        $machinesStmt = $this->db->query('SELECT id FROM machines');
        $allMachineIds = $machinesStmt->fetchAll(\PDO::FETCH_COLUMN);

        foreach ($pairings as $pair) {
            $stmt = $this->db->prepare(
                'INSERT INTO event_matchups (event_id, player1_id, player2_id, status, game_number, round_name, series_id)
                 VALUES (?, ?, ?, \'pending\', 1, ?, ?)'
            );
            $stmt->execute([$nextEventId, $pair['home'], $pair['away'], $nextRoundName, $pair['series_id']]);
            $eventMatchupId = (int) $this->db->lastInsertId();

            $matchupMachineIds = $this->getMatchupMachinePool($leagueId, $allMachineIds);
            MatchupGenerator::createInningSlots(
                $this->db->getPdo(), $eventMatchupId,
                $inningsPerGame, $matchupMachineIds
            );
        }
    }

    /**
     * Get target machine pool for a matchup, restricted to a single randomly picked location from the league's assigned locations.
     */
    private function getMatchupMachinePool(int $leagueId, array $allMachineIds): array
    {
        $pdo = $this->db->getPdo();
        
        $llStmt = $pdo->prepare('SELECT location_id FROM league_locations WHERE league_id = ?');
        $llStmt->execute([$leagueId]);
        $assignedLocationIds = $llStmt->fetchAll(\PDO::FETCH_COLUMN);

        if (empty($assignedLocationIds)) {
            return $allMachineIds;
        }

        $lmStmt = $pdo->query('SELECT location_id, machine_id FROM location_machines');
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
