<?php
/**
 * Database Migration Runner.
 * 
 * Standalone CLI script for running database schema migrations.
 * This is intentionally NOT auto-loaded by config.php — migrations
 * should be run explicitly via this script or a CI pipeline.
 * 
 * Usage:
 *   php migrate.php          # Run all pending migrations
 *   php migrate.php --status # Show applied migrations
 * 
 * Each migration is tracked in the schema_migrations table for idempotency.
 */

// Prevent web access
if (php_sapi_name() !== 'cli' && !defined('MIGRATE_WEB_ALLOWED')) {
    http_response_code(403);
    echo "This script must be run from the command line.\n";
    exit(1);
}

require_once __DIR__ . '/includes/config.php';

/**
 * Ensures the tracking table for migrations exists.
 * @param PDO $pdo
 */
function ensureMigrationsTable($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `schema_migrations` (
        `migration_name` VARCHAR(255) PRIMARY KEY,
        `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

/**
 * Core migration logic extracted from config.php.
 * @param PDO $pdo
 */
function initializeDatabaseSchema($pdo) {
    global $adminPassword;
    
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
        `participants` ENUM('individual', 'team') DEFAULT 'individual',
        `start_date` DATE DEFAULT NULL,
        `scoring_format` VARCHAR(50) DEFAULT 'bowling',
        `season_scoring` ENUM('cumulative', 'weekly') DEFAULT 'weekly',
        `drop_lowest_weeks` INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `teams` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL,
        `city` VARCHAR(255) DEFAULT NULL,
        `state` VARCHAR(255) DEFAULT NULL,
        UNIQUE KEY `unique_team_location` (`name`, `city`, `state`),
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `team_members` (
        `team_id` INT NOT NULL,
        `player_id` INT NOT NULL,
        PRIMARY KEY (`team_id`, `player_id`),
        CONSTRAINT `fk_tm_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_tm_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `league_teams` (
        `league_id` INT NOT NULL,
        `team_id` INT NOT NULL,
        PRIMARY KEY (`league_id`, `team_id`),
        CONSTRAINT `fk_lt_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_lt_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE
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

    // --- Seed Default Admin User ---
    $checkAdmin = $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
    if ($checkAdmin == 0) {
        $hashed = password_hash($adminPassword, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)");
        $stmt->execute(['admin', $hashed, 'admin']);
    }

    // Ensure 'scores' table has the unique constraint for upsert logic
    $checkScores = $pdo->query("SHOW TABLES LIKE 'scores'")->fetch();
    if ($checkScores) {
        $checkStatus = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'status'")->fetch();
        if (!$checkStatus) {
            $pdo->exec("ALTER TABLE `scores` ADD COLUMN `status` ENUM('pending', 'approved') DEFAULT 'approved' AFTER `ball3` ");
        }
        $checkOldIndex = $pdo->query("SHOW INDEX FROM `scores` WHERE Key_name = 'player_id_2' OR (Column_name = 'order_number' AND Seq_in_index = 2 AND Key_name != 'unique_player_round')")->fetch();
        if ($checkOldIndex) {
            $indexName = $checkOldIndex['Key_name'];
            $pdo->exec("ALTER TABLE `scores` DROP INDEX `$indexName` ");
        }
        $checkIndex = $pdo->query("SHOW INDEX FROM `scores` WHERE Key_name = 'unique_player_round'")->fetch();
        if (!$checkIndex) {
            $pdo->exec("ALTER TABLE `scores` ADD UNIQUE KEY `unique_player_round` (event_id, player_id, order_number)");
        }
    }

    // Check for required columns and migrations in leagues
    $checkLeagues = $pdo->query("SHOW TABLES LIKE 'leagues'")->fetch();
    if ($checkLeagues) {
        $checkType = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'type'")->fetch();
        if (!$checkType) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `type` ENUM('standard', 'session') DEFAULT 'standard' AFTER `name` ");
        }
    }
}

echo "=== PinBowling Database Migration ===\n\n";

// Show status mode
if (isset($argv[1]) && $argv[1] === '--status') {
    try {
        $pdo = getDbConnection();
        ensureMigrationsTable($pdo);
        
        $stmt = $pdo->query('SELECT migration_name, applied_at FROM schema_migrations ORDER BY applied_at');
        $applied = $stmt->fetchAll();
        
        if (empty($applied)) {
            echo "No migrations have been applied yet.\n";
        } else {
            echo "Applied migrations:\n";
            foreach ($applied as $m) {
                echo "  ✓ {$m['migration_name']} (applied {$m['applied_at']})\n";
            }
        }
        echo "\n";
        exit(0);
    } catch (PDOException $e) {
        echo "Error checking migration status: " . $e->getMessage() . "\n";
        exit(1);
    }
}

// Run migrations
try {
    $pdo = getDbConnection();
    ensureMigrationsTable($pdo);

    echo "Running schema migrations...\n\n";

    // Check if initial schema is already applied
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'initial_schema'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        initializeDatabaseSchema($pdo);
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('initial_schema')")->execute();
        echo "✓ Initial schema applied successfully.\n";
    } else {
        echo "Initial schema already applied. No pending migrations.\n";
    }
} catch (PDOException $e) {
    echo "\n✗ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
