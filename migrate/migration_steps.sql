-- ============================================================
-- MIGRATION: Import Production Data to Staging Database
-- ============================================================
-- Source: sql_backup_pinballa1_and_stuff_16-07-2026_09_03.sql
-- Target: Current staging database (managed by migrate.php)
--
-- Instructions:
--   1. Run each STEP block separately (copy from "-- STEP X" to
--      the next "-- END STEP X" or "-- VERIFY STEP X").
--   2. Run the VERIFY query that follows each step.
--   3. Report the results back to me so I can confirm before
--      you proceed to the next step.
--
-- All INSERTs use IGNORE or WHERE NOT EXISTS for idempotency.
-- IDs are resolved by name-based subqueries throughout.
-- ============================================================

-- ============================================================
-- STEP 1: Locations
-- ============================================================
INSERT IGNORE INTO `locations` (`name`, `city`, `state`) VALUES
('Level 256', 'Asheville', 'North Carolina'),
('DSSOLVR', 'Asheville', 'North Carolina');

-- VERIFY STEP 1:
-- SELECT id, name, city, state FROM `locations` ORDER BY name;
-- Expected: 2 rows -- Level 256 (Asheville, NC) and DSSOLVR (Asheville, NC)

-- ============================================================
-- END STEP 1 -- Run the VERIFY and report results
-- ============================================================

-- ============================================================
-- STEP 2: Machines (20 rows)
-- ============================================================
INSERT IGNORE INTO `machines` (`machine_name`, `year`, `manufacturer`) VALUES
('X-Men', NULL, NULL),
('Stranger Things', NULL, NULL),
('Car Hop', NULL, NULL),
('Foo Fighters', NULL, NULL),
('Monster Bash', NULL, NULL),
('King Kong', NULL, NULL),
('Jaws', NULL, NULL),
('Godzilla', NULL, NULL),
('Walking Dead', NULL, NULL),
('Dungeons & Dragons', NULL, NULL),
('Pokemon', NULL, NULL),
('John Wick', NULL, NULL),
('Jurassic Park', NULL, NULL),
('Star Wars FOTE', NULL, NULL),
('Deadpool', NULL, NULL),
('Hot Wheels', NULL, NULL),
('Cactus Canyon', NULL, NULL),
('Metallica', NULL, NULL),
('Spiderman', NULL, NULL),
('Black Knight: Sword of Rage', NULL, NULL);

-- VERIFY STEP 2:
-- SELECT id, machine_name FROM `machines` ORDER BY machine_name;
-- Expected: 20 rows

-- ============================================================
-- END STEP 2 -- Run the VERIFY and report results
-- ============================================================

-- ============================================================
-- STEP 3: Players (26 rows)
-- ============================================================
INSERT IGNORE INTO `players` (`player_name`, `ifpa_id`, `matchplay_id`) VALUES
('Kyle Voorhees', NULL, NULL),
('Shawn Scott Smith', NULL, NULL),
('Adam Yates', NULL, NULL),
('Anna Yates', NULL, NULL),
('Noah Clarke', NULL, NULL),
('Nora Collins', NULL, NULL),
('Ed Christoph', NULL, NULL),
('Katie Sampler', NULL, NULL),
('Lilly', NULL, NULL),
('Adam Bowman', NULL, NULL),
('Brian Tavener', NULL, NULL),
('Lee Stafford', NULL, NULL),
('Andrew Spillios', NULL, NULL),
('Brendan Newman', NULL, NULL),
('Austin Fanger', NULL, NULL),
('Steve McGinn', '31103', '651'),
('Heather Labarbera', NULL, NULL),
('Zachary Hiller', NULL, NULL),
('Mark Lathrop', NULL, NULL),
('Laura Varney', NULL, NULL),
('Brian Dunn', NULL, NULL),
('Nerb', NULL, NULL),
('Cailan', NULL, NULL),
('Courtland cain', NULL, NULL),
('Cory Cain', NULL, NULL),
('Bowman', NULL, NULL);

-- VERIFY STEP 3:
-- SELECT id, player_name, ifpa_id, matchplay_id FROM `players` ORDER BY player_name;
-- Expected: 26 rows, Steve McGinn should have ifpa_id=31103, matchplay_id=651

-- ============================================================
-- END STEP 3 -- Run the VERIFY and report results
-- ============================================================

