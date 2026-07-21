<?php

namespace App\Includes;

/**
 * Data serialization helpers to ensure consistent API response shapes.
 */
class Serializer {

    /**
     * Normalizes a player database row into a standardized associative array.
     * 
     * @param array $row Database row from players table joined with users.
     * @return array Standardized player object.
     */
    public static function player($row) {
        return [
            'id' => isset($row['id']) ? (int)$row['id'] : null,
            'playerName' => $row['player_name'] ?? null,
            'ifpaId' => $row['ifpa_id'] ?? null,
            'matchplayId' => $row['matchplay_id'] ?? null,
            'userRole' => $row['role'] ?? null,
            'username' => $row['username'] ?? null,
            'email' => $row['email'] ?? null,
            'userId' => isset($row['user_id']) ? (int)$row['user_id'] : null
        ];
    }

    /**
     * Normalizes a location database row.
     */
    public static function location($row) {
        return [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'city' => $row['city'] ?? null,
            'state' => $row['state'] ?? null,
            'machines' => self::locationMachinesGrouped($row['machines'] ?? [])
        ];
    }

    /**
     * Groups flat location_machine rows (from a JOIN with location_machine_scores)
     * into machine objects with a `scores` map keyed by format.
     */
    public static function locationMachinesGrouped(array $rows): array {
        $grouped = [];
        foreach ($rows as $row) {
            $lmId = (int)$row['id'];
            if (!isset($grouped[$lmId])) {
                $grouped[$lmId] = [
                    'id' => $lmId,
                    'locationId' => isset($row['location_id']) ? (int)$row['location_id'] : null,
                    'machineId' => (int)$row['machine_id'],
                    'machineName' => $row['machine_name'] ?? null,
                    'format' => $row['format'] ?? 'bowling',
                    'targetEasy' => (int)($row['target_easy'] ?? 0),
                    'targetMed' => (int)($row['target_med'] ?? 0),
                    'targetHard' => (int)($row['target_hard'] ?? 0),
                    'scores' => [],
                ];
            }
            $fmt = $row['format'] ?? 'bowling';
            $grouped[$lmId]['scores'][$fmt] = [
                'targetEasy' => (int)($row['target_easy'] ?? 0),
                'targetMed' => (int)($row['target_med'] ?? 0),
                'targetHard' => (int)($row['target_hard'] ?? 0),
            ];
        }
        foreach ($grouped as &$g) {
            if (empty($g['scores'])) {
                $g['scores'] = (object)[];
            }
        }
        return array_values($grouped);
    }

    /**
     * Normalizes a league database row.
     */
    public static function league($row) {
        return [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'type' => $row['type'] ?? 'standard',
            'participants' => $row['participants'] ?? 'individual',
            'startDate' => $row['start_date'] ?? null,
            'scoringFormat' => $row['scoring_format'] ?? 'bowling',
            'seasonScoring' => $row['season_scoring'] ?? 'weekly',
            'dropLowestWeeks' => (int)($row['drop_lowest_weeks'] ?? 0),
            'weeklyPoints' => isset($row['weekly_points']) ? (int)$row['weekly_points'] : null,
            'pointSpread' => isset($row['point_spread']) ? (int)$row['point_spread'] : null,
            'weeksInSeason' => isset($row['weeks_in_season']) && $row['weeks_in_season'] !== null ? (int)$row['weeks_in_season'] : null,
            'matchupsPerGame' => isset($row['matchups_per_game']) && $row['matchups_per_game'] !== null ? (int)$row['matchups_per_game'] : null,
            'inningsPerGame' => isset($row['matchups_per_game']) && $row['matchups_per_game'] !== null ? (int)$row['matchups_per_game'] : null,
            'status' => $row['status'] ?? 'setup',
            'playoffSeriesLength' => isset($row['playoff_series_length']) ? (int)$row['playoff_series_length'] : 1,
            'events' => isset($row['events']) ? array_map([self::class, 'event'], $row['events']) : [],
            'players' => isset($row['players']) ? array_map([self::class, 'player'], $row['players']) : [],
            'teams' => isset($row['teams']) ? array_map([self::class, 'team'], $row['teams']) : [],
            'locationIds' => $row['location_ids'] ?? []
        ];
    }

    /**
     * Normalizes an event database row.
     */
    public static function event($row) {
        return [
            'id' => (int)$row['id'],
            'leagueId' => (int)$row['league_id'],
            'locationId' => isset($row['location_id']) ? (int)$row['location_id'] : null,
            'eventName' => $row['event_name'],
            'eventDate' => $row['event_date'] ?? null,
            'scoringFormat' => $row['scoring_format'] ?? 'bowling',
            'locationName' => $row['location_name'] ?? null,
            'matchups' => isset($row['matchups']) ? array_map([self::class, 'eventMatchup'], $row['matchups']) : []
        ];
    }

