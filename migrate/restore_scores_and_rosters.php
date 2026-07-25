<?php
/**
 * Restore Scores & Reconstruct League Rosters Script.
 *
 * Use this script to recover scores from `migrate/scores_insert.sql` and automatically
 * recreate missing 1-player teams in `teams` / `team_members` and re-assign them to `league_teams`.
 *
 * Usage: php migrate/restore_scores_and_rosters.php
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $pdo = $container->get(\App\Service\DatabaseService::class)->getPdo();

    echo "1. Reading scores_insert.sql to restore missing score records...\n";
    $sqlFile = __DIR__ . '/scores_insert.sql';
    if (!file_exists($sqlFile)) {
        throw new Exception("File not found: scores_insert.sql");
    }

    $rawSql = file_get_contents($sqlFile);

    // Transform `INSERT INTO tmp_prod_scores (...) VALUES (...)` to `INSERT IGNORE INTO scores (player_id, event_id, order_number, machine_id, ball1, ball2, ball3) VALUES (...)`
    $restoreSql = str_replace(
        'INSERT INTO `tmp_prod_scores` (`prod_player_id`,`prod_event_id`,`order_number`,`prod_machine_id`,`ball1`,`ball2`,`ball3`) VALUES',
        'INSERT IGNORE INTO `scores` (`player_id`,`event_id`,`order_number`,`machine_id`,`ball1`,`ball2`,`ball3`) VALUES',
        $rawSql
    );

    $stmt = $pdo->prepare($restoreSql);
    $stmt->execute();
    $insertedScoresCount = $stmt->rowCount();
    echo "✓ Restored {$insertedScoresCount} score records into scores table.\n\n";

    echo "2. Reconstructing missing 1-player teams and league rosters from scores...\n";

    // Find all distinct (league_id, player_id) combinations from scores JOIN events
    $stmt = $pdo->query("
        SELECT DISTINCT e.league_id, s.player_id, p.player_name
        FROM scores s
        JOIN events e ON s.event_id = e.id
        JOIN players p ON s.player_id = p.id
        WHERE e.league_id IS NOT NULL
    ");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($rows)) {
        echo "No score records found to reconstruct.\n";
        exit(0);
    }

    echo "Found " . count($rows) . " player-league score associations.\n";

    $reassignedCount = 0;

    // Ensure is_individual_wrapper column exists in teams table
    try {
        $pdo->exec("ALTER TABLE `teams` ADD COLUMN `is_individual_wrapper` TINYINT(1) DEFAULT 0");
    } catch (\PDOException $e) {
        // Column already exists
    }

    foreach ($rows as $row) {
        $leagueId = (int)$row['league_id'];
        $playerId = (int)$row['player_id'];
        $playerName = $row['player_name'];

        // Step A: Find existing 1-player team for this player, or create one
        $stmtTeam = $pdo->prepare("
            SELECT t.id FROM teams t
            JOIN team_members tm ON t.id = tm.team_id
            GROUP BY t.id
            HAVING COUNT(tm.player_id) = 1 AND SUM(tm.player_id = ?) = 1
        ");
        $stmtTeam->execute([$playerId]);
        $teamId = $stmtTeam->fetchColumn();

        if (!$teamId) {
            $insertTeam = $pdo->prepare("INSERT INTO teams (name, is_individual_wrapper) VALUES (?, 1)");
            $insertTeam->execute([$playerName]);
            $teamId = (int)$pdo->lastInsertId();

            $insertMember = $pdo->prepare("INSERT INTO team_members (team_id, player_id) VALUES (?, ?)");
            $insertMember->execute([$teamId, $playerId]);
        } else {
            $pdo->prepare("UPDATE teams SET is_individual_wrapper = 1 WHERE id = ?")->execute([$teamId]);
        }

        // Step B: Link team to league in league_teams
        $insertLT = $pdo->prepare("INSERT IGNORE INTO league_teams (league_id, team_id) VALUES (?, ?)");
        $insertLT->execute([$leagueId, $teamId]);

        if ($insertLT->rowCount() > 0) {
            $reassignedCount++;
            echo "  + Re-linked '{$playerName}' (Player ID {$playerId}) to League ID {$leagueId}\n";
        }
    }

    echo "\n✓ Restoration complete! Re-linked {$reassignedCount} league roster memberships.\n";

} catch (Exception $e) {
    echo "\n✗ Recovery script failed: " . $e->getMessage() . "\n";
    exit(1);
}
