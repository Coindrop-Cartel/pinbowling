# Branch Review: `feature/baseball_season`

**Date:** 2026-07-14
**Branch:** `feature/baseball_season`
**Purpose:** Unify the creation of `event_matchups` and `matchups` (innings) across one-off sessions and league seasons, and fix Baseball H2H scoring UI regressions.

---

## Summary of Changes

8 files modified, 269 insertions, 137 deletions.

| File | Lines Changed | Category |
|------|---------------|----------|
| `service/matchupService.php` | +147 | Backend — new helpers |
| `service/leagueService.php` | +35 / -117 | Backend — refactor |
| `includes/bootstrap.php` | +1 / -1 | DI wiring |
| `api/matchup.php` | +22 / -5 | API endpoint |
| `scripts/services/api.js` | +1 | Frontend API client |
| `scripts/pages/playPage.js` | +30 / -4 | Session creation flow |
| `scripts/pages/scoresPage.js` | +16 / -2 | Scoring UI |
| `scripts/ui/roundRow.js` | +18 / -7 | Round row rendering |

---

## Issue 1: Duplicated SQL for Matchup Creation in `LeagueService`

### Problem
Three methods in `LeagueService` contained near-identical inline SQL to create `event_matchups` parent rows and their child `matchups` (inning) rows:
- `startSeason()` — regular season week generation
- `updateSeason()` — regenerating a week's matchups
- `startPlayoffs()` — playoff series game creation

Each method independently:
1. Prepared an `INSERT INTO event_matchups` statement
2. Executed it with player IDs
3. Retrieved `lastInsertId()`
4. Prepared an `INSERT INTO matchups` statement
5. Looped over innings, inserting top (player_order 1) and bottom (player_order 2) rows

This was ~40 lines of duplicated logic per method, with subtle variations (e.g., `startPlayoffs` adds `round_name` and `series_id` columns).

### Attempted Fix
Created three helper methods in `MatchupService`:

1. **`createEventMatchup(array $data): int`** — Creates just the parent `event_matchups` row. Supports optional `roundName` and `seriesId` for playoffs. Uses dynamic column building.

2. **`createMatchupWithInnings(array $data): int`** — Creates the parent row (via `createEventMatchup`) AND all child inning rows in one call. Takes `inningsPerGame` and a flat `machines` array (2 per inning).

3. **`createByeMatchup(int $eventId, int $homePlayerId): int`** — Creates a completed BYE-week matchup with no away player.

`LeagueService` was updated to:
- Accept `MatchupService` as a constructor dependency
- Delegate all three methods to `$this->matchupService->createMatchupWithInnings(...)` or `createByeMatchup(...)`

`bootstrap.php` was updated to inject `MatchupService` into `LeagueService`.

### Review Notes / Concerns
- **Machine selection logic remains in `LeagueService`.** The shuffling/selection of machines (`$matchupMachines`) is still done inline in each `LeagueService` method before calling `createMatchupWithInnings`. This could be further extracted, but the selection logic differs slightly between season and playoff contexts.
- **`createEventMatchup` uses dynamic column building** (string interpolation of column names). This is safe since column names are hardcoded, not user input, but it's less readable than explicit statements. An alternative would be separate methods or a fixed-column approach with nullable values.
- **`createMatchupWithInnings` silently skips inning creation** if `awayPlayerId` is null or machines are empty. This is a guard, but it means a caller could get a parent row with no children and no error. Consider throwing or logging.
- **No transaction wrapping** in `createMatchupWithInnings`. The parent insert and child inserts are not atomic. If a child insert fails, you get an orphaned parent row. The old inline code also lacked this, so it's not a regression, but it's an opportunity.
- **`createByeMatchup` duplicates the SQL** that `createEventMatchup` would use with `status='completed'`. Could potentially be unified, but the BYE case has fixed `home_runs=0, away_runs=0, winner_id=NULL` which makes a separate method reasonable.

---

## Issue 2: API Endpoint Doesn't Return Nested Inning Data

### Problem
The `GET /api/matchup.php?eventId=X` endpoint previously called `getEventMatchups($eventId)` which returns flat `matchups` rows (child inning rows) directly. The frontend `BaseballEngine.getRoundRowContext()` needs both:
- The parent `event_matchups` data (to identify home/away, opponent names)
- The child `matchups` inning data (to map machines to innings and player_order)

The old endpoint only returned the flat child rows, so the engine couldn't resolve "Top of X" vs "Bottom of X" or identify opponents.

### Attempted Fix
Modified `api/matchup.php` GET handler to:
1. Call a new `getEventMatchupsList($eventId)` method (returns parent `event_matchups` rows with joined player names)
2. For each parent, call `getMatchupInnings($m['id'])` to fetch child rows
3. Wrap each parent with an `innings` array containing serialized child rows
4. Return the nested structure

