<?php
/**
 * Database Connectivity Diagnostic Tool.
 * 
 * Provides a visual summary of the connection status, environment variables, 
 * and current database tables to assist with initial setup and troubleshooting.
 */
require_once __DIR__ . '/includes/config.php';

try {
    $pdo = getDbConnection();

    $stmt = $pdo->query('SELECT DATABASE() AS dbname, @@hostname AS hostname');
    $info = $stmt->fetch(PDO::FETCH_ASSOC);

    global $DB_HOST, $DB_PORT, $DB_NAME;
    $configuredHost = $DB_HOST;
    $configuredPort = $DB_PORT;
    $configuredDb = $DB_NAME;

    $phpVersion = PHP_VERSION;
    $pdoDrivers = PDO::getAvailableDrivers();

    $envFound = file_exists(__DIR__ . '/.env') ? 'found' : 'not found';

    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>DB Test</title></head><body>';
    echo '<h1>Database Connection Test</h1>';
    echo '<p><strong>Status:</strong> <span style="color:green;">Connected</span></p>';
    
    echo '<h2>System Info</h2>';
    echo '<p><strong>PHP Version:</strong> ' . htmlspecialchars($phpVersion) . '</p>';
    echo '<p><strong>PDO Drivers:</strong> ' . htmlspecialchars(implode(', ', $pdoDrivers)) . '</p>';
    
    echo '<h2>Database Info</h2>';
    echo '<p><strong>Connected host:</strong> ' . htmlspecialchars($info['hostname'] ?? 'unknown') . '</p>';
    echo '<p><strong>Connected database:</strong> ' . htmlspecialchars($info['dbname'] ?? 'unknown') . '</p>';
    
    echo '<h2>Configured values</h2>';
    echo '<p><strong>Configured host:</strong> ' . htmlspecialchars($configuredHost) . '</p>';
    echo '<p><strong>Configured port:</strong> ' . htmlspecialchars($configuredPort) . '</p>';
    echo '<p><strong>Configured database:</strong> ' . htmlspecialchars($configuredDb) . '</p>';
    echo '<p><strong>.env file status:</strong> ' . htmlspecialchars($envFound) . '</p>';

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

    echo '<p>Visit <code>index.php</code> or <code>players.php</code> to use the app.</p>';
    echo '</body></html>';
} catch (PDOException $e) {
    $pdoDrivers = PDO::getAvailableDrivers();
    $hasMysqlDriver = in_array('mysql', $pdoDrivers);
    
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>DB Test</title></head><body>';
    echo '<h1>Database Connection Test Failed</h1>';
    
    if (!$hasMysqlDriver) {
        echo '<p style="color:red; font-weight:bold;">Error: The PHP <code>pdo_mysql</code> extension is not installed or enabled.</p>';
        echo '<p>On TurnKey/Debian, try: <code>sudo apt-get install php-mysql</code> and restart Apache.</p>';
    }

    echo '<p><strong>Error:</strong></p>';
    echo '<pre>' . htmlspecialchars($e->getMessage()) . '</pre>';
    
    echo '<h2>Troubleshooting Hints</h2>';
    echo '<ul>';
    if (strpos($e->getMessage(), 'Access denied') !== false) {
        echo '<li>Check your <strong>DB_USER</strong> and <strong>DB_PASS</strong>.</li>';
        echo '<li>If using <code>root</code>, MariaDB might require a dedicated user for web access.</li>';
    }
    if (strpos($e->getMessage(), 'Connection refused') !== false || strpos($e->getMessage(), 'nosuchfile') !== false) {
        echo '<li>If <code>DB_HOST</code> is <code>localhost</code>, try <code>127.0.0.1</code>.</li>';
        echo '<li>Verify the MariaDB service is running: <code>systemctl status mariadb</code>.</li>';
    }
    if (strpos($e->getMessage(), 'Unknown database') !== false) {
        echo '<li>The database <code>' . htmlspecialchars($DB_NAME) . '</code> does not exist. Create it via terminal: <code>CREATE DATABASE ' . $DB_NAME . ';</code></li>';
    }
    echo '</ul>';

    echo '<p>Check your `config.php` values and .env file.</p>';
    echo '</body></html>';
    exit;
}