-- ============================================================
-- STEP 4: Leagues (8 rows)
-- ============================================================
-- Note: leagues table has no UNIQUE on name, so we use WHERE NOT EXISTS
INSERT INTO `leagues` (`name`, `type`, `participants`, `start_date`, `scoring_format`, `season_scoring`, `drop_lowest_weeks`)
SELECT 'Asheville Pinball League - Season 6', 'standard', 'individual', '2026-05-26', 'bowling', 'weekly', 0
WHERE NOT EXISTS (SELECT 1 FROM `leagues` WHERE `name` = 'Asheville Pinball League - Season 6');

INSERT INTO `leagues` (`name`, `type`, `participants`, `start_date`, `scoring_format`, `season_scoring`, `drop_lowest_weeks`)
SELECT 'Asheville Pinbowling! Season 1', 'standard', 'individual', '2026-06-03', 'bowling', 'weekly', 0
WHERE NOT EXISTS (SELECT 1 FROM `leagues` WHERE `name` = 'Asheville Pinbowling! Season 1');

-- VERIFY STEP 4:
-- SELECT id, name, type, participants, start_date, scoring_format FROM `leagues` ORDER BY id;
-- Expected: 2 rows -- 1 standard league (Asheville Pinball League - Season 6),
--   1 standard league (Asheville Pinbowling! Season 1).
--   Session leagues (Level 256) are intentionally NOT migrated.

-- ============================================================
-- END STEP 4 -- Run the VERIFY and report results
-- ============================================================

-- ============================================================
-- STEP 5: Events (7 rows)
-- ============================================================
-- Resolves league_id by league name, location_id by location name.
-- Uses INSERT ... SELECT with WHERE NOT EXISTS on (league_id, event_name, event_date)
-- since events has no UNIQUE key on those columns.
INSERT INTO `events` (`league_id`, `location_id`, `event_name`, `event_date`, `scoring_format`)
SELECT l.id, loc.id, 'Pinbowling Week', '2026-05-26', 'bowling'
FROM `leagues` l, `locations` loc
WHERE l.name = 'Asheville Pinball League - Season 6'
  AND loc.name = 'Level 256'
  AND NOT EXISTS (SELECT 1 FROM `events` e WHERE e.league_id = l.id AND e.event_name = 'Pinbowling Week' AND e.event_date = '2026-05-26');

INSERT INTO `events` (`league_id`, `location_id`, `event_name`, `event_date`, `scoring_format`)
SELECT l.id, loc.id, 'Week 1', '2026-06-03', 'bowling'
FROM `leagues` l, `locations` loc
WHERE l.name = 'Asheville Pinbowling! Season 1'
  AND loc.name = 'Level 256'
  AND NOT EXISTS (SELECT 1 FROM `events` e WHERE e.league_id = l.id AND e.event_name = 'Week 1' AND e.event_date = '2026-06-03');

INSERT INTO `events` (`league_id`, `location_id`, `event_name`, `event_date`, `scoring_format`)
SELECT l.id, loc.id, 'Week 2', '2026-06-10', 'bowling'
FROM `leagues` l, `locations` loc
WHERE l.name = 'Asheville Pinbowling! Season 1'
  AND loc.name = 'Level 256'
  AND NOT EXISTS (SELECT 1 FROM `events` e WHERE e.league_id = l.id AND e.event_name = 'Week 2' AND e.event_date = '2026-06-10');

INSERT INTO `events` (`league_id`, `location_id`, `event_name`, `event_date`, `scoring_format`)
SELECT l.id, loc.id, 'Week 3', '2026-06-17', 'bowling'
FROM `leagues` l, `locations` loc
WHERE l.name = 'Asheville Pinbowling! Season 1'
  AND loc.name = 'Level 256'
  AND NOT EXISTS (SELECT 1 FROM `events` e WHERE e.league_id = l.id AND e.event_name = 'Week 3' AND e.event_date = '2026-06-17');

INSERT INTO `events` (`league_id`, `location_id`, `event_name`, `event_date`, `scoring_format`)
SELECT l.id, loc.id, 'Week 4', '2026-06-24', 'bowling'
FROM `leagues` l, `locations` loc
WHERE l.name = 'Asheville Pinbowling! Season 1'
  AND loc.name = 'Level 256'
  AND NOT EXISTS (SELECT 1 FROM `events` e WHERE e.league_id = l.id AND e.event_name = 'Week 4' AND e.event_date = '2026-06-24');

INSERT INTO `events` (`league_id`, `location_id`, `event_name`, `event_date`, `scoring_format`)
SELECT l.id, loc.id, 'Week 5', '2026-07-01', 'bowling'
FROM `leagues` l, `locations` loc
WHERE l.name = 'Asheville Pinbowling! Season 1'
  AND loc.name = 'Level 256'
  AND NOT EXISTS (SELECT 1 FROM `events` e WHERE e.league_id = l.id AND e.event_name = 'Week 5' AND e.event_date = '2026-07-01');

