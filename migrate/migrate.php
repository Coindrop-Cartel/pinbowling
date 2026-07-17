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
//if (php_sapi_name() !== 'cli' && !defined('MIGRATE_WEB_ALLOWED')) {
//    http_response_code(403);
//    echo "This script must be run from the command line.\n";
//    exit(1);
//}

require_once __DIR__ . '/../includes/config.php';

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
        `note` TEXT DEFAULT NULL,
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
        echo "Initial schema already applied.\n";
    }

    // Check if matchups table migration is applied
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'create_matchups_table'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `matchups` (
          `id` INT AUTO_INCREMENT PRIMARY KEY,
          `event_id` INT NOT NULL,
          `order_number` INT NOT NULL,
          `player_id` INT NOT NULL,
          `machine_id` INT NOT NULL,
          `player_order` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
          UNIQUE KEY `unique_matchup` (`event_id`, `order_number`, `player_order`),
          CONSTRAINT `fk_matchup_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
          CONSTRAINT `fk_matchup_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
          CONSTRAINT `fk_matchup_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('create_matchups_table')")->execute();
        echo "✓ Matchups table migration applied successfully.\n";
    } else {
        echo "Matchups table migration already applied.\n";
    }

    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'baseball_decimal_and_head2head'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE `leagues` MODIFY `participants` ENUM('individual', 'team', 'head2head') DEFAULT 'individual'");
        $pdo->exec("ALTER TABLE `target_scores` MODIFY `value2` DECIMAL(12,3) DEFAULT 0");
        $pdo->exec("ALTER TABLE `location_machines` MODIFY `value2` DECIMAL(12,3) DEFAULT 0");
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('baseball_decimal_and_head2head')")->execute();
        echo "Baseball decimal/head-to-head migration applied successfully.\n";
    } else {
        echo "Baseball decimal/head-to-head migration already applied.\n";
    }

    // Add top_bottom column to matchups table for baseball inning designation
    // (Legacy migration — on fresh installs the column never existed; skip gracefully.)
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'matchups_add_top_bottom'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $hasTopBottom = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'top_bottom'")->fetch();
        if ($hasTopBottom) {
            $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `top_bottom` ENUM('top','bottom') NOT NULL DEFAULT 'top' AFTER `machine_id`");
        }
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('matchups_add_top_bottom')")->execute();
        echo "✓ Matchups top_bottom column migration applied successfully.\n";
    } else {
        echo "Matchups top_bottom column migration already applied.\n";
    }

    // Replace top_bottom ENUM with player_order SMALLINT for flexible head-to-head matchups
    // player_order: 1 = home (was 'top'), 2 = away (was 'bottom'), 3+ for future multi-player matchups
    // (Legacy migration — on fresh installs player_order already exists; skip gracefully.)
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'matchups_player_order'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $hasTopBottom = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'top_bottom'")->fetch();
        $hasPlayerOrder = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'player_order'")->fetch();
        if ($hasTopBottom) {
            if (!$hasPlayerOrder) {
                $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `player_order` SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER `machine_id`");
            }
            $pdo->exec("UPDATE `matchups` SET `player_order` = CASE WHEN `top_bottom` = 'top' THEN 1 WHEN `top_bottom` = 'bottom' THEN 2 ELSE 1 END");
            $pdo->exec("ALTER TABLE `matchups` DROP COLUMN `top_bottom`");
        } elseif (!$hasPlayerOrder) {
            $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `player_order` SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER `machine_id`");
        }
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('matchups_player_order')")->execute();
        echo "✓ Matchups player_order column migration applied successfully.\n";
    } else {
        echo "Matchups player_order column migration already applied.\n";
    }

    // Drop unused order_number and machine_condition columns from location_machines.
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'location_machines_drop_unused_cols'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $checkOrder = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'order_number'")->fetch();
        if ($checkOrder) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `order_number`");
        }
        $checkCond = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'machine_condition'")->fetch();
        if ($checkCond) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `machine_condition`");
        }
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('location_machines_drop_unused_cols')")->execute();
        echo "✓ location_machines unused columns dropped successfully.\n";
    } else {
        echo "location_machines unused columns migration already applied.\n";
    }

    // Refactor matchups to a normalized per-player-row shape.
    // Old shape: one row per pairing with player1_id + player2_id.
    // New shape: one row per (player, slot) with player_id + player_order.
    //   order_number = inning/slot index (1 = inning 1, 2 = inning 2, ...)
    //   player_order = role within the slot (1 = home, 2 = away, 3+ future)
    // This supersedes the abandoned 'matchups_sequential_order' migration, which is
    // intentionally never applied (it would have dropped player_order and made
    // order_number sequential — the opposite of this refactor).
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'matchups_per_player_rows'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
        // Detect current shape: does player1_id still exist?
        $hasPlayer1 = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'player1_id'")->fetch();
        // Does player_order already exist (from the earlier matchups_player_order migration)?
        $hasPlayerOrder = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'player_order'")->fetch();

        if ($hasPlayer1) {
            // Ensure player_order column exists (default 1 = home).
            if (!$hasPlayerOrder) {
                $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `player_order` SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER `machine_id`");
            }
            // Add player_id column (after order_number) if missing.
            $hasPlayerId = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'player_id'")->fetch();
            if (!$hasPlayerId) {
                $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `player_id` INT NOT NULL DEFAULT 0 AFTER `order_number`");
            }

            // Make old columns nullable so we can insert new rows without providing values for them
            $pdo->exec("ALTER TABLE `matchups` MODIFY `player1_id` INT DEFAULT NULL");
            $pdo->exec("ALTER TABLE `matchups` MODIFY `player2_id` INT DEFAULT NULL");

            // Drop the two player FKs first, then the old unique key before splitting rows,
            // because the split inserts duplicate (event_id, order_number) pairs.
            $fkP1 = $pdo->query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matchups' AND CONSTRAINT_NAME = 'fk_matchup_p1'")->fetch();
            if ($fkP1) {
                $pdo->exec("ALTER TABLE `matchups` DROP FOREIGN KEY `fk_matchup_p1`");
            }
            $fkP2 = $pdo->query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matchups' AND CONSTRAINT_NAME = 'fk_matchup_p2'")->fetch();
            if ($fkP2) {
                $pdo->exec("ALTER TABLE `matchups` DROP FOREIGN KEY `fk_matchup_p2`");
            }
            $oldKey = $pdo->query("SHOW INDEX FROM `matchups` WHERE Key_name = 'unique_matchup'")->fetch();
            if ($oldKey) {
                $pdo->exec("ALTER TABLE `matchups` DROP INDEX `unique_matchup`");
            }

            // Split each existing row into 2 rows: player1 -> player_order 1 (home),
            // player2 -> player_order 2 (away). Insert the away rows first with a
            // temporary id gap, then update the original rows in place to become the
            // home rows. This preserves existing ids for the home side.
            $pdo->exec("INSERT INTO `matchups` (`event_id`, `order_number`, `player_id`, `machine_id`, `player_order`)
                        SELECT `event_id`, `order_number`, `player2_id`, `machine_id`, 2
                        FROM `matchups`
                        WHERE `player2_id` IS NOT NULL AND `player2_id` > 0");
            // Convert the original rows into the home (player_order 1) rows.
            $pdo->exec("UPDATE `matchups` SET `player_id` = `player1_id`, `player_order` = 1
                        WHERE `player1_id` IS NOT NULL");

            // Drop the now-redundant player1_id / player2_id columns.
            $pdo->exec("ALTER TABLE `matchups` DROP COLUMN `player1_id`");
            $pdo->exec("ALTER TABLE `matchups` DROP COLUMN `player2_id`");

            // Add the new unique key and the single player FK.
            $pdo->exec("ALTER TABLE `matchups` ADD UNIQUE KEY `unique_matchup` (`event_id`, `order_number`, `player_order`)");
            $pdo->exec("ALTER TABLE `matchups` ADD CONSTRAINT `fk_matchup_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE");
        } else {
            // Already split (e.g. someone applied a prior version of this refactor).
            // Just ensure the unique key and FK match the target shape.
            $oldKey = $pdo->query("SHOW INDEX FROM `matchups` WHERE Key_name = 'unique_matchup'")->fetch();
            if ($oldKey) {
                $pdo->exec("ALTER TABLE `matchups` DROP INDEX `unique_matchup`");
            }
            $pdo->exec("ALTER TABLE `matchups` ADD UNIQUE KEY `unique_matchup` (`event_id`, `order_number`, `player_order`)");
        }

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('matchups_per_player_rows')")->execute();
        echo "✓ Matchups per-player-rows refactor applied successfully.\n";
    } else {
        echo "Matchups per-player-rows refactor already applied.\n";
    }
    // Add format-specific target score columns to location_machines.
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'location_machines_format_targets'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $columnsToAdd = [
            'target_easy_bowling',
            'target_med_bowling',
            'target_hard_bowling',
            'target_easy_baseball',
            'target_med_baseball',
            'target_hard_baseball',
        ];

        foreach ($columnsToAdd as $column) {
            $checkColumn = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE '{$column}'")->fetch();
            if (!$checkColumn) {
                $pdo->exec("ALTER TABLE `location_machines` ADD COLUMN `{$column}` BIGINT DEFAULT 0 AFTER `target_hard`");
            }
        }
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('location_machines_format_targets')")->execute();
        echo "✓ location_machines format-specific target columns migration applied successfully.\n";
    } else {
        echo "location_machines format-specific target columns migration already applied.\n";
    }

    // Remove value1, value2, and format from location_machines table
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'location_machines_remove_values_and_add_format'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        // Drop value1 column if it exists
        $checkValue1 = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'value1'")->fetch();
        if ($checkValue1) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `value1`");
        }

        // Drop value2 column if it exists
        $checkValue2 = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'value2'")->fetch();
        if ($checkValue2) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `value2`");
        }

        // Drop the format-inclusive unique key FIRST (must drop index before dropping the column it references)
        $formatKey = $pdo->query("SHOW INDEX FROM `location_machines` WHERE Key_name = 'unique_location_machine_format'")->fetch();
        if ($formatKey) {
            $pdo->exec("ALTER TABLE `location_machines` DROP INDEX `unique_location_machine_format`");
        }

        // Now safe to drop format column (format now lives only in location_machine_scores)
        $checkFormat = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'format'")->fetch();
        if ($checkFormat) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `format`");
        }

        // Ensure simple unique key exists (location_id, machine_id) without format
        $simpleKey = $pdo->query("SHOW INDEX FROM `location_machines` WHERE Key_name = 'unique_location_machine'")->fetch();
        if (!$simpleKey) {
            $pdo->exec("ALTER TABLE `location_machines` ADD UNIQUE KEY `unique_location_machine` (`location_id`, `machine_id`)");
        }

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('location_machines_remove_values_and_add_format')")->execute();
        echo "✓ location_machines columns (value1, value2, format removed) migration applied successfully.\n";
    } else {
        echo "location_machines columns (value1, value2, format removed) migration already applied.\n";
    }

    // Refactor location_machines to separate scores into location_machine_scores
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'location_machines_score_refactor'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        // Drop target_easy, target_med, target_hard from location_machines if they exist
        $checkEasy = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'target_easy'")->fetch();
        if ($checkEasy) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `target_easy`");
        }
        $checkMed = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'target_med'")->fetch();
        if ($checkMed) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `target_med`");
        }
        $checkHard = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'target_hard'")->fetch();
        if ($checkHard) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `target_hard`");
        }

        // Drop the format-inclusive unique key FIRST (must drop index before dropping the column it references)
        $formatKey = $pdo->query("SHOW INDEX FROM `location_machines` WHERE Key_name = 'unique_location_machine_format'")->fetch();
        if ($formatKey) {
            $pdo->exec("ALTER TABLE `location_machines` DROP INDEX `unique_location_machine_format`");
        }

        // Drop format column from location_machines if it still exists (safety net)
        $checkFormat = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'format'")->fetch();
        if ($checkFormat) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `format`");
        }

        // Drop existing format-specific target columns if they exist (from a previous migration, now redundant)
        $columnsToDrop = [
            'target_easy_bowling',
            'target_med_bowling',
            'target_hard_bowling',
            'target_easy_baseball',
            'target_med_baseball',
            'target_hard_baseball',
        ];
        foreach ($columnsToDrop as $column) {
            $checkColumn = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE '{$column}'")->fetch();
            if ($checkColumn) {
                $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `{$column}`");
            }
        }

        // Create location_machine_scores table
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

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('location_machines_score_refactor')")->execute();
        echo "✓ location_machines score refactor migration applied successfully.\n";
    } else {
        echo "location_machines score refactor migration already applied.\n";
    }

    // Drop format column from location_machines (format now lives only in location_machine_scores)
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'location_machines_drop_format'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        // Drop the format-inclusive unique key FIRST (must drop index before dropping the column it references)
        $formatKey = $pdo->query("SHOW INDEX FROM `location_machines` WHERE Key_name = 'unique_location_machine_format'")->fetch();
        if ($formatKey) {
            $pdo->exec("ALTER TABLE `location_machines` DROP INDEX `unique_location_machine_format`");
        }

        // Now safe to drop format column
        $checkFormat = $pdo->query("SHOW COLUMNS FROM `location_machines` LIKE 'format'")->fetch();
        if ($checkFormat) {
            $pdo->exec("ALTER TABLE `location_machines` DROP COLUMN `format`");
        }

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('location_machines_drop_format')")->execute();
        echo "✓ location_machines format column dropped successfully.\n";
    } else {
        echo "location_machines format column drop already applied.\n";
    }

    // Repair the fk_matchup_event foreign key on the matchups table.
    // The matchups_per_player_rows migration ran with FOREIGN_KEY_CHECKS = 0 and
    // dropped/recreated the unique_matchup index and fk_matchup_player, but never
    // re-verified fk_matchup_event. On databases where the matchups table
    // pre-existed (or where that migration dropped the event FK), the cascade
    // from events -> matchups is missing, causing 1451 errors when deleting
    // events or leagues. This migration restores the FK if absent.
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'repair_matchup_event_fk'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $fkCascade = $pdo->query(
            "SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS
             WHERE CONSTRAINT_SCHEMA = DATABASE()
               AND TABLE_NAME = 'matchups'
               AND CONSTRAINT_NAME = 'fk_matchup_event'
               AND DELETE_RULE = 'CASCADE'"
        )->fetch();
        if (!$fkCascade) {
            $fkExists = $pdo->query(
                "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = 'matchups'
                   AND CONSTRAINT_NAME = 'fk_matchup_event'"
            )->fetch();
            if ($fkExists) {
                $pdo->exec("ALTER TABLE `matchups` DROP FOREIGN KEY `fk_matchup_event`");
            }
            $pdo->exec("ALTER TABLE `matchups`
                ADD CONSTRAINT `fk_matchup_event`
                FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE");
            echo "✓ Repaired missing fk_matchup_event foreign key on matchups table with ON DELETE CASCADE.\n";
        } else {
            echo "fk_matchup_event foreign key already present on matchups table with ON DELETE CASCADE.\n";
        }
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('repair_matchup_event_fk')")->execute();
    } else {
        echo "fk_matchup_event repair migration already applied.\n";
    }

    // Rebuild the fk_matchup_event foreign key on the matchups table to ensure
    // index references are fully intact and set to ON DELETE CASCADE.
    // This is necessary because index drops in previous migrations may have
    // left the foreign key reference in an orphaned/corrupted state.
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'rebuild_matchup_event_fk_cascade'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
        
        $fkExists = $pdo->query(
            "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'matchups'
               AND CONSTRAINT_NAME = 'fk_matchup_event'"
        )->fetch();
        if ($fkExists) {
            $pdo->exec("ALTER TABLE `matchups` DROP FOREIGN KEY `fk_matchup_event`");
        }
        
        $pdo->exec("ALTER TABLE `matchups`
            ADD CONSTRAINT `fk_matchup_event`
            FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE");
            
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('rebuild_matchup_event_fk_cascade')")->execute();
        echo "✓ Successfully rebuilt fk_matchup_event foreign key with ON DELETE CASCADE.\n";
    } else {
        echo "fk_matchup_event rebuild migration already applied.\n";
    }

    // Add email column to users table for password/username recovery
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'users_add_email'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $checkEmail = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'email'")->fetch();
        if (!$checkEmail) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `email` VARCHAR(255) UNIQUE DEFAULT NULL AFTER `password_hash`");
        }
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('users_add_email')")->execute();
        echo "✓ users email column migration applied successfully.\n";
    } else {
        echo "users email column migration already applied.\n";
    }

    // Add reset_token and reset_token_expires columns to users table
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'users_add_reset_token'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $checkToken = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'reset_token'")->fetch();
        if (!$checkToken) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `reset_token` VARCHAR(255) UNIQUE DEFAULT NULL AFTER `email`");
        }
        $checkExpires = $pdo->query("SHOW COLUMNS FROM `users` LIKE 'reset_token_expires'")->fetch();
        if (!$checkExpires) {
            $pdo->exec("ALTER TABLE `users` ADD COLUMN `reset_token_expires` DATETIME DEFAULT NULL AFTER `reset_token`");
        }
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('users_add_reset_token')")->execute();
        echo "✓ users reset token columns migration applied successfully.\n";
    } else {
        echo "users reset token columns migration already applied.\n";
    }

    // Create machine_scores table
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'create_machine_scores_table'");
    $stmt->execute();
    if (!$stmt->fetch()) {
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
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('create_machine_scores_table')")->execute();
        echo "✓ machine_scores table migration applied successfully.\n";
    } else {
        echo "machine_scores table migration already applied.\n";
    }

    // Baseball Season & Head-to-Head leagues migration
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'baseball_season_head2head'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

        // 1. Alter leagues table
        $checkWeeks = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'weeks_in_season'")->fetch();
        if (!$checkWeeks) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `weeks_in_season` INT DEFAULT NULL AFTER `drop_lowest_weeks`");
        }
        $checkInnings = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'innings_per_game'")->fetch();
        if (!$checkInnings) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `innings_per_game` INT NOT NULL DEFAULT 2 AFTER `weeks_in_season`");
        }
        $checkStatus = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'status'")->fetch();
        if (!$checkStatus) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `status` ENUM('setup', 'active', 'completed') DEFAULT 'setup' AFTER `innings_per_game`");
        }
        $checkPlayoffLength = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'playoff_series_length'")->fetch();
        if (!$checkPlayoffLength) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `playoff_series_length` INT DEFAULT 1 AFTER `status`");
        }

        // 2. Create event_matchups table
        $pdo->exec("CREATE TABLE IF NOT EXISTS `event_matchups` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `event_id` INT NOT NULL,
            `home_player_id` INT NOT NULL,
            `away_player_id` INT DEFAULT NULL,
            `home_runs` INT DEFAULT 0,
            `away_runs` INT DEFAULT 0,
            `winner_id` INT DEFAULT NULL,
            `status` ENUM('pending', 'completed') DEFAULT 'pending',
            `game_number` INT DEFAULT 1,
            `round_name` VARCHAR(50) DEFAULT NULL,
            `series_id` INT DEFAULT NULL,
            CONSTRAINT `fk_em_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_em_home` FOREIGN KEY (`home_player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_em_away` FOREIGN KEY (`away_player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_em_winner` FOREIGN KEY (`winner_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        $checkRoundName = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE 'round_name'")->fetch();
        if (!$checkRoundName) {
            $pdo->exec("ALTER TABLE `event_matchups` ADD COLUMN `round_name` VARCHAR(50) DEFAULT NULL AFTER `game_number`");
        }
        $checkSeriesId = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE 'series_id'")->fetch();
        if (!$checkSeriesId) {
            $pdo->exec("ALTER TABLE `event_matchups` ADD COLUMN `series_id` INT DEFAULT NULL AFTER `round_name`");
        }

        // 3. Alter matchups table
        $checkEMId = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'event_matchup_id'")->fetch();
        if (!$checkEMId) {
            $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `event_matchup_id` INT DEFAULT NULL AFTER `event_id`");
            $pdo->exec("ALTER TABLE `matchups` ADD CONSTRAINT `fk_matchup_event_matchup` FOREIGN KEY (`event_matchup_id`) REFERENCES `event_matchups` (`id`) ON DELETE CASCADE");
        }
        
        $keys = $pdo->query("SHOW INDEX FROM `matchups` WHERE Key_name = 'unique_matchup'")->fetchAll();
        if (count($keys) > 0) {
            $pdo->exec("ALTER TABLE `matchups` DROP INDEX `unique_matchup`");
        }
        
        $checkMatchKey = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'match_key'")->fetch();
        if (!$checkMatchKey) {
            $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `match_key` VARCHAR(100) GENERATED ALWAYS AS (
                IF(`event_matchup_id` IS NULL, 
                   CONCAT('evt_', `event_id`, '_rnd_', `order_number`), 
                   CONCAT('mch_', `event_matchup_id`, '_rnd_', `order_number`)
                )
            ) STORED");
            $pdo->exec("ALTER TABLE `matchups` ADD UNIQUE KEY `unique_matchups_key` (`player_order`, `match_key`)");
        }

        // 4. Alter scores table
        $checkEMIdScore = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'event_matchup_id'")->fetch();
        if (!$checkEMIdScore) {
            $pdo->exec("ALTER TABLE `scores` ADD COLUMN `event_matchup_id` INT DEFAULT NULL AFTER `event_id`");
            $pdo->exec("ALTER TABLE `scores` ADD CONSTRAINT `fk_score_event_matchup` FOREIGN KEY (`event_matchup_id`) REFERENCES `event_matchups` (`id`) ON DELETE CASCADE");
        }
        
        $keysScore = $pdo->query("SHOW INDEX FROM `scores` WHERE Key_name = 'unique_player_round'")->fetchAll();
        if (count($keysScore) > 0) {
            $pdo->exec("ALTER TABLE `scores` DROP INDEX `unique_player_round`");
        }
        
        $checkMatchKeyScore = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'match_key'")->fetch();
        if (!$checkMatchKeyScore) {
            $pdo->exec("ALTER TABLE `scores` ADD COLUMN `match_key` VARCHAR(100) GENERATED ALWAYS AS (
                IF(`event_matchup_id` IS NULL, 
                   CONCAT('evt_', `event_id`, '_rnd_', `order_number`), 
                   CONCAT('mch_', `event_matchup_id`, '_rnd_', `order_number`)
                )
            ) STORED");
            $pdo->exec("ALTER TABLE `scores` ADD UNIQUE KEY `unique_scores_key` (`player_id`, `match_key`)");
        }

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('baseball_season_head2head')")->execute();
        echo "✓ Baseball Season & Head-to-Head leagues migration applied successfully.\n";
    } else {
        echo "Baseball Season & Head-to-Head leagues migration already applied.\n";
    }

    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
} catch (PDOException $e) {
    echo "\n✗ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
