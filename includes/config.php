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

// Ensure a session is started to support CSRF protection and authentication.
if (session_status() === PHP_SESSION_NONE && !defined('PHPUNIT_RUNNING')) {
    session_start();
}
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

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

$apiSecret = envValue($loadedEnv, ['API_SECRET']);
// UI_VERSION is used for asset cache-busting.
// package.json is the single source of truth for versioning across the project.
$packageFile = PB_BASE_DIR . '/package.json';
if (is_readable($packageFile)) {
    $packageData = json_decode(file_get_contents($packageFile), true);
    if (json_last_error() === JSON_ERROR_NONE && isset($packageData['version'])) {
        $uiVersion = $packageData['version'];
        $uiVersionSource = 'package.json';
        error_log("[PinBowling DEBUG] Successfully read UI Version '{$uiVersion}' from {$packageFile}");
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

$adminPassword = envValue($loadedEnv, ['ADMIN_PASSWORD']);

// --- Security Warnings ---
if (php_sapi_name() !== 'cli' && !defined('PHPUNIT_RUNNING')) {
    if (empty($apiSecret) || $apiSecret === 'bowl-2024-secret') {
        error_log('[PinBowling SECURITY WARNING] API_SECRET is empty or still using the insecure default. '
            . 'Set a strong API_SECRET in your .env file immediately.');
    }
    if (empty($adminPassword) || $adminPassword === 'admin123') {
        error_log('[PinBowling SECURITY WARNING] ADMIN_PASSWORD is empty or still using the insecure default. '
            . 'Set a strong ADMIN_PASSWORD in your .env file immediately.');
    }
}

// --- Shared Branding Metadata ---
// Retrieve site-wide preference from cookie (shared with JS)
$preferredFormat = $_COOKIE['pb_preferred_format'] ?? 'bowling';
$themeClass = ($preferredFormat === 'golf') ? 'theme-golf' : '';

// Global project text (Format Agnostic)
$siteBrand   = 'Pinball And Stuff';
$siteSlogan  = "Don't say \"and stuff\", just say \"There is pinball here\".";
$heroIntroText = "Like Pinball, but wish it was scored like Bowling? Like Pinball, but wish it was scored more like Golf? Like Pinball, but wish it was scored more like Basketball? 
                Well if it's the first two, we've got a site for you (if it's the 3rd one, find an NBA Fastbreak machine).";
$aboutProject = "This project is a free and open-source web application to let folks manage leagues or create one off sessions to kill time at a bar. 
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
        'themeClass' => 'theme-bowling',
        'roundLabel' => 'Frame',
        'turnHeaderPrefix' => 'Frame',
        'primaryTargetLabel' => 'Strike',
        'value1Label' => 'Strike',
        'value2Label' => '1',
        'hint'  => "Enter the cumulative score after each ball. If you reach the target score for that round, you can stop entering scores and move on to the next frame. 
                    DO NOT PLAY EXTRA BALLS",
        'lastFrameHint' => "In the last frame, you can get up to 3 strikes.  Keep playing until you hit the additional target scores or you run out of balls.",
        'thresholdStart' => 10, // Display ranks from 10 down to 1
        'thresholdEnd' => 1,
        'logic' => "Each machine has target scores corresponding to pin counts. Reaching the target on ball 1 is a strike (X). Reaching it on ball 2 is a 9-count spare (9/). 
        Reaching it on ball 3 is a spare based on your cumulative progress from balls 1 & 2 (capped at 8/). Total scores are calculated following standard bowling rules, 
        if you don't know how Bowling Score works I'm not gonna explain it to you, but I will say higher is better."
    ],
    'golf' => [
        'brand' => 'PinGolf',
        'logo'  => 'pingolf.png',
        'cta'   => "Let's Golf!",
        'themeClass' => 'theme-golf',
        'roundLabel' => 'Hole',
        'turnHeaderPrefix' => 'Hole',
        'primaryTargetLabel' => 'Par',
        'value1Label' => 'Target Score',
        'value2Label' => 'Par',
        'hint'  => "Enter the cumulative score after each ball. When you hit the target score you can stop entering scores for that round and move on to the next hole.
                    DO NOT PLAY EXTRA BALLS",
        'lastFrameHint' => "",
        'thresholdStart' => 3, // Display ranks from 3 up to 10
        'thresholdEnd' => 10,
        'logic' => "Strokes 1, 2, or 3 are awarded based on which ball reached the Target Score. If the target is not met within three balls, 
        a score of 4-10 is assigned based on the final cumulative score relative the target scores for that hole and then scored relative to the par value (-1, +2, etc).  
        If you don't know how Golf scoring works, I don't really know what to tell you, but I will say lower is better."
    ]
];

$active = $engineMeta[$preferredFormat] ?? $engineMeta['bowling'];
$bodyClass = $active['themeClass'];

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
    }
    return $pdo;
}

// Include modularized HTTP and Utility helpers
require_once PB_INC_DIR . '/http.php';
// Include modularized auth helpers
require_once PB_INC_DIR . '/auth.php';
// Include data serializers
require_once PB_INC_DIR . '/serializers.php';

// Add the includes directory to the PHP include_path to allow cleaner require statements
set_include_path(get_include_path() . PATH_SEPARATOR . PB_INC_DIR);
