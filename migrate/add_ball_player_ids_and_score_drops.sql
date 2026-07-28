-- ============================================================
-- MIGRATION: Add ball_player_ids and score drop settings
-- ============================================================
-- NOTE: The ball1-3_player_id columns on the `scores` table
-- were never populated (individual mode doesn't use them).
-- They have been removed in Migration 12 of migrate.php.
-- The team_scores table retains its own ball1-3_player_id columns.
-- ============================================================
-- Purpose:
--   1. Support ball-level player tracking for Baseball Team mode
--      (ball1_player_id, ball2_player_id, ball3_player_id).
--   2. Support score dropping configuration in leagues
--      (drop_lowest_player_scores).
-- ============================================================

-- 1. Add ball-level player IDs to scores table
ALTER TABLE `scores`
    ADD COLUMN `ball1_player_id` INT NULL DEFAULT NULL AFTER `ball1`,
    ADD COLUMN `ball2_player_id` INT NULL DEFAULT NULL AFTER `ball2`,
    ADD COLUMN `ball3_player_id` INT NULL DEFAULT NULL AFTER `ball3`,
    ADD CONSTRAINT `fk_scores_b1_player` FOREIGN KEY (`ball1_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL,
    ADD CONSTRAINT `fk_scores_b2_player` FOREIGN KEY (`ball2_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL,
    ADD CONSTRAINT `fk_scores_b3_player` FOREIGN KEY (`ball3_player_id`) REFERENCES `players` (`id`) ON DELETE SET NULL;

-- 2. Add drop_lowest_player_scores to leagues table
ALTER TABLE `leagues`
    ADD COLUMN `drop_lowest_player_scores` INT DEFAULT 0 AFTER `drop_lowest_weeks`;