INSERT INTO `events` (`league_id`, `location_id`, `event_name`, `event_date`, `scoring_format`)
SELECT l.id, loc.id, 'Week 6', '2026-07-08', 'bowling'
FROM `leagues` l, `locations` loc
WHERE l.name = 'Asheville Pinbowling! Season 1'
  AND loc.name = 'Level 256'
  AND NOT EXISTS (SELECT 1 FROM `events` e WHERE e.league_id = l.id AND e.event_name = 'Week 6' AND e.event_date = '2026-07-08');

-- VERIFY STEP 5:
-- SELECT e.id, l.name AS league_name, e.event_name, e.event_date, e.scoring_format
-- FROM `events` e JOIN `leagues` l ON e.league_id = l.id ORDER BY e.event_date, e.event_name;
-- Expected: 7 rows

-- ============================================================
-- END STEP 5 -- Run the VERIFY and report results
-- ============================================================

-- ============================================================
-- STEP 6: League Players (30 rows)
-- ============================================================
-- Resolves league_id by league name, player_id by player name.
-- Uses INSERT IGNORE since league_players has PK(league_id, player_id).
INSERT IGNORE INTO `league_players` (`league_id`, `player_id`)
SELECT l.id, p.id
FROM `leagues` l, `players` p
WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Kyle Voorhees'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Kyle Voorhees'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Shawn Scott Smith'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Adam Yates'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Anna Yates'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Noah Clarke'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Noah Clarke'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Nora Collins'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Nora Collins'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Ed Christoph'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Ed Christoph'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Katie Sampler'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Lilly'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Adam Bowman'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Adam Bowman'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Brian Tavener'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Brian Tavener'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Lee Stafford'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Andrew Spillios'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Andrew Spillios'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Brendan Newman'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinball League - Season 6' AND p.player_name = 'Austin Fanger'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Heather Labarbera'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Zachary Hiller'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Mark Lathrop'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Laura Varney'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Brian Dunn'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Nerb'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Cailan'
UNION ALL SELECT l.id, p.id FROM `leagues` l, `players` p WHERE l.name = 'Asheville Pinbowling! Season 1' AND p.player_name = 'Courtland cain';

-- VERIFY STEP 6:
-- SELECT l.name AS league_name, p.player_name
-- FROM `league_players` lp
-- JOIN `leagues` l ON lp.league_id = l.id
-- JOIN `players` p ON lp.player_id = p.id
-- ORDER BY l.name, p.player_name;
-- Expected: 30 rows

-- ============================================================
-- END STEP 6 -- Run the VERIFY and report results
-- ============================================================

-- ============================================================
-- STEP 7: Location Machines (19 rows)
-- ============================================================
-- Resolves location_id by location name, machine_id by machine name.
-- Uses INSERT IGNORE since location_machines has UNIQUE(location_id, machine_id).
INSERT IGNORE INTO `location_machines` (`location_id`, `machine_id`)
SELECT loc.id, m.id
FROM `locations` loc, `machines` m
WHERE loc.name = 'Level 256' AND m.machine_name = 'X-Men'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Stranger Things'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Car Hop'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Foo Fighters'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Monster Bash'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'King Kong'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Jaws'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Godzilla'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Walking Dead'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Dungeons & Dragons'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'DSSOLVR' AND m.machine_name = 'Pokemon'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'DSSOLVR' AND m.machine_name = 'Star Wars FOTE'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Deadpool'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Hot Wheels'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Cactus Canyon'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Spiderman'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Black Knight: Sword of Rage'
UNION ALL SELECT loc.id, m.id FROM `locations` loc, `machines` m WHERE loc.name = 'Level 256' AND m.machine_name = 'Jurassic Park';

-- VERIFY STEP 7:
-- SELECT lm.id, loc.name AS location, m.machine_name
-- FROM `location_machines` lm
-- JOIN `locations` loc ON lm.location_id = loc.id
-- JOIN `machines` m ON lm.machine_id = m.id
-- ORDER BY loc.name, m.machine_name;
-- Expected: 19 rows -- 17 at Level 256, 2 at DSSOLVR

-- ============================================================
-- END STEP 7 -- Run the VERIFY and report results
-- ============================================================

