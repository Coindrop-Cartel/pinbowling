# Team/Individual Data Path Split

## Problem

Team baseball and individual baseball used the same data structures (`event_matchups` /
`matchups`). The team migration (migration 11) created separate tables
(`team_event_matchups` / `team_matchups`) but several gaps left the team path
non-functional and the individual session creation path broken.

## Changes

### 1. Migration 11 — Table creation & FK fixes

**File:** `migrate/migrate.php`

- DROP the four team tables before CREATE so stale FK names (e.g.
  `fk_ts_machine`) don't collide.
- Renamed the `scores` table constraint from `fk_ts_machine` to
  `fk_tscore_machine` to avoid collision with `team_sessions`.
- Wrapped `DROP INDEX uq_score_team` in `SET FOREIGN_KEY_CHECKS = 0` /
  `SET FOREIGN_KEY_CHECKS = 1` because the index is needed by a FK.
- Added the missing `$stmt->execute()` before `fetchColumn()` in the
  migration-check query.

### 2. Backend: Team matchup slot creation stores pitcher/batter

**File:** `service/MatchupGenerator.php`

`createTeamMatchupSlots()` now accepts optional `$team1Id` / `$team2Id`
parameters and stores them in the `team_matchups` row. `team1_id` = pitching
team, `team2_id` = batting team for that half-inning.

**File:** `service/SeasonService.php` (`generateWeekMatchups`)

- Top half: `team1_id = home` (pitches), `team2_id = away` (bats)
- Bottom half: `team1_id = away` (pitches), `team2_id = home` (bats)
- Both pass `team1Id` / `team2Id` to `createTeamMatchupSlots()`.

This mirrors individual baseball where `matchups.player1_id` = pitcher,
`matchups.player2_id` = batter for each round.

### 3. Backend: Serializer exposes team IDs on entries

**File:** `includes/Serializer.php`

- `teamMatchup()` — added `team1Id` / `team2Id` to output (from the DB
  columns that already existed but were never populated).
- `teamEventMatchup()` — added `entries` field so the frontend receives
  per-round machine data.
- `event()` — routes rows with `team1_id` to `teamEventMatchup()` instead of
  `eventMatchup()`.

### 4. Frontend: Role resolution uses entry team IDs directly

**File:** `scripts/services/matchupBuilder.js` (`enrichTeamMatchupEntries`)

Derives `isTop`, `teamId` (batting), and `opponentTeamId` (pitching) from the
entry's `team1_id` / `team2_id` rather than parsing the `roundName` string.
No longer needs the caller to pass `roundName` for role determination.

**File:** `scripts/core/engines/BaseballEngine.js` (`getRoundRowContext`)

Team mode now uses `round.team1Id` (pitcher) / `round.team2Id` (batter)
directly to determine `isTop` and roles, rather than calling
`resolveTeamMatchupRole()` which attempted to re-find the entry by sequential
order number in a flattened list (broken because every half-inning entry had
`orderNumber: 1`). Removed the unused `resolveTeamMatchupRole` import.

### 5. Frontend: Scores page guard & name resolution

**File:** `scripts/pages/scoresPage.js`

- Summary title and spectator warning use `team1Name` / `team2Name` for team
  mode.
- Team matchup override fires without `activeEventMatchupId`.
- Individual API call guarded behind `!eventId || !leagueId` so team matchup
  IDs don't trigger unnecessary 404s.
- Enriched entries map `team1Id` / `team2Id`, `isTop`, `roundName` through
  to the normalized machine list.

### 6. Session creation — Baseball format detection

**File:** `api/matchup.php`

The POST handler was detecting baseball format only via the `leagues` table,
missing sessions (which store the format on the `events` table, not on a
league). Changed to check `events.scoring_format` first, then fall back to
`leagues.scoring_format`. This ensures the `event_matchup` record is created
for session matchups.

### 7. Session API — Include matchups in events

**File:** `service/SessionService.php` (`getSession`)

`LeagueService::getLeague()` attaches `event_matchups` to each event in the
response; `SessionService::getSession()` was missing this step. Added a
query that fetches `event_matchups` (with player names) by event ID and
attaches them to the serialized event rows. This allows the schedule view
(`renderMatchupSchedule`) to display matchups with Play buttons for
individual head-to-head sessions.

### 8. Test data updates

**File:** `tests/unit/scripts/services/matchupBuilder.test.js`

Server entries in `enrichTeamMatchupEntries` tests now include `team1_id` /
`team2_id`. Added `bottomServerEntries` fixture. Updated test names and
expectations to match the data-driven role resolution.

## Data model

```
team_event_matchups         (pairing — always home=team1, away=team2)
├── team1_id                home team
├── team2_id                away team
├── round_name              "Top N" / "Bottom N"
│
└── team_matchups           (per half-inning — pitcher=batter)
    ├── team1_id            pitching team for this half-inning
    ├── team2_id            batting team for this half-inning
    ├── machine_id
    └── order_number        always 1 (one machine per half-inning)
```

Mirrors individual baseball:

```
event_matchups              (pairing — always home=player1, away=player2)
├── player1_id              home player
├── player2_id              away player
│
└── matchups                (per round — pitcher=batter)
    ├── player1_id          pitcher for this round
    ├── player2_id          batter for this round
    ├── machine_id
    └── order_number
```

### 9. Team score recalculation — Pitcher ball values

**File:** `service/TeamScoreService.php` (`updateTeamMatchupTotals`)

`calculateRunsForHalfRound()` was called with `$pitcherScores = ['ball1' => 0, 'ball2' => 0, 'ball3' => 0]` — the pitcher's actual ball values from `team_scores` were never looked up. This caused the server-side run calculation to diverge from the JS engine, producing wrong totals in `team_event_matchups.team1_score`/`team2_score` (visible in the weekly matchups schedule).

Fixed by computing the pitcher team ID (`home` for top half, `away` for bottom half) and looking up their `team_scores` row by `"{halfId}_{pitchingTeamId}"`. Falls back to `[0,0,0]` when the pitcher hasn't saved yet — the recalculation on the next save produces the correct total once both teams' ball values are present.

## Naming conventions

- **game**: One head-to-head contest
- **round**: A single machine slot within a game (a half-inning in baseball)
- **event**: A scheduled session or league week
- **matchup**: A pairing of participants within an event
- Format-specific terms (inning, frame, hole) live only inside engines.
- The UI resolves labels and role names through `engine.getRoundRowContext()`
  and `engine.getRoundLabel()`.
