<?php

namespace App\Service;

class TeamScoreService
{
    private DatabaseService $db;

    public function __construct(DatabaseService $db)
    {
        $this->db = $db;
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
        ?int $ball3PlayerId = null
    ): bool {
        $pdo = $this->db->getPdo();

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

        if ($teamEventMatchupId !== null) {
            $this->updateTeamMatchupTotals($pdo, $teamEventMatchupId);
        }

        return true;
    }

    public function updateTeamMatchupTotals($pdo, int $teamEventMatchupId): void
    {
        $stmt = $pdo->prepare('SELECT * FROM team_event_matchups WHERE id = ?');
        $stmt->execute([$teamEventMatchupId]);
        $targetMatchup = $stmt->fetch();
        if (!$targetMatchup) return;

        $eventId = (int)$targetMatchup['event_id'];

        $stmt = $pdo->prepare('SELECT * FROM team_event_matchups WHERE event_id = ? ORDER BY id ASC');
        $stmt->execute([$eventId]);
        $allHalfMatchups = $stmt->fetchAll();

        $stmt = $pdo->prepare(
            'SELECT ts.*, m.machine_name FROM target_scores ts JOIN machines m ON ts.machine_id = m.id WHERE ts.event_id = ?'
        );
        $stmt->execute([$eventId]);
        $machines = $stmt->fetchAll();
        $targetByMachine = [];
        foreach ($machines as $mac) {
            $machineId = (int) $mac['machine_id'];
            if (!isset($targetByMachine[$machineId])) {
                $targetByMachine[$machineId] = $mac;
            }
        }

        $stmt = $pdo->prepare(
            'SELECT ts.* FROM team_scores ts JOIN team_event_matchups tem ON ts.team_event_matchup_id = tem.id WHERE tem.event_id = ? ORDER BY ts.id DESC'
        );
        $stmt->execute([$eventId]);
        $allTeamScores = $stmt->fetchAll();

        $scoresByHalfMatchupAndTeam = [];
        foreach ($allTeamScores as $ts) {
            $temId = (int)$ts['team_event_matchup_id'];
            $teamId = (int)$ts['team_id'];
            $key = "{$temId}_{$teamId}";
            if (!isset($scoresByHalfMatchupAndTeam[$key])) {
                $scoresByHalfMatchupAndTeam[$key] = $ts;
            }
        }

        $runningHomeRuns = 0;
        $runningAwayRuns = 0;
        $totalHalfInnings = count($allHalfMatchups);

        for ($i = 0; $i < $totalHalfInnings; $i++) {
            $half = $allHalfMatchups[$i];
            $halfId = (int)$half['id'];
            $roundName = $half['round_name'] ?? '';
            $isTop = str_starts_with($roundName, 'Top');
            $team1Id = (int)$half['team1_id']; // Home
            $team2Id = (int)$half['team2_id']; // Away
            $battingTeamId = $isTop ? $team2Id : $team1Id;
            $isLastHalf = ($i === $totalHalfInnings - 1);

            // Walk-off check: bottom of last inning when home team is already leading
            if (!$isTop && $isLastHalf && $runningHomeRuns > $runningAwayRuns) {
                $stmt = $pdo->prepare(
                    'UPDATE team_event_matchups SET team1_score = 0, team2_score = 0, team_winner_id = ?, status = ? WHERE id = ?'
                );
                $stmt->execute([$team1Id, 'completed', $halfId]);
                continue;
            }

            $lookupKey = "{$halfId}_{$battingTeamId}";
            $scoreEntry = $scoresByHalfMatchupAndTeam[$lookupKey] ?? null;

            $pitchingTeamId = $isTop ? $team1Id : $team2Id;
            $pitcherLookupKey = "{$halfId}_{$pitchingTeamId}";
            $pitcherScoreEntry = $scoresByHalfMatchupAndTeam[$pitcherLookupKey] ?? null;

            if ($scoreEntry && (
                (int)($scoreEntry['ball1'] ?? 0) > 0 ||
                (int)($scoreEntry['ball2'] ?? 0) > 0 ||
                (int)($scoreEntry['ball3'] ?? 0) > 0
            )) {
                $machineId = (int)$scoreEntry['machine_id'];
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

                if ($isTop) {
                    $runningAwayRuns += $runs;
                    $stmt = $pdo->prepare(
                        'UPDATE team_event_matchups SET team2_score = ?, status = ? WHERE id = ?'
                    );
                    $stmt->execute([$runs, 'completed', $halfId]);
                } else {
                    $runningHomeRuns += $runs;
                    $stmt = $pdo->prepare(
                        'UPDATE team_event_matchups SET team1_score = ?, status = ? WHERE id = ?'
                    );
                    $stmt->execute([$runs, 'completed', $halfId]);
                }
            } else {
                $stmt = $pdo->prepare(
                    'UPDATE team_event_matchups SET status = ? WHERE id = ?'
                );
                $stmt->execute(['pending', $halfId]);
            }
        }
    }

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
