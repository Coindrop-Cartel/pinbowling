<?php
/**
 * Core configuration and utility functions for the PinBowling backend.
 * Handles environment variable loading, database connection management,
 * and security validation.
 */

/**
 * Manually parses a .env file into PHP's environment arrays.
 * Useful for shared hosting environments where putenv/$_ENV are required.
 * @param string $envPath Path to the .env file.
 * @return array Parsed environment variables.
 */
function loadEnvFile($envPath) {
    $env = [];
    if (!is_readable($envPath)) {
        return $env;
    }

    $handle = fopen($envPath, 'r');
    if ($handle === false) {
        return $env;
    }

    while (($line = fgets($handle)) !== false) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0 || strpos($line, '=') === false) {
            continue;
        }

        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);

        if ($value !== '' && ((($value[0] === '"') && substr($value, -1) === '"') || (($value[0] === "'") && substr($value, -1) === "'"))) {
            $value = substr($value, 1, -1);
        }

        $env[$name] = $value;
        putenv("$name=$value");
        $_ENV[$name] = $value;
        $_SERVER[$name] = $value;
    }

    fclose($handle);
    return $env;
}

// Look for the .env file in the root directory (one level up from /includes)
$loadedEnv = loadEnvFile(__DIR__ . '/../.env');

/**
 * Helper to retrieve configuration values with fallbacks.
 * Checks the parsed .env array, getenv(), and finally a default value.
 * @param array $env The array returned by loadEnvFile.
 * @param array $names List of potential key names (for cross-platform support).
 * @param mixed $default Fallback value.
 */
function envValue(array $env, array $names, $default = null) {
    foreach ($names as $name) {
        if (array_key_exists($name, $env)) {
            return $env[$name];
        }
        $value = getenv($name);
        if ($value !== false) {
            return $value;
        }
    }
    return $default;
}

// --- Database & Security Configuration ---

$dbHost = envValue($loadedEnv, ['DB_HOST', 'MYSQL_HOST'], 'localhost');
$dbPort = envValue($loadedEnv, ['DB_PORT', 'MYSQL_PORT'], '3306');
$dbName = envValue($loadedEnv, ['DB_NAME', 'MYSQL_DATABASE'], 'pinbowling');
$dbUser = envValue($loadedEnv, ['DB_USER', 'MYSQL_USER'], 'username');
$dbPass = envValue($loadedEnv, ['DB_PASS', 'MYSQL_PASSWORD'], 'password');
$dbCharset = 'utf8mb4';
$apiSecret = envValue($loadedEnv, ['API_SECRET'], 'bowl-2024-secret');
// UI_VERSION is used for asset cache-busting. 
// It is read from version.txt to allow cache-busting updates without touching environment secrets.
$versionFile = __DIR__ . '/../version.txt';
$isReadable = is_readable($versionFile);
$uiVersion = $isReadable ? trim(file_get_contents($versionFile)) : '1.0.0';
$uiVersionSource = $isReadable ? 'version.txt' : 'Hardcoded Fallback';

$adminPassword = envValue($loadedEnv, ['ADMIN_PASSWORD'], 'admin123');
$debugMode = false; // Initial state; toggled via Management UI and persisted in localStorage.

$dbDsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset={$dbCharset}";

/**
 * Established a singleton PDO connection to the MySQL database.
 * @return PDO
 */
function getDbConnection() {
    global $dbDsn, $dbUser, $dbPass;
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO($dbDsn, $dbUser, $dbPass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        initializeDatabaseSchema($pdo);
    }
    return $pdo;
}

/**
 * Ensures database tables follow the standardized lowercase snake_case convention.
 * Migrates existing PascalCase tables if found.
 * @param PDO $pdo
 */