Added `getEventMatchupsList()` to `MatchupService` — a new query joining `event_matchups` with `events`, `players` (home/away/winner).

### Review Notes / Concerns
- **N+1 query pattern.** `getMatchupInnings()` is called once per parent matchup in a loop. For events with many matchups (e.g., a 10-player round-robin = 45 matchups), this is 46 queries. Could be replaced with a single query joining both tables and grouping in PHP.
- **`getEventMatchups()` (the old method) is now unused** by the API but still exists in `MatchupService`. It returns flat child rows. Check if anything else calls it; if not, it could be removed or deprecated.
- **The POST handler was also refactored** to support a `createEventMatchup` flag (see Issue 4). The standard `saveMatchups` path now passes `$input` directly instead of wrapping it in an array. Verify the frontend always sends an array.

---

## Issue 3: One-Off Sessions Don't Create Parent `event_matchup` Records

### Problem
When a user creates a one-off Baseball H2H session via the "Let's Bowl" / Play page, the frontend called `PB_API.matchups.save(matchups)` which only inserts child `matchups` rows (via `saveMatchups()`). No parent `event_matchups` row was created.

Result: The scores page couldn't identify the matchup as head-to-head, couldn't show the opponent, and couldn't label innings as Top/Bottom.

### Attempted Fix
In `scripts/pages/playPage.js`:
1. Added a `currentFrameCount` variable to track the user-selected inning count (fixes a bug where `generatedFrames.length` was used but could be stale/incorrect since each inning has 2 machines).
2. For H2H formats (`engine.isH2H`), before saving inning rows:
   - Call `PB_API.matchups.create({...})` to create the parent `event_matchups` row
   - Then call `PB_API.matchups.save(...)` with the `eventMatchupId` attached to each inning row
3. For non-H2H formats, behavior is unchanged.

Added `PB_API.matchups.create(data)` in `scripts/services/api.js` which POSTs with a `createEventMatchup: true` flag.

The `api/matchup.php` POST handler checks for this flag and calls `$matchupService->createEventMatchup(...)` instead of `saveMatchups(...)`.

### Review Notes / Concerns
- **`engine.isH2H` is used but not verified to exist** on all engines. If a non-baseball engine doesn't define `isH2H`, this evaluates to `undefined` (falsy) and skips parent creation — which is correct, but fragile. Consider a default or a method on the base `ScoringEngine` class.
- **Hardcoded to first 2 roster players** (`finalRoster[0]` and `finalRoster[1]`). For a 2-player session this is fine, but `generateMatchupPayload` supports N players (round-robin). The parent creation only handles 2. If sessions ever have >2 players, this breaks. The `generateMatchupPayload` round-robin logic may be dead code for sessions.
- **No error handling** if `PB_API.matchups.create()` fails. The inning save would proceed with `eventMatchupId: undefined`.
- **The `createEventMatchup` flag pattern** (a special key in the POST body) is a bit of an API smell. A cleaner approach might be a separate endpoint (e.g., `POST /api/matchup.php?action=createEventMatchup`) or a separate endpoint file. The current approach overloads the POST handler with two distinct operations distinguished by a body field.
- **`currentFrameCount` vs `generatedFrames.length`**: The fix correctly uses the user's selected count rather than the generated frames length (which is `innings * 2` machines). This is a real bug fix. However, `currentFrameCount` is set in `handleGenerate()` but the matchup generation happens in a different function (`startSession`/`saveSession`). Verify `currentFrameCount` is set before that function runs.

---

## Issue 4: Baseball H2H Scoring UI Shows Wrong Inning Labels

### Problem
On the scores page, Baseball H2H innings were labeled as generic "Inning 1, Inning 2..." instead of "Top of 1, Bottom of 1, Top of 2...". Additionally:
- One-off sessions didn't show opponent context
- League matchups showed duplicated inning numbers ("Inning 1, Inning 1") without Top/Bottom distinction

### Root Cause
`BaseballEngine.getRoundRowContext()` needs `eventMatchups` data (parent + child rows) to determine:
- Which inning (orderNumber) a machine belongs to
- Whether the current player is home (player_order 1) or away (2)
- Whether the machine is the "Top" or "Bottom" half of the inning
- Who the opponent is (sibling row)

The data wasn't reaching the engine correctly because:
1. The API wasn't returning nested parent+child data (Issue 2)
2. `buildRoundRow` was passing an extra unused argument to `getRoundRowContext`

