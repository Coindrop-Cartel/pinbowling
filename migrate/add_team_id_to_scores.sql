-- ============================================================
-- MIGRATION: Add team_id to scores table
-- ============================================================
-- Purpose: Support team-level score rows (e.g. baseball H2H where
--          a half-inning score belongs to the team, not a player).
--          player_id-based rows are unchanged; team_id is nullable
--          and used exclusively when a team, not an individual,
--          owns the score entry.
-- ============================================================

-- 1. Make player_id nullable (team rows won't have a player_id)
ALTER TABLE `scores`
    MODIFY COLUMN `player_id` INT(11) NULL DEFAULT NULL;

-- 2. Add the team_id column
ALTER TABLE `scores`
    ADD COLUMN `team_id` INT(11) NULL DEFAULT NULL AFTER `player_id`,
    ADD KEY `idx_scores_team_id` (`team_id`),
    ADD CONSTRAINT `fk_scores_team`
        FOREIGN KEY (`team_id`)
        REFERENCES `teams` (`id`)
        ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Add a unique key covering team-scoped score rows
--    (mirrors the existing player-scoped unique key, uses team_id instead)
ALTER TABLE `scores`
    ADD UNIQUE KEY `uq_score_team` (`event_matchup_id`, `team_id`, `order_number`);

-- VERIFY:
-- DESCRIBE scores;
-- Expected: player_id is nullable, new team_id column present, new unique key visible
