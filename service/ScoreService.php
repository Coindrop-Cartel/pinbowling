<?php

namespace App\Service;

/**
 * Service managing player scores, recording new scores, and bulk score cleanup.
 */
class ScoreService
{
    private DatabaseService $db;
    private PlayoffService $playoffService;

    private const SCORE_COLUMNS = 's.id, s.player_id, s.event_id, s.event_matchup_id, s.order_number, s.machine_id, s.ball1, s.ball2, s.ball3, m.machine_name';

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
            'SELECT ' . self::SCORE_COLUMNS . '
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
                'SELECT ' . self::SCORE_COLUMNS . '
                 FROM scores s
                 JOIN machines m ON m.id = s.machine_id
                 WHERE s.player_id = ? AND s.event_id = ?
                 ORDER BY s.order_number ASC',
                [$playerId, $eventId]
            );
        } else {
            $stmt = $this->db->query(
                'SELECT ' . self::SCORE_COLUMNS . '
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
            'SELECT ' . self::SCORE_COLUMNS . '
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

        $player1Id = (int) $matchup['player1_id'];
        $player2Id = (int) $matchup['player2_id'];

        // Fetch detailed matchup slots (machine config, player roles)
        $stmt = $pdo->prepare('SELECT * FROM matchups WHERE event_matchup_id = ? ORDER BY order_number ASC');
        $stmt->execute([$eventMatchupId]);
        $slots = $stmt->fetchAll();

        // Detect team baseball: slots have player_id set (batting rotation)
        $isTeamMode = !empty($slots) && isset($slots[0]['player_id']) && $slots[0]['player_id'] !== null;

        if ($isTeamMode) {
            $this->updateTeamMatchupTotals($pdo, $matchup, $slots, $eventMatchupId);
            return;
        }

        // Individual mode: requires both player IDs
        if (!$player1Id || !$player2Id) {
            return; // BYE week or incomplete matchup
        }

        // Fetch all scores submitted for this matchup
        $scores = $this->getMatchupScores($eventMatchupId);

        // Structure scores by player and order_number (slot)
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

        $player1Score = 0;
        $player2Score = 0;

        // Number of rounds (each round = top + bottom)
        $roundsCount = (int) (count($slots) / 2);
        $hasScores = false;
        $isWalkoff = false;

        for ($round = 1; $round <= $roundsCount; $round++) {
            $topOrderNum    = ($round - 1) * 2 + 1;
            $bottomOrderNum = ($round - 1) * 2 + 2;

            $p1TopEntry    = $scoreMap[$player1Id][$topOrderNum]    ?? ['ball1' => 0, 'ball2' => 0, 'ball3' => 0];
            $p2TopEntry    = $scoreMap[$player2Id][$topOrderNum]    ?? ['ball1' => 0, 'ball2' => 0, 'ball3' => 0];
            $p1BottomEntry = $scoreMap[$player1Id][$bottomOrderNum] ?? ['ball1' => 0, 'ball2' => 0, 'ball3' => 0];
            $p2BottomEntry = $scoreMap[$player2Id][$bottomOrderNum] ?? ['ball1' => 0, 'ball2' => 0, 'ball3' => 0];

            if (
                isset($scoreMap[$player1Id][$topOrderNum]) ||
                isset($scoreMap[$player2Id][$topOrderNum]) ||
                isset($scoreMap[$player1Id][$bottomOrderNum]) ||
                isset($scoreMap[$player2Id][$bottomOrderNum])
            ) {
                $hasScores = true;
            }

            $defaultTarget = ['value1' => 5000000, 'value2' => 1.5];
            $topTarget    = $machineMap[$topOrderNum]    ?? $defaultTarget;
            $bottomTarget = $machineMap[$bottomOrderNum] ?? $defaultTarget;

            $topPlayed = isset($scoreMap[$player1Id][$topOrderNum]) || isset($scoreMap[$player2Id][$topOrderNum]);

            if ($topTarget) {
                // Top of round: Player 2 (Away) is batter, Player 1 (Home) is pitcher
                $runs = $this->calculateRunsForHalfRound($topTarget, $p2TopEntry, $p1TopEntry);
                $player2Score += $runs;
            }

            if ($bottomTarget) {
                // Bottom of round: Player 1 (Home) is batter, Player 2 (Away) is pitcher
                $isLastRound = ($round === $roundsCount);
                if ($isLastRound && $topPlayed && $player1Score > $player2Score) {
                    $isWalkoff = true;
                } else {
                    $runs = $this->calculateRunsForHalfRound($bottomTarget, $p1BottomEntry, $p2BottomEntry);
                    $player1Score += $runs;
                }
            }
        }

        // Check if matchup is fully played/completed.
        $fullyPlayed = true;
        for ($round = 1; $round <= $roundsCount; $round++) {
            $topOrderNum    = ($round - 1) * 2 + 1;
            $bottomOrderNum = ($round - 1) * 2 + 2;

            $isLastRound = ($round === $roundsCount);
            if ($isLastRound && $isWalkoff) {
                // For a walk-off bottom half-inning, we don't require player scores for bottomOrderNum
                if (
                    !isset($scoreMap[$player1Id][$topOrderNum]) ||
                    !isset($scoreMap[$player2Id][$topOrderNum])
                ) {
                    $fullyPlayed = false;
                    break;
                }
            } else {
                if (
                    !isset($scoreMap[$player1Id][$topOrderNum]) ||
                    !isset($scoreMap[$player2Id][$topOrderNum]) ||
                    !isset($scoreMap[$player1Id][$bottomOrderNum]) ||
                    !isset($scoreMap[$player2Id][$bottomOrderNum])
                ) {
                    $fullyPlayed = false;
                    break;
                }
            }
        }

        $status = 'pending';
        $winnerId = null;

        if ($fullyPlayed && $hasScores) {
            $status = 'completed';
            if ($player1Score > $player2Score) {
                $winnerId = $player1Id;
            } elseif ($player2Score > $player1Score) {
                $winnerId = $player2Id;
            } else {
                $winnerId = null; // Tie
            }
        }

        $stmt = $pdo->prepare(
            'UPDATE event_matchups 
             SET player1_score = ?, player2_score = ?, winner_id = ?, status = ? 
             WHERE id = ?'
        );
        $stmt->execute([$player1Score, $player2Score, $winnerId, $status, $eventMatchupId]);

        if ($status === 'completed') {
            $this->playoffService->handlePlayoffAdvancement($eventMatchupId);
        }
    }

    /**
     * Team baseball half-inning totals calculator.
     *
     * Each event_matchup represents one half-inning. Matchup rows have player_id
     * (the batter). Scores are keyed by player_id. Pitcher scores are 0 (not entered).
     */
    private function updateTeamMatchupTotals(PDO $pdo, array $matchup, array $slots, int $eventMatchupId): void
    {
        $scores = $this->getMatchupScores($eventMatchupId);
        $scoreMap = [];
        foreach ($scores as $s) {
            $scoreMap[(int) $s['player_id']][(int) $s['order_number']] = $s;
        }

        // Fetch target scores for this event
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

        $totalRuns = 0;
        $hasScores = false;
        $defaultTarget = ['value1' => 5000000, 'value2' => 1.5];

        foreach ($slots as $slot) {
            $orderNum = (int) $slot['order_number'];
            $batterId = (int) $slot['player_id'];
            $batterEntry = $scoreMap[$batterId][$orderNum] ?? null;

            if ($batterEntry) {
                $hasScores = true;
                $target = $machineMap[$orderNum] ?? $defaultTarget;
                $emptyPitcher = ['ball1' => 0, 'ball2' => 0, 'ball3' => 0];
                $totalRuns += $this->calculateRunsForHalfRound($target, $batterEntry, $emptyPitcher);
            }
        }

        $status = 'pending';
        $winnerId = null;

        if ($hasScores) {
            // Check if all slots have scores
            $allPlayed = true;
            foreach ($slots as $slot) {
                $orderNum = (int) $slot['order_number'];
                $batterId = (int) $slot['player_id'];
                if (!isset($scoreMap[$batterId][$orderNum])) {
                    $allPlayed = false;
                    break;
                }
            }
            if ($allPlayed) {
                $status = 'completed';
            }
        }

        // Store total runs in player1_score (batting team's runs for this half-inning)
        // winner_id: set to player1_id (home team) if completed, null if pending
        $stmt = $pdo->prepare(
            'UPDATE event_matchups
             SET player1_score = ?, winner_id = ?, status = ?
             WHERE id = ?'
        );
        $stmt->execute([$totalRuns, $winnerId, $status, $eventMatchupId]);

        if ($status === 'completed') {
            $this->playoffService->handlePlayoffAdvancement($eventMatchupId);
        }
    }

    /**
     * Half-round run calculator helper.
     */
    private function calculateRunsForHalfRound(array $target, array $batterEntry, array $pitcherEntry): int
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

        // Build thresholds, using stored score1-10 columns if present to avoid overflow/recalculation mismatches
        $thresholds = [];
        for ($rank = 1; $rank <= 10; $rank++) {
            $colName = 'score' . $rank;
            if (isset($target[$colName]) && (int)$target[$colName] > 0) {
                $thresholds[$rank] = (int)$target[$colName];
            } else {
                $threshold = $val1 * pow($val2, $rank - 1);
                if ($threshold > PHP_INT_MAX || $threshold < 0) {
                    $thresholds[$rank] = PHP_INT_MAX;
                } else {
                    $thresholds[$rank] = (int) round($threshold);
                }
            }
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