-- ============================================================
-- STEP 8: Location Machine Scores -- format='bowling' (19 rows)
-- ============================================================
-- Ports target_easy/med/hard from production location_machines into
-- the staging location_machine_scores table with format='bowling'.
-- Resolves location_machine_id by joining location name + machine name.
-- Uses ON DUPLICATE KEY UPDATE to overwrite any existing rows.
INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 35000000, 75000000, 950000000
FROM `location_machines` lm
JOIN `locations` loc ON lm.location_id = loc.id
JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'X-Men'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 35000000, 55000000, 75000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Stranger Things'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 2000000, 4500000, 6000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Car Hop'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 45000000, 65000000, 95000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Foo Fighters'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 7000000, 10000000, 18000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Monster Bash'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 70000000, 100000000, 135000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'King Kong'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 70000000, 120000000, 150000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Jaws'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 50000000, 85000000, 115000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Godzilla'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 12000000, 22000000, 30000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Walking Dead'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 90000000, 140000000, 190000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Dungeons & Dragons'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 0, 0, 0
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'DSSOLVR' AND m.machine_name = 'Pokemon'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 0, 0, 0
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'DSSOLVR' AND m.machine_name = 'Star Wars FOTE'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 25000000, 50000000, 75000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Deadpool'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 25000000, 50000000, 75000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Hot Wheels'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 7000000, 14000000, 20000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Cactus Canyon'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 8000000, 15000000, 25000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Spiderman'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 28000000, 50000000, 85000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Black Knight: Sword of Rage'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