    /**
     * Normalizes a score database row.
     */
    public static function score($row) {
        return [
            'id' => (int)$row['id'],
            'playerId' => (int)$row['player_id'],
            'eventId' => (int)($row['event_id'] ?? 0),
            'eventMatchupId' => (isset($row['event_matchup_id']) && $row['event_matchup_id'] !== null) ? (int)$row['event_matchup_id'] : null,
            'orderNumber' => (int)$row['order_number'],
            'machineId' => (int)$row['machine_id'],
            'machineName' => $row['machine_name'] ?? null,
            'ball1' => (int)$row['ball1'],
            'ball2' => (int)$row['ball2'],
            'ball3' => (int)$row['ball3'],
            'status' => $row['status'] ?? 'approved'
        ];
    }

    /**
     * Groups flat master machine rows (from a JOIN with machine_scores)
     * into machine objects with a `scores` map keyed by format.
     */
    public static function masterMachinesGrouped(array $rows): array {
        $grouped = [];
        foreach ($rows as $row) {
            $mId = (int)$row['id'];
            if (!isset($grouped[$mId])) {
                $grouped[$mId] = [
                    'id' => $mId,
                    'machineName' => $row['machine_name'],
                    'year' => $row['year'] ? (int)$row['year'] : null,
                    'manufacturer' => $row['manufacturer'] ?? null,
                    'scores' => [],
                ];
            }
            if (isset($row['format']) && $row['format'] !== null) {
                $fmt = $row['format'];
                $grouped[$mId]['scores'][$fmt] = [
                    'targetEasy' => (int)($row['target_easy'] ?? 0),
                    'targetMed' => (int)($row['target_med'] ?? 0),
                    'targetHard' => (int)($row['target_hard'] ?? 0),
                ];
            }
        }
        foreach ($grouped as &$g) {
            if (empty($g['scores'])) {
                $g['scores'] = (object)[];
            }
        }
        return array_values($grouped);
    }

    /**
     * Normalizes a master machine registry row/rows.
     */
    public static function masterMachine($rows) {
        if (empty($rows)) return null;
        if (!isset($rows[0]) || !is_array($rows[0])) {
            $rows = [$rows];
        }
        $grouped = self::masterMachinesGrouped($rows);
        return $grouped[0] ?? null;
    }

    /**
     * Normalizes a target score row used in event configurations.
     */
    public static function targetScore($row) {
        return [
            'id' => (int)$row['id'],
            'eventId' => (int)$row['event_id'],
            'machineId' => (int)$row['machine_id'],
            'machineName' => $row['machine_name'] ?? null,
            'orderNumber' => (int)$row['order_number'],
            'value1' => (int)($row['value1'] ?? 0),
            'value2' => (float)($row['value2'] ?? 0),
            'values' => [
                1 => (int)($row['score1'] ?? 0),
                2 => (int)($row['score2'] ?? 0),
                3 => (int)($row['score3'] ?? 0),
                4 => (int)($row['score4'] ?? 0),
                5 => (int)($row['score5'] ?? 0),
                6 => (int)($row['score6'] ?? 0),
                7 => (int)($row['score7'] ?? 0),
                8 => (int)($row['score8'] ?? 0),
                9 => (int)($row['score9'] ?? 0),
                10 => (int)($row['score10'] ?? 0),
            ]
        ];
    }

    /**
     * Normalizes a team database row including its members.
     */
    public static function team($row) {
        return [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'city' => $row['city'] ?? null,
            'state' => $row['state'] ?? null,
            'members' => array_map(function($m) {
                return [
                    'id' => (int)$m['id'],
                    'playerName' => $m['player_name']
                ];
            }, $row['members'] ?? [])
        ];
    }

    /**
     * Normalizes a matchup database row.
     */
    public static function matchup($row) {
        return [
            'id' => (int)$row['id'],
            'eventMatchupId' => (isset($row['event_matchup_id']) && $row['event_matchup_id'] !== null) ? (int)$row['event_matchup_id'] : null,
            'orderNumber' => (int)$row['order_number'],
            'machineId' => (int)$row['machine_id'],
            'machineName' => $row['machine_name'] ?? null
        ];
    }

    /**
     * Normalizes an event matchup database row.
     */
    public static function eventMatchup($row) {
        return [
            'id' => (int)$row['id'],
            'eventId' => (int)$row['event_id'],
            'leagueId' => isset($row['league_id']) ? (int)$row['league_id'] : null,
            'player1Id' => (int)$row['player1_id'],
            'player2Id' => (isset($row['player2_id']) && $row['player2_id'] !== null) ? (int)$row['player2_id'] : null,
            'player1Name' => $row['player1_name'] ?? null,
            'player2Name' => $row['player2_name'] ?? null,
            'player1Score' => (int)($row['player1_score'] ?? 0),
            'player2Score' => (int)($row['player2_score'] ?? 0),
            'winnerId' => (isset($row['winner_id']) && $row['winner_id'] !== null) ? (int)$row['winner_id'] : null,
            'status' => $row['status'] ?? 'pending',
            'gameNumber' => (int)($row['game_number'] ?? 1),
            'roundName' => $row['round_name'] ?? null,
            'seriesId' => isset($row['series_id']) ? (int)$row['series_id'] : null
        ];
    }
}
