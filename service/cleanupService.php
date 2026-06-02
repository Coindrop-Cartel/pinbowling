<?php
/**
 * Cleanup Service for PinBowling.
 * Automates the removal of one-off session leagues and their associated data 
 * after a retention period (default 30 days) to prevent database bloat.
 */
require_once __DIR__ . '/../includes/config.php';

try {
    $pdo = getDbConnection();
    
    // This operation is restricted to global admins only.
    // Trigger via CRON or CLI: curl -H "X-PB-SECRET: <SECRET>" https://yoursite.com/service/cleanupService.php
    validateAdminAccess();

    // Check for optional retention period override via query string or JSON body
    $input = getJsonInput();
    $retentionDays = (int)($_GET['days'] ?? $input['days'] ?? 30);
    if ($retentionDays <= 0) $retentionDays = 30;

    $cutoffDate = date('Y-m-d', strtotime("-$retentionDays days"));

    // Identify session leagues that have passed the retention threshold.
    $stmt = $pdo->prepare("SELECT id FROM leagues WHERE type = 'session' AND start_date < ?");
    $stmt->execute([$cutoffDate]);
    $leagueIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($leagueIds)) {
        sendJson(['message' => 'No session leagues older than ' . $retentionDays . ' days were found.'], 200);
    }

    $pdo->beginTransaction();

    // Prepare placeholders for bulk deletion
    $idPlaceholders = implode(',', array_fill(0, count($leagueIds), '?'));

    // 1. Remove player scores for events within these leagues
    $sqlScores = "DELETE FROM scores WHERE event_id IN (SELECT id FROM events WHERE league_id IN ($idPlaceholders))";
    $pdo->prepare($sqlScores)->execute($leagueIds);

    // 2. Remove target score templates for events within these leagues
    $sqlTargets = "DELETE FROM target_scores WHERE event_id IN (SELECT id FROM events WHERE league_id IN ($idPlaceholders))";
    $pdo->prepare($sqlTargets)->execute($leagueIds);

    // 3. Remove the events themselves
    $sqlEvents = "DELETE FROM events WHERE league_id IN ($idPlaceholders)";
    $pdo->prepare($sqlEvents)->execute($leagueIds);

    // 4. Remove player-to-league roster mappings
    $sqlRoster = "DELETE FROM league_players WHERE league_id IN ($idPlaceholders)";
    $pdo->prepare($sqlRoster)->execute($leagueIds);

    // 5. Finally, delete the leagues
    $sqlLeagues = "DELETE FROM leagues WHERE id IN ($idPlaceholders)";
    $pdo->prepare($sqlLeagues)->execute($leagueIds);

    $pdo->commit();

    sendJson([
        'success' => true,
        'leagues_cleaned' => count($leagueIds),
        'cleaned_ids' => $leagueIds
    ]);

} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    sendJson(['error' => $e->getMessage()], 500);
}