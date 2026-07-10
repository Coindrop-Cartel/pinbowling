<?php
/**
 * Data serialization helpers to ensure consistent API response shapes.
 */

/**
 * Normalizes a player database row into a standardized associative array.
 * Merges signatures from leagueService and playerService to resolve Issue 7.
 * 
 * @param array $row Database row from players table joined with users.
 * @return array Standardized player object.
 */
function serializePlayer($row) {
    return [
        'id' => isset($row['id']) ? (int)$row['id'] : null,
        'playerName' => $row['player_name'] ?? null,
        'ifpaId' => $row['ifpa_id'] ?? null,
        'matchplayId' => $row['matchplay_id'] ?? null,
        'userRole' => $row['role'] ?? null,
        'username' => $row['username'] ?? null,
        'email' => $row['email'] ?? null,
        'userId' => isset($row['user_id']) ? (int)$row['user_id'] 
            : (isset($row['userId']) ? (int)$row['userId'] : null)
    ];
}

/**
 * Normalizes a location database row.
 */
function serializeLocation($row) {
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'city' => $row['city'] ?? null,
        'state' => $row['state'] ?? null,
        'machines' => serializeLocationMachinesGrouped($row['machines'] ?? [])
    ];
}

/**
 * Groups flat location_machine rows (from a JOIN with location_machine_scores)
 * into machine objects with a `scores` map keyed by format.
 *
 * Input: array of rows, each with lm.* + lms.format, lms.target_easy, lms.target_med, lms.target_hard
 * Output: array of machine objects, each with a `scores` map like:
 *   { bowling: {targetEasy, targetMed, targetHard}, baseball: {...}, ... }
 * Also sets top-level `format`/`targetEasy`/`targetMed`/`targetHard` from the first score row.
 */
function serializeLocationMachinesGrouped(array $rows): array {
    $grouped = [];
    foreach ($rows as $row) {
        $lmId = (int)$row['id'];
        if (!isset($grouped[$lmId])) {
            $grouped[$lmId] = [
                'id' => $lmId,
                'locationId' => isset($row['location_id']) ? (int)$row['location_id'] : null,
                'machineId' => (int)$row['machine_id'],
                'machineName' => $row['machine_name'] ?? null,
                'note' => $row['note'] ?? null,
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
    return array_values($grouped);
}

/**
 * Normalizes a league database row.
 */
function serializeLeague($row) {
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'type' => $row['type'] ?? 'standard',
        'participants' => $row['participants'] ?? 'individual',
        'startDate' => $row['start_date'] ?? null,
        'scoringFormat' => $row['scoring_format'] ?? 'bowling',
        'seasonScoring' => $row['season_scoring'] ?? 'weekly',
        'dropLowestWeeks' => (int)($row['drop_lowest_weeks'] ?? 0),
        'events' => isset($row['events']) ? array_map('serializeEvent', $row['events']) : [],
        'players' => isset($row['players']) ? array_map('serializePlayer', $row['players']) : [],
        'teams' => isset($row['teams']) ? array_map('serializeTeam', $row['teams']) : []
    ];
}

/**
 * Normalizes an event database row.
 */
function serializeEvent($row) {
    return [
        'id' => (int)$row['id'],
        'leagueId' => (int)$row['league_id'],
        'locationId' => isset($row['location_id']) ? (int)$row['location_id'] : null,
        'eventName' => $row['event_name'],
        'eventDate' => $row['event_date'] ?? null,
        'scoringFormat' => $row['scoring_format'] ?? 'bowling',
        'locationName' => $row['location_name'] ?? null
    ];
}

/**
 * Normalizes a score database row.
 */
function serializeScore($row) {
    return [
        'id' => (int)$row['id'],
        'playerId' => (int)$row['player_id'],
        'eventId' => (int)($row['event_id'] ?? 0),
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
 * Normalizes a master machine registry row.
 */
function serializeMasterMachine($row) {
    return [
        'id' => (int)$row['id'],
        'machineName' => $row['machine_name'],
        'year' => $row['year'] ? (int)$row['year'] : null,
        'manufacturer' => $row['manufacturer'] ?? null
    ];
}

/**
 * Normalizes a target score row used in event configurations.
 */
function serializeTargetScore($row) {
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
function serializeTeam($row) {
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
 *
 * Each row represents a single player's slot in a half-inning:
 *   orderNumber = inning/slot index, playerOrder = role (1=home, 2=away).
 */
function serializeMatchup($row) {
    return [
        'id' => (int)$row['id'],
        'eventId' => (int)$row['event_id'],
        'orderNumber' => (int)$row['order_number'],
        'playerId' => (int)$row['player_id'],
        'machineId' => (int)$row['machine_id'],
        'playerOrder' => (int)($row['player_order'] ?? 1),
        'playerName' => $row['player_name'] ?? null,
        'machineName' => $row['machine_name'] ?? null
    ];
}
