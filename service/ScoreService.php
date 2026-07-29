<?php

namespace App\Service;

/**
 * Service managing player scores, recording new scores, and bulk score cleanup.
 */
class ScoreService
{
    use HalfRoundScoring;

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
     * @param int|null $player1Score Pre-computed matchup total for player1 (Home). When provided, skips server-side recalculation.
     * @param int|null $player2Score Pre-computed matchup total for player2 (Away). When provided, skips server-side recalculation.
     * @return bool
     */
    public function saveScore(
        int $eventId,
        ?int $playerId = null,
        int $machineId = 0,
        int $orderNumber = 0,
        ?int $ball1 = null,
        ?int $ball2 = null,
        ?int $ball3 = null,
        ?int $eventMatchupId = null,
        ?int $player1Score = null,
        ?int $player2Score = null
    ): bool {
        $pdo = $this->db;

        $stmt = $pdo->prepare('SELECT league_id, session_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $eventRow = $stmt->fetch();
        if (!$eventRow) {
            throw new \Exception('Event not found.');
        }
        $leagueId = $eventRow['league_id'];
        $sessionId = $eventRow['session_id'];

        if ($playerId) {
            $inRoster = false;

            if ($sessionId) {
                $stmt = $pdo->prepare('SELECT 1 FROM session_players WHERE session_id = ? AND player_id = ?');
                $stmt->execute([$sessionId, $playerId]);
                $inRoster = (bool)$stmt->fetchColumn();
                if (!$inRoster) {
                    $stmt2 = $pdo->prepare('SELECT 1 FROM players WHERE id = ?');
                    $stmt2->execute([$playerId]);
                    $inRoster = (bool)$stmt2->fetchColumn();
                }
            } elseif ($leagueId) {
                $stmt = $pdo->prepare(
                    'SELECT 1 FROM league_players WHERE league_id = ? AND player_id = ?'
                );
                $stmt->execute([$leagueId, $playerId]);
                $inRoster = (bool)$stmt->fetchColumn();
            }

            if (!$inRoster) {
                $stmt2 = $pdo->prepare('SELECT 1 FROM players WHERE id = ?');
                $stmt2->execute([$playerId]);
                if (!$stmt2->fetchColumn()) {
                    throw new \Exception('Player is not registered in this league.');
                }
            }
        }

        $stmt = $pdo->prepare(
            'INSERT INTO scores (event_id, event_matchup_id, player_id, machine_id, order_number, ball1, ball2, ball3)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ball1 = VALUES(ball1), ball2 = VALUES(ball2), ball3 = VALUES(ball3)'
        );

        $stmt->execute([$eventId, $eventMatchupId, $playerId, $machineId, $orderNumber, $ball1, $ball2, $ball3]);

        error_log("[PinBowling DEBUG] ScoreService::saveScore — INSERT id=$eventId order=$orderNumber player=$playerId machine=$machineId balls=$ball1/$ball2/$ball3 matchupId=$eventMatchupId");

        if ($eventMatchupId !== null) {
            error_log("[PinBowling DEBUG] ScoreService::saveScore — calling updateMatchupTotals for matchupId=$eventMatchupId player1Score=$player1Score player2Score=$player2Score");
            $this->updateMatchupTotals($eventMatchupId, $player1Score, $player2Score);
        }

        return true;
    }

    /**
     * Re-calculate runs and winner for a matchup once scores are updated.
     *
     * When pre-computed totals are provided (from the JS scoring engine), they are used
     * directly instead of re-calculating server-side. This eliminates the dual-implementation
     * risk between JS and PHP run calculations.
     *
     * @param int $eventMatchupId
     * @param int|null $player1Score Pre-computed total for player1 (Home)
     * @param int|null $player2Score Pre-computed total for player2 (Away)
     */
    private function updateMatchupTotals(int $eventMatchupId, ?int $player1Score = null, ?int $player2Score = null): void
    {
        $pdo = $this->db;

        $stmt = $pdo->prepare('SELECT * FROM event_matchups WHERE id = ?');
        $stmt->execute([$eventMatchupId]);
        $matchup = $stmt->fetch();
        if (!$matchup)
            return;

        $player1Id = (int)($matchup['player1_id'] ?? 0);
        $player2Id = (int)($matchup['player2_id'] ?? 0);

        $stmt = $pdo->prepare('SELECT * FROM matchups WHERE event_matchup_id = ? ORDER BY order_number ASC');
        $stmt->execute([$eventMatchupId]);
        $matchupRows = $stmt->fetchAll();

        // Use pre-computed totals when provided (single source of truth from JS engine)
        if ($player1Score !== null && $player2Score !== null) {
            $hasScores = ($player1Score > 0 || $player2Score > 0);

            error_log("[PinBowling DEBUG] ScoreService::updateMatchupTotals — PATH A (pre-computed) matchupId=$eventMatchupId player1Score=$player1Score player2Score=$player2Score hasScores=" . ($hasScores ? 'yes' : 'no'));

            $status = 'pending';
            $winnerId = null;

            if ($hasScores) {
                $scores = $this->getMatchupScores($eventMatchupId);
                $scoreMap = [];
                foreach ($scores as $s) {
                    $idKey = (int) ($s['player_id'] ?? 0);
                    $scoreMap[$idKey][(int) $s['order_number']] = $s;
                }

                $roundsCount = max(1, (int) (count($matchupRows) / 2));
                $isWalkoff = false;
                $allPlayed = true;
                for ($round = 1; $round <= $roundsCount; $round++) {
                    $topOrderNum    = ($round - 1) * 2 + 1;
                    $bottomOrderNum = ($round - 1) * 2 + 2;

                    $isLastRound = ($round === $roundsCount);
                    $topPlayed = (isset($scoreMap[$player1Id][$topOrderNum]) && isset($scoreMap[$player2Id][$topOrderNum]));
                    $bottomPlayed = (isset($scoreMap[$player1Id][$bottomOrderNum]) && isset($scoreMap[$player2Id][$bottomOrderNum]));

                    if ($isLastRound && $topPlayed && !$bottomPlayed && $player1Score > $player2Score) {
                        $isWalkoff = true;
                        break;
                    }

                    if (!$topPlayed || (!$bottomPlayed && !$isWalkoff)) {
                        $allPlayed = false;
                        break;
                    }
                }

                if ($allPlayed) {
                    $status = 'completed';
                    if ($player1Score > $player2Score) {
                        $winnerId = $player1Id;
                    } elseif ($player2Score > $player1Score) {
                        $winnerId = $player2Id;
                    }
                } elseif ($isWalkoff) {
                    $status = 'completed';
                    $winnerId = $player1Id;
                }

                error_log("[PinBowling DEBUG] ScoreService::updateMatchupTotals — PATH A results: allPlayed=" . ($allPlayed ? 'yes' : 'no') . " isWalkoff=" . ($isWalkoff ? 'yes' : 'no') . " winnerId=$winnerId status=$status");
            }

            $stmt = $pdo->prepare(
                'UPDATE event_matchups 
                 SET player1_score = ?, player2_score = ?, player_winner_id = ?, status = ? 
                 WHERE id = ?'
            );
            $stmt->execute([$player1Score, $player2Score, $winnerId, $status, $eventMatchupId]);

            error_log("[PinBowling DEBUG] ScoreService::updateMatchupTotals — PATH A executed UPDATE event_matchups SET player1_score=$player1Score player2_score=$player2Score winner=$winnerId status=$status WHERE id=$eventMatchupId");

            if ($status === 'completed') {
                $this->playoffService->handlePlayoffAdvancement($eventMatchupId);
            }
            return;
        }

        // Fallback: server-side calculation when no pre-computed totals provided
        if (!$player1Id || !$player2Id) {
            error_log("[PinBowling DEBUG] ScoreService::updateMatchupTotals — PATH B aborted: missing player IDs (p1Id=$player1Id p2Id=$player2Id)");
            return;
        }

        $scores = $this->getMatchupScores($eventMatchupId);

        error_log("[PinBowling DEBUG] ScoreService::updateMatchupTotals — PATH B (fallback) matchupId=$eventMatchupId p1Id=$player1Id p2Id=$player2Id scoresCount=" . count($scores) . " matchupRowsCount=" . count($matchupRows));

        $scoreMap = [];
        foreach ($scores as $s) {
            $idKey = (int) ($s['player_id'] ?? 0);
            $scoreMap[$idKey][(int) $s['order_number']] = $s;
            error_log("[PinBowling DEBUG] ScoreService::updateMatchupTotals — scoreMap[player=$idKey][order={$s['order_number']}] = ball1={$s['ball1']} ball2={$s['ball2']} ball3={$s['ball3']}");
        }

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

        $roundsCount = (int) (count($matchupRows) / 2);
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

            $topPlayed = isset($scoreMap[$player1Id][$topOrderNum]) && isset($scoreMap[$player2Id][$topOrderNum]);

            if ($topTarget) {
                $runs = $this->calculateRunsForHalfRound($topTarget, $p2TopEntry, $p1TopEntry);
                $player2Score += $runs;
            }

            if ($bottomTarget) {
                $isLastRound = ($round === $roundsCount);
                if ($isLastRound && $topPlayed && $player1Score > $player2Score) {
                    $isWalkoff = true;
                } else {
                    $runs = $this->calculateRunsForHalfRound($bottomTarget, $p1BottomEntry, $p2BottomEntry);
                    $player1Score += $runs;
                }
            }
        }

        error_log("[PinBowling DEBUG] ScoreService::updateMatchupTotals — PATH B computed: player1Score=$player1Score player2Score=$player2Score hasScores=" . ($hasScores ? 'yes' : 'no') . " isWalkoff=" . ($isWalkoff ? 'yes' : 'no') . " roundsCount=$roundsCount");

        $fullyPlayed = true;
        for ($round = 1; $round <= $roundsCount; $round++) {
            $topOrderNum    = ($round - 1) * 2 + 1;
            $bottomOrderNum = ($round - 1) * 2 + 2;

            $isLastRound = ($round === $roundsCount);
            if ($isLastRound && $isWalkoff) {
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
                $winnerId = null;
            }
        }

        error_log("[PinBowling DEBUG] ScoreService::updateMatchupTotals — PATH B final: UPDATE event_matchups SET p1Score=$player1Score p2Score=$player2Score winner=$winnerId status=$status fullyPlayed=" . ($fullyPlayed ? 'yes' : 'no') . " WHERE id=$eventMatchupId");

        $stmt = $pdo->prepare(
            'UPDATE event_matchups 
             SET player1_score = ?, player2_score = ?, player_winner_id = ?, status = ? 
             WHERE id = ?'
        );
        $stmt->execute([$player1Score, $player2Score, $winnerId, $status, $eventMatchupId]);

        if ($status === 'completed') {
            $this->playoffService->handlePlayoffAdvancement($eventMatchupId);
        }
    }

    /**
     * Delete all scores for a player.
     *
     * @param int $playerId
     * @return bool
     */
    public function deletePlayerScores(int $playerId): bool
    {
        $pdo = $this->db;
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
        $pdo = $this->db;
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
        $pdo = $this->db;
        $stmt = $pdo->prepare('DELETE FROM scores WHERE event_id = ? AND player_id = ?');
        return $stmt->execute([$eventId, $playerId]);
    }
}
