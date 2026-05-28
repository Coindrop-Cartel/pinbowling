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

// Handle CORS preflight requests globally. This is required because custom 
// headers like X-PB-SECRET trigger an OPTIONS request for ALL method types.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-PB-SECRET, X-HTTP-Method-Override');
    exit;
}

/**
 * Ensures required database tables exist.
 * 
 * This function is designed to be idempotent. It handles the initial 
 * creation of the schema and subsequent migrations (e.g., renaming 
 * columns or adding junction tables for leagues/players) to ensure 
 * data continuity across application versions.
 */
function initDatabase() {
    $pdo = getDbConnection();

    $pdo->exec("CREATE TABLE IF NOT EXISTS Locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        city VARCHAR(100) DEFAULT NULL,
        state VARCHAR(50) DEFAULT NULL
    )");

    try {
        $pdo->exec("ALTER TABLE Locations ADD COLUMN city VARCHAR(100) DEFAULT NULL, ADD COLUMN state VARCHAR(50) DEFAULT NULL");
    } catch (PDOException $e) { /* Columns likely already exist */ }

    $pdo->exec("CREATE TABLE IF NOT EXISTS Machines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_name VARCHAR(255) NOT NULL UNIQUE
    )");

    // --- Migration: Machines v2 ---
    // Decouples round mapping from the master machine title. 
    // Moves scoring thresholds to Target_Scores and Location_Machines.
    try {
        $pdo->exec("ALTER TABLE Machines DROP COLUMN frame_number");
    } catch (PDOException $e) { /* Column likely doesn't exist or other error */ }
    for ($i = 1; $i <= 10; $i++) {
        try {
            $pdo->exec("ALTER TABLE Machines DROP COLUMN score{$i}");
        } catch (PDOException $e) { /* Column likely doesn't exist or other error */ }
    }
    try {
        $pdo->exec("ALTER TABLE Machines ADD UNIQUE (machine_name)");
    } catch (PDOException $e) { /* Constraint likely already exists */ }

    $pdo->exec("CREATE TABLE IF NOT EXISTS Location_Machines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        location_id INT NOT NULL,
        machine_id INT NOT NULL,
        score1 INT NOT NULL DEFAULT 0,
        score2 INT NOT NULL DEFAULT 0,
        score3 INT NOT NULL DEFAULT 0,
        score4 INT NOT NULL DEFAULT 0,
        score5 INT NOT NULL DEFAULT 0,
        score6 INT NOT NULL DEFAULT 0,
        score7 INT NOT NULL DEFAULT 0,
        score8 INT NOT NULL DEFAULT 0,
        score9 INT NOT NULL DEFAULT 0,
        score10 INT NOT NULL DEFAULT 0,
        target_easy INT NOT NULL DEFAULT 0,
        target_med INT NOT NULL DEFAULT 0,
        target_hard INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_loc_machine (location_id, machine_id),
        CONSTRAINT fk_loc_mach_location FOREIGN KEY (location_id) REFERENCES Locations(id) ON DELETE CASCADE,
        CONSTRAINT fk_loc_mach_machine FOREIGN KEY (machine_id) REFERENCES Machines(id) ON DELETE CASCADE
    )");

    try {
        $pdo->exec("ALTER TABLE Location_Machines ADD COLUMN target_easy INT NOT NULL DEFAULT 0, ADD COLUMN target_med INT NOT NULL DEFAULT 0, ADD COLUMN target_hard INT NOT NULL DEFAULT 0");
    } catch (PDOException $e) { /* Columns likely already exist */ }

    $pdo->exec("CREATE TABLE IF NOT EXISTS Players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_name VARCHAR(255) NOT NULL UNIQUE,
        ifpa_id VARCHAR(50) DEFAULT NULL,
        matchplay_id VARCHAR(50) DEFAULT NULL
    )");

    // Migrate existing Players table if columns are missing
    try {
        $pdo->exec("ALTER TABLE Players ADD COLUMN ifpa_id VARCHAR(50) DEFAULT NULL");
        $pdo->exec("ALTER TABLE Players ADD COLUMN matchplay_id VARCHAR(50) DEFAULT NULL");
    } catch (PDOException $e) { /* Columns likely already exist */ }

    $pdo->exec("CREATE TABLE IF NOT EXISTS Leagues (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        start_date DATE DEFAULT NULL
    )");

    // Junction table for many-to-many relationship between Leagues and Players.
    // Allows a global player registry while filtering scoring by league membership.
    $pdo->exec("CREATE TABLE IF NOT EXISTS League_Players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        league_id INT NOT NULL,
        player_id INT NOT NULL,
        UNIQUE KEY uq_league_player (league_id, player_id),
        CONSTRAINT fk_lp_league FOREIGN KEY (league_id) REFERENCES Leagues(id) ON DELETE CASCADE,
        CONSTRAINT fk_lp_player FOREIGN KEY (player_id) REFERENCES Players(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS Events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        league_id INT DEFAULT NULL,
        location_id INT DEFAULT NULL,
        event_name VARCHAR(255) NOT NULL,
        event_date DATE DEFAULT NULL,
        CONSTRAINT fk_event_league FOREIGN KEY (league_id) REFERENCES Leagues(id) ON DELETE CASCADE,
        CONSTRAINT fk_event_location FOREIGN KEY (location_id) REFERENCES Locations(id) ON DELETE SET NULL
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS Target_Scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL,
        machine_id INT NOT NULL,
        order_number INT NOT NULL,
        score1 INT NOT NULL DEFAULT 0,
        score2 INT NOT NULL DEFAULT 0,
        score3 INT NOT NULL DEFAULT 0,
        score4 INT NOT NULL DEFAULT 0,
        score5 INT NOT NULL DEFAULT 0,
        score6 INT NOT NULL DEFAULT 0,
        score7 INT NOT NULL DEFAULT 0,
        score8 INT NOT NULL DEFAULT 0,
        score9 INT NOT NULL DEFAULT 0,
        score10 INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_event_order (event_id, order_number),
        CONSTRAINT fk_target_event FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE,
        CONSTRAINT fk_target_machine FOREIGN KEY (machine_id) REFERENCES Machines(id) ON DELETE CASCADE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS Scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT DEFAULT NULL,
        player_id INT NOT NULL,
        order_number INT NOT NULL,
        machine_id INT NOT NULL,
        ball1 INT NOT NULL DEFAULT 0,
        ball2 INT NOT NULL DEFAULT 0,
        ball3 INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_player_order_event (player_id, order_number, event_id),
        INDEX idx_player_id (player_id),
        INDEX idx_machine_id (machine_id),
        CONSTRAINT fk_scores_player FOREIGN KEY (player_id) REFERENCES Players(id) ON DELETE CASCADE,
        CONSTRAINT fk_scores_machine FOREIGN KEY (machine_id) REFERENCES Machines(id) ON DELETE CASCADE,
        CONSTRAINT fk_scores_event FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE
    )");

    // --- Migration: Round to Order ---
    try {
        $pdo->exec("ALTER TABLE Target_Scores CHANGE COLUMN frame_number order_number INT NOT NULL");
        $pdo->exec("ALTER TABLE Target_Scores DROP INDEX uq_event_frame, ADD UNIQUE KEY uq_event_order (event_id, order_number)");
    } catch (PDOException $e) {}

    try {
        $pdo->exec("ALTER TABLE Scores CHANGE COLUMN frame order_number INT NOT NULL");
        $pdo->exec("ALTER TABLE Scores DROP INDEX uq_player_frame_event, ADD UNIQUE KEY uq_player_order_event (player_id, order_number, event_id)");
    } catch (PDOException $e) {}

    // --- Migration: Scores v2 ---
    // Aligns terminology by renaming 'tournament_id' to 'event_id'.
    try {
        // Attempt to rename tournament_id to event_id if it exists from a previous iteration
        $pdo->exec("ALTER TABLE Scores CHANGE COLUMN tournament_id event_id INT DEFAULT NULL");
    } catch (PDOException $e) { 
        try {
            $pdo->exec("ALTER TABLE Scores ADD COLUMN event_id INT DEFAULT NULL");
        } catch (PDOException $ex) { /* Column likely already exists */ }
    }
    
    try {
        $pdo->exec("ALTER TABLE Scores ADD CONSTRAINT fk_scores_event FOREIGN KEY (event_id) REFERENCES Events(id) ON DELETE CASCADE");
    } catch (PDOException $e) { /* Constraint likely already exists */ }
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
