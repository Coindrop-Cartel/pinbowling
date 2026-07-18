<?php
/**
 * Cleanup REST API Endpoint.
 * HTTP controller that delegates to the CleanupService class.
 * 
 * Automated cleanup of old session leagues and abandoned player records.
 * Trigger via CRON or curl with admin secret.
 */

require_once __DIR__ . '/../includes/bootstrap.php';

use App\Http\ApiController;
use App\Service\CleanupService;
use App\Service\DatabaseService;

class CleanupController extends ApiController {
    private CleanupService $cleanupService;

    public function __construct($container) {
        parent::__construct($container);
        $this->cleanupService = $container->get(CleanupService::class);
    }

    protected function validateAccess(): void {
        // This operation is restricted to global admins only
        $this->validateAdminAccess();
    }

    protected function handle(): void {
        $retentionDays = (int)($_GET['days'] ?? $this->input['days'] ?? 30);

        switch ($this->method) {
            case 'GET':
                // Return system diagnostics info
                $dbConfig = \Configuration::getInstance()->getDbConfig();
                $dbConnected = false;
                $dbError = null;
                $connectedHost = 'unknown';
                $connectedDatabase = 'unknown';
                $tables = [];

                try {
                    $pdo = $this->container->get(DatabaseService::class)->getPdo();
                    $stmt = $pdo->query('SELECT DATABASE() AS dbname, @@hostname AS hostname');
                    $info = $stmt->fetch(\PDO::FETCH_ASSOC);
                    $connectedHost = $info['hostname'] ?? 'unknown';
                    $connectedDatabase = $info['dbname'] ?? 'unknown';
                    $tables = $pdo->query('SHOW TABLES')->fetchAll(\PDO::FETCH_COLUMN);
                    $dbConnected = true;
                } catch (\Exception $e) {
                    $dbError = $e->getMessage();
                }

                $this->sendJson([
                    'phpVersion' => PHP_VERSION,
                    'pdoDrivers' => \PDO::getAvailableDrivers(),
                    'dbConnected' => $dbConnected,
                    'dbError' => $dbError,
                    'connectedHost' => $connectedHost,
                    'connectedDatabase' => $connectedDatabase,
                    'configuredHost' => $dbConfig['host'],
                    'configuredPort' => $dbConfig['port'],
                    'configuredUser' => $dbConfig['user'],
                    'configuredDatabase' => $dbConfig['name'],
                    'envFound' => file_exists(__DIR__ . '/../.env'),
                    'tables' => $tables
                ]);
                break;

            case 'POST':
                // Run cleanup for old session leagues
                $result = $this->cleanupService->cleanupOldSessionLeagues($retentionDays);
                $this->sendJson($result);
                break;

            case 'PUT':
                // Clean up abandoned players
                $result = $this->cleanupService->cleanupAbandonedPlayers();
                $this->sendJson($result);
                break;

            default:
                $this->sendError('Unsupported request method', 405);
        }
    }
}

// Prevent immediate execution during unit testing
$container = $GLOBALS['container'];
if (!defined('PHPUNIT_RUNNING') || PHPUNIT_RUNNING !== true) {
    (new CleanupController($container))->dispatch();
}
