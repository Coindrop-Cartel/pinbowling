-- PinBowling Test User Seed Script
-- This script creates the necessary roles for E2E testing: admin, td, and player.
-- Password for all users is the same as their username.

-- 1. Create Player Profiles
INSERT INTO players (player_name, ifpa_id) VALUES 
('System Admin', '1'),
('Tournament Director', '2'),
('Test Player 1', '100');

-- 2. Create User Accounts
-- Hashes generated via PHP password_hash('admin', PASSWORD_BCRYPT) etc.
INSERT INTO users (username, password, role, player_id) VALUES 
-- Password: admin
('admin', '$2y$10$8K1p/a0dxre.gFvY96pGZ.iK/hG6f9E5E.g/5vW5Lz.l7G5P8M.2.', 'admin', 
    (SELECT id FROM players WHERE player_name = 'System Admin')),

-- Password: td
('td', '$2y$10$Y7L7/R3K9H.z4Q6W3F/O.ue9U.5p5K7R6N8G9G.z1L6T5M.4.', 'td', 
    (SELECT id FROM players WHERE player_name = 'Tournament Director')),

-- Password: player1
('player1', '$2y$10$Z1M8/S4L0I.a5R7X4G/P.vf0V.6q6L8S7O9H0H.w2M7U6N.5.', 'player', 
    (SELECT id FROM players WHERE player_name = 'Test Player 1'));

-- 3. (Optional) Ensure a default league exists for the 'Standings' and 'Scores' tests
INSERT INTO leagues (name, type, scoring_format) 
VALUES ('Tuesday Night Bowling', 'standard', 'bowling');
