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
        `is_individual_wrapper` TINYINT(1) DEFAULT 0,
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
        `player_id` INT NULL DEFAULT NULL,
        `team_id` INT NULL DEFAULT NULL,
        `order_number` INT NOT NULL,
        `machine_id` INT NOT NULL,
        `ball1` BIGINT DEFAULT 0,
        `ball1_player_id` INT NULL DEFAULT NULL,
        `ball2` BIGINT DEFAULT 0,
        `ball2_player_id` INT NULL DEFAULT NULL,
        `ball3` BIGINT DEFAULT 0,
        `ball3_player_id` INT NULL DEFAULT NULL,
        `match_key` VARCHAR(100) GENERATED ALWAYS AS (
            IF(`event_matchup_id` IS NULL,
               CONCAT('evt_', `event_id`, '_rnd_', `order_number`),
               CONCAT('mch_', `event_matchup_id`, '_rnd_', `order_number`)
            )
        ) STORED,
        UNIQUE KEY `unique_scores_key` (`player_id`, `match_key`),
        UNIQUE KEY `uq_score_team` (`event_matchup_id`, `team_id`, `order_number`),
        CONSTRAINT `fk_scores_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_scores_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_scores_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_scores_machine` FOREIGN KEY (`machine_id`) REFERENCES `machines` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_score_event_matchup` FOREIGN KEY (`event_matchup_id`) REFERENCES `event_matchups` (`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_scores_b1_player` FOREIGN KEY (`ball1_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL,
        CONSTRAINT `fk_scores_b2_player` FOREIGN KEY (`ball2_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL,
        CONSTRAINT `fk_scores_b3_player` FOREIGN KEY (`ball3_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL
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
        `player1_id` INT NOT NULL,
        `player2_id` INT DEFAULT NULL,
        `player3_id` INT DEFAULT NULL,
        `player4_id` INT DEFAULT NULL,
        `player1_score` INT DEFAULT 0,
        `player2_score` INT DEFAULT 0,
        `player3_score` INT DEFAULT 0,
        `player4_score` INT DEFAULT 0,
        `winner_id` INT DEFAULT NULL,
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
            'type'                     => "ALTER TABLE `leagues` ADD COLUMN `type` ENUM('standard', 'session') DEFAULT 'standard' AFTER `name`",
            'competition_format'       => "ALTER TABLE `leagues` ADD COLUMN `competition_format` ENUM('group', 'head2head') DEFAULT 'group' AFTER `type`",
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
        if (!$hasWrapperCol) {
            $pdo->exec("ALTER TABLE `teams` ADD COLUMN `is_individual_wrapper` TINYINT(1) DEFAULT 0");
        }
        // Retroactively flag existing 1-person wrapper teams
        $pdo->exec("
            UPDATE `teams` t
            JOIN `team_members` tm ON t.id = tm.team_id
            JOIN `players` p ON tm.player_id = p.id
            SET t.is_individual_wrapper = 1
            WHERE t.name = p.player_name
              AND t.id IN (
                SELECT sub.team_id FROM (
                  SELECT tm2.team_id
                  FROM `team_members` tm2
                  GROUP BY tm2.team_id
                  HAVING COUNT(tm2.player_id) = 1
                ) sub
              )
        ");
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

        // team_id support: make player_id nullable and add team_id column + unique key
        $playerIdCol = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'player_id'")->fetch();
        if ($playerIdCol && strpos(strtoupper($playerIdCol['Null'] ?? ''), 'NO') !== false) {
            // Make player_id nullable so team-level rows can omit it
            $pdo->exec("ALTER TABLE `scores` MODIFY COLUMN `player_id` INT NULL DEFAULT NULL");
        }

        $hasTeamId = $pdo->query("SHOW COLUMNS FROM `scores` LIKE 'team_id'")->fetch();
        if (!$hasTeamId) {
            $pdo->exec("ALTER TABLE `scores` ADD COLUMN `team_id` INT NULL DEFAULT NULL AFTER `player_id`");
            $fkExists = $pdo->query(
                "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scores' AND CONSTRAINT_NAME = 'fk_scores_team'"
            )->fetch();
            if (!$fkExists) {
                $pdo->exec("ALTER TABLE `scores` ADD CONSTRAINT `fk_scores_team` FOREIGN KEY (`team_id`) REFERENCES `teams` (`id`) ON DELETE CASCADE");
            }
        }

        $hasTeamKey = $pdo->query("SHOW INDEX FROM `scores` WHERE Key_name = 'uq_score_team'")->fetch();
        if (!$hasTeamKey) {
            $pdo->exec("ALTER TABLE `scores` ADD UNIQUE KEY `uq_score_team` (`event_matchup_id`, `team_id`, `order_number`)");
        }

        $ballCols = [
            'ball1_player_id' => "ALTER TABLE `scores` ADD COLUMN `ball1_player_id` INT NULL DEFAULT NULL AFTER `ball1`",
            'ball2_player_id' => "ALTER TABLE `scores` ADD COLUMN `ball2_player_id` INT NULL DEFAULT NULL AFTER `ball2`",
            'ball3_player_id' => "ALTER TABLE `scores` ADD COLUMN `ball3_player_id` INT NULL DEFAULT NULL AFTER `ball3`",
        ];
        foreach ($ballCols as $col => $sql) {
            $exists = $pdo->query("SHOW COLUMNS FROM `scores` LIKE '$col'")->fetch();
            if (!$exists) {
                $pdo->exec($sql);
            }
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
    }

    // --- event_matchups ---
    $checkTable = $pdo->query("SHOW TABLES LIKE 'event_matchups'")->fetch();
    if ($checkTable) {
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
        $hasLeaguePlayers = $pdo->query("SHOW TABLES LIKE 'league_players'")->fetch();
        if ($hasLeaguePlayers) {
            // Step 1: Create a 1-player team for each player in league_players if they don't already have one
            $pdo->exec("
                INSERT INTO teams (name)
                SELECT DISTINCT p.player_name
                FROM league_players lp
                JOIN players p ON lp.player_id = p.id
                LEFT JOIN (
                    SELECT tm.player_id, t.id
                    FROM team_members tm
                    JOIN teams t ON tm.team_id = t.id
                    GROUP BY tm.player_id, t.id
                    HAVING COUNT(*) = 1
                ) existing_solo ON lp.player_id = existing_solo.player_id
                WHERE existing_solo.id IS NULL
            ");

            // Step 2: Link player to their 1-player team in team_members
            $pdo->exec("
                INSERT IGNORE INTO team_members (team_id, player_id)
                SELECT DISTINCT t.id, lp.player_id
                FROM league_players lp
                JOIN players p ON lp.player_id = p.id
                JOIN teams t ON t.name = p.player_name
            ");

            // Step 3: Link the team to the league in league_teams
            $pdo->exec("
                INSERT IGNORE INTO league_teams (league_id, team_id)
                SELECT DISTINCT lp.league_id, tm.team_id
                FROM league_players lp
                JOIN team_members tm ON lp.player_id = tm.player_id
            ");

            // Step 4: Safely drop legacy league_players table
            $pdo->exec("DROP TABLE IF EXISTS `league_players`");
        } else {
            // Fallback: If league_players was already dropped, reconstruct league_teams from scores table!
            $pdo->exec("
                INSERT INTO teams (name)
                SELECT DISTINCT p.player_name
                FROM scores s
                JOIN events e ON s.event_id = e.id
                JOIN players p ON s.player_id = p.id
                LEFT JOIN (
                    SELECT tm.player_id, t.id
                    FROM team_members tm
                    JOIN teams t ON tm.team_id = t.id
                    GROUP BY tm.player_id, t.id
                    HAVING COUNT(*) = 1
                ) existing_solo ON s.player_id = existing_solo.player_id
                WHERE e.league_id IS NOT NULL AND existing_solo.id IS NULL
            ");

            $pdo->exec("
                INSERT IGNORE INTO team_members (team_id, player_id)
                SELECT DISTINCT t.id, s.player_id
                FROM scores s
                JOIN events e ON s.event_id = e.id
                JOIN players p ON s.player_id = p.id
                JOIN teams t ON t.name = p.player_name
                WHERE e.league_id IS NOT NULL
            ");

            $pdo->exec("
                INSERT IGNORE INTO league_teams (league_id, team_id)
                SELECT DISTINCT e.league_id, tm.team_id
                FROM scores s
                JOIN events e ON s.event_id = e.id
                JOIN team_members tm ON s.player_id = tm.player_id
                WHERE e.league_id IS NOT NULL
            ");
        }

        $pdo->prepare("INSERT INTO schema_migrations (migration_name) VALUES ('migrate_league_players_to_universal_teams')")->execute();
        echo "✓ Migrated legacy league_players into universal teams (league_teams/team_members).\n";
    } else {
        echo "League players migration already applied.\n";
    }

    echo "\n✓ All migrations complete.\n";
} catch (PDOException $e) {
    echo "\n✗ Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
