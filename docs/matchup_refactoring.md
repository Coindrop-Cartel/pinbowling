# Matchups Table Refactoring — Progress Tracker

## Goal
Refactor the `matchups` table from the paired `(player1_id, player2_id)` shape to the normalized per-player-row shape using **Option B**:

```
matchups:
  id              INT AUTO_INCREMENT PRIMARY KEY
  event_id        INT NOT NULL
  order_number    INT NOT NULL        -- inning/slot level (1 = inning 1, 2 = inning 2, ...)
  player_id       INT NOT NULL        -- the player in this slot
  machine_id      INT NOT NULL
  player_order    SMALLINT UNSIGNED NOT NULL DEFAULT 1  -- 1 = home, 2 = away, 3+ future
  UNIQUE KEY unique_matchup (event_id, order_number, player_order)
  FK event_id  -> events(id)   ON DELETE CASCADE
  FK player_id -> players(id)  ON DELETE CASCADE
  FK machine_id -> machines(id) ON DELETE CASCADE
```

One pairing = N rows sharing the same `order_number` (and `machine_id`), one row per
player, disambiguated by `player_order`. This scales to 3+ player matchups without
further schema changes.

## Decision: `order_number` is inning-level (NOT sequential)
- `order_number` = inning/slot index (1, 2, 3, ...).
- `player_order` = role within the slot (1 = home, 2 = away).
- Frontend must switch from `orderNumber % 2` parity to `player_order === 1` for home/away.

## Migration strategy
- New migration `matchups_per_player_rows`:
  1. Add `player_id INT NOT NULL` after `order_number`.
  2. Add `player_order SMALLINT UNSIGNED NOT NULL DEFAULT 1` if missing (it may exist from `matchups_player_order` migration, or be absent if `matchups_sequential_order` already ran).
  3. Split each existing row into 2 rows: p1 -> player_order 1, p2 -> player_order 2.
  4. Drop `player1_id`, `player2_id`, old `unique_matchup` key, `fk_matchup_p1`, `fk_matchup_p2`.
  5. Add `UNIQUE KEY unique_matchup (event_id, order_number, player_order)`.
  6. Add `CONSTRAINT fk_matchup_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE`.
- The `matchups_sequential_order` migration is superseded. If it has not run, skip it. If it has run, the new migration must restore `player_order` and renumber `order_number` back to inning-level.

## Files to change

### Backend (PHP)
- [x] `migrate.php` — add `matchups_per_player_rows` migration; neutralize `matchups_sequential_order`. Fresh-install `CREATE TABLE` updated to new schema.
- [x] `service/Matchup/MatchupService.php` — rewrite queries (1 player JOIN, group by order_number), rewrite `saveMatchups` upsert.
- [x] `includes/serializers.php` — `serializeMatchup` emits `playerId`, `playerOrder`, `playerName` (drop `player1Id/player2Id/player1Name/player2Name`).

### Frontend (JS)
- [x] `scripts/core/engines/BaseballEngine.js`
  - [x] `generateMatchupPayload` — emit 2 rows per half-inning (one per player) with `playerId` + `playerOrder`.
  - [x] `renderResults` — `myMatchups` filter + opponent derivation via sibling rows.
  - [x] `getRoundRowContext` — use `player_order` for role, sibling row for opponent name.
  - [x] `buildPlayerScoreMap` — pass through to normalizer.
- [x] `scripts/services/normalizer.js` — `buildBaseballScoreMapForPlayer` use `playerId`/`playerOrder` + sibling lookup; `isPlayer1` becomes `playerOrder === 1`.

### Tests
- [ ] Check `tests/` for any matchup fixtures referencing `player1Id/player2Id`.

## Progress log
- [x] 2026-07-05: Created this tracker. Schema decision: Option B (inning-level order_number + player_order).
- [x] 2026-07-05: Implemented `matchups_per_player_rows` migration in migrate.php; updated fresh-install CREATE TABLE.
- [x] 2026-07-05: Rewrote `MatchupService.php` (queries + `saveMatchups` upsert on new unique key).
- [x] 2026-07-05: Updated `serializeMatchup` in serializers.php.
- [x] 2026-07-05: Updated `BaseballEngine.js` `generateMatchupPayload` for per-player rows.
- [x] 2026-07-05: Updated `normalizer.js` `buildBaseballScoreMapForPlayer` (sibling lookup, `isPlayer1 = playerOrder === 1`).
- [x] 2026-07-05: Updated `BaseballEngine.js` `renderResults` (inning grouping by `orderNumber`, Home/Away via `playerOrder`).
- [x] 2026-07-05: Updated `BaseballEngine.js` `getRoundRowContext` (sibling-row opponent, `playerOrder` role, Top/Bottom via machineId compare).
- [ ] Next: audit `tests/` for `player1Id/player2Id` fixtures and update them.
