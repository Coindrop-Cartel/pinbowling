<?php

namespace App\Service;

/**
 * Shared half-round run calculation logic extracted from ScoreService
 * and TeamScoreService to eliminate the exact copy-paste.
 */
trait HalfRoundScoring
{
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
}
