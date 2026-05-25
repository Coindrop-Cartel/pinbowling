<?php
require_once __DIR__ . '/config.php';

try {
    $pdo = getDbConnection();
    $stmt = $pdo->query('SELECT DATABASE() AS dbname, @@hostname AS hostname');
    $info = $stmt->fetch(PDO::FETCH_ASSOC);

    global $DB_HOST, $DB_PORT, $DB_NAME, $DB_USER, $DB_PASS, $DB_DSN;
    $configuredHost = $DB_HOST;
    $configuredPort = $DB_PORT;
    $configuredDb = $DB_NAME;
    $configuredUser = $DB_USER;
    $configuredDsn = $DB_DSN;
    $envFound = file_exists(__DIR__ . '/.env') ? 'found' : 'not found';
    $envPath = realpath(__DIR__ . '/.env') ?: __DIR__ . '/.env';
    $configPath = realpath(__DIR__ . '/config.php') ?: __DIR__ . '/config.php';

    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>DB Test</title></head><body>';
    echo '<h1>Database Connection Test</h1>';
    echo '<p><strong>Status:</strong> <span style="color:green;">Connected</span></p>';
    echo '<p><strong>Connected host:</strong> ' . htmlspecialchars($info['hostname'] ?? 'unknown') . '</p>';
    echo '<p><strong>Connected database:</strong> ' . htmlspecialchars($info['dbname'] ?? 'unknown') . '</p>';
    echo '<h2>Configured values</h2>';
    echo '<p><strong>Config file path:</strong> ' . htmlspecialchars($configPath) . '</p>';
    echo '<p><strong>.env path:</strong> ' . htmlspecialchars($envPath) . '</p>';
    echo '<p><strong>Configured host:</strong> ' . htmlspecialchars($configuredHost) . '</p>';
    echo '<p><strong>Configured port:</strong> ' . htmlspecialchars($configuredPort) . '</p>';
    echo '<p><strong>Configured database:</strong> ' . htmlspecialchars($configuredDb) . '</p>';
    echo '<p><strong>Configured user:</strong> ' . htmlspecialchars($configuredUser) . '</p>';
    echo '<p><strong>.env file:</strong> ' . $envFound . '</p>';
    echo '<p><strong>.env contents:</strong></p>';
    echo '<pre>' . htmlspecialchars(file_get_contents(__DIR__ . '/.env')) . '</pre>';
    echo '<p><strong>DSN:</strong> ' . htmlspecialchars($configuredDsn) . '</p>';

    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_NUM);
    echo '<h2>Tables</h2>';
    if (count($tables) === 0) {
        echo '<p>No tables found.</p>';
    } else {
        echo '<ul>';
        foreach ($tables as $table) {
            echo '<li>' . htmlspecialchars($table[0]) . '</li>';
        }
        echo '</ul>';
    }

    echo '<p>Visit <code>index.html</code> or <code>players.html</code> to use the app.</p>';
    echo '</body></html>';
} catch (PDOException $e) {
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>DB Test</title></head><body>';
    echo '<h1>Database Connection Test Failed</h1>';
    echo '<p><strong>Error:</strong></p>';
    echo '<pre>' . htmlspecialchars($e->getMessage()) . '</pre>';
    echo '<p>Check your `config.php` values and .env file.</p>';
    echo '</body></html>';
    exit;
}
