<?php

namespace App\Service;

class TeamScoreService
{
    use HalfRoundScoring;

    private DatabaseService $db;
    private TeamPlayoffService $teamPlayoffService;

    public function __construct(DatabaseService $db, TeamPlayoffService $teamPlayoffService)
    {
        $this->db = $db;
        $this->teamPlayoffService = $teamPlayoffService;
    }

    public function saveTeamScore(
        int $eventId,
        int $teamId,
        int $machineId,
        int $orderNumber,
        ?int $ball1 = null,
        ?int $ball2 = null,
        ?int $ball3 = null,
        ?int $teamEventMatchupId = null,
        ?int $ball1PlayerId = null,
        ?int $ball2PlayerId = null,
        ?int $ball3PlayerId = null,
        ?int $team1Score = null,
        ?int $team2Score = null
    ): bool {
        $pdo = $this->db;

        $stmt = $pdo->prepare('SELECT league_id FROM events WHERE id = ?');
        $stmt->execute([$eventId]);
        $leagueId = $stmt->fetchColumn();
        if (!$leagueId) {
            throw new \Exception('Event not found.');
        }

        $stmt = $pdo->prepare('SELECT 1 FROM league_teams WHERE league_id = ? AND team_id = ?');
        $stmt->execute([$leagueId, $teamId]);
        if (!$stmt->fetchColumn()) {
            throw new \Exception('Team is not registered in this league.');
        }

        $existingId = null;
        if ($teamEventMatchupId !== null) {
            $checkStmt = $pdo->prepare('SELECT id FROM team_scores WHERE team_event_matchup_id = ? AND team_id = ? AND order_number = ?');
            $checkStmt->execute([$teamEventMatchupId, $teamId, $orderNumber]);
            $existingId = $checkStmt->fetchColumn();
        }

        $action = $existingId ? 'UPDATE' : 'INSERT';
        if ($existingId) {
            $stmt = $pdo->prepare(
                'UPDATE team_scores SET machine_id = ?, ball1 = ?, ball1_player_id = ?, ball2 = ?, ball2_player_id = ?, ball3 = ?, ball3_player_id = ? WHERE id = ?'
            );
            $stmt->execute([$machineId, $ball1, $ball1PlayerId, $ball2, $ball2PlayerId, $ball3, $ball3PlayerId, $existingId]);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO team_scores (team_event_matchup_id, team_id, machine_id, order_number, ball1, ball1_player_id, ball2, ball2_player_id, ball3, ball3_player_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmt->execute([$teamEventMatchupId, $teamId, $machineId, $orderNumber, $ball1, $ball1PlayerId, $ball2, $ball2PlayerId, $ball3, $ball3PlayerId]);
        }

        error_log("[PinBowling DEBUG] TeamScoreService::saveTeamScore — {$action} teamId=$teamId eventId=$eventId order=$orderNumber machine=$machineId balls=$ball1/$ball2/$ball3 ballPlayers=$ball1PlayerId/$ball2PlayerId/$ball3PlayerId temId=$teamEventMatchupId");

        if ($teamEventMatchupId !== null) {
            $this->updateTeamMatchupTotals($pdo, $teamEventMatchupId);
        }

        return true;
    }

    public function updateTeamMatchupTotals($pdo, int $teamEventMatchupId): void
    {
        $stmt = $pdo->prepare('SELECT * FROM team_event_matchups WHERE id = ?');
        $stmt->execute([$teamEventMatchupId]);
        $game = $stmt->fetch();
        if (!$game) {
            error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — temId=$teamEventMatchupId NOT FOUND, aborting");
            return;
        }

        $eventId = (int)$game['event_id'];
        $homeTeamId = (int)$game['team1_id'];
        $awayTeamId = (int)$game['team2_id'];

        error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — START temId=$teamEventMatchupId eventId=$eventId home=$homeTeamId away=$awayTeamId");

        // Load team_matchups entries in order_number sequence
        $stmt = $pdo->prepare(
            'SELECT tm.* FROM team_matchups tm WHERE tm.team_event_matchup_id = ? ORDER BY tm.order_number ASC'
        );
        $stmt->execute([$teamEventMatchupId]);
        $entries = $stmt->fetchAll();

        // Load machine targets
        $stmt = $pdo->prepare(
            'SELECT ts.*, m.machine_name FROM target_scores ts JOIN machines m ON ts.machine_id = m.id WHERE ts.event_id = ?'
        );
        $stmt->execute([$eventId]);
        $targetByMachine = [];
        foreach ($stmt->fetchAll() as $mac) {
            $targetByMachine[(int)$mac['machine_id']] = $mac;
        }

        // Load all team_scores for this game
        $stmt = $pdo->prepare(
            'SELECT * FROM team_scores WHERE team_event_matchup_id = ?'
        );
        $stmt->execute([$teamEventMatchupId]);
        $allTeamScores = $stmt->fetchAll();

        $scoresByTeamAndOrder = [];
        foreach ($allTeamScores as $ts) {
            $key = (int)$ts['team_id'] . '_' . (int)$ts['order_number'];
            if (!isset($scoresByTeamAndOrder[$key])) {
                $scoresByTeamAndOrder[$key] = $ts;
            }
        }

        error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — entries=" . count($entries) . " teamScores=" . count($allTeamScores));

        $runningHomeRuns = 0;
        $runningAwayRuns = 0;
        $totalEntries = count($entries);

        for ($i = 0; $i < $totalEntries; $i++) {
            $entry = $entries[$i];
            $orderNum = (int)$entry['order_number'];
            $isTop = ($orderNum % 2 === 1);
            $isLastEntry = ($i === $totalEntries - 1);

            // team_matchups encodes: team1_id = pitcher, team2_id = batter
            $pitchingTeamId = (int)$entry['team1_id'];
            $battingTeamId = (int)$entry['team2_id'];

            error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — entry #$i: orderNum=$orderNum isTop=" . ($isTop ? 'yes' : 'no') . " pitcher=$pitchingTeamId batter=$battingTeamId lastEntry=" . ($isLastEntry ? 'yes' : 'no') . " runs: home=$runningHomeRuns away=$runningAwayRuns");

            // Walk-off: bottom of last inning when home already leads
            if (!$isTop && $isLastEntry && $runningHomeRuns > $runningAwayRuns) {
                error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — WALK-OFF orderNum=$orderNum home already leading $runningHomeRuns-$runningAwayRuns");
                continue;
            }

            $batterKey = $battingTeamId . '_' . $orderNum;
            $scoreEntry = $scoresByTeamAndOrder[$batterKey] ?? null;

            $pitcherKey = $pitchingTeamId . '_' . $orderNum;
            $pitcherScoreEntry = $scoresByTeamAndOrder[$pitcherKey] ?? null;

            error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — batterKey=$batterKey found=" . ($scoreEntry ? 'yes' : 'no') . " pitcherKey=$pitcherKey found=" . ($pitcherScoreEntry ? 'yes' : 'no'));

            if ($scoreEntry && (
                (int)($scoreEntry['ball1'] ?? 0) > 0 ||
                (int)($scoreEntry['ball2'] ?? 0) > 0 ||
                (int)($scoreEntry['ball3'] ?? 0) > 0
            )) {
                $machineId = (int)$entry['machine_id'];
                if (isset($targetByMachine[$machineId])) {
                    $target = $targetByMachine[$machineId];
                } else {
                    $resolved = \App\Service\TargetResolver::resolveTarget($pdo, $machineId, 'baseball', 'medium');
                    $target = ['value1' => $resolved['value1'] ?? 5000000, 'value2' => $resolved['value2'] ?? 1.5];
                }

                $batterScores = [
                    'ball1' => (int)($scoreEntry['ball1'] ?? 0),
                    'ball2' => (int)($scoreEntry['ball2'] ?? 0),
                    'ball3' => (int)($scoreEntry['ball3'] ?? 0),
                ];
                $pitcherScores = $pitcherScoreEntry ? [
                    'ball1' => (int)($pitcherScoreEntry['ball1'] ?? 0),
                    'ball2' => (int)($pitcherScoreEntry['ball2'] ?? 0),
                    'ball3' => (int)($pitcherScoreEntry['ball3'] ?? 0),
                ] : ['ball1' => 0, 'ball2' => 0, 'ball3' => 0];

                $runs = $this->calculateRunsForHalfRound($target, $batterScores, $pitcherScores);
                error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — runs computed: $runs (batter=" . json_encode($batterScores) . " pitcher=" . json_encode($pitcherScores) . ")");

                if ($battingTeamId === $homeTeamId) {
                    $runningHomeRuns += $runs;
                } else {
                    $runningAwayRuns += $runs;
                }
            } else {
                error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — no batting scores for orderNum=$orderNum");
            }
        }

        // Write final game totals to the single temId row
        $winnerId = null;
        if ($runningHomeRuns > $runningAwayRuns) {
            $winnerId = $homeTeamId;
        } elseif ($runningAwayRuns > $runningHomeRuns) {
            $winnerId = $awayTeamId;
        }

        $stmt = $pdo->prepare(
            'UPDATE team_event_matchups SET team1_score = ?, team2_score = ?, team_winner_id = ?, status = ? WHERE id = ?'
        );
        $status = ($runningHomeRuns > 0 || $runningAwayRuns > 0) ? 'completed' : 'pending';
        $stmt->execute([$runningHomeRuns, $runningAwayRuns, $winnerId, $status, $teamEventMatchupId]);
        error_log("[PinBowling DEBUG] TeamScoreService::updateTeamMatchupTotals — FINAL: temId=$teamEventMatchupId home($homeTeamId)=$runningHomeRuns away($awayTeamId)=$runningAwayRuns winner=$winnerId status=$status");

        if ($status === 'completed') {
            $this->teamPlayoffService->handlePlayoffAdvancement($teamEventMatchupId);
        }
    }

    public function getEventTeamScores(int $eventId): array
    {
        $stmt = $this->db->query(
            'SELECT ts.*, m.machine_name, tem.event_id
             FROM team_scores ts
             JOIN team_event_matchups tem ON ts.team_event_matchup_id = tem.id
             JOIN machines m ON ts.machine_id = m.id
             WHERE tem.event_id = ?',
            [$eventId]
        );
        return $stmt->fetchAll();
    }

    public function getTeamEventMatchupScores(int $teamEventMatchupId): array
    {
        $stmt = $this->db->query(
            'SELECT ts.*, m.machine_name
             FROM team_scores ts
             JOIN machines m ON ts.machine_id = m.id
             WHERE ts.team_event_matchup_id = ?',
            [$teamEventMatchupId]
        );
        return $stmt->fetchAll();
    }
}
