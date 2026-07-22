<?php
/**
 * Database Migration Runner.
 *
 * Standalone CLI script for idempotent database schema management.
 * Creates all tables in their final form, then fills in any missing
 * columns for databases that predate schema additions. Never runs
 * legacy data transformations or drop/recreate cycles.
 *
 * Usage:
 *   php migrate.php          # Run all pending migrations
 *   php migrate.php --status # Show applied migrations
 *
 * Design:
 *  - initializeDatabaseSchema() creates every table with CREATE TABLE IF NOT EXISTS
 *    using the final column set, so fresh installs get the correct schema directly.
 *  - After table creation, a column-alignment pass checks for any columns that
 *    may be missing on databases created by older versions of the schema and
 *    adds them. This is NOT a per-migration affair — one pass handles it all.
 *  - Only truly obsolete tables/columns (e.g. score_history) are dropped.
 *  - All historical data transformations (splitting rows, renaming columns,
 *    converting values) have been removed — they were one-time operations that
 *    should never run again.
 */

require_once __DIR__ . '/../includes/config.php';

/**
 * Ensures the tracking table for migrations exists.
 */
function ensureMigrationsTable($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `schema_migrations` (
        `migration_name` VARCHAR(255) PRIMARY KEY,
        `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

/**
 * Creates every table in its final current form.
 * Tables that already exist are left untouched (CREATE TABLE IF NOT EXISTS).
 */
function initializeDatabaseSchema($pdo) {
    $adminPassword = Configuration::getInstance()->getAdminPassword();

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
        `participants` ENUM('individual', 'team', 'head2head') DEFAULT 'individual',
        `start_date` DATE DEFAULT NULL,
        `scoring_format` VARCHAR(50) DEFAULT 'bowling',
        `season_scoring` ENUM('cumulative', 'weekly') DEFAULT 'weekly',
        `drop_lowest_weeks` INT DEFAULT 0,
        `weekly_points` INT DEFAULT NULL,
        `point_spread` INT DEFAULT NULL,
        `rounds_per_game` INT DEFAULT NULL,
        `matchups_per_round` INT DEFAULT NULL,
        `weeks_in_season` INT DEFAULT NULL,
        `status` ENUM('setup', 'active', 'completed') DEFAULT 'setup',
        `playoff_series_length` INT DEFAULT 1
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
        `email` VARCHAR(255) UNIQUE DEFAULT NULL,
        `reset_token` VARCHAR(255) UNIQUE DEFAULT NULL,
        `reset_token_expires` DATETIME DEFAULT NULL,
        `role` ENUM('player', 'td', 'admin') DEFAULT 'player',
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
        `event_id` INT NOT NULL,
        `event_matchup_id` INT DEFAULT NULL,
        `player_id` INT NOT NULL,
        `order_number` INT NOT NULL,
        `machine_id` INT NOT NULL,
        `ball1` BIGINT DEFAULT 0,
        `ball2` BIGINT DEFAULT 0,
        `ball3` BIGINT DEFAULT 0,
        `match_key` VARCHAR(100) GENERATED ALWAYS AS (
            IF(`event_matchup_id` IS NULL,
               CONCAT('evt_', `event_id`, '_rnd_', `order_number`),
               CONCAT('mch_', `event_matchup_id`, '_rnd_', `order_number`)
            )
        ) STORED,
        UNIQUE KEY `unique_scores_key` (`player_id`, `match_key`),
        CONSTRAINT `fk_scores_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_scores_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_scores_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_score_event_matchup` FOREIGN KEY (`event_matchup_id`) REFERENCES `event_matchups` (`id`) ON DELETE CASCADE
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
        `value2` DECIMAL(12,3) DEFAULT 0,
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
        UNIQUE KEY `unique_location_machine` (`location_id`, `machine_id`),
        CONSTRAINT `fk_lm_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_lm_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `event_matchups` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `event_id` INT NOT NULL,
        `player1_id` INT NOT NULL,
        `player2_id` INT DEFAULT NULL,
        `player1_score` INT DEFAULT 0,
        `player2_score` INT DEFAULT 0,
        `winner_id` INT DEFAULT NULL,
        `status` ENUM('pending', 'completed') DEFAULT 'pending',
        `game_number` INT DEFAULT 1,
        `round_name` VARCHAR(50) DEFAULT NULL,
        `series_id` INT DEFAULT NULL,
        CONSTRAINT `fk_em_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_em_home` FOREIGN KEY (`player1_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_em_away` FOREIGN KEY (`player2_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_em_winner` FOREIGN KEY (`winner_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `matchups` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `event_matchup_id` INT DEFAULT NULL,
        `order_number` INT NOT NULL,
        `machine_id` INT NOT NULL,
        UNIQUE KEY `unique_matchup_round` (`event_matchup_id`, `order_number`),
        CONSTRAINT `fk_matchup_event_matchup` FOREIGN KEY (`event_matchup_id`) REFERENCES `event_matchups` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_matchup_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `machine_scores` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `machine_id` INT NOT NULL,
        `format` VARCHAR(50) DEFAULT 'bowling',
        `target_easy` BIGINT DEFAULT 0,
        `target_med` BIGINT DEFAULT 0,
        `target_hard` BIGINT DEFAULT 0,
        UNIQUE KEY `unique_machine_score_format` (`machine_id`, `format`),
        CONSTRAINT `fk_ms_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `league_locations` (
        `league_id` INT NOT NULL,
        `location_id` INT NOT NULL,
        PRIMARY KEY (`league_id`, `location_id`),
        CONSTRAINT `fk_ll_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_ll_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `location_machine_scores` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `location_machine_id` INT NOT NULL,
        `format` VARCHAR(50) DEFAULT 'bowling',
        `target_easy` BIGINT DEFAULT 0,
        `target_med` BIGINT DEFAULT 0,
        `target_hard` BIGINT DEFAULT 0,
        UNIQUE KEY `unique_location_machine_score_format` (`location_machine_id`, `format`),
        CONSTRAINT `fk_lms_location_machine` FOREIGN KEY (`location_machine_id`) REFERENCES `location_machines` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    // --- Seed Default Admin User ---
    $checkAdmin = $pdo->query("SELECT COUNT(*) FROM users WHERE role = 'admin'")->fetchColumn();
    if ($checkAdmin == 0) {
        $hashed = password_hash($adminPassword, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)");
        $stmt->execute(['admin', $hashed, 'admin']);
    }
}

/**
 * Adds columns that may be missing from tables created by older schema versions.
 * Safe to run on fresh installs (SHOW COLUMNS will find everything already present).
 */
function alignTableColumns($pdo) {
    // --- leagues ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'leagues'")->fetch();
    if ($checkTable) {
        $cols = [
            'type'                     => "ALTER TABLE `leagues` ADD COLUMN `type` ENUM('standard', 'session') DEFAULT 'standard' AFTER `name`",
            'weekly_points'            => "ALTER TABLE `leagues` ADD COLUMN `weekly_points` INT DEFAULT NULL AFTER `drop_lowest_weeks`",
            'point_spread'             => "ALTER TABLE `leagues` ADD COLUMN `point_spread` INT DEFAULT NULL AFTER `weekly_points`",
            'rounds_per_game'          => "ALTER TABLE `leagues` ADD COLUMN `rounds_per_game` INT DEFAULT NULL AFTER `point_spread`",
            'matchups_per_round'       => "ALTER TABLE `leagues` ADD COLUMN `matchups_per_round` INT DEFAULT NULL AFTER `rounds_per_game`",
            'weeks_in_season'          => "ALTER TABLE `leagues` ADD COLUMN `weeks_in_season` INT DEFAULT NULL AFTER `drop_lowest_weeks`",
            'status'                   => "ALTER TABLE `leagues` ADD COLUMN `status` ENUM('setup', 'active', 'completed') DEFAULT 'setup'",
            'playoff_series_length'    => "ALTER TABLE `leagues` ADD COLUMN `playoff_series_length` INT DEFAULT 1",
        ];
        foreach ($cols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
        }
    }

    // --- users ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'users'")->fetch();
    if ($checkTable) {
        $cols = [
            'email'                => "ALTER TABLE `users` ADD COLUMN `email` VARCHAR(255) UNIQUE DEFAULT NULL AFTER `password_hash`",
            'reset_token'          => "ALTER TABLE `users` ADD COLUMN `reset_token` VARCHAR(255) UNIQUE DEFAULT NULL AFTER `email`",
            'reset_token_expires'  => "ALTER TABLE `users` ADD COLUMN `reset_token_expires` DATETIME DEFAULT NULL AFTER `reset_token`",
        ];
        foreach ($cols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `users` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
        }
    }

    // --- scores ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'scores'")->fetch();
    if ($checkTable) {
        $hasEMId = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'event_matchup_id'")->fetch();
        if (!$hasEMId) {
            $pdo->exec("ALTER TABLE `scores` ADD COLUMN `event_matchup_id` INT DEFAULT NULL AFTER `event_id`");
            $fkExists = $pdo->query(
                "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scores' AND CONSTRAINT_NAME = 'fk_score_event_matchup'"
            )->fetch();
            if (!$fkExists) {
                $pdo->exec("ALTER TABLE `scores` ADD CONSTRAINT `fk_score_event_matchup` FOREIGN KEY (`event_matchup_id`) REFERENCES `event_matchups` (`id`) ON DELETE CASCADE");
            }
        }

        $hasMatchKey = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'match_key'")->fetch();
        if (!$hasMatchKey) {
            $pdo->exec("ALTER TABLE `scores` ADD COLUMN `match_key` VARCHAR(100) GENERATED ALWAYS AS (
                IF(`event_matchup_id` IS NULL,
                   CONCAT('evt_', `event_id`, '_rnd_', `order_number`),
                   CONCAT('mch_', `event_matchup_id`, '_rnd_', `order_number`)
                )
            ) STORED");
        }

        $hasScoresKey = $pdo->query("SHOW INDEX FROM `scores` WHERE Key_name = 'unique_scores_key'")->fetch();
        if (!$hasScoresKey) {
            $pdo->exec("ALTER TABLE `scores` ADD UNIQUE KEY `unique_scores_key` (`player_id`, `match_key`)");
        }
    }

    // --- matchups ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'matchups'")->fetch();
    if ($checkTable) {
        $hasEMId = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'event_matchup_id'")->fetch();
        if (!$hasEMId) {
            $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `event_matchup_id` INT DEFAULT NULL AFTER `id`");
            $fkExists = $pdo->query(
                "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matchups' AND CONSTRAINT_NAME = 'fk_matchup_event_matchup'"
            )->fetch();
            if (!$fkExists) {
                $pdo->exec("ALTER TABLE `matchups` ADD CONSTRAINT `fk_matchup_event_matchup` FOREIGN KEY (`event_matchup_id`) REFERENCES `event_matchups` (`id`) ON DELETE CASCADE");
            }
        }
    }

    // --- event_matchups ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'event_matchups'")->fetch();
    if ($checkTable) {
        $cols = [
            'round_name'  => "ALTER TABLE `event_matchups` ADD COLUMN `round_name` VARCHAR(50) DEFAULT NULL AFTER `game_number`",
            'series_id'   => "ALTER TABLE `event_matchups` ADD COLUMN `series_id` INT DEFAULT NULL AFTER `round_name`",
        ];
        foreach ($cols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
        }
    }

    // --- location_machine_scores ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'location_machine_scores'")->fetch();
    if (!$checkTable) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `location_machine_scores` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `location_machine_id` INT NOT NULL,
            `format` VARCHAR(50) DEFAULT 'bowling',
            `target_easy` BIGINT DEFAULT 0,
            `target_med` BIGINT DEFAULT 0,
            `target_hard` BIGINT DEFAULT 0,
            UNIQUE KEY `unique_location_machine_score_format` (`location_machine_id`, `format`),
            CONSTRAINT `fk_lms_location_machine` FOREIGN KEY (`location_machine_id`) REFERENCES `location_machines` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    }

    // --- machine_scores ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'machine_scores'")->fetch();
    if (!$checkTable) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `machine_scores` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `machine_id` INT NOT NULL,
            `format` VARCHAR(50) DEFAULT 'bowling',
            `target_easy` BIGINT DEFAULT 0,
            `target_med` BIGINT DEFAULT 0,
            `target_hard` BIGINT DEFAULT 0,
            UNIQUE KEY `unique_machine_score_format` (`machine_id`, `format`),
            CONSTRAINT `fk_ms_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    }

    // --- league_locations ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'league_locations'")->fetch();
    if (!$checkTable) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `league_locations` (
            `league_id` INT NOT NULL,
            `location_id` INT NOT NULL,
            PRIMARY KEY (`league_id`, `location_id`),
            CONSTRAINT `fk_ll_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_ll_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    }
}

echo "=== PinBowling Database Migration ===\n\n";

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

try {
    $pdo = getDbConnection();
    ensureMigrationsTable($pdo);

    echo "Running schema migrations...\n\n";

    // -----------------------------------------------------------------------
    // Migration 1: initial_schema
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'initial_schema'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        initializeDatabaseSchema($pdo);
        alignTableColumns($pdo);
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('initial_schema')")->execute();
        echo "✓ Initial schema applied successfully.\n";
    } else {
        echo "Initial schema already applied.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 2: clean_unused_tables_and_columns
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'clean_unused_tables_and_columns'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("DROP TABLE IF EXISTS `score_history`");

        $hasNote = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'note'")->fetch();
        if ($hasNote) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `note`");
        }

        $hasCreatedAt = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'created_at'")->fetch();
        if ($hasCreatedAt) {
            $pdo->exec("ALTER TABLE `users` DROP COLUMN `created_at`");
        }

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('clean_unused_tables_and_columns')")->execute();
        echo "✓ Cleaned up unused tables/columns (score_history, location_machines.note, users.created_at) successfully.\n";
    } else {
        echo "Cleanup of unused tables/columns already applied.\n";
    }

    echo "\n✓ All migrations complete.\n";
} catch (PDOException $e) {
    echo "\n✗ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