### Attempted Fix
**`scripts/ui/roundRow.js`:**
1. Removed the unused third argument `{ machines, roundIndex }` from the `engine.getRoundRowContext(round, engineContext)` call. The `BaseballEngine` method signature only accepts `(round, context)`.
2. Updated the opponent inputs rendering to handle two opponent containers (pitcher and batter labels). Previously, it queried a single `.opponent-inputs-container` and dumped all opponent inputs there. Now it queries all containers, finds the one matching the opposite role (`.batter-label` if current player is pitcher, `.pitcher-label` otherwise), and appends inputs there.

**`scripts/pages/scoresPage.js`:**
1. Added auto-selection of the first player when in a single-matchup event with no `activeMatchupId` (one-off session case), so the user lands directly in the scoring form.
2. Fixed a potential `undefined` in the matchup summary (`matchup?.homePlayerName || 'Unknown'`).
3. Added a fallback summary for the schedule view (matchups exist but none active).

### Review Notes / Concerns
- **The two-opponent-container approach in `roundRow.js` is complex.** The row HTML now always renders two `opponent-inputs-container` divs (one with `pitcher-label`, one with `batter-label`) when `hasMatchup` is true, plus a main `round-inputs-container`. The JS then finds the "opposite role" container and fills it. This works but the HTML structure is confusing — the "opponent" container is determined by role, not by a clear data attribute. Consider using `data-role="opponent"` or similar.
- **The `getRoundRowContext` method in `BaseballEngine` is ~50 lines** with multiple `eventMatchups.find()` calls (up to 4 linear scans per round row). For events with many matchups and innings, this is O(rounds × matchups). Could be optimized with a pre-built lookup map, but likely fine for typical sizes.
- **The `isTop` determination** relies on comparing `topMatchup.machineId === round.machineId`. This assumes the current player is viewing their own machine. If a player views the opponent's machine for an inning, `isTop` is determined by the machine, which is correct, but the logic is subtle and worth a comment.
- **Auto-selecting the first player** for single-matchup sessions is a UX choice. It assumes the logged-in user wants to score the first player. For spectators, this might be surprising. The existing matchup-context auto-select (a few lines above) already handles the `activeMatchupId` case.

---

## Dependency Graph

```
bootstrap.php
  └─> LeagueService(db, MatchupService)
        └─> MatchupService.createMatchupWithInnings()
              ├─> createEventMatchup()
              └─> (inline INSERT into matchups)

api/matchup.php
  ├─ GET  → getEventMatchupsList() + getMatchupInnings() (N+1)
  └─ POST → createEventMatchup() OR saveMatchups()

playPage.js
  └─> PB_API.matchups.create() → [POST with createEventMatchup flag]
      PB_API.matchups.save()   → [POST with inning rows]

scoresPage.js
  └─> Engine.enrichScoreMap() → buildBaseballScoreMapForPlayer()
      buildRoundRow() → Engine.getRoundRowContext(round, engineContext)
```

---

## Suggested Refactoring Opportunities

1. **Eliminate N+1 in API GET.** Replace the loop of `getMatchupInnings()` calls with a single query that joins `event_matchups` and `matchups`, then group in PHP by `event_matchup_id`.

2. **Wrap `createMatchupWithInnings` in a transaction** to ensure atomicity of parent + child inserts.

3. **Extract machine selection** from `LeagueService` into a helper (e.g., `selectRandomMachines($allMachineIds, $count)`) since the shuffle/dedup logic is repeated.

4. **Replace the `createEventMatchup` POST flag** with either a separate endpoint or a RESTful resource design (`POST /api/event-matchup` vs `POST /api/matchup`).

5. **Add `isH2H` to the base `ScoringEngine`** with a default of `false` to make the `playPage.js` check explicit rather than relying on `undefined` being falsy.

6. **Simplify the opponent container HTML** in `roundRow.js` — use a single container with a `data-role` attribute rather than two role-labeled containers.

7. **Remove or deprecate `getEventMatchups()`** in `MatchupService` if it's no longer used after the API change.

8. **Consider a `MatchupFactory` or builder** that encapsulates the full creation flow (parent + innings + machine selection) to fully unify session and league paths. Currently `playPage.js` does parent-then-children in two API calls, while `LeagueService` does it in one PHP call. A single shared path would eliminate the divergence.

---

## Files Changed (for reference)

```
api/matchup.php             |  27 ++++++--
includes/bootstrap.php      |   2 +-
scripts/pages/playPage.js   |  34 ++++++++--
scripts/pages/scoresPage.js |  18 +++++-
scripts/services/api.js     |   1 +
scripts/ui/roundRow.js      |  25 +++++---
service/leagueService.php   | 152 +++++++++++---------------------------------
service/matchupService.php  | 147 ++++++++++++++++++++++++++++++++++++++++++
```
