<?php

namespace App\Service;

use PDO;

/**
 * Single Source of Truth for Target Score Resolution across formats (Baseball, Golf, Bowling).
 *
 * Enforces the 4-tier precedence hierarchy:
 * 1. Location target for requested format (target_easy / target_med / target_hard)
 * 2. Master machine target for requested format
 * 3. Cross-format conversion fallback:
 *    - Baseball: Bowling (/ 10), Golf (/ 10)
 *    - Golf: Bowling (1:1), Baseball (* 10)
 *    - Bowling: Golf (1:1), Baseball (* 10)
 * 4. Format Defaults:
 *    - Baseball: 5,000,000 Medium (3,000,000 Easy, 10,000,000 Hard), multiplier 1.5
 *    - Golf & Bowling: 50,000,000 Medium (25,000,000 Easy, 100,000,000 Hard), multiplier 1.0
 */
class TargetResolver {

    /**
     * Central default configurations for each scoring format.
     */
    public const FORMAT_DEFAULTS = [
        'baseball' => [
            'easy' => 3000000,
            'medium' => 5000000,
            'hard' => 10000000,
            'multiplier' => 1.5,
        ],
        'golf' => [
            'easy' => 25000000,
            'medium' => 50000000,
            'hard' => 100000000,
            'multiplier' => 1.0,
        ],
        'bowling' => [
            'easy' => 25000000,
            'medium' => 50000000,
            'hard' => 100000000,
            'multiplier' => 1.0,
        ],
    ];

    /**
     * Resolves the target score baseline and multiplier for a machine.
     *
     * @param PDO         $pdo        Active PDO connection.
     * @param int         $machineId  ID of the machine.
     * @param string      $format     Scoring format ('baseball', 'golf', 'bowling').
     * @param string      $difficulty Difficulty level ('easy', 'medium', 'hard').
     * @param int|null    $locationId Optional location ID to narrow location targets.
     * @return array      ['value1' => int, 'value2' => float]
     */
    public static function resolveTarget(
        PDO $pdo,
        int $machineId,
        string $format = 'bowling',
        string $difficulty = 'medium',
        ?int $locationId = null
    ): array {
        $format = strtolower($format);
        $difficulty = strtolower($difficulty);
        $diffKey = in_array($difficulty, ['easy', 'med', 'medium', 'hard']) ? $difficulty : 'medium';
        $columnName = $diffKey === 'easy' ? 'target_easy' : ($diffKey === 'hard' ? 'target_hard' : 'target_med');

        // 1. Fetch location_machine_scores
        $locSql = "SELECT lms.format, lms.{$columnName} as score
                   FROM location_machine_scores lms
                   JOIN location_machines lm ON lms.location_machine_id = lm.id
                   WHERE lm.machine_id = ?";
        $params = [$machineId];
        if ($locationId) {
            $locSql .= " AND lm.location_id = ?";
            $params[] = $locationId;
        }
        $stmt = $pdo->prepare($locSql);
        $stmt->execute($params);
        $locRows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (!empty($r['score'])) {
                $locRows[strtolower($r['format'])] = (int)$r['score'];
            }
        }

        // 2. Fetch machine_scores
        $stmt = $pdo->prepare("SELECT format, {$columnName} as score FROM machine_scores WHERE machine_id = ?");
        $stmt->execute([$machineId]);
        $masterRows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (!empty($r['score'])) {
                $masterRows[strtolower($r['format'])] = (int)$r['score'];
            }
        }

        $baseline = self::applyPrecedence($format, $diffKey, $locRows, $masterRows);
        $multiplier = self::FORMAT_DEFAULTS[$format]['multiplier'] ?? 1.0;

        return [
            'value1' => $baseline,
            'value2' => $multiplier,
        ];
    }

    /**
     * Applies the 4-tier precedence rule across location and master targets.
     */
    private static function applyPrecedence(string $format, string $diffKey, array $locRows, array $masterRows): int {
        // Tier 1: Location score for format
        if (!empty($locRows[$format])) {
            return $locRows[$format];
        }

        // Tier 2: Master machine score for format
        if (!empty($masterRows[$format])) {
            return $masterRows[$format];
        }

        // Tier 3: Cross-format conversion fallback
        if ($format === 'baseball') {
            if (!empty($locRows['bowling'])) return (int)round($locRows['bowling'] / 10);
            if (!empty($masterRows['bowling'])) return (int)round($masterRows['bowling'] / 10);
            if (!empty($locRows['golf'])) return (int)round($locRows['golf'] / 10);
            if (!empty($masterRows['golf'])) return (int)round($masterRows['golf'] / 10);
        } elseif ($format === 'golf') {
            if (!empty($locRows['bowling'])) return $locRows['bowling'];
            if (!empty($masterRows['bowling'])) return $masterRows['bowling'];
            if (!empty($locRows['baseball'])) return $locRows['baseball'] * 10;
            if (!empty($masterRows['baseball'])) return $masterRows['baseball'] * 10;
        } else { // bowling
            if (!empty($locRows['golf'])) return $locRows['golf'];
            if (!empty($masterRows['golf'])) return $masterRows['golf'];
            if (!empty($locRows['baseball'])) return $locRows['baseball'] * 10;
            if (!empty($masterRows['baseball'])) return $masterRows['baseball'] * 10;
        }

        // Tier 4: Format Default
        $fmtConfig = self::FORMAT_DEFAULTS[$format] ?? self::FORMAT_DEFAULTS['bowling'];
        $diffNorm = ($diffKey === 'easy') ? 'easy' : (($diffKey === 'hard') ? 'hard' : 'medium');
        return $fmtConfig[$diffNorm] ?? 50000000;
    }
}
