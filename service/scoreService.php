<?php

namespace App\Service;

/**
 * Service managing player scores, recording new scores, and bulk score cleanup.
 */
class ScoreService
{
    private DatabaseService $db;
    private PlayoffService $playoffService;

    public function __construct(DatabaseService $db, PlayoffService $playoffService)
    {
        $this->db = $db;
        $this->playoffService = $playoffService;
    }

    /**
     * Get scores for a league.
     *
     * @param int $leagueId
     * @return array
     */
    public function getLeagueScores(int $leagueId): array
    {
        $stmt = $this->db->query(
            'SELECT s.id, s.player_id, s.event_id, s.event_matchup_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
             FROM scores s
             JOIN machines m ON m.id = s.machine_id
             JOIN events e ON s.event_id = e.id
             WHERE e.league_id = ?
             ORDER BY s.event_id ASC, s.player_id ASC, s.order_number ASC',
            [$leagueId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Get scores for a specific event.
     *
     * @param int $eventId
     * @param int|null $playerId Optional filter by player
     * @return array
     */
    public function getEventScores(int $eventId, ?int $playerId = null): array
    {
        if ($playerId) {
            $stmt = $this->db->query(
                'SELECT s.id, s.player_id, s.event_id, s.event_matchup_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM scores s
                 JOIN machines m ON m.id = s.machine_id
                 WHERE s.player_id = ? AND s.event_id = ?
                 ORDER BY s.order_number ASC',
                [$playerId, $eventId]
            );
        } else {
            $stmt = $this->db->query(
                'SELECT s.id, s.player_id, s.event_id, s.event_matchup_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
                 FROM scores s
                 JOIN machines m ON m.id = s.machine_id
                 WHERE s.event_id = ?
                 ORDER BY s.player_id ASC, s.order_number ASC',
                [$eventId]
            );
        }
        return $stmt->fetchAll();
    }

    /**
     * Get scores for a specific event matchup.
     *
     * @param int $eventMatchupId
     * @return array
     */
    public function getMatchupScores(int $eventMatchupId): array
    {
        $stmt = $this->db->query(
            'SELECT s.id, s.player_id, s.event_id, s.event_matchup_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name
             FROM scores s
             JOIN machines m ON m.id = s.machine_id
             WHERE s.event_matchup_id = ?
             ORDER BY s.order_number ASC',
            [$eventMatchupId]
        );
        return $stmt->fetchAll();
    }

    /**
     * Save or update a score.
     *
     * @param int $eventId
     * @param int $playerId
     * @param int $machineId
     * @param int $orderNumber
     * @param int|null $ball1
     * @param int|null $ball2
     * @param int|null $ball3
     * @param int|null $eventMatchupId
     * @return bool
     */
    public function saveScore(
        int $eventId,
        int $playerId,
        int $machineId,
        int $orderNumber,
        ?int $ball1 = null,
        ?int $ball2 = null,
        ?int $ball3 = null,
        ?int $eventMatchupId = null
    ): bool {
        $pdo = $this->db->getPdo();

        // 1. Get the league_id from the event
        $stmt = $pdo->prepare('SELECT league_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $leagueId = $stmt->fetchColumn();
        if (!$leagueId) {
            throw new \Exception('Event not found.');
        }

        // 2. Check if player is a member of the league roster (directly or via team)
        $stmt = $pdo->prepare(
            'SELECT 1 FROM league_players WHERE league_id = ? AND player_id = ?
             UNION
             SELECT 1 FROM league_teams lt 
             JOIN team_members tm ON lt.team_id = tm.team_id 
             WHERE lt.league_id = ? AND tm.player_id = ?'
        );
        $stmt->execute([$leagueId, $playerId, $leagueId, $playerId]);
        if (!$stmt->fetchColumn()) {
            throw new \Exception('Player is not registered in this league.');
        }

        $stmt = $pdo->prepare(
            'INSERT INTO scores (event_id, event_matchup_id, player_id, machine_id, order_number, ball1, ball2, ball3)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ball1 = VALUES(ball1), ball2 = VALUES(ball2), ball3 = VALUES(ball3)'
        );

        $stmt->execute([$eventId, $eventMatchupId, $playerId, $machineId, $orderNumber, $ball1, $ball2, $ball3]);

        // If eventMatchupId is set, check if we need to auto-calculate the total/winner of the matchup
        if ($eventMatchupId !== null) {
            $this->updateMatchupTotals($eventMatchupId);
        }

        return true;
    }

    /**
     * Re-calculate runs and winner for a matchup once scores are updated.
     *
     * @param int $eventMatchupId
     */
    private function updateMatchupTotals(int $eventMatchupId): void
    {
        $pdo = $this->db->getPdo();

        // Fetch event matchup details
        $stmt = $pdo->prepare('SELECT * FROM event_matchups WHERE id = ?');
        $stmt->execute([$eventMatchupId]);
        $matchup = $stmt->fetch();
        if (!$matchup)
            return;

        // Fetch detailed matchup slots (machine config, player roles)
        $stmt = $pdo->prepare('SELECT * FROM matchups WHERE event_matchup_id = ? ORDER BY order_number ASC, player_order ASC');
        $stmt->execute([$eventMatchupId]);
        $slots = $stmt->fetchAll();

        // Fetch all scores submitted for this matchup
        $scores = $this->getMatchupScores($eventMatchupId);

        // Structure scores by player and order_number (inning)
        $scoreMap = [];
        foreach ($scores as $s) {
            $scoreMap[(int) $s['player_id']][(int) $s['order_number']] = $s;
        }

        // Fetch machines in this matchup to get target score thresholds
        $stmt = $pdo->prepare(
            'SELECT ts.*, m.machine_name 
             FROM target_scores ts 
             JOIN machines m ON ts.machine_id = m.id
             WHERE ts.event_id = ?'
        );
        $stmt->execute([$matchup['event_id']]);
        $machines = $stmt->fetchAll();
        $machineMap = [];
        foreach ($machines as $mac) {
            $machineMap[(int) $mac['order_number']] = $mac;
        }

        // Calculate runs for home and away
        $homeId = (int) $matchup['home_player_id'];
        $awayId = (int) $matchup['away_player_id'];

        $homeRuns = 0;
        $awayRuns = 0;

        // Baseball top/bottom innings
        // Odd slot indexes: Player 1 (Home) is batter (player_order = 1), Player 2 (Away) is pitcher (player_order = 2)
        // Even slot indexes: Player 2 (Away) is batter (player_order = 2), Player 1 (Home) is pitcher (player_order = 1)
        // Let's count runs inning-by-inning.
        // Group slots by order_number (inning)
        $inningSlots = [];
        foreach ($slots as $sl) {
            $inningSlots[(int) $sl['order_number']][(int) $sl['player_order']] = $sl;
        }

        // Check how many innings are played
        $inningsCount = count($inningSlots);
        $hasScores = false;

        for ($inning = 1; $inning <= $inningsCount; $inning++) {
            $homeSlot = $inningSlots[$inning][1] ?? null;
            $awaySlot = $inningSlots[$inning][2] ?? null;
            if (!$homeSlot || !$awaySlot)
                continue;

            $homeEntry = $scoreMap[$homeId][$inning] ?? ['ball1' => 0, 'ball2' => 0, 'ball3' => 0];
            $awayEntry = $scoreMap[$awayId][$inning] ?? ['ball1' => 0, 'ball2' => 0, 'ball3' => 0];

            if (($scoreMap[$homeId][$inning] ?? null) || ($scoreMap[$awayId][$inning] ?? null)) {
                $hasScores = true;
            }

            // Top of inning (even zero-based slot, odd 1-based inning? No, in generateMatchupPayload, order_number is $inning,
            // so we alternate roles. Home pitches on Top, bats on Bottom.
            // Let's determine who is batter and pitcher for this machine.
            // Home is player_order 1, Away is player_order 2.
            // In BaseballEngine:
            // Top of inning (idx % 2 === 0): Pitcher is Home, Batter is Away.
            // Bottom of inning (idx % 2 === 1): Batter is Home, Pitcher is Away.
            // Here each inning has 2 machines: Top (index 2*(inning-1)) and Bottom (index 2*(inning-1)+1).
            // Let's get the thresholds for the machines.
            // Top Machine runs (Away batter):
            $topMachine = $machineMap[($inning - 1) * 2 + 1] ?? null; // In database, order_number of target_scores
            // Wait! In database, target_scores has `order_number` representing the machine slot (1 to 2 * innings_per_game)
            $topOrderNum = ($inning - 1) * 2 + 1;
            $bottomOrderNum = ($inning - 1) * 2 + 2;

            $topTarget = $machineMap[$topOrderNum] ?? null;
            $bottomTarget = $machineMap[$bottomOrderNum] ?? null;

            if ($topTarget) {
                // Away batter vs Home pitcher
                $runs = $this->calculateRunsForInningHalf($topTarget, $awayEntry, $homeEntry);
                $awayRuns += $runs;
            }

            if ($bottomTarget) {
                // Home batter vs Away pitcher
                $runs = $this->calculateRunsForInningHalf($bottomTarget, $homeEntry, $awayEntry);
                $homeRuns += $runs;
            }
        }

        // Update event matchup runs
        $status = 'pending';
        $winnerId = null;

        // Check if matchup is fully played/completed.
        // Matchup is completed if we have entries for all rounds, or if it is a completed status.
        // Wait, is it completed? If all inning entries are populated or TD locks it.
        // Usually, if scores are submitted for the last inning, we can mark it complete.
        // Let's say if we have scores for all innings:
        $fullyPlayed = true;
        for ($inning = 1; $inning <= $inningsCount; $inning++) {
            if (!isset($scoreMap[$homeId][$inning]) || !isset($scoreMap[$awayId][$inning])) {
                $fullyPlayed = false;
                break;
            }
        }

        if ($fullyPlayed && $hasScores) {
            $status = 'completed';
            if ($homeRuns > $awayRuns) {
                $winnerId = $homeId;
            } elseif ($awayRuns > $homeRuns) {
                $winnerId = $awayId;
            } else {
                $winnerId = null; // Tie
            }
        }

        $stmt = $pdo->prepare(
            'UPDATE event_matchups 
             SET home_runs = ?, away_runs = ?, winner_id = ?, status = ? 
             WHERE id = ?'
        );
        $stmt->execute([$homeRuns, $awayRuns, $winnerId, $status, $eventMatchupId]);

        if ($status === 'completed') {
            $this->playoffService->handlePlayoffAdvancement($eventMatchupId);
        }
    }



    /**
     * Inning half run calculator helper.
     */
    private function calculateRunsForInningHalf(array $target, array $batterEntry, array $pitcherEntry): int
    {
        $b1 = (int) ($batterEntry['ball1'] ?? 0);
        $b2 = (int) ($batterEntry['ball2'] ?? 0);
        $b3 = (int) ($batterEntry['ball3'] ?? 0);

        $p1 = (int) ($pitcherEntry['ball1'] ?? 0);
        $p2 = (int) ($pitcherEntry['ball2'] ?? 0);
        $p3 = (int) ($pitcherEntry['ball3'] ?? 0);

        $batterScores = [$b1, $b2, $b3];
        $pitcherScores = [$p1, $p2, $p3];

        $runsAccumulated = 0;
        $val1 = (int) ($target['value1'] ?? 5000000);
        $val2 = (float) ($target['value2'] ?? 1.5);

        // Build thresholds
        $thresholds = [];
        for ($rank = 1; $rank <= 10; $rank++) {
            $thresholds[$rank] = (int) round($val1 * pow($val2, $rank - 1));
        }

        for ($i = 0; $i < 3; $i++) {
            $diff = $batterScores[$i] - $pitcherScores[$i];
            if ($diff <= 0)
                continue;

            $totalPossibleRuns = 0;
            // Find max rank matching the diff
            for ($rank = 10; $rank >= 1; $rank--) {
                if ($diff >= $thresholds[$rank]) {
                    $totalPossibleRuns = $rank;
                    break;
                }
            }

            $marginal = max(0, $totalPossibleRuns - $runsAccumulated);
            $runsAccumulated += $marginal;
        }

        return $runsAccumulated;
    }

    /**
     * Delete a specific score.
     *
     * @param int $scoreId
     * @return bool
     */
    public function deleteScore(int $scoreId): bool
    {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM scores WHERE id = ?');
        return $stmt->execute([$scoreId]);
    }

    /**
     * Delete all scores for a player.
     *
     * @param int $playerId
     * @return bool
     */
    public function deletePlayerScores(int $playerId): bool
    {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM scores WHERE player_id = ?');
        return $stmt->execute([$playerId]);
    }

    /**
     * Delete all scores for an event.
     *
     * @param int $eventId
     * @return bool
     */
    public function deleteEventScores(int $eventId): bool
    {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM scores WHERE event_id = ?');
        return $stmt->execute([$eventId]);
    }

    /**
     * Delete all scores for a player in a specific event.
     *
     * @param int $eventId
     * @param int $playerId
     * @return bool
     */
    public function deletePlayerEventScores(int $eventId, int $playerId): bool
    {
        $pdo = $this->db->getPdo();
        $stmt = $pdo->prepare('DELETE FROM scores WHERE event_id = ? AND player_id = ?');
        return $stmt->execute([$eventId, $playerId]);
    }
}
