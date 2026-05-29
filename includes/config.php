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

$DB_HOST = envValue($loadedEnv, ['DB_HOST', 'MYSQL_HOST'], 'localhost');
$DB_PORT = envValue($loadedEnv, ['DB_PORT', 'MYSQL_PORT'], '3306');
$DB_NAME = envValue($loadedEnv, ['DB_NAME', 'MYSQL_DATABASE'], 'pinbowling');
$DB_USER = envValue($loadedEnv, ['DB_USER', 'MYSQL_USER'], 'username');
$DB_PASS = envValue($loadedEnv, ['DB_PASS', 'MYSQL_PASSWORD'], 'password');
$DB_CHARSET = 'utf8mb4';
$API_SECRET = envValue($loadedEnv, ['API_SECRET'], 'bowl-2024-secret');
// UI_VERSION is used for asset cache-busting. 
// It prioritizes .env, but falls back to the modification time of index.php.
// Deployment Tip: 'touch index.php' on the server to force-clear client caches.
$UI_VERSION = envValue($loadedEnv, ['UI_VERSION'], @filemtime(__DIR__ . '/../index.php') ?: '1.0.0');
$ADMIN_PASSWORD = envValue($loadedEnv, ['ADMIN_PASSWORD'], 'admin123');

$DB_DSN = "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset={$DB_CHARSET}";

/**
 * Established a singleton PDO connection to the MySQL database.
 * @return PDO
 */
function getDbConnection() {
    global $DB_DSN, $DB_USER, $DB_PASS;
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO($DB_DSN, $DB_USER, $DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
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
    global $API_SECRET;
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $providedSecret = $_SERVER['HTTP_X_PB_SECRET'] ?? $headers['X-PB-SECRET'] ?? $headers['x-pb-secret'] ?? $_SERVER['REDIRECT_HTTP_X_PB_SECRET'] ?? null;
    $providedLeaguePass = $_SERVER['HTTP_X_LEAGUE_PASSWORD'] ?? $headers['X-LEAGUE-PASSWORD'] ?? $headers['x-league-password'] ?? null;

    // 1. Check Global Secret (Admin Override)
    if ($providedSecret === $API_SECRET) return;

    // 2. Check League Specific Password
    if (!$leagueId) sendJson(['error' => 'League ID required for validation'], 400);

    $stmt = $pdo->prepare('SELECT password FROM Leagues WHERE id = ?');
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
    global $API_SECRET;
    
    // Hosted environments (CGI/FastCGI) often rename or strip custom headers.
    // We check common variations and Apache-specific header arrays.
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $providedSecret = $_SERVER['HTTP_X_PB_SECRET'] ?? $headers['X-PB-SECRET'] ?? $headers['x-pb-secret'] ?? $_SERVER['REDIRECT_HTTP_X_PB_SECRET'] ?? null;

    if (!$providedSecret || $providedSecret !== $API_SECRET) {
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
