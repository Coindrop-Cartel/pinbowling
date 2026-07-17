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
            $stmt = $pdo->prepare('SELECT status, innings_per_game FROM leagues WHERE id = ?');
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
            
            $inningsPerGame = (int)($league['innings_per_game'] ?? 2);
            
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
                    'INSERT INTO event_matchups (event_id, home_player_id, away_player_id, status, game_number, round_name, series_id)
                     VALUES (?, ?, ?, \'pending\', 1, ?, ?)'
                );
                $stmt->execute([$eventId, $pair['home'], $pair['away'], $roundName, $pair['series_id']]);
                $eventMatchupId = (int)$pdo->lastInsertId();
 
                MatchupGenerator::createInningSlots(
                    $pdo, $eventId, $eventMatchupId,
                    $pair['home'], $pair['away'],
                    $inningsPerGame, $allMachineIds
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
}
