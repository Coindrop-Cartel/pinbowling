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

    switch ($method) {
        case 'GET':
            // Return system diagnostics info
            $dbConfig = \Configuration::getInstance()->getDbConfig();
            $pdo = $container->get(\App\Service\DatabaseService::class)->getPdo();
            
            $stmt = $pdo->query('SELECT DATABASE() AS dbname, @@hostname AS hostname');
            $info = $stmt->fetch(\PDO::FETCH_ASSOC);

            $tables = $pdo->query('SHOW TABLES')->fetchAll(\PDO::FETCH_COLUMN);

            sendJson([
                'phpVersion' => PHP_VERSION,
                'pdoDrivers' => \PDO::getAvailableDrivers(),
                'connectedHost' => $info['hostname'] ?? 'unknown',
                'connectedDatabase' => $info['dbname'] ?? 'unknown',
                'configuredHost' => $dbConfig['host'],
                'configuredPort' => $dbConfig['port'],
                'configuredDatabase' => $dbConfig['name'],
                'envFound' => file_exists(__DIR__ . '/../.env'),
                'tables' => $tables
            ]);
            break;

        case 'POST':
            // Run cleanup for old session leagues
            $result = $cleanupService->cleanupOldSessionLeagues($retentionDays);
            sendJson($result);
            break;

        case 'PUT':
            // Clean up abandoned players
            $result = $cleanupService->cleanupAbandonedPlayers();
            sendJson($result);
            break;

        default:
            sendJson(['error' => 'Unsupported request method'], 405);
    }

} catch (Exception $e) {
    sendJson(['error' => $e->getMessage()], 500);
}