INSERT INTO `location_machine_scores` (`location_machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT lm.id, 'bowling', 30000000, 60000000, 120000000
FROM `location_machines` lm JOIN `locations` loc ON lm.location_id = loc.id JOIN `machines` m ON lm.machine_id = m.id
WHERE loc.name = 'Level 256' AND m.machine_name = 'Jurassic Park'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

-- VERIFY STEP 8:
-- SELECT loc.name AS location, m.machine_name, lms.format, lms.target_easy, lms.target_med, lms.target_hard
-- FROM `location_machine_scores` lms
-- JOIN `location_machines` lm ON lms.location_machine_id = lm.id
-- JOIN `locations` loc ON lm.location_id = loc.id
-- JOIN `machines` m ON lm.machine_id = m.id
-- ORDER BY loc.name, m.machine_name;
-- Expected: 19 rows, all with format='bowling'

-- ============================================================
-- END STEP 8 -- Run the VERIFY and report results
-- ============================================================


-- ============================================================
-- STEP 8b: Machine Default Scores -- format='bowling' (19 rows)
-- ============================================================
-- Copies the location-specific bowling target scores into the
-- machine_scores table as machine-level defaults. This provides
-- a good starting baseline for all machines, while the location-
-- specific scores in location_machine_scores can be adjusted
-- independently per location if needed.
-- Uses ON DUPLICATE KEY UPDATE to overwrite any existing rows.
INSERT INTO `machine_scores` (`machine_id`, `format`, `target_easy`, `target_med`, `target_hard`)
SELECT m.id, 'bowling', lms.target_easy, lms.target_med, lms.target_hard
FROM `location_machine_scores` lms
JOIN `location_machines` lm ON lms.location_machine_id = lm.id
JOIN `machines` m ON lm.machine_id = m.id
WHERE lms.format = 'bowling'
ON DUPLICATE KEY UPDATE
    target_easy = VALUES(target_easy),
    target_med  = VALUES(target_med),
    target_hard = VALUES(target_hard);

-- VERIFY STEP 8b:
-- SELECT m.machine_name, ms.format, ms.target_easy, ms.target_med, ms.target_hard
-- FROM `machine_scores` ms
-- JOIN `machines` m ON ms.machine_id = m.id
-- ORDER BY m.machine_name;
-- Expected: 19 rows, all with format='bowling'
-- (Machines not assigned to any location, like John Wick and Metallica,
--  will not have entries and will use the table defaults of 0/0/0.)

-- ============================================================
-- END STEP 8b -- Run the VERIFY and report results
-- ============================================================


-- ============================================================
-- STEP 9: SCORES
-- Production `scores` has a `status` column (all 'approved') that
-- staging does NOT have -- we drop it during migration.
-- IDs won't match up, so we resolve player_id by player_name,
-- event_id by (league_name + event_name + event_date), and
-- machine_id by machine_name.
-- Idempotency: UNIQUE KEY unique_player_round (event_id, player_id, order_number)
--
-- STRATEGY: We build three small mapping temp tables that map the
-- PRODUCTION ids to the names we already migrated in Steps 1-5.
-- Then we import the raw production `scores` rows into a temp table
-- (you will paste the INSERT block from the backup file), and finally
-- run a single INSERT IGNORE ... SELECT that joins through the
-- mapping tables to resolve staging IDs by name.
-- Expected: ~1013 rows inserted (first run); 0 on re-run.
-- ============================================================

-- 9a. Mapping: prod player_id -> player_name
DROP TEMPORARY TABLE IF EXISTS `tmp_map_player`;
CREATE TEMPORARY TABLE `tmp_map_player` (
  `prod_id` int NOT NULL PRIMARY KEY,
  `player_name` varchar(255) NOT NULL
);
INSERT INTO `tmp_map_player` (`prod_id`, `player_name`) VALUES
(1,'Kyle Voorhees'),(2,'Shawn Scott Smith'),(3,'Adam Yates'),(4,'Anna Yates'),
(5,'Noah Clarke'),(6,'Nora Collins'),(7,'Ed Christoph'),(8,'Katie Sampler'),
(9,'Lilly'),(10,'Adam Bowman'),(11,'Brian Tavener'),(12,'Lee Stafford'),
(13,'Andrew Spillios'),(14,'Brendan Newman'),(15,'Austin Fanger'),(16,'Steve McGinn'),
(17,'Heather Labarbera'),(19,'Zachary Hiller'),(20,'Mark Lathrop'),(21,'Laura Varney'),
(23,'Brian Dunn'),(24,'Nerb'),(25,'Cailan'),(26,'Courtland cain'),(28,'Bowman');

-- 9b. Mapping: prod machine_id -> machine_name
DROP TEMPORARY TABLE IF EXISTS `tmp_map_machine`;
CREATE TEMPORARY TABLE `tmp_map_machine` (
  `prod_id` int NOT NULL PRIMARY KEY,
  `machine_name` varchar(255) NOT NULL
);
INSERT INTO `tmp_map_machine` (`prod_id`, `machine_name`) VALUES
(1,'X-Men'),(2,'Stranger Things'),(3,'Car Hop'),(4,'Foo Fighters'),
(5,'Monster Bash'),(6,'King Kong'),(8,'Jaws'),(9,'Godzilla'),
(10,'Walking Dead'),(11,'Dungeons & Dragons'),(12,'Pokemon'),(13,'John Wick'),
(14,'Jurassic Park'),(15,'Star Wars FOTE'),(16,'Deadpool'),(17,'Hot Wheels'),
(18,'Cactus Canyon'),(19,'Metallica'),(20,'Spiderman'),(21,'Black Knight: Sword of Rage');

-- 9c. Mapping: prod event_id -> (league_name, event_name, event_date, scoring_format)
-- NOTE: events 8 and 9 both share league_name + event_name + event_date
-- ("Level 256 - 6/9/2026 - 03:09 PM", 2026-06-09) but differ in scoring_format
-- (golf vs bowling). We include scoring_format as a tiebreaker.
DROP TEMPORARY TABLE IF EXISTS `tmp_map_event`;
CREATE TEMPORARY TABLE `tmp_map_event` (
  `prod_id` int NOT NULL PRIMARY KEY,
  `league_name` varchar(255) NOT NULL,
  `event_name` varchar(255) NOT NULL,
  `event_date` date NOT NULL,
  `scoring_format` varchar(50) NOT NULL
);
INSERT INTO `tmp_map_event` (`prod_id`, `league_name`, `event_name`, `event_date`, `scoring_format`) VALUES
(1,'Asheville Pinball League - Season 6','Pinbowling Week','2026-05-26','bowling'),
(2,'Asheville Pinbowling! Season 1','Week 1','2026-06-03','bowling'),
(8,'Asheville Pinbowling! Season 1','Week 2','2026-06-10','bowling'),
(11,'Asheville Pinbowling! Season 1','Week 3','2026-06-17','bowling'),
(12,'Asheville Pinbowling! Season 1','Week 4','2026-06-24','bowling'),
(13,'Asheville Pinbowling! Season 1','Week 5','2026-07-01','bowling'),
(14,'Asheville Pinbowling! Season 1','Week 6','2026-07-08','bowling');

-- 9d. Temp table to hold the raw production scores rows.
-- You will populate this from the backup file (see instructions below).
DROP TEMPORARY TABLE IF EXISTS `tmp_prod_scores`;
CREATE TEMPORARY TABLE `tmp_prod_scores` (
  `prod_player_id` int NOT NULL,
  `prod_event_id` int NOT NULL,
  `order_number` int NOT NULL,
  `prod_machine_id` int NOT NULL,
  `ball1` bigint DEFAULT 0,
  `ball2` bigint DEFAULT 0,
  `ball3` bigint DEFAULT 0
);

-- separate file `scores_insert.sql`. This keeps the migration
-- script concise and avoids a single extremely long line.
-- (When run via migrate-data.php, `source` directives are inlined
-- automatically; when run via the mysql CLI, `source` is a builtin.)
source scores_insert.sql;

-- 9e. Migrate: resolve staging IDs by name and insert (idempotent via unique key)
INSERT IGNORE INTO `scores` (`player_id`, `event_id`, `order_number`, `machine_id`, `ball1`, `ball2`, `ball3`)
SELECT
    p.id          AS player_id,
    e.id          AS event_id,
    tps.order_number,
    m.id          AS machine_id,
    tps.ball1, tps.ball2, tps.ball3
FROM `tmp_prod_scores` tps
JOIN `tmp_map_player`  mp ON mp.prod_id = tps.prod_player_id
JOIN `players`         p  ON p.player_name = mp.player_name
JOIN `tmp_map_event`   me ON me.prod_id = tps.prod_event_id
JOIN `leagues`         l  ON l.name = me.league_name
JOIN `events`          e  ON e.league_id = l.id
                          AND e.event_name = me.event_name
                          AND e.event_date = me.event_date
                          AND e.scoring_format = me.scoring_format
JOIN `tmp_map_machine` mm ON mm.prod_id = tps.prod_machine_id
JOIN `machines`        m  ON m.machine_name = mm.machine_name;

-- 9f. VERIFY
-- SELECT COUNT(*) AS scores_migrated FROM `scores`;
-- Cross-check: production had ~1013 score rows.
-- SELECT e.event_name, COUNT(*) AS cnt
--   FROM `scores` s JOIN `events` e ON s.event_id = e.id
--   GROUP BY e.event_name ORDER BY e.event_name;
-- Expected event distribution (approx):
--   Pinbowling Week: 90, Week 1: 90, Week 2: 90, Week 3: 90,
--   Week 4: 90, Week 5: 90, Week 6: 90
--   (Session league scores are intentionally NOT migrated.)

-- 9g. Cleanup temp tables
DROP TEMPORARY TABLE IF EXISTS `tmp_prod_scores`;
DROP TEMPORARY TABLE IF EXISTS `tmp_map_player`;
DROP TEMPORARY TABLE IF EXISTS `tmp_map_machine`;
DROP TEMPORARY TABLE IF EXISTS `tmp_map_event`;

-- ============================================================
-- END STEP 9 -- Run the VERIFY and report results
-- ============================================================


-- ============================================================
-- STEP 10: TARGET_SCORES
-- Production `target_scores` has columns:
--   (id, event_id, machine_id, order_number, value1, value2, score1..score10)
-- Staging schema matches (minus the id). IDs won't match up, so we
-- resolve event_id by (league_name + event_name + event_date + scoring_format)
-- and machine_id by machine_name.
-- Idempotency: UNIQUE KEY (event_id, order_number)
-- Same temp-table + mapping strategy as Step 9.
-- Expected: 109 rows inserted (first run); 0 on re-run.
-- ============================================================

-- 10a. Rebuild the mapping temp tables (dropped at end of Step 9)
DROP TEMPORARY TABLE IF EXISTS `tmp_map_machine`;
CREATE TEMPORARY TABLE `tmp_map_machine` (
  `prod_id` int NOT NULL PRIMARY KEY,
  `machine_name` varchar(255) NOT NULL
);
INSERT INTO `tmp_map_machine` (`prod_id`, `machine_name`) VALUES
(1,'X-Men'),(2,'Stranger Things'),(3,'Car Hop'),(4,'Foo Fighters'),
(5,'Monster Bash'),(6,'King Kong'),(8,'Jaws'),(9,'Godzilla'),
(10,'Walking Dead'),(11,'Dungeons & Dragons'),(12,'Pokemon'),(13,'John Wick'),
(14,'Jurassic Park'),(15,'Star Wars FOTE'),(16,'Deadpool'),(17,'Hot Wheels'),
(18,'Cactus Canyon'),(19,'Metallica'),(20,'Spiderman'),(21,'Black Knight: Sword of Rage');

DROP TEMPORARY TABLE IF EXISTS `tmp_map_event`;
CREATE TEMPORARY TABLE `tmp_map_event` (
  `prod_id` int NOT NULL PRIMARY KEY,
  `league_name` varchar(255) NOT NULL,
  `event_name` varchar(255) NOT NULL,
  `event_date` date NOT NULL,
  `scoring_format` varchar(50) NOT NULL
);
INSERT INTO `tmp_map_event` (`prod_id`, `league_name`, `event_name`, `event_date`, `scoring_format`) VALUES
(1,'Asheville Pinball League - Season 6','Pinbowling Week','2026-05-26','bowling'),
(2,'Asheville Pinbowling! Season 1','Week 1','2026-06-03','bowling'),
(8,'Asheville Pinbowling! Season 1','Week 2','2026-06-10','bowling'),
(11,'Asheville Pinbowling! Season 1','Week 3','2026-06-17','bowling'),
(12,'Asheville Pinbowling! Season 1','Week 4','2026-06-24','bowling'),
(13,'Asheville Pinbowling! Season 1','Week 5','2026-07-01','bowling'),
(14,'Asheville Pinbowling! Season 1','Week 6','2026-07-08','bowling');

-- 10b. Temp table for raw production target_scores rows
DROP TEMPORARY TABLE IF EXISTS `tmp_prod_target_scores`;
CREATE TEMPORARY TABLE `tmp_prod_target_scores` (
  `prod_event_id` int NOT NULL,
  `prod_machine_id` int NOT NULL,
  `order_number` int NOT NULL,
  `value1` bigint DEFAULT 0,
  `value2` decimal(12,3) DEFAULT 0,
  `score1` bigint DEFAULT 0, `score2` bigint DEFAULT 0, `score3` bigint DEFAULT 0,
  `score4` bigint DEFAULT 0, `score5` bigint DEFAULT 0, `score6` bigint DEFAULT 0,
  `score7` bigint DEFAULT 0, `score8` bigint DEFAULT 0, `score9` bigint DEFAULT 0,
  `score10` bigint DEFAULT 0
);

-- Load the pre-generated INSERT statements for target scores from the
-- separate file `target_scores_insert.sql`. This keeps the migration
-- script concise and avoids a single extremely long line.
source target_scores_insert.sql;

-- 10c. Migrate: resolve staging IDs by name and insert (idempotent)
INSERT IGNORE INTO `target_scores`
  (`event_id`, `machine_id`, `order_number`, `value1`, `value2`,
   `score1`, `score2`, `score3`, `score4`, `score5`,
   `score6`, `score7`, `score8`, `score9`, `score10`)
SELECT
    e.id            AS event_id,
    m.id            AS machine_id,
    tps.order_number,
    tps.value1, tps.value2,
    tps.score1, tps.score2, tps.score3, tps.score4, tps.score5,
    tps.score6, tps.score7, tps.score8, tps.score9, tps.score10
FROM `tmp_prod_target_scores` tps
JOIN `tmp_map_event`   me ON me.prod_id = tps.prod_event_id
JOIN `leagues`         l  ON l.name = me.league_name
JOIN `events`          e  ON e.league_id = l.id
                          AND e.event_name = me.event_name
                          AND e.event_date = me.event_date
                          AND e.scoring_format = me.scoring_format
JOIN `tmp_map_machine` mm ON mm.prod_id = tps.prod_machine_id
JOIN `machines`        m  ON m.machine_name = mm.machine_name;

-- 10d. VERIFY
-- SELECT COUNT(*) AS target_scores_migrated FROM `target_scores`;
-- Cross-check: production had 109 target_score rows.
-- SELECT e.event_name, e.scoring_format, COUNT(*) AS cnt
--   FROM `target_scores` ts JOIN `events` e ON ts.event_id = e.id
--   GROUP BY e.event_name, e.scoring_format ORDER BY e.event_name;

-- 10e. Cleanup temp tables
DROP TEMPORARY TABLE IF EXISTS `tmp_prod_target_scores`;
DROP TEMPORARY TABLE IF EXISTS `tmp_map_machine`;
DROP TEMPORARY TABLE IF EXISTS `tmp_map_event`;

-- ============================================================
-- END STEP 10 -- Run the VERIFY and report results
-- ============================================================


-- ============================================================
-- STEP 11: USERS
-- Production `users` has columns:
--   (id, player_id, username, password_hash, role)
-- Staging `users` has additional email, reset_token, reset_token_expires
-- columns -- we set those to NULL. player_id is resolved by player_name.
-- Idempotency: UNIQUE(username) and UNIQUE(player_id).
-- NOTE: prod user id 1 has player_id=NULL (admin with no player link).
-- Expected: 14 rows inserted (first run); 0 on re-run.
-- ============================================================

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT NULL, 'admin', '$2y$10$Lm7BqmYLU7w0npg1kiiUOOLm3Sz68fxVbnkby2ZKvqBP1dgWFSYvG', 'admin', NULL, NULL, NULL
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE username='admin');

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'the_okey', '$2y$10$m0Yoq57Y9XqDIhvRMR6SUuWjdJTp1k3pRzqFnpckuLKEyY949O8l2', 'admin', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Kyle Voorhees';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'HiPpYcHoP', '$2y$10$uQ0igtB68UCBuS28AhKiKeshDOADWWvRHcw06p7DOCn7qt2LhcQ.u', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Mark Lathrop';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'Kylecrodile_Tears69', '$2y$10$N7K7JpKrFHY.7cGYNs0BQOIiVZAK6aOg7nYWGRvHk7u/bW6Y2dKIe', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Andrew Spillios';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'Yates', '$2y$10$05v2ghdKbaLKvHSGa3L7y.PMk2VW0cgUWN7FmSTlixdra/Zn5tzkG', 'admin', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Adam Yates';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'Lvlwing', '$2y$10$noZV4Q0Q.qeOZpTpZjOd4e/7PmtoZPNjigk6.tnp.rhwFIIzUNX9W', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Laura Varney';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'Noah', '$2y$10$ox05VMUihTcX8OfbZjPBIuHej1OOduOCRHd.5OTtwDwq4ToahY0Fy', 'admin', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Noah Clarke';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'SpareMe1', '$2y$10$OMvhqm51HG.pFNa9iiovQ.GnQb/6CmmjjkY2n2gs5m5iR15xGk8mG', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Nora Collins';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'Ismilewhenidontseekyle', '$2y$10$LJGkohqtPLhwuQAwt.FvcuyaLf/eU9CTZmMt8ffgJtZgvBJ62Qpf.', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Nerb';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'AvlBoiler', '$2y$10$HQMD.OjM0ene4LEI.BmNbO/d7AOV6CbpmA1qPpV/Sy2NfxH6NrSXK', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Cailan';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'Courtland', '$2y$10$Q8vHmDGSZf0qeNHvv7KVkewdKll020nmFu9w0Kw0w1u3V9e5boQha', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Courtland cain';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'Bowmansoup', '$2y$10$N0kGjbOFa.KMJuRJpLSU5epmHHmuf4rF7fPZba.aNOMKCyOoMPd8G', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Bowman';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'Abefroman', '$2y$10$ph0nCBFQ1GVwBFbJroiziO6iJaV4mZDdQLMyJcyabj8TKnHMtcO4u', 'player', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Adam Bowman';

INSERT IGNORE INTO `users` (`player_id`, `username`, `password_hash`, `role`, `email`, `reset_token`, `reset_token_expires`)
SELECT p.id, 'McGinn', '$2y$10$VxcNVwP/cIcyzWLLopyCb.0/jI.wGGyMI92uL1ckM8FKwzJcvSb6W', 'td', NULL, NULL, NULL
FROM `players` p WHERE p.player_name='Steve McGinn';

-- 11a. VERIFY
-- SELECT COUNT(*) AS users_migrated FROM `users`;
-- Cross-check: production had 14 users.
-- SELECT u.username, u.role, p.player_name
--   FROM `users` u LEFT JOIN `players` p ON u.player_id = p.id
--   ORDER BY u.username;
-- Expected: 14 rows. 'admin' should have player_name=NULL.

-- ============================================================
-- END STEP 11 -- Run the VERIFY and report results
-- ============================================================


-- ============================================================
-- MIGRATION COMPLETE
-- All 11 steps finished. Final sanity checks:
--   SELECT 'locations' tbl, COUNT(*) c FROM locations
--   UNION ALL SELECT 'machines', COUNT(*) FROM machines
--   UNION ALL SELECT 'players', COUNT(*) FROM players
--   UNION ALL SELECT 'leagues', COUNT(*) FROM leagues
--   UNION ALL SELECT 'events', COUNT(*) FROM events
--   UNION ALL SELECT 'league_players', COUNT(*) FROM league_players
--   UNION ALL SELECT 'location_machines', COUNT(*) FROM location_machines
--   UNION ALL SELECT 'location_machine_scores', COUNT(*) FROM location_machine_scores
--   UNION ALL SELECT 'machine_scores', COUNT(*) FROM machine_scores
--   UNION ALL SELECT 'scores', COUNT(*) FROM scores
--   UNION ALL SELECT 'target_scores', COUNT(*) FROM target_scores
--   UNION ALL SELECT 'users', COUNT(*) FROM users;
-- Expected: 2, 20, 26, 2, 7, 30, 19, 19, 19, ~1013, 109, 14
-- ============================================================
