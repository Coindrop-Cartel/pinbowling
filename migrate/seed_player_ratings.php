<?php
/**
 * Bulk updates player IFPA IDs, IFPA Rankings, and Match Play Ratings in the database.
 * Run via web browser or command line: php migrate/seed_player_ratings.php
 */

if (php_sapi_name() !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}

try {
    require_once __DIR__ . '/../includes/config.php';
    require_once __DIR__ . '/migrate.php';

    $pdo = getDbConnection();

    // Ensure database schema has aligned table columns (ifpa_rating & ifpa_ranking)
    if (function_exists('alignTableColumns')) {
        alignTableColumns($pdo);
    }

    $players = [
        ['name' => 'Adam Bowman',       'ifpa_id' => '18838',  'ranking' => 2354,  'rating' => 1546.76],
        ['name' => 'Adam Yates',        'ifpa_id' => '83592',  'ranking' => 2042,  'rating' => 1420.11],
        ['name' => 'Adrian Ogletree',   'ifpa_id' => '102447', 'ranking' => 12970, 'rating' => 1151.65],
        ['name' => 'Andrew Spillios',   'ifpa_id' => '101876', 'ranking' => 1289,  'rating' => 1861.02],
        ['name' => 'Anna Yates',        'ifpa_id' => '89021',  'ranking' => 9256,  'rating' => 1124.25],
        ['name' => 'Austin Fanger',     'ifpa_id' => '70443',  'ranking' => 2947,  'rating' => 1444.13],
        ['name' => 'Brendan Newman',    'ifpa_id' => '93484',  'ranking' => 4480,  'rating' => 1374.63],
        ['name' => 'Brian Dunn',        'ifpa_id' => '106448', 'ranking' => 10497, 'rating' => 1203.36],
        ['name' => 'Brian Tavener',     'ifpa_id' => '51304',  'ranking' => 4601,  'rating' => 1349.70],
        ['name' => 'Bryce Lafoon',      'ifpa_id' => '145612', 'ranking' => 8383,  'rating' => 1158.57],
        ['name' => 'Cailan Curtis',     'ifpa_id' => '133642', 'ranking' => 10759, 'rating' => 1210.29],
        ['name' => 'Courtland Cain',    'ifpa_id' => '83031',  'ranking' => 1606,  'rating' => 1530.52],
        ['name' => 'Ed Christoph',      'ifpa_id' => '114768', 'ranking' => 6110,  'rating' => 1318.12],
        ['name' => 'Evelyn Tavener',    'ifpa_id' => '83990',  'ranking' => 11349, 'rating' => 1248.56],
        ['name' => 'Heather Labarbera', 'ifpa_id' => '125682', 'ranking' => 16265, 'rating' => 1037.75],
        ['name' => 'Jeremy Altheide',   'ifpa_id' => '155317', 'ranking' => 13334, 'rating' => 1142.12],
        ['name' => 'Katie Sampler',     'ifpa_id' => '98756',  'ranking' => 14641, 'rating' => 901.45],
        ['name' => 'Kit Lafoon',        'ifpa_id' => '145611', 'ranking' => 7822,  'rating' => 1244.09],
        ['name' => 'Kyle Voorhees',     'ifpa_id' => '88590',  'ranking' => 2892,  'rating' => 1502.87],
        ['name' => 'Laura Varney',      'ifpa_id' => '115405', 'ranking' => 3755,  'rating' => 1428.26],
        ['name' => 'Lee Royland',       'ifpa_id' => '83996',  'ranking' => 45380, 'rating' => 959.69],
        ['name' => 'Lilly NC',          'ifpa_id' => '156158', 'ranking' => 47570, 'rating' => 763.65],
        ['name' => 'Mark Lathrop',      'ifpa_id' => '106115', 'ranking' => 11586, 'rating' => 1206.18],
        ['name' => 'Matt Tavener',      'ifpa_id' => '74933',  'ranking' => 9120,  'rating' => 1281.17],
        ['name' => 'Mike Talmarkes',    'ifpa_id' => '90154',  'ranking' => 3791,  'rating' => 1427.99],
        ['name' => 'Milo Smith',        'ifpa_id' => '93852',  'ranking' => 13555, 'rating' => 1041.62],
        ['name' => 'Nathan Sabo',       'ifpa_id' => '147973', 'ranking' => 9335,  'rating' => 1166.80],
        ['name' => 'Noah Clarke',       'ifpa_id' => '84552',  'ranking' => 4607,  'rating' => 1444.38],
        ['name' => 'Nora Collins',      'ifpa_id' => '150841', 'ranking' => 13775, 'rating' => 982.53],
        ['name' => 'Owen Tavener',      'ifpa_id' => '84379',  'ranking' => 23359, 'rating' => 910.57],
        ['name' => 'Quinn Babb',        'ifpa_id' => '98030',  'ranking' => 8201,  'rating' => 1131.02],
        ['name' => 'Shawn Scott Smith', 'ifpa_id' => '67180',  'ranking' => 1932,  'rating' => 1368.62],
        ['name' => 'Sophia Locia',      'ifpa_id' => '136565', 'ranking' => 22079, 'rating' => 835.79],
        ['name' => 'Steve Lane',        'ifpa_id' => '3729',   'ranking' => 1852,  'rating' => 1603.98],
        ['name' => 'Vincent Sparacino', 'ifpa_id' => '138723', 'ranking' => 6602,  'rating' => 1371.29],
        ['name' => 'Zachary Hiller',    'ifpa_id' => '140857', 'ranking' => 21472, 'rating' => 979.15],
    ];

    $stmt = $pdo->prepare("
        UPDATE players 
        SET ifpa_id = ?, ifpa_ranking = ?, ifpa_rating = ? 
        WHERE LOWER(player_name) = LOWER(?) OR ifpa_id = ?
    ");

    $updatedCount = 0;
    $skippedCount = 0;

    foreach ($players as $p) {
        $stmt->execute([$p['ifpa_id'], $p['ranking'], $p['rating'], $p['name'], $p['ifpa_id']]);
        if ($stmt->rowCount() > 0) {
            $updatedCount += $stmt->rowCount();
            echo "[UPDATED] {$p['name']} -> IFPA #{$p['ifpa_id']} | Rank #{$p['ranking']} | Rating {$p['rating']}\n";
        } else {
            $skippedCount++;
            echo "[SKIPPED] {$p['name']} -> Not found in database (no changes made)\n";
        }
    }

    echo "\n=============================================\n";
    echo "Finished! Updated: $updatedCount | Skipped: $skippedCount\n";
    echo "=============================================\n";

} catch (\Throwable $e) {
    http_response_code(500);
    echo "Error executing seed_player_ratings: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString();
}