function initializeDatabaseSchema($pdo) {
    // --- Base Table Creation ---
    // We use CREATE TABLE IF NOT EXISTS to ensure the database can be rebuilt 
    // automatically if tables are dropped or if starting a fresh installation.
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS `leagues` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL,
        `type` ENUM('standard', 'session') DEFAULT 'standard',
        `start_date` DATE DEFAULT NULL,
        `password` VARCHAR(255) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `locations` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL,
        `city` VARCHAR(255) DEFAULT NULL,
        `state` VARCHAR(255) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `machines` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `machine_name` VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `players` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `player_name` VARCHAR(255) NOT NULL UNIQUE,
        `ifpa_id` VARCHAR(50) DEFAULT NULL,
        `matchplay_id` VARCHAR(50) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `events` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `league_id` INT NOT NULL,
        `location_id` INT DEFAULT NULL,
        `event_name` VARCHAR(255) NOT NULL,
        `event_date` DATE DEFAULT NULL,
        CONSTRAINT `fk_events_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_events_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `scores` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `player_id` INT NOT NULL,
        `event_id` INT NOT NULL,
        `order_number` INT NOT NULL,
        `machine_id` INT NOT NULL,
        `ball1` BIGINT DEFAULT 0,
        `ball2` BIGINT DEFAULT 0,
        `ball3` BIGINT DEFAULT 0,
        UNIQUE KEY `unique_player_round` (`event_id`, `player_id`, `order_number`),
        CONSTRAINT `fk_scores_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_scores_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_scores_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `league_players` (
        `league_id` INT NOT NULL,
        `player_id` INT NOT NULL,
        PRIMARY KEY (`league_id`, `player_id`),
        CONSTRAINT `fk_lp_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_lp_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `target_scores` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `event_id` INT NOT NULL,
        `machine_id` INT NOT NULL,
        `order_number` INT NOT NULL,
        `score1` BIGINT DEFAULT 0, `score2` BIGINT DEFAULT 0, `score3` BIGINT DEFAULT 0, `score4` BIGINT DEFAULT 0, `score5` BIGINT DEFAULT 0,
        `score6` BIGINT DEFAULT 0, `score7` BIGINT DEFAULT 0, `score8` BIGINT DEFAULT 0, `score9` BIGINT DEFAULT 0, `score10` BIGINT DEFAULT 0,
        UNIQUE KEY `unique_event_round` (`event_id`, `order_number`),
        CONSTRAINT `fk_ts_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_ts_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `location_machines` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `location_id` INT NOT NULL,
        `machine_id` INT NOT NULL,
        `note` TEXT DEFAULT NULL,
        `score1` BIGINT DEFAULT 0, `score2` BIGINT DEFAULT 0, `score3` BIGINT DEFAULT 0, `score4` BIGINT DEFAULT 0, `score5` BIGINT DEFAULT 0,
        `score6` BIGINT DEFAULT 0, `score7` BIGINT DEFAULT 0, `score8` BIGINT DEFAULT 0, `score9` BIGINT DEFAULT 0, `score10` BIGINT DEFAULT 0,
        `target_easy` BIGINT DEFAULT 0,
        `target_med` BIGINT DEFAULT 0,
        `target_hard` BIGINT DEFAULT 0,
        UNIQUE KEY `unique_location_machine` (`location_id`, `machine_id`),
        CONSTRAINT `fk_lm_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_lm_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $migrations = [
        'Leagues' => 'leagues',
        'Events' => 'events',
        'Machines' => 'machines',
        'Players' => 'players',
        'Scores' => 'scores',
        'League_Players' => 'league_players',
        'Locations' => 'locations',
        'Location_Machines' => 'location_machines',
        'Target_Scores' => 'target_scores'
    ];

    foreach ($migrations as $old => $new) {
        if ($old === $new) continue;
        $checkOld = $pdo->query("SHOW TABLES LIKE '$old'")->fetch();
        if ($checkOld) {
            $checkNew = $pdo->query("SHOW TABLES LIKE '$new'")->fetch();
            if (!$checkNew) {
                $pdo->exec("RENAME TABLE `$old` TO `$new` ");
            }
        }
    }

    // Ensure 'leagues' table has the 'password' column (added for protected leagues)
    $checkLeagues = $pdo->query("SHOW TABLES LIKE 'leagues'")->fetch();
    if ($checkLeagues) {
        $checkPassword = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'password'")->fetch();
        if (!$checkPassword) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `password` VARCHAR(255) DEFAULT NULL AFTER `start_date` ");
        }
    }

    // Ensure 'leagues' table has the 'type' column for standard vs session distinction
    if ($checkLeagues) {
        $checkType = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'type'")->fetch();
        if (!$checkType) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `type` ENUM('standard', 'session') DEFAULT 'standard' AFTER `name` ");
        }
    }

    // Ensure 'location_machines' table has all required scoring and target columns
    $checkLM = $pdo->query("SHOW TABLES LIKE 'location_machines'")->fetch();
    if ($checkLM) {
        $checkScoreCol = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'score1'")->fetch();
        if (!$checkScoreCol) {
            $pdo->exec("ALTER TABLE `location_machines` 
                ADD COLUMN `score1` BIGINT DEFAULT 0, ADD COLUMN `score2` BIGINT DEFAULT 0, ADD COLUMN `score3` BIGINT DEFAULT 0, ADD COLUMN `score4` BIGINT DEFAULT 0, ADD COLUMN `score5` BIGINT DEFAULT 0,
                ADD COLUMN `score6` BIGINT DEFAULT 0, ADD COLUMN `score7` BIGINT DEFAULT 0, ADD COLUMN `score8` BIGINT DEFAULT 0, ADD COLUMN `score9` BIGINT DEFAULT 0, ADD COLUMN `score10` BIGINT DEFAULT 0,
                ADD COLUMN `target_easy` BIGINT DEFAULT 0, ADD COLUMN `target_med` BIGINT DEFAULT 0, ADD COLUMN `target_hard` BIGINT DEFAULT 0,
                ADD UNIQUE KEY `unique_location_machine` (`location_id`, `machine_id`) ");
        }
    }

    // Ensure 'locations' table has city and state columns
    $checkLocations = $pdo->query("SHOW TABLES LIKE 'locations'")->fetch();
    if ($checkLocations) {
        $checkCity = $pdo->query("SHOW COLUMNS FROM `locations` LIKE 'city'")->fetch();
        if (!$checkCity) {
            $pdo->exec("ALTER TABLE `locations` ADD COLUMN `city` VARCHAR(255) DEFAULT NULL AFTER `name`, ADD COLUMN `state` VARCHAR(255) DEFAULT NULL AFTER `city` ");
        }
    }

    // Ensure 'target_scores' table has the unique constraint for round configuration
    $checkTargets = $pdo->query("SHOW TABLES LIKE 'target_scores'")->fetch();
    if ($checkTargets) {
        $checkIndex = $pdo->query("SHOW INDEX FROM `target_scores` WHERE Key_name = 'unique_event_round'")->fetch();
        if (!$checkIndex) {
            $pdo->exec("ALTER TABLE `target_scores` ADD UNIQUE KEY `unique_event_round` (event_id, order_number)");
        }
    }

    // Ensure 'scores' table has the unique constraint for upsert logic
    $checkScores = $pdo->query("SHOW TABLES LIKE 'scores'")->fetch();
    if ($checkScores) {
        // Fix: Remove the overly restrictive index that ignores event_id
        $checkOldIndex = $pdo->query("SHOW INDEX FROM `scores` WHERE Key_name = 'player_id_2' OR (Column_name = 'order_number' AND Seq_in_index = 2 AND Key_name != 'unique_player_round')")->fetch();
        if ($checkOldIndex) {
            // We need to be careful to only drop the index that lacks event_id. 
            // Based on your DB output, it's likely named 'player_id' or 'player_id_2'
            $indexName = $checkOldIndex['Key_name'];
            $pdo->exec("ALTER TABLE `scores` DROP INDEX `$indexName` ");
        }

        $checkIndex = $pdo->query("SHOW INDEX FROM `scores` WHERE Key_name = 'unique_player_round'")->fetch();
        if (!$checkIndex) {
            $pdo->exec("ALTER TABLE `scores` ADD UNIQUE KEY `unique_player_round` (event_id, player_id, order_number)");
        }
    }
}

// Handle HTTP Method Tunneling for environments that block DELETE/PUT.
// This allows us to use POST with a special header to perform other actions.
$headers = function_exists('getallheaders') ? getallheaders() : [];
$methodOverride = $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? $headers['X-HTTP-Method-Override'] ?? $headers['x-http-method-override'] ?? null;
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $methodOverride) {
    $_SERVER['REQUEST_METHOD'] = strtoupper($methodOverride);
}

// Set global CORS headers to prevent NetworkErrors during preflighted requests (DELETE, PUT, etc.)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-PB-SECRET, X-LEAGUE-PASSWORD, X-HTTP-Method-Override');

// Handle CORS preflight requests globally. This is required because custom 
// headers like X-PB-SECRET trigger an OPTIONS request for ALL method types.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

/**
 * Validates access to a specific league.
 * Access is granted if the global admin secret is correct OR if the
 * provided league-specific password matches.
 * 
 * @param PDO $pdo
 * @param int $leagueId
 * @return void
 */
function validateLeagueAccess($pdo, $leagueId) {
    global $apiSecret, $adminPassword;
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $providedSecret = $_SERVER['HTTP_X_PB_SECRET'] ?? $headers['X-PB-SECRET'] ?? $headers['x-pb-secret'] ?? $_SERVER['REDIRECT_HTTP_X_PB_SECRET'] ?? null;
    $providedLeaguePass = $_SERVER['HTTP_X_LEAGUE_PASSWORD'] ?? $headers['X-LEAGUE-PASSWORD'] ?? $headers['x-league-password'] ?? null;

    // 1. Check if the provided League Pass matches the Global Admin Password (Master Override)
    if ($providedLeaguePass === $adminPassword) return;

    // 2. Check League Specific Password
    if (!$leagueId) sendJson(['error' => 'League ID required for validation'], 400);

    $stmt = $pdo->prepare('SELECT password FROM leagues WHERE id = ?');
    $stmt->execute([(int)$leagueId]);
    $hash = $stmt->fetchColumn();

    if (!$hash) return; // League has no password set

    if (!$providedLeaguePass || !password_verify($providedLeaguePass, $hash)) {
        sendJson(['error' => 'Unauthorized: Invalid League Password'], 401);
    }
}

/**
 * Security Gatekeeper. Verifies the custom X-PB-SECRET header against
 * the server-side API_SECRET. Rejects unauthorized write requests.
 * @return void
 */
function validateApiSecret() {
    global $apiSecret;
    
    // Hosted environments (CGI/FastCGI) often rename or strip custom headers.
    // We check common variations and Apache-specific header arrays.
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $providedSecret = $_SERVER['HTTP_X_PB_SECRET'] ?? $headers['X-PB-SECRET'] ?? $headers['x-pb-secret'] ?? $_SERVER['REDIRECT_HTTP_X_PB_SECRET'] ?? null;

    if (!$providedSecret || $providedSecret !== $apiSecret) {
        sendJson(['error' => 'Unauthorized: Invalid or missing API secret'], 401);
    }
}

/**
 * Standardized JSON response handler.
 * @param mixed $data Data to encode.
 * @param int $status HTTP status code.
 */
function sendJson($data, $status = 200) {
    if (ob_get_length()) ob_clean();
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Reads and decodes JSON data from the request body.
 * @return array
 */
function getJsonInput() {
    $body = file_get_contents('php://input');
    return json_decode($body, true) ?: [];
}

/**
 * Appends the current UI_VERSION to an asset path for cache-busting.
 * Converts /path/file.js to /v1.1.1/path/file.js
 * @param string $path Path to the asset (js/css).
 * @return string
 */
function versionedAsset($path) {
    global $uiVersion, $baseUrl;
    // Extract the part of the path after the base URL
    $relativePath = str_replace($baseUrl, '', $path);
    // Prepend the version segment: /baseUrl/v1.1.1/relativePath
    return $baseUrl . '/v' . $uiVersion . '/' . ltrim($relativePath, '/');
}
