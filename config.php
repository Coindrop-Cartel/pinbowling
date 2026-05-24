<?php
// PinBowling PHP MySQL configuration
// Update the values below with your hosting database credentials.
// If your host provides environment variables, those are also supported.

$DB_HOST = getenv('DB_HOST') ?: getenv('MYSQL_HOST') ?: 'localhost';
$DB_NAME = getenv('DB_NAME') ?: getenv('MYSQL_DATABASE') ?: 'pinbowling';
$DB_USER = getenv('DB_USER') ?: getenv('MYSQL_USER') ?: 'username';
$DB_PASS = getenv('DB_PASS') ?: getenv('MYSQL_PASSWORD') ?: 'password';
$DB_CHARSET = 'utf8mb4';

$DB_DSN = "mysql:host={$DB_HOST};dbname={$DB_NAME};charset={$DB_CHARSET}";

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

function initDatabase() {
    $pdo = getDbConnection();

    $pdo->exec("CREATE TABLE IF NOT EXISTS Machines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        machine_name VARCHAR(255) NOT NULL,
        frame_number INT NOT NULL UNIQUE,
        score1 INT NOT NULL DEFAULT 0,
        score2 INT NOT NULL DEFAULT 0,
        score3 INT NOT NULL DEFAULT 0,
        score4 INT NOT NULL DEFAULT 0,
        score5 INT NOT NULL DEFAULT 0,
        score6 INT NOT NULL DEFAULT 0,
        score7 INT NOT NULL DEFAULT 0,
        score8 INT NOT NULL DEFAULT 0,
        score9 INT NOT NULL DEFAULT 0,
        score10 INT NOT NULL DEFAULT 0
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS Players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_name VARCHAR(255) NOT NULL UNIQUE
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS Scores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_id INT NOT NULL,
        frame INT NOT NULL,
        machine_id INT NOT NULL,
        ball1 INT NOT NULL DEFAULT 0,
        ball2 INT NOT NULL DEFAULT 0,
        ball3 INT NOT NULL DEFAULT 0,
        UNIQUE KEY uq_player_frame (player_id, frame),
        INDEX idx_player_id (player_id),
        INDEX idx_machine_id (machine_id),
        CONSTRAINT fk_scores_player FOREIGN KEY (player_id) REFERENCES Players(id) ON DELETE CASCADE,
        CONSTRAINT fk_scores_machine FOREIGN KEY (machine_id) REFERENCES Machines(id) ON DELETE CASCADE
    )");
}

function sendJson($data, $status = 200) {
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonInput() {
    $body = file_get_contents('php://input');
    return json_decode($body, true) ?: [];
}
