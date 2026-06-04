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

// Asset Configuration
$stylesDir = 'styles'; // Folder name for CSS files. Set to '' if files are in the root.

$apiSecret = envValue($loadedEnv, ['API_SECRET'], 'bowl-2024-secret');
// UI_VERSION is used for asset cache-busting. 
// It is read from version.txt to allow cache-busting updates without touching environment secrets.
$versionFile = __DIR__ . '/../version.txt';
$isReadable = is_readable($versionFile);
$uiVersion = $isReadable ? trim(file_get_contents($versionFile)) : '1.0.0';
$uiVersionSource = $isReadable ? 'version.txt' : 'Hardcoded Fallback';

$adminPassword = envValue($loadedEnv, ['ADMIN_PASSWORD'], 'admin123');
$debugMode = false; // Initial state; toggled via Management UI and persisted in localStorage.

// --- Shared Branding Metadata ---
// Retrieve site-wide preference from cookie (shared with JS)
$preferredFormat = $_COOKIE['pb_preferred_format'] ?? 'bowling';
$themeClass = ($preferredFormat === 'golf') ? 'theme-golf' : '';

// Global project text (Format Agnostic)
$siteBrand   = 'Pinball And Stuff';
$siteSlogan  = "Don't say \"and stuff\", just say \"There is pinball here\".";
$aboutProject = "Like Pinball, but wish it was scored like Bowling?  Like Pinball, but wish it was scored more like Golf? Like Pinball, but wish it was scored more like Basketball?  
                Well if it's the first two, we've got a site for you (if it's the 3rd one, find an NBA Fastbreak machine, perferablely linked.  I know a guy). 
                <br><br> 
                This project is a free and open-source web application to let folks manage leagues or create one off sessions to kill time at a bar.  
                At some point the links to the source code on github will be on some other page, but I haven't gotten to that.";
$aiDisclosure = "I don't feel like AI \"generated\" this site, but at this point it's pretty hard to code without it being involved in some part of your workflow.  
                I don't consider that \"generating\" code because the design, structure, layout and logos were all designed and reviewed by a human (one human to be specific), 
                but I also don't want to be misleading about the fact that it was used to help generate the backend, stardized pages and track down issues and syntax.  
                <br><br>
                Unfortunately this means that some text in some locations may have been overriden and I didn't notice (but I'm working tracking that down).  
                AI has a tendancy left unchecked to overstep bounds and include dumb corporate speak when I just want it track down some syntax issue or find out why a dropdown won't go away.  
                If you have questions about how it was used, feel free to ask.  I have a complicated relationship with AI so be prepared for a long rambling answer. 
                <br><br>
                <b>If given all this you feel like it was and that makes it a hard pass for you, I totally undersatnd.</b>";

$engineMeta = [
    'bowling' => [
        'brand' => 'PinBowling',
        'logo'  => 'pinbowling.png',
        'cta'   => "Let's Bowl!",
        'hint'  => "Enter the cumulative score after each ball. If you reach the target score for that round, you can stop entering scores and move on to the next frame. 
                    DO NOT PLAY EXTRA BALLS",
        'lastFrameHint' => "In the last frame, you can get up to 3 strikes.  Keep playing until you hit the additional target scores or you run out of balls.",
        'logic' => "Each machine has target scores corresponding to pin counts. Reaching the target on ball 1 is a strike (X). Reaching it on ball 2 is a 9-count spare (9/). 
        Reaching it on ball 3 is a spare based on your cumulative progress from balls 1 & 2 (capped at 8/). Total scores are calculated following standard bowling rules, 
        if you don't know how Bowling Score works I'm not gonna explain it to you, but I will say higher is better."
    ],
    'golf' => [
        'brand' => 'PinGolf',
        'logo'  => 'pingolf.png',
        'cta'   => "Let's Golf!",
        'hint'  => "Enter the cumulative score after each ball. When you hit the target score you can stop entering scores for that round and move on to the next hole.
                    DO NOT PLAY EXTRA BALLS",
        'logic' => "Strokes 1, 2, or 3 are awarded based on which ball reached the Target Score. If the target is not met within three balls, 
        a score of 4-10 is assigned based on the final cumulative score relative the target scores for that hole and then scored relative to the par value (-1, +2, etc).  
        If you don't know how Golf scoring works, I don't really know what to tell you, but I will say lower is better."
    ]
];

