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
        `competition_format` ENUM('group', 'head2head') DEFAULT 'group',
        `participation_type` ENUM('individual', 'team') DEFAULT 'individual',
        `team_size` INT DEFAULT 1,
        `start_date` DATE DEFAULT NULL,
        `scoring_format` VARCHAR(50) DEFAULT 'bowling',
        `season_scoring` ENUM('cumulative', 'weekly') DEFAULT 'weekly',
        `drop_lowest_weeks` INT DEFAULT 0,
        `drop_lowest_player_scores` INT DEFAULT 0,
        `weekly_points` INT DEFAULT NULL,
        `point_spread` INT DEFAULT NULL,
        `rounds_per_game` INT DEFAULT NULL,
        `matchups_per_round` INT DEFAULT NULL,
        `weeks_in_season` INT DEFAULT NULL,
        `status` ENUM('setup', 'active', 'completed', 'archived') DEFAULT 'setup',
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS `league_players` (
        `league_id` INT NOT NULL,
        `player_id` INT NOT NULL,
        PRIMARY KEY (`league_id`, `player_id`),
        CONSTRAINT `fk_lp_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_lp_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
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

    $pdo->exec("CREATE TABLE IF NOT EXISTS `sessions` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(255) NOT NULL,
        `scoring_format` VARCHAR(50) DEFAULT 'bowling',
        `competition_format` ENUM('group', 'head2head') DEFAULT 'group',
        `rounds_per_game` INT DEFAULT NULL,
        `matchups_per_round` INT DEFAULT NULL,
        `location_id` INT DEFAULT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT `fk_sessions_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `session_players` (
        `session_id` INT NOT NULL,
        `player_id` INT NOT NULL,
        PRIMARY KEY (`session_id`, `player_id`),
        CONSTRAINT `fk_sp_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_sp_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `session_locations` (
        `session_id` INT NOT NULL,
        `location_id` INT NOT NULL,
        PRIMARY KEY (`session_id`, `location_id`),
        CONSTRAINT `fk_sl_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_sl_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `events` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `league_id` INT DEFAULT NULL,
        `session_id` INT DEFAULT NULL,
        `location_id` INT DEFAULT NULL,
        `event_name` VARCHAR(255) NOT NULL,
        `event_date` DATE DEFAULT NULL,
        `scoring_format` VARCHAR(50) DEFAULT 'bowling',
        CONSTRAINT `fk_events_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_events_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_events_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `scores` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `event_id` INT NOT NULL,
        `event_matchup_id` INT DEFAULT NULL,
        `player_id` INT NULL DEFAULT NULL,
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
        `location_id` INT DEFAULT NULL,
        `player1_id` INT DEFAULT NULL,
        `player2_id` INT DEFAULT NULL,
        `player3_id` INT DEFAULT NULL,
        `player4_id` INT DEFAULT NULL,
        `player1_score` INT DEFAULT 0,
        `player2_score` INT DEFAULT 0,
        `player3_score` INT DEFAULT 0,
        `player4_score` INT DEFAULT 0,
        `player_winner_id` INT DEFAULT NULL,
        `status` ENUM('pending', 'completed') DEFAULT 'pending',
        `game_number` INT DEFAULT 1,
        `round_name` VARCHAR(50) DEFAULT NULL,
        `series_id` INT DEFAULT NULL,
        CONSTRAINT `fk_em_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_em_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `matchups` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `event_matchup_id` INT DEFAULT NULL,
        `order_number` INT NOT NULL,
        `machine_id` INT NOT NULL,
        `player1_id` INT DEFAULT NULL,
        `player2_id` INT DEFAULT NULL,
        `player3_id` INT DEFAULT NULL,
        `player4_id` INT DEFAULT NULL,
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
 *
 * FK checks are temporarily disabled so that ALTER TABLE operations on partially-
 * migrated databases do not fail when re-validating existing FK constraints that
 * may reference tables or columns created in a different order.
 */
function alignTableColumns($pdo) {
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

    // --- leagues ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'leagues'")->fetch();
    if ($checkTable) {
        $cols = [
            'competition_format'       => "ALTER TABLE `leagues` ADD COLUMN `competition_format` ENUM('group', 'head2head') DEFAULT 'group' AFTER `name`",
            'participation_type'       => "ALTER TABLE `leagues` ADD COLUMN `participation_type` ENUM('individual', 'team') DEFAULT 'individual' AFTER `competition_format`",
            'team_size'                => "ALTER TABLE `leagues` ADD COLUMN `team_size` INT DEFAULT 1 AFTER `participation_type`",
            'drop_lowest_weeks'        => "ALTER TABLE `leagues` ADD COLUMN `drop_lowest_weeks` INT DEFAULT 0",
            'drop_lowest_player_scores' => "ALTER TABLE `leagues` ADD COLUMN `drop_lowest_player_scores` INT DEFAULT 0 AFTER `drop_lowest_weeks`",
            'weekly_points'            => "ALTER TABLE `leagues` ADD COLUMN `weekly_points` INT DEFAULT NULL AFTER `drop_lowest_player_scores`",
            'point_spread'             => "ALTER TABLE `leagues` ADD COLUMN `point_spread` INT DEFAULT NULL AFTER `weekly_points`",
            'rounds_per_game'          => "ALTER TABLE `leagues` ADD COLUMN `rounds_per_game` INT DEFAULT NULL AFTER `point_spread`",
            'matchups_per_round'       => "ALTER TABLE `leagues` ADD COLUMN `matchups_per_round` INT DEFAULT NULL AFTER `rounds_per_game`",
            'weeks_in_season'          => "ALTER TABLE `leagues` ADD COLUMN `weeks_in_season` INT DEFAULT NULL AFTER `drop_lowest_weeks`",
            'status'                   => "ALTER TABLE `leagues` ADD COLUMN `status` ENUM('setup', 'active', 'completed', 'archived') DEFAULT 'setup'",
            'playoff_series_length'    => "ALTER TABLE `leagues` ADD COLUMN `playoff_series_length` INT DEFAULT 1",
        ];
        foreach ($cols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
        }

    }

    // --- teams ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'teams'")->fetch();
    if ($checkTable) {
        $hasWrapperCol = $pdo->query("SHOW COLUMNS FROM `teams` LIKE 'is_individual_wrapper'")->fetch();
        if ($hasWrapperCol) {
            $pdo->exec("ALTER TABLE `teams` DROP COLUMN `is_individual_wrapper`");
        }
    }

    // --- league_players (may need creation on pre-v2 databases that dropped it) ---
    $lpTable = $pdo->query("SHOW TABLES LIKE 'league_players'")->fetch();
    if (!$lpTable) {
        $pdo->exec("CREATE TABLE `league_players` (
            `league_id` INT NOT NULL,
            `player_id` INT NOT NULL,
            PRIMARY KEY (`league_id`, `player_id`),
            CONSTRAINT `fk_lp_league` FOREIGN KEY (`league_id`) REFERENCES `leagues` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_lp_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
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

    // --- event_matchups ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'event_matchups'")->fetch();
    if ($checkTable) {
        $hasLocId = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE 'location_id'")->fetch();
        if (!$hasLocId) {
            $pdo->exec("ALTER TABLE `event_matchups` ADD COLUMN `location_id` INT DEFAULT NULL AFTER `event_id`");
            $fkExists = $pdo->query(
                "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_matchups' AND CONSTRAINT_NAME = 'fk_em_location'"
            )->fetch();
            if (!$fkExists) {
                $pdo->exec("ALTER TABLE `event_matchups` ADD CONSTRAINT `fk_em_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL");
            }
        }

        $p1Col = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE 'player1_id'")->fetch();
        if ($p1Col && strpos(strtoupper($p1Col['Null'] ?? ''), 'NO') !== false) {
            $pdo->exec("ALTER TABLE `event_matchups` MODIFY COLUMN `player1_id` INT NULL DEFAULT NULL");
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

        // Drop legacy matchup_id column if present
        $hasLegacyMatchupId = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'matchup_id'")->fetch();
        if ($hasLegacyMatchupId) {
            $pdo->exec("ALTER TABLE `scores` DROP COLUMN `matchup_id`");
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

        $hasPlayerId = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'player_id'")->fetch();
        if ($hasPlayerId) {
            // Drop any FK constraints referencing player_id before dropping the column
            $playerFks = $pdo->query(
                "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'matchups'
                 AND COLUMN_NAME = 'player_id' AND REFERENCED_TABLE_NAME IS NOT NULL"
            )->fetchAll(\PDO::FETCH_COLUMN);
            foreach ($playerFks as $fk) {
                $pdo->exec("ALTER TABLE `matchups` DROP FOREIGN KEY `$fk`");
            }

            if (!$pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'player1_id'")->fetch()) {
                $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `player1_id` INT DEFAULT NULL AFTER `machine_id`");
                $pdo->exec("UPDATE `matchups` SET `player1_id` = `player_id`");
            }
            $pdo->exec("ALTER TABLE `matchups` DROP COLUMN `player_id`");
        }

        $hasP1Id = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'player1_id'")->fetch();
        if (!$hasP1Id) {
            $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `player1_id` INT DEFAULT NULL AFTER `machine_id`");
        }

        $hasP2Id = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE 'player2_id'")->fetch();
        if (!$hasP2Id) {
            $pdo->exec("ALTER TABLE `matchups` ADD COLUMN `player2_id` INT DEFAULT NULL AFTER `player1_id`");
        }

        $mCols = [
            'player3_id' => "ALTER TABLE `matchups` ADD COLUMN `player3_id` INT DEFAULT NULL AFTER `player2_id`",
            'player4_id' => "ALTER TABLE `matchups` ADD COLUMN `player4_id` INT DEFAULT NULL AFTER `player3_id`",
        ];
        foreach ($mCols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `matchups` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
        }
    }

    // --- event_matchups ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'event_matchups'")->fetch();
    if ($checkTable) {
        // Handle legacy home_player_id / away_player_id → player1_id / player2_id
        $hasHomeId = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE 'home_player_id'")->fetch();
        if ($hasHomeId) {
            $hasP1Id = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE 'player1_id'")->fetch();
            if (!$hasP1Id) {
                $pdo->exec("ALTER TABLE `event_matchups` CHANGE COLUMN `home_player_id` `player1_id` INT DEFAULT NULL");
            } else {
                $pdo->exec("ALTER TABLE `event_matchups` DROP COLUMN `home_player_id`");
            }
        }
        $hasAwayId = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE 'away_player_id'")->fetch();
        if ($hasAwayId) {
            $hasP2Id = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE 'player2_id'")->fetch();
            if (!$hasP2Id) {
                $pdo->exec("ALTER TABLE `event_matchups` CHANGE COLUMN `away_player_id` `player2_id` INT DEFAULT NULL");
            } else {
                $pdo->exec("ALTER TABLE `event_matchups` DROP COLUMN `away_player_id`");
            }
        }

        // Ensure player1_id/player1_score and player2_id/player2_score exist
        // (may be missing if neither home/away nor current columns were on this table)
        $ensureCols = [
            'player1_id'    => "ALTER TABLE `event_matchups` ADD COLUMN `player1_id` INT DEFAULT NULL AFTER `location_id`",
            'player2_id'    => "ALTER TABLE `event_matchups` ADD COLUMN `player2_id` INT DEFAULT NULL AFTER `player1_id`",
            'player1_score' => "ALTER TABLE `event_matchups` ADD COLUMN `player1_score` INT DEFAULT 0 AFTER `location_id`",
            'player2_score' => "ALTER TABLE `event_matchups` ADD COLUMN `player2_score` INT DEFAULT 0 AFTER `player1_score`",
        ];
        foreach ($ensureCols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
        }

        $cols = [
            'player3_id'    => "ALTER TABLE `event_matchups` ADD COLUMN `player3_id` INT DEFAULT NULL AFTER `player2_id`",
            'player4_id'    => "ALTER TABLE `event_matchups` ADD COLUMN `player4_id` INT DEFAULT NULL AFTER `player3_id`",
            'player3_score' => "ALTER TABLE `event_matchups` ADD COLUMN `player3_score` INT DEFAULT 0 AFTER `player2_score`",
            'player4_score' => "ALTER TABLE `event_matchups` ADD COLUMN `player4_score` INT DEFAULT 0 AFTER `player3_score`",
            'round_name'  => "ALTER TABLE `event_matchups` ADD COLUMN `round_name` VARCHAR(50) DEFAULT NULL AFTER `game_number`",
            'series_id'   => "ALTER TABLE `event_matchups` ADD COLUMN `series_id` INT DEFAULT NULL AFTER `round_name`",
        ];
        foreach ($cols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `event_matchups` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
        }

        // Drop legacy player foreign key constraints on event_matchups if present
        $fkConstraints = ['fk_em_home', 'fk_em_away', 'fk_em_winner'];
        foreach ($fkConstraints as $fk) {
            $fkExists = $pdo->query(
                "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'event_matchups' AND CONSTRAINT_NAME = '$fk'"
            )->fetch();
            if ($fkExists) {
                $pdo->exec("ALTER TABLE `event_matchups` DROP FOREIGN KEY `$fk`");
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

    // --- sessions table ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'sessions'")->fetch();
    if (!$checkTable) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS `sessions` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(255) NOT NULL,
            `scoring_format` VARCHAR(50) DEFAULT 'bowling',
            `competition_format` ENUM('group', 'head2head') DEFAULT 'group',
            `rounds_per_game` INT DEFAULT NULL,
            `matchups_per_round` INT DEFAULT NULL,
            `location_id` INT DEFAULT NULL,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT `fk_sessions_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        $pdo->exec("CREATE TABLE IF NOT EXISTS `session_players` (
            `session_id` INT NOT NULL,
            `player_id` INT NOT NULL,
            PRIMARY KEY (`session_id`, `player_id`),
            CONSTRAINT `fk_sp_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_sp_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        $pdo->exec("CREATE TABLE IF NOT EXISTS `session_locations` (
            `session_id` INT NOT NULL,
            `location_id` INT NOT NULL,
            PRIMARY KEY (`session_id`, `location_id`),
            CONSTRAINT `fk_sl_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_sl_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    }

    // --- events session_id + nullable league_id ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'events'")->fetch();
    if ($checkTable) {
        $hasSessionId = $pdo->query("SHOW COLUMNS FROM `events` LIKE 'session_id'")->fetch();
        if (!$hasSessionId) {
            $pdo->exec("ALTER TABLE `events` ADD COLUMN `session_id` INT DEFAULT NULL AFTER `league_id`");
            $fkExists = $pdo->query(
                "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND CONSTRAINT_NAME = 'fk_events_session'"
            )->fetch();
            if (!$fkExists) {
                $pdo->exec("ALTER TABLE `events` ADD CONSTRAINT `fk_events_session` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE");
            }
        }

        $leagueIdCol = $pdo->query("SHOW COLUMNS FROM `events` LIKE 'league_id'")->fetch();
        if ($leagueIdCol && strpos($leagueIdCol['Null'] ?? '', 'NO') !== false) {
            $pdo->exec("ALTER TABLE `events` MODIFY COLUMN `league_id` INT DEFAULT NULL");
        }
    }

    // --- team_event_matchups ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'team_event_matchups'")->fetch();
    if ($checkTable) {
        $temCols = [
            'round_name' => "ALTER TABLE `team_event_matchups` ADD COLUMN `round_name` VARCHAR(50) DEFAULT NULL AFTER `game_number`",
            'series_id'  => "ALTER TABLE `team_event_matchups` ADD COLUMN `series_id` INT DEFAULT NULL AFTER `round_name`",
        ];
        foreach ($temCols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `team_event_matchups` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
        }
    }

    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
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
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('initial_schema')")->execute();
        echo "✓ Initial schema applied successfully.\n";
    } else {
        echo "Initial schema already applied.\n";
    }

    // Always align table columns to ensure any missing columns from upgrades are added
    alignTableColumns($pdo);

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

    // -----------------------------------------------------------------------
    // Migration 3: add_archived_to_league_status
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'add_archived_to_league_status'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE `leagues` MODIFY COLUMN `status` ENUM('setup', 'active', 'completed', 'archived') DEFAULT 'setup'");
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('add_archived_to_league_status')")->execute();
        echo "✓ Added 'archived' to leagues.status ENUM.\n";
    } else {
        echo "Archived status already added.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 4: split_participants_into_format_and_type
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'split_participants_into_format_and_type'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        // Add new columns
        $hasCompFmt = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'competition_format'")->fetch();
        if (!$hasCompFmt) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `competition_format` ENUM('group', 'head2head') DEFAULT 'group' AFTER `type`");
        }
        $hasPartType = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'participation_type'")->fetch();
        if (!$hasPartType) {
            $pdo->exec("ALTER TABLE `leagues` ADD COLUMN `participation_type` ENUM('individual', 'team') DEFAULT 'individual' AFTER `competition_format`");
        }

        // Migrate existing data: individual → group+individual, team → group+team, head2head → head2head+individual
        $pdo->exec("UPDATE `leagues` SET competition_format = 'group', participation_type = 'individual' WHERE participants = 'individual'");
        $pdo->exec("UPDATE `leagues` SET competition_format = 'group', participation_type = 'team' WHERE participants = 'team'");
        $pdo->exec("UPDATE `leagues` SET competition_format = 'head2head', participation_type = 'individual' WHERE participants = 'head2head'");

        // Drop the now-obsolete participants column
        $hasParticipants = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'participants'")->fetch();
        if ($hasParticipants) {
            $pdo->exec("ALTER TABLE `leagues` DROP COLUMN `participants`");
        }

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('split_participants_into_format_and_type')")->execute();
        echo "✓ Split participants into competition_format and participation_type.\n";
    } else {
        echo "Competition format/participation type columns already exist.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 5: fix_baseball_corrupted_multipliers
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'fix_baseball_corrupted_multipliers'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("
            UPDATE target_scores 
            SET value2 = 1.5,
                score1 = CAST(ROUND(value1 * 1.0) AS SIGNED),
                score2 = CAST(ROUND(value1 * 1.5) AS SIGNED),
                score3 = CAST(ROUND(value1 * 2.25) AS SIGNED),
                score4 = CAST(ROUND(value1 * 3.375) AS SIGNED),
                score5 = CAST(ROUND(value1 * 5.0625) AS SIGNED),
                score6 = CAST(ROUND(value1 * 7.59375) AS SIGNED),
                score7 = CAST(ROUND(value1 * 11.390625) AS SIGNED),
                score8 = CAST(ROUND(value1 * 17.0859375) AS SIGNED),
                score9 = CAST(ROUND(value1 * 25.62890625) AS SIGNED),
                score10 = CAST(ROUND(value1 * 38.443359375) AS SIGNED)
            WHERE value2 > 10.0 AND event_id IN (
                SELECT e.id FROM events e 
                JOIN leagues l ON e.league_id = l.id 
                WHERE l.scoring_format = 'baseball'
            )
        ");

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('fix_baseball_corrupted_multipliers')")->execute();
        echo "✓ Fixed baseball corrupted multipliers.\n";
    } else {
        echo "Baseball corrupted multipliers migration already applied.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 6: migrate_league_players_to_universal_teams
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'migrate_league_players_to_universal_teams'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('migrate_league_players_to_universal_teams')")->execute();
        echo "✓ Migration 6 — league_players to universal teams (legacy — no action needed on current schema).\n";
    } else {
        echo "League players migration already applied.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 7: flag_individual_wrapper_teams (no-op, schema no longer uses this column)
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'flag_individual_wrapper_teams'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('flag_individual_wrapper_teams')")->execute();
        echo "✓ Migration 7 — individual wrapper flagging (legacy — no action needed).\n";
    } else {
        echo "Flag individual wrapper teams migration already applied.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 8: restore_league_players_from_wrappers (no-op, league_players is the primary path now)
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'restore_league_players_from_wrappers'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('restore_league_players_from_wrappers')")->execute();
        echo "✓ Migration 8 — league players restoration (legacy — no action needed).\n";
    } else {
        echo "League players restoration already applied.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 9: cleanup_individual_wrapper_teams
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'cleanup_individual_wrapper_teams'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

        // Step 1: Backfill league_players from existing league_teams for individual leagues
        $pdo->exec("
            INSERT IGNORE INTO league_players (league_id, player_id)
            SELECT DISTINCT lt.league_id, tm.player_id
            FROM league_teams lt
            JOIN teams t ON lt.team_id = t.id
            JOIN team_members tm ON t.id = tm.team_id
            JOIN leagues l ON lt.league_id = l.id
            WHERE l.participation_type = 'individual'
        ");
        $restored = $pdo->query("SELECT COUNT(*) FROM league_players")->fetchColumn();
        echo "  league_players has $restored rows after backfill.\n";

        // Step 2: Null out scores.team_id for individual leagues (they use player_id now)
        $hasTeamIdCol = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'team_id'")->fetch();
        if ($hasTeamIdCol) {
            $nullCount = $pdo->exec("
                UPDATE scores s
                JOIN events e ON s.event_id = e.id
                JOIN leagues l ON e.league_id = l.id
                SET s.team_id = NULL
                WHERE l.participation_type = 'individual'
                  AND s.team_id IS NOT NULL
            ");
            echo "  Nulled $nullCount scores.team_id references for individual leagues.\n";
        } else {
            echo "  scores.team_id column does not exist — skipping UPDATE.\n";
        }

        // Step 3: Delete league_teams entries for individual leagues (roster now in league_players)
        $ltCount = $pdo->exec("
            DELETE lt FROM league_teams lt
            JOIN leagues l ON lt.league_id = l.id
            WHERE l.participation_type = 'individual'
        ");
        echo "  Removed $ltCount league_teams entries for individual leagues.\n";

        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('cleanup_individual_wrapper_teams')")->execute();
        echo "✓ Migration 9 — migrated individual leagues from wrapper teams to league_players.\n";
    } else {
        echo "Individual wrapper team cleanup already applied.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 10: separate_sessions_from_leagues
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'separate_sessions_from_leagues'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

        // Make league_id nullable first (needed to NULL out session event references)
        $pdo->exec("ALTER TABLE `events` MODIFY COLUMN `league_id` INT DEFAULT NULL");

        // Find session league IDs
        $sessionLeagueIds = $pdo->query("SELECT id FROM leagues WHERE type = 'session'")->fetchAll(\PDO::FETCH_COLUMN);

        if (!empty($sessionLeagueIds)) {
            $placeholders = implode(',', array_fill(0, count($sessionLeagueIds), '?'));

            // Null out league_id on session events
            $pdo->prepare("UPDATE events SET league_id = NULL WHERE league_id IN ($placeholders)")->execute($sessionLeagueIds);

            // Cascade delete session event data manually
            $evtIds = $pdo->prepare("SELECT id FROM events WHERE league_id IS NULL");
            $evtIds->execute();
            $eventIdList = $evtIds->fetchAll(\PDO::FETCH_COLUMN);

            if (!empty($eventIdList)) {
                $evtPlaceholders = implode(',', array_fill(0, count($eventIdList), '?'));
                $pdo->prepare("DELETE FROM scores WHERE event_id IN ($evtPlaceholders)")->execute($eventIdList);
                $pdo->prepare("DELETE FROM matchups WHERE event_matchup_id IN (SELECT id FROM event_matchups WHERE event_id IN ($evtPlaceholders))")->execute($eventIdList);
                $pdo->prepare("DELETE FROM event_matchups WHERE event_id IN ($evtPlaceholders)")->execute($eventIdList);
                $pdo->prepare("DELETE FROM target_scores WHERE event_id IN ($evtPlaceholders)")->execute($eventIdList);
                $pdo->prepare("DELETE FROM events WHERE id IN ($evtPlaceholders)")->execute($eventIdList);
            }

            // Delete league associations, then the leagues
            $pdo->prepare("DELETE FROM league_teams WHERE league_id IN ($placeholders)")->execute($sessionLeagueIds);
            $pdo->prepare("DELETE FROM league_players WHERE league_id IN ($placeholders)")->execute($sessionLeagueIds);
            $pdo->prepare("DELETE FROM league_staff WHERE league_id IN ($placeholders)")->execute($sessionLeagueIds);
            $pdo->prepare("DELETE FROM league_locations WHERE league_id IN ($placeholders)")->execute($sessionLeagueIds);
            $pdo->prepare("DELETE FROM leagues WHERE id IN ($placeholders)")->execute($sessionLeagueIds);
            echo "  Removed " . count($sessionLeagueIds) . " session leagues.\n";
        } else {
            echo "  No session leagues found to remove.\n";
        }

        // Drop the type column from leagues
        $hasType = $pdo->query("SHOW COLUMNS FROM `leagues` LIKE 'type'")->fetch();
        if ($hasType) {
            $pdo->exec("ALTER TABLE `leagues` DROP COLUMN `type`");
            echo "  Dropped leagues.type column.\n";
        }

        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('separate_sessions_from_leagues')")->execute();
        echo "✓ Migration 10 — separated sessions from leagues.\n";
    } else {
        echo "Session separation from leagues already applied.\n";
    }

    // Migration 11: split_team_and_individual_tables
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'split_team_and_individual_tables'");
    $stmt->execute();
    if (!$stmt->fetch()) {

        // --- Create team-only tables ---
        // Team data is not yet in production, so drop any existing team tables
        // for a clean slate before recreating.
        $pdo->exec("DROP TABLE IF EXISTS `team_scores`");
        $pdo->exec("DROP TABLE IF EXISTS `team_matchups`");
        $pdo->exec("DROP TABLE IF EXISTS `team_event_matchups`");

        $pdo->exec("CREATE TABLE IF NOT EXISTS `team_event_matchups` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `event_id` INT NOT NULL,
            `location_id` INT DEFAULT NULL,
            `team1_id` INT DEFAULT NULL,
            `team2_id` INT DEFAULT NULL,
            `team3_id` INT DEFAULT NULL,
            `team4_id` INT DEFAULT NULL,
            `team1_score` INT DEFAULT 0,
            `team2_score` INT DEFAULT 0,
            `team3_score` INT DEFAULT 0,
            `team4_score` INT DEFAULT 0,
            `team_winner_id` INT DEFAULT NULL,
            `status` ENUM('pending', 'completed') DEFAULT 'pending',
            `game_number` INT DEFAULT 1,
            `round_name` VARCHAR(50) DEFAULT NULL,
            `series_id` INT DEFAULT NULL,
            CONSTRAINT `fk_tem_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_tem_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        $pdo->exec("CREATE TABLE IF NOT EXISTS `team_matchups` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `team_event_matchup_id` INT DEFAULT NULL,
            `order_number` INT NOT NULL,
            `machine_id` INT NOT NULL,
            `team1_id` INT DEFAULT NULL,
            `team2_id` INT DEFAULT NULL,
            `team3_id` INT DEFAULT NULL,
            `team4_id` INT DEFAULT NULL,
            UNIQUE KEY `unique_team_matchup_round` (`team_event_matchup_id`, `order_number`),
            CONSTRAINT `fk_tm_team_event_matchup` FOREIGN KEY (`team_event_matchup_id`) REFERENCES `team_event_matchups` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_tm_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        $pdo->exec("CREATE TABLE IF NOT EXISTS `team_scores` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `team_event_matchup_id` INT DEFAULT NULL,
            `team_id` INT DEFAULT NULL,
            `machine_id` INT NOT NULL,
            `order_number` INT NOT NULL,
            `ball1` INT DEFAULT 0,
            `ball1_player_id` INT DEFAULT NULL,
            `ball2` INT DEFAULT 0,
            `ball2_player_id` INT DEFAULT NULL,
            `ball3` INT DEFAULT 0,
            `ball3_player_id` INT DEFAULT NULL,
            UNIQUE KEY `unique_team_score` (`team_event_matchup_id`, `team_id`, `order_number`),
            CONSTRAINT `fk_tscore_team_event_matchup` FOREIGN KEY (`team_event_matchup_id`) REFERENCES `team_event_matchups` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_tscore_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_tscore_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_tscore_b1_player` FOREIGN KEY (`ball1_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL,
            CONSTRAINT `fk_tscore_b2_player` FOREIGN KEY (`ball2_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL,
            CONSTRAINT `fk_tscore_b3_player` FOREIGN KEY (`ball3_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");

        // --- Clean up individual tables (team columns no longer belong here) ---

        // Helper: check if a column exists
        $colExists = function($table, $col) use ($pdo) {
            return (bool)$pdo->query("SHOW COLUMNS FROM `$table` LIKE '$col'")->fetch();
        };

        // 1. Delete any existing team data (dev phase — no migration needed)
        $teamEventIds = $pdo->query(
            "SELECT em.id FROM event_matchups em
             JOIN events e ON em.event_id = e.id
             JOIN leagues l ON e.league_id = l.id
             WHERE l.participation_type = 'team'"
        )->fetchAll(\PDO::FETCH_COLUMN);
        if (!empty($teamEventIds)) {
            $ids = implode(',', array_map('intval', $teamEventIds));
            $pdo->exec("DELETE FROM matchups WHERE event_matchup_id IN ($ids)");
            $pdo->exec("DELETE FROM scores WHERE event_matchup_id IN ($ids)");
            $pdo->exec("DELETE FROM event_matchups WHERE id IN ($ids)");
        }

        // 2. Drop team FK + unique key from scores, then drop team_id
        if ($colExists('scores', 'team_id')) {
            $fkScoreTeam = $pdo->query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
                                         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scores'
                                         AND COLUMN_NAME = 'team_id' AND REFERENCED_TABLE_NAME IS NOT NULL")->fetchColumn();
            if ($fkScoreTeam) {
                $pdo->exec("ALTER TABLE `scores` DROP FOREIGN KEY `$fkScoreTeam`");
            }
            $uqExists = $pdo->query("SHOW KEYS FROM `scores` WHERE Key_name = 'uq_score_team'")->fetch();
            if ($uqExists) {
                // A prior failed migration may have left FK metadata linking team_scores
                // to uq_score_team. Temporarily disable FK checks to allow the drop.
                $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
                $pdo->exec("ALTER TABLE `scores` DROP INDEX `uq_score_team`");
                $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
            }
            $pdo->exec("ALTER TABLE `scores` DROP COLUMN `team_id`");
        }

        // 3. Drop team columns from event_matchups
        foreach (['team1_id','team2_id','team3_id','team4_id','team1_score','team2_score','team3_score','team4_score'] as $col) {
            if ($colExists('event_matchups', $col)) {
                $pdo->exec("ALTER TABLE `event_matchups` DROP COLUMN `$col`");
            }
        }

        // 4. Rename winner_id to player_winner_id on event_matchups
        if ($colExists('event_matchups', 'winner_id')) {
            $pdo->exec("ALTER TABLE `event_matchups` CHANGE COLUMN `winner_id` `player_winner_id` INT DEFAULT NULL");
        }

        // 5. Drop team columns from matchups
        foreach (['team1_id','team2_id','team3_id','team4_id'] as $col) {
            if ($colExists('matchups', $col)) {
                $pdo->exec("ALTER TABLE `matchups` DROP COLUMN `$col`");
            }
        }

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('split_team_and_individual_tables')")->execute();
        echo "✓ Migration 11 — split team and individual tables.\n";
    } else {
        echo "Team/individual table split already applied.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 12: remove_ball_player_ids_from_scores
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'remove_ball_player_ids_from_scores'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

        foreach (['fk_scores_b1_player', 'fk_scores_b2_player', 'fk_scores_b3_player'] as $fk) {
            $exists = $pdo->query(
                "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scores'
                 AND CONSTRAINT_NAME = '$fk'"
            )->fetch();
            if ($exists) {
                $pdo->exec("ALTER TABLE `scores` DROP FOREIGN KEY `$fk`");
            }
        }

        foreach (['ball1_player_id', 'ball2_player_id', 'ball3_player_id'] as $col) {
            $colExists = $pdo->query("SHOW COLUMNS FROM `scores` LIKE '$col'")->fetch();
            if ($colExists) {
                $pdo->exec("ALTER TABLE `scores` DROP COLUMN `$col`");
            }
        }

        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('remove_ball_player_ids_from_scores')")->execute();
        echo "✓ Migration 12 — removed ball1-3_player_id columns from scores table.\n";
    } else {
        echo "Ball player ID columns removal from scores already applied.\n";
    }

    // -----------------------------------------------------------------------
    // Migration 13: consolidate_team_event_matchups_to_one_per_game
    // -----------------------------------------------------------------------
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration_name = 'consolidate_team_event_matchups_to_one_per_game'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

        // 1. For each distinct game (event_id, team1_id, team2_id), merge
        //    the multiple half-inning rows into a single row with summed scores.
        $rows = $pdo->query(
            "SELECT id, event_id, team1_id, team2_id, team1_score, team2_score, status, game_number
             FROM team_event_matchups
             ORDER BY event_id ASC, team1_id ASC, team2_id ASC, id ASC"
        )->fetchAll();

        $games = [];
        foreach ($rows as $r) {
            $key = (int)$r['event_id'] . '_' . (int)$r['team1_id'] . '_' . (int)$r['team2_id'];
            if (!isset($games[$key])) {
                $games[$key] = [
                    'survivor_id' => (int)$r['id'],
                    'event_id' => (int)$r['event_id'],
                    'team1_id' => (int)$r['team1_id'],
                    'team2_id' => (int)$r['team2_id'],
                    'team1_score' => (int)($r['team1_score'] ?? 0),
                    'team2_score' => (int)($r['team2_score'] ?? 0),
                    'game_number' => (int)($r['game_number'] ?? 1),
                    'duplicate_ids' => [],
                ];
            } else {
                $games[$key]['duplicate_ids'][] = (int)$r['id'];
                $games[$key]['team1_score'] += (int)($r['team1_score'] ?? 0);
                $games[$key]['team2_score'] += (int)($r['team2_score'] ?? 0);
            }
        }

        foreach ($games as $g) {
            $survivorId = $g['survivor_id'];
            $dupIds = $g['duplicate_ids'];

            if (empty($dupIds)) {
                // Single row only — just clear round_name
                $pdo->prepare("UPDATE team_event_matchups SET round_name = NULL WHERE id = ?")->execute([$survivorId]);
                continue;
            }

            // Update survivor with summed scores
            $pdo->prepare(
                "UPDATE team_event_matchups SET team1_score = ?, team2_score = ?, round_name = NULL WHERE id = ?"
            )->execute([$g['team1_score'], $g['team2_score'], $survivorId]);

            // Re-point team_matchups entries: update temId and adjust order_number
            // Each temId had order_numbers starting at 1. We accumulate an offset
            // equal to the count of entries already assigned, so the final sequence
            // is 1, 2, 3, ... across all consolidated entries.
            $entriesForSurvivor = $pdo->prepare(
                "SELECT COUNT(*) FROM team_matchups WHERE team_event_matchup_id = ?"
            );
            $entriesForSurvivor->execute([$survivorId]);
            $offset = (int)$entriesForSurvivor->fetchColumn();

            foreach ($dupIds as $dupId) {
                // Re-point team_matchups entries
                $tmStmt = $pdo->prepare(
                    "SELECT id, order_number FROM team_matchups WHERE team_event_matchup_id = ? ORDER BY order_number ASC"
                );
                $tmStmt->execute([$dupId]);
                $tmEntries = $tmStmt->fetchAll();

                foreach ($tmEntries as $tm) {
                    $newOrder = $offset + (int)$tm['order_number'];
                    $pdo->prepare(
                        "UPDATE team_matchups SET team_event_matchup_id = ?, order_number = ? WHERE id = ?"
                    )->execute([$survivorId, $newOrder, (int)$tm['id']]);
                }

                // Re-point team_scores entries (same offset as team_matchups)
                $tsStmt = $pdo->prepare(
                    "SELECT id, order_number FROM team_scores WHERE team_event_matchup_id = ? ORDER BY order_number ASC"
                );
                $tsStmt->execute([$dupId]);
                $tsEntries = $tsStmt->fetchAll();

                foreach ($tsEntries as $ts) {
                    $newOrder = $offset + (int)$ts['order_number'];
                    $pdo->prepare(
                        "UPDATE team_scores SET team_event_matchup_id = ?, order_number = ? WHERE id = ?"
                    )->execute([$survivorId, $newOrder, (int)$ts['id']]);
                }

                // Advance offset by the number of order_number positions consumed
                $offset += count($tmEntries);
            }

            // Delete duplicate team_event_matchups
            $placeholders = implode(',', array_fill(0, count($dupIds), '?'));
            $pdo->prepare("DELETE FROM team_event_matchups WHERE id IN ($placeholders)")->execute($dupIds);
        }

        // 2. Clear inning-based round_name values ("Top 1", "Bottom 1", etc.)
        //    but preserve playoff bracket values ("Quarterfinals", "Semifinals", "Finals").
        $pdo->exec("UPDATE team_event_matchups SET round_name = NULL WHERE round_name REGEXP '^(Top|Bottom) [0-9]+$'");

        // 3. Add series_id for playoff series tracking
        $colExists = $pdo->query("SHOW COLUMNS FROM `team_event_matchups` LIKE 'series_id'")->fetch();
        if (!$colExists) {
            $pdo->exec("ALTER TABLE `team_event_matchups` ADD COLUMN `series_id` INT DEFAULT NULL AFTER `game_number`");
        }

        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('consolidate_team_event_matchups_to_one_per_game')")->execute();
        echo "✓ Migration 13 — consolidated team_event_matchups to 1 row per game, cleared inning round_name, added series_id.\n";
    } else {
        echo "Team event matchup consolidation already applied.\n";
    }

    echo "\n✓ All migrations complete.\n";
} catch (PDOException $e) {
    echo "\n✗ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
