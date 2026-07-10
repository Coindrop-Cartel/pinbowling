<?php
/**
 * Cleanup REST API Endpoint.
 * HTTP controller that delegates to the CleanupService class.
 * 
 * Automated cleanup of old session leagues and abandoned player records.
 * Trigger via CRON or curl with admin secret.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

try {
    $container = $GLOBALS['container'];
    $cleanupService = $container->get(\App\Service\CleanupService::class);
    
    // This operation is restricted to global admins only
    validateAdminAccess();

    $method = $_SERVER['REQUEST_METHOD'];
    $input = getJsonInput();
    $retentionDays = (int)($_GET['days'] ?? $input['days'] ?? 30);

    if ($method === 'POST') {
        // Run cleanup for old session leagues
        $result = $cleanupService->cleanupOldSessionLeagues($retentionDays);
        sendJson($result);
    } else if ($method === 'PUT') {
        // Clean up abandoned players
        $result = $cleanupService->cleanupAbandonedPlayers();
        sendJson($result);
    } else {
        sendJson(['error' => 'Only POST and PUT methods are supported'], 405);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
