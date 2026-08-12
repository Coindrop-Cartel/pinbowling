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
            'ifpaRating' => isset($row['ifpa_rating']) && $row['ifpa_rating'] !== null ? (float)$row['ifpa_rating'] : null,
            'ifpaRanking' => isset($row['ifpa_ranking']) && $row['ifpa_ranking'] !== null ? (int)$row['ifpa_ranking'] : null,
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
            'competitionFormat' => $row['competition_format'] ?? 'group',
            'participationType' => $row['participation_type'] ?? 'individual',
            'teamSize' => isset($row['team_size']) ? (int)$row['team_size'] : 1,
            'startDate' => $row['start_date'] ?? null,
            'scoringFormat' => $row['scoring_format'] ?? 'bowling',
            'seasonScoring' => $row['season_scoring'] ?? 'weekly',
            'dropLowestWeeks' => (int)($row['drop_lowest_weeks'] ?? 0),
            'dropLowestPlayerScores' => (int)($row['drop_lowest_player_scores'] ?? 0),
            'weeklyPoints' => isset($row['weekly_points']) ? (int)$row['weekly_points'] : null,
            'pointSpread' => isset($row['point_spread']) ? (int)$row['point_spread'] : null,
            'weeksInSeason' => isset($row['weeks_in_season']) && $row['weeks_in_season'] !== null ? (int)$row['weeks_in_season'] : null,
            'roundsPerGame' => isset($row['rounds_per_game']) && $row['rounds_per_game'] !== null ? (int)$row['rounds_per_game'] : null,
            'matchupsPerRound' => isset($row['matchups_per_round']) && $row['matchups_per_round'] !== null ? (int)$row['matchups_per_round'] : null,
            'status' => $row['status'] ?? 'setup',
            'playoffSeriesLength' => isset($row['playoff_series_length']) ? (int)$row['playoff_series_length'] : 1,
            'events' => isset($row['events']) ? array_map([self::class, 'event'], $row['events']) : [],
            'players' => isset($row['players']) ? array_map([self::class, 'player'], $row['players']) : [],
            'teams' => isset($row['teams']) ? array_map([self::class, 'team'], $row['teams']) : [],
            'locationIds' => $row['location_ids'] ?? []
        ];
    }

    /**
     * Normalizes a session database row.
     */
    public static function session($row) {
        return [
            'id' => (int)$row['id'],
            'name' => $row['name'],
            'scoringFormat' => $row['scoring_format'] ?? 'bowling',
            'competitionFormat' => $row['competition_format'] ?? 'group',
            'participationType' => $row['participation_type'] ?? 'individual',
            'teamSize' => isset($row['team_size']) ? (int)$row['team_size'] : 1,
            'roundsPerGame' => isset($row['rounds_per_game']) && $row['rounds_per_game'] !== null ? (int)$row['rounds_per_game'] : null,
            'matchupsPerRound' => isset($row['matchups_per_round']) && $row['matchups_per_round'] !== null ? (int)$row['matchups_per_round'] : null,
            'locationId' => isset($row['location_id']) ? (int)$row['location_id'] : null,
            'createdAt' => $row['created_at'] ?? null,
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
            'leagueId' => isset($row['league_id']) && $row['league_id'] !== null ? (int)$row['league_id'] : null,
            'sessionId' => isset($row['session_id']) && $row['session_id'] !== null ? (int)$row['session_id'] : null,
            'locationId' => isset($row['location_id']) ? (int)$row['location_id'] : null,
            'eventName' => $row['event_name'],
            'eventDate' => $row['event_date'] ?? null,
            'scoringFormat' => $row['scoring_format'] ?? 'bowling',
            'locationName' => $row['location_name'] ?? null,
            'matchups' => isset($row['matchups']) ? array_map(function($m) {
                return isset($m['team1_id']) ? self::teamEventMatchup($m) : self::eventMatchup($m);
            }, $row['matchups']) : []
        ];
    }

    /**
     * Normalizes a score database row.
     */
    public static function score($row) {
        return [
            'id' => (int)$row['id'],
            'playerId' => (isset($row['player_id']) && $row['player_id'] !== null) ? (int)$row['player_id'] : null,
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
     * Normalizes a team score database row.
     */
    public static function teamScore($row) {
        return [
            'id' => (int)$row['id'],
            'teamId' => (isset($row['team_id']) && $row['team_id'] !== null) ? (int)$row['team_id'] : null,
            'eventId' => (int)($row['event_id'] ?? 0),
            'teamEventMatchupId' => (isset($row['team_event_matchup_id']) && $row['team_event_matchup_id'] !== null) ? (int)$row['team_event_matchup_id'] : null,
            'orderNumber' => (int)$row['order_number'],
            'machineId' => (int)$row['machine_id'],
            'machineName' => $row['machine_name'] ?? null,
            'ball1' => (int)$row['ball1'],
            'ball1PlayerId' => (isset($row['ball1_player_id']) && $row['ball1_player_id'] !== null) ? (int)$row['ball1_player_id'] : null,
            'ball2' => (int)$row['ball2'],
            'ball2PlayerId' => (isset($row['ball2_player_id']) && $row['ball2_player_id'] !== null) ? (int)$row['ball2_player_id'] : null,
            'ball3' => (int)$row['ball3'],
            'ball3PlayerId' => (isset($row['ball3_player_id']) && $row['ball3_player_id'] !== null) ? (int)$row['ball3_player_id'] : null,
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
            'matchupRefId' => (int)($row['matchup_ref_id'] ?? 0),
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
                    'playerName' => $m['player_name'] ?? $m['playerName'] ?? null
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
            'machineName' => $row['machine_name'] ?? null,
            'player1Id' => (isset($row['player1_id']) && $row['player1_id'] !== null) ? (int)$row['player1_id'] : null,
            'player2Id' => (isset($row['player2_id']) && $row['player2_id'] !== null) ? (int)$row['player2_id'] : null,
            'player3Id' => (isset($row['player3_id']) && $row['player3_id'] !== null) ? (int)$row['player3_id'] : null,
            'player4Id' => (isset($row['player4_id']) && $row['player4_id'] !== null) ? (int)$row['player4_id'] : null,
            'playerId' => (isset($row['player2_id']) && $row['player2_id'] !== null) ? (int)$row['player2_id'] : ((isset($row['player1_id']) && $row['player1_id'] !== null) ? (int)$row['player1_id'] : null),
            'playerName' => $row['player_name'] ?? null
        ];
    }

    /**
     * Normalizes an event matchup database row.
     */
    public static function teamEventMatchup($row) {
        return [
            'id' => (int)$row['id'],
            'eventId' => (int)$row['event_id'],
            'leagueId' => isset($row['league_id']) ? (int)$row['league_id'] : null,
            'team1Id' => (isset($row['team1_id']) && $row['team1_id'] !== null) ? (int)$row['team1_id'] : null,
            'team2Id' => (isset($row['team2_id']) && $row['team2_id'] !== null) ? (int)$row['team2_id'] : null,
            'team3Id' => (isset($row['team3_id']) && $row['team3_id'] !== null) ? (int)$row['team3_id'] : null,
            'team4Id' => (isset($row['team4_id']) && $row['team4_id'] !== null) ? (int)$row['team4_id'] : null,
            'team1Name' => $row['team1_name'] ?? null,
            'team2Name' => $row['team2_name'] ?? null,
            'team3Name' => $row['team3_name'] ?? null,
            'team4Name' => $row['team4_name'] ?? null,
            'team1Score' => (int)($row['team1_score'] ?? 0),
            'team2Score' => (int)($row['team2_score'] ?? 0),
            'team3Score' => (int)($row['team3_score'] ?? 0),
            'team4Score' => (int)($row['team4_score'] ?? 0),
            'teamWinnerId' => (isset($row['team_winner_id']) && $row['team_winner_id'] !== null) ? (int)$row['team_winner_id'] : null,
            'status' => $row['status'] ?? 'pending',
            'gameNumber' => (int)($row['game_number'] ?? 1),
            'roundName' => $row['round_name'] ?? null,
            'seriesId' => isset($row['series_id']) ? (int)$row['series_id'] : null,
            'entries' => $row['entries'] ?? [],
        ];
    }

    public static function teamMatchup($row) {
        return [
            'id' => (int)$row['id'],
            'teamEventMatchupId' => (isset($row['team_event_matchup_id']) && $row['team_event_matchup_id'] !== null) ? (int)$row['team_event_matchup_id'] : null,
            'orderNumber' => (int)$row['order_number'],
            'machineId' => (int)$row['machine_id'],
            'machineName' => $row['machine_name'] ?? null,
            'team1Id' => (isset($row['team1_id']) && $row['team1_id'] !== null) ? (int)$row['team1_id'] : null,
            'team2Id' => (isset($row['team2_id']) && $row['team2_id'] !== null) ? (int)$row['team2_id'] : null,
        ];
    }

    public static function eventMatchup($row) {
        return [
            'id' => (int)$row['id'],
            'eventId' => (int)$row['event_id'],
            'leagueId' => isset($row['league_id']) ? (int)$row['league_id'] : null,
            'player1Id' => (isset($row['player1_id']) && $row['player1_id'] !== null) ? (int)$row['player1_id'] : null,
            'player2Id' => (isset($row['player2_id']) && $row['player2_id'] !== null) ? (int)$row['player2_id'] : null,
            'player3Id' => (isset($row['player3_id']) && $row['player3_id'] !== null) ? (int)$row['player3_id'] : null,
            'player4Id' => (isset($row['player4_id']) && $row['player4_id'] !== null) ? (int)$row['player4_id'] : null,
            'player1Name' => $row['player1_name'] ?? null,
            'player2Name' => $row['player2_name'] ?? null,
            'player3Name' => $row['player3_name'] ?? null,
            'player4Name' => $row['player4_name'] ?? null,
            'player1Score' => (int)($row['player1_score'] ?? 0),
            'player2Score' => (int)($row['player2_score'] ?? 0),
            'player3Score' => (int)($row['player3_score'] ?? 0),
            'player4Score' => (int)($row['player4_score'] ?? 0),
            'winnerId' => (isset($row['player_winner_id']) && $row['player_winner_id'] !== null) ? (int)$row['player_winner_id'] : null,
            'status' => $row['status'] ?? 'pending',
            'gameNumber' => (int)($row['game_number'] ?? 1),
            'roundName' => $row['round_name'] ?? null,
            'seriesId' => isset($row['series_id']) ? (int)$row['series_id'] : null
        ];
    }
}
