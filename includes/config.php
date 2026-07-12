<?php
/**
 * Core configuration and utility functions for the PinBowling backend.
 * Handles environment variable loading, database connection management,
 * and security validation.
 */

// Define absolute path constants to simulate JS-style aliases (@pages, @inc)
define('PB_BASE_DIR', dirname(__DIR__));
define('PB_INC_DIR', __DIR__);
define('PB_PAGES_DIR', PB_INC_DIR . '/pages');

require_once __DIR__ . '/Configuration.php';
require_once __DIR__ . '/SiteContent.php';

// Ensure a session is started to support CSRF protection and authentication.
if (session_status() === PHP_SESSION_NONE && !defined('PHPUNIT_RUNNING')) {
    session_start();
}
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$config = Configuration::getInstance();
$siteContent = new SiteContent();

// Asset Configuration
$stylesDir = 'styles'; // Folder name for CSS files. Set to '' if files are in the root.

// UI_VERSION is used for asset cache-busting.
// package.json is the single source of truth for versioning across the project.
$packageFile = PB_BASE_DIR . '/package.json';
if (is_readable($packageFile)) {
    $packageData = json_decode(file_get_contents($packageFile), true);
    if (json_last_error() === JSON_ERROR_NONE && isset($packageData['version'])) {
        $uiVersion = $packageData['version'];
        $uiVersionSource = 'package.json';
    } else {
        $uiVersion = '1.0.0';
        $uiVersionSource = 'Hardcoded Fallback (JSON parse error or missing version key)';
        error_log("[PinBowling DEBUG] Failed to parse package.json or missing 'version' key at {$packageFile}. JSON Error: " . json_last_error_msg());
    }
} else {
    $uiVersion = '1.0.0';
    $uiVersionSource = 'Hardcoded Fallback';
    error_log("[PinBowling DEBUG] package.json not found or not readable at {$packageFile}. Falling back to {$uiVersion}.");
}

// --- Security Warnings (delegated to Configuration) ---
if (php_sapi_name() !== 'cli' && !defined('PHPUNIT_RUNNING')) {
    foreach ($config->checkSecurityWarnings() as $warning) {
        error_log("[PinBowling SECURITY WARNING] {$warning}");
    }
}

// --- Shared Branding Metadata ---
// Global project text (Format Agnostic)
$siteBrand   = SiteContent::get('siteBrand');
$siteSlogan  = SiteContent::get('siteSlogan');
$heroIntroText = SiteContent::get('heroIntroText');
$aboutProject = SiteContent::get('aboutProject');
$aiDisclosure = SiteContent::get('aiDisclosure');
$mainSiteLogo = SiteContent::get('mainSiteLogo');

// --- Database Configuration (derived from Configuration singleton) ---
$dbConfig = $config->getDbConfig();
$dbDsn = "mysql:host={$dbConfig['host']};port={$dbConfig['port']};dbname={$dbConfig['name']};charset={$dbConfig['charset']}";

/**
 * Established a singleton PDO connection to the MySQL database.
 * @return PDO
 */
function getDbConnection($mockPdo = null) {
    static $pdo = null;
    if ($mockPdo !== null) {
        $pdo = $mockPdo;
        return $pdo;
    }
    if ($pdo === null) {
        if (isset($GLOBALS['container']) && $GLOBALS['container'] instanceof App\Includes\Container) {
             $pdo = $GLOBALS['container']->get(App\Service\DatabaseService::class)->getPdo();
        } else {
             $cfg = Configuration::getInstance();
             $db = $cfg->getDbConfig();
             $dsn = "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset={$db['charset']}";
             $pdo = new PDO($dsn, $db['user'], $db['pass'], [
                 PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                 PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                 PDO::ATTR_EMULATE_PREPARES => false,
             ]);
        }
    }
    return $pdo;
}

// Initialize from engine metadata module (for format-agnostic content)
require_once __DIR__ . '/engineMeta.php';

// Include modularized HTTP and Utility helpers
require_once PB_INC_DIR . '/http.php';

// Include modularized auth helpers
require_once PB_INC_DIR . '/auth.php';
// Include data serializers
require_once PB_INC_DIR . '/serializers.php';

// Add the includes directory to the PHP include_path to allow cleaner require statements
set_include_path(get_include_path() . PATH_SEPARATOR . PB_INC_DIR);