$active = $engineMeta[$preferredFormat] ?? $engineMeta['bowling'];

$dbDsn = "mysql:host={$dbHost};port={$dbPort};dbname={$dbName};charset={$dbCharset}";

/**
 * Established a singleton PDO connection to the MySQL database.
 * @return PDO
 */
function getDbConnection($mockPdo = null) {
    global $dbDsn, $dbUser, $dbPass;
    static $pdo = null;
    if ($mockPdo !== null) {
        $pdo = $mockPdo;
        return $pdo;
    }
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
    global $adminPassword;
    // --- Base Table Creation ---
    // We use CREATE TABLE IF NOT EXISTS to ensure the database can be rebuilt 
    // automatically if tables are dropped or if starting a fresh installation.
    
    $pdo->exec("CREATE TABLE IF NOT EXISTS `locations` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL,
        `city` VARCHAR(255) DEFAULT NULL,
        `state` VARCHAR(255) DEFAULT NULL,
        UNIQUE KEY `unique_location` (`name`, `city`, `state`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `machines` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `machine_name` VARCHAR(255) NOT NULL UNIQUE,
        `year` INT DEFAULT NULL,
        `manufacturer` VARCHAR(255) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `players` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `player_name` VARCHAR(255) NOT NULL UNIQUE,
        `ifpa_id` VARCHAR(50) DEFAULT NULL,
        `matchplay_id` VARCHAR(50) DEFAULT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `leagues` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL,
        `type` ENUM('standard', 'session') DEFAULT 'standard',
        `start_date` DATE DEFAULT NULL,
        `scoring_format` VARCHAR(50) DEFAULT 'bowling'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `users` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `player_id` INT UNIQUE,
        `username` VARCHAR(255) UNIQUE NOT NULL,
        `password_hash` VARCHAR(255) NOT NULL,
        `role` ENUM('player', 'td', 'admin') DEFAULT 'player',
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT `fk_user_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `league_staff` (
        `league_id` INT NOT NULL,
        `user_id` INT NOT NULL,
        PRIMARY KEY (`league_id`, `user_id`),
        CONSTRAINT `fk_staff_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_staff_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `events` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `league_id` INT NOT NULL,
        `location_id` INT DEFAULT NULL,
        `event_name` VARCHAR(255) NOT NULL,
        `event_date` DATE DEFAULT NULL,
        `scoring_format` VARCHAR(50) DEFAULT 'bowling',
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS `score_history` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `score_id` INT DEFAULT NULL,
        `event_id` INT NOT NULL,
        `player_id` INT NOT NULL,
        `order_number` INT NOT NULL,
        `machine_id` INT NOT NULL,
        `ball1` BIGINT DEFAULT 0,
        `ball2` BIGINT DEFAULT 0,
        `ball3` BIGINT DEFAULT 0,
        `status` ENUM('pending', 'approved') DEFAULT 'approved',
        `change_type` ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
        `changed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        `value1` BIGINT DEFAULT 0,
        `value2` BIGINT DEFAULT 0,
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
        `value1` BIGINT DEFAULT 0,
        `value2` BIGINT DEFAULT 0,
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

    // Ensure 'machines' table has year and manufacturer
    $checkMachines = $pdo->query("SHOW TABLES LIKE 'machines'")->fetch();
    if ($checkMachines) {
        $checkYear = $pdo->query("SHOW COLUMNS FROM `machines` LIKE 'year'")->fetch();
        if (!$checkYear) {
            $pdo->exec("ALTER TABLE `machines` ADD COLUMN `year` INT DEFAULT NULL AFTER `machine_name`, ADD COLUMN `manufacturer` VARCHAR(255) DEFAULT NULL AFTER `year` ");
        }
    }

    // Ensure 'users' table uses 'username' instead of 'email'
    $checkUsers = $pdo->query("SHOW TABLES LIKE 'users'")->fetch();
    if ($checkUsers) {
        $checkEmail = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'email'")->fetch();
        if ($checkEmail) {
            // Migrate existing email column to username
            $pdo->exec("ALTER TABLE `users` CHANGE `email` `username` VARCHAR(255) NOT NULL");
        }
    }

    // Ensure 'leagues' table has the 'type' column for standard vs session distinction
    if ($checkLeagues) {
        $checkType = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'type'")->fetch();
        if (!$checkType) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `type` ENUM('standard', 'session') DEFAULT 'standard' AFTER `name` ");
        }
    }

    // Ensure 'leagues' table has the 'scoring_format' column for default scoring engine
    if ($checkLeagues) {
        $checkLeagueScoring = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'scoring_format'")->fetch();
        if (!$checkLeagueScoring) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `scoring_format` VARCHAR(50) DEFAULT 'bowling' AFTER `start_date` ");
        }
    }

    // Ensure 'events' table has the 'scoring_format' column
    $checkEvents = $pdo->query("SHOW TABLES LIKE 'events'")->fetch();
    if ($checkEvents) {
        $checkScoring = $pdo->query("SHOW COLUMNS FROM `events` LIKE 'scoring_format'")->fetch();
        if (!$checkScoring) {
            $pdo->exec("ALTER TABLE `events` ADD COLUMN `scoring_format` VARCHAR(50) DEFAULT 'bowling' AFTER `event_date` ");
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

    // Ensure 'target_scores' and 'location_machines' have value1 and value2 source columns
    $checkTSValue1 = $pdo->query("SHOW COLUMNS FROM `target_scores` LIKE 'value1'")->fetch();
    if (!$checkTSValue1) {
        $pdo->exec("ALTER TABLE `target_scores` ADD COLUMN `value1` BIGINT DEFAULT 0 AFTER `order_number`, ADD COLUMN `value2` BIGINT DEFAULT 0 AFTER `value1` ");
    }

    $checkLMValue1 = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'value1'")->fetch();
    if (!$checkLMValue1) {
        $pdo->exec("ALTER TABLE `location_machines` ADD COLUMN `value1` BIGINT DEFAULT 0 AFTER `note`, ADD COLUMN `value2` BIGINT DEFAULT 0 AFTER `value1` ");
    }

    // Ensure 'locations' table has city and state columns
    $checkLocations = $pdo->query("SHOW TABLES LIKE 'locations'")->fetch();
    if ($checkLocations) {
        $checkCity = $pdo->query("SHOW COLUMNS FROM `locations` LIKE 'city'")->fetch();
        if (!$checkCity) {
            $pdo->exec("ALTER TABLE `locations` ADD COLUMN `city` VARCHAR(255) DEFAULT NULL AFTER `name`, ADD COLUMN `state` VARCHAR(255) DEFAULT NULL AFTER `city` ");
        }

        // Drop the overly restrictive 'name' index and replace with a composite one
        $checkOldIndex = $pdo->query("SHOW INDEX FROM `locations` WHERE Key_name = 'name'")->fetch();
        if ($checkOldIndex) {
            $pdo->exec("ALTER TABLE `locations` DROP INDEX `name` ");
        }
        $checkNewIndex = $pdo->query("SHOW INDEX FROM `locations` WHERE Key_name = 'unique_location'")->fetch();
        if (!$checkNewIndex) {
            $pdo->exec("ALTER TABLE `locations` ADD UNIQUE KEY `unique_location` (`name`, `city`, `state`) ");
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

    // --- Seed Default Admin User ---
    // If no admin user exists, create one using the ADMIN_PASSWORD from .env
    $checkAdmin = $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
    if ($checkAdmin == 0) {
        $hashed = password_hash($adminPassword, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)");
        $stmt->execute(['admin', $hashed, 'admin']);
    }

    // Ensure 'scores' table has the unique constraint for upsert logic
    $checkScores = $pdo->query("SHOW TABLES LIKE 'scores'")->fetch();
    if ($checkScores) {
        // Fix: Remove the overly restrictive index that ignores event_id

        // Add status column for approval workflow
        $checkStatus = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'status'")->fetch();
        if (!$checkStatus) {
            $pdo->exec("ALTER TABLE `scores` ADD COLUMN `status` ENUM('pending', 'approved') DEFAULT 'approved' AFTER `ball3` ");
        }

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
header('Access-Control-Allow-Headers: Content-Type, X-PB-SECRET, X-HTTP-Method-Override');

// Handle CORS preflight requests globally. This is required because custom 
// headers like X-PB-SECRET trigger an OPTIONS request for ALL method types.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

/**
 * Helper to get the currently authenticated user from the session.
 */
function getCurrentUser() {
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
    return $_SESSION['user'] ?? null;
}

/**
 * Checks if the current user has permission to manage a specific league.
 */
function canManageLeague($pdo, $leagueId) {
    $user = getCurrentUser();
    if (!$user) return false;
    if ($user['role'] === 'admin') return true;
    
    if ($user['role'] === 'td') {
        $stmt = $pdo->prepare("SELECT 1 FROM league_staff WHERE league_id = ? AND user_id = ?");
        $stmt->execute([$leagueId, $user['id']]);
        return (bool)$stmt->fetch();
    }
    return false;
}

/**
 * Helper to retrieve custom headers from various server environments.
 * Handles standard, lowercase, and REDIRECT_ prefixed variants (common in CGI/FastCGI).
 */
function getHeader($name) {
    static $headers = null;
    if ($headers === null) {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
    }
    
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return $_SERVER[$serverKey] 
        ?? $headers[$name] 
        ?? $headers[strtolower($name)] 
        ?? $_SERVER["REDIRECT_$serverKey"] 
        ?? null;
}

/**
 * Validates access to a specific league.
 * Access is granted if the global admin secret is correct OR if the
 * provided league-specific password matches.
 */
function validateLeagueAccess($pdo, $leagueId) {
    global $apiSecret;

    $providedSecret = getHeader('X-PB-Secret');

    // 1. Master Overrides: Session Role or API Secret
    $user = getCurrentUser();
    if ($user && ($user['role'] === 'admin' || $user['role'] === 'td')) {
        return;
    }

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }

    // If we reach here and it's a restricted action, we'll rely on the specific service logic
}

/**
 * Verifies that the provided credentials match the Global Admin Password or API Secret.
 * Used for system-wide modifications like master machine/player editing.
 */
function validateAdminAccess() {
    global $apiSecret;

    $providedSecret = getHeader('X-PB-Secret');

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }
    
    $user = getCurrentUser();
    if ($user && $user['role'] === 'admin') {
        return;
    }

    sendJson(['error' => 'Unauthorized: Admin access required'], 401);
}

/**
 * Verifies that the user is at least a TD or has master credentials.
 */
function validateTDAccess() {
    global $apiSecret;

    $providedSecret = getHeader('X-PB-Secret');

    if ($providedSecret && $providedSecret === $apiSecret) {
        return;
    }
    
    $user = getCurrentUser();
    if ($user && ($user['role'] === 'admin' || $user['role'] === 'td')) {
        return;
    }

    sendJson(['error' => 'Unauthorized: TD or Admin access required'], 401);
}

/**
 * Security Gatekeeper. Verifies the custom X-PB-SECRET header against
 * the server-side API_SECRET. Rejects unauthorized write requests.
 */
function validateApiSecret() {
    global $apiSecret;

    $providedSecret = getHeader('X-PB-Secret');

    if ($providedSecret === $apiSecret) {
        return;
    }

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
