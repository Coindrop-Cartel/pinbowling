<?php
/**
 * One-off recovery script to reconstruct league rosters from the scores table.
 *
 * Use this script if rosters were lost. It inspects scores JOIN events, identifies every
 * player who scored in a league event, and reconstructs their roster entries:
 * - Team leagues: creates 1-player teams, assigns via team_members + league_teams
 * - Individual leagues: inserts directly into league_players
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $pdo = $container->get(\App\Service\DatabaseService::class);

    echo "Scanning scores table to reconstruct league rosters...\n";

    // 1. Find all distinct (league_id, player_id) combinations from scores JOIN events
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
            $insertTeam = $pdo->prepare("INSERT INTO teams (name) VALUES (?)");
            $insertTeam->execute([$playerName]);
            $teamId = (int)$pdo->lastInsertId();

            $insertMember = $pdo->prepare("INSERT INTO team_members (team_id, player_id) VALUES (?, ?)");
            $insertMember->execute([$teamId, $playerId]);
        }

        // Step B: Check league participation type
        $stmtPart = $pdo->prepare("SELECT participation_type FROM leagues WHERE id = ?");
        $stmtPart->execute([$leagueId]);
        $partType = $stmtPart->fetchColumn();

        if ($partType === 'team') {
            // Link team to league in league_teams
            $insertLT = $pdo->prepare("INSERT IGNORE INTO league_teams (league_id, team_id) VALUES (?, ?)");
            $insertLT->execute([$leagueId, $teamId]);

            if ($insertLT->rowCount() > 0) {
                $reassignedCount++;
                echo "  + Reassigned '{$playerName}' (Player ID {$playerId}) to League ID {$leagueId}\n";
            }
        } else {
            // Individual league: use league_players
            $insertLP = $pdo->prepare("INSERT IGNORE INTO league_players (league_id, player_id) VALUES (?, ?)");
            $insertLP->execute([$leagueId, $playerId]);

            if ($insertLP->rowCount() > 0) {
                $reassignedCount++;
                echo "  + Reassigned '{$playerName}' (Player ID {$playerId}) to League ID {$leagueId}\n";
            }
        }
    }

    echo "\n✓ Reconstruction complete! Reassigned {$reassignedCount} league roster memberships from scores.\n";

} catch (Exception $e) {
    echo "\n✗ Recovery script failed: " . $e->getMessage() . "\n";
    exit(1);
}
