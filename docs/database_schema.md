# PinBowling — Database Schema & Relationships

> Reference for how leagues, events, matchups, scores, and target scores are
> structured. Use this alongside `docs/architecture.md` when reviewing session
> generation (`scripts/pages/playPage.js` → `scripts/services/sessionFinalizer.js`)
> and the scoring engines (`scripts/core/engines/`).

## Design Principles

1. **Format-agnostic storage.** Tables use neutral column names
   (`player1_id`, `player2_id`, `player3_id`, `player4_id`,
   `player1_score`, `player2_score`, `order_number`, `value1`, `value2`).
   No format-specific terminology lives in the schema. Each scoring engine
   is responsible for translating these columns into format vocabulary:
   - **Baseball (team)** — `player1` = Home team, `player2` = Away team;
     `player1_score`/`player2_score` = Home Runs / Away Runs;
     `round_name` = half-inning label ("Top N" / "Bottom N");
     `matchups.player_id` = batter assigned by rotation.
   - **Baseball (individual)** — `player1` = Home, `player2` = Away;
     `player1_score`/`player2_score` = Home Runs / Away Runs;
     `order_number` on `matchups` = half-inning slot (Top/Bottom of inning N).
   - **Bowling / Golf** — `player1`/`player2` are unused (individual formats);
     `order_number` on `scores`/`target_scores` = frame number / hole number.
2. **Two participation models.**
   - `leagues.participation_type = 'individual'` — everyone plays everyone
     (Bowling, Golf). Roster via `league_players`.
   - `leagues.participation_type = 'team'` — teams compete (Team Baseball).
     Roster via `league_teams` → `team_members`.
   - `leagues.participants = 'head2head'` — paired play (Individual Baseball).
     Pairings tracked through `event_matchups` + `matchups`.
3. **Two league lifecycles.**
   - `leagues.type = 'session'` — a one-off single-event session (Quick Play).
   - `leagues.type = 'standard'` — a multi-event league spanning weeks/season.
4. **Targets vs. Scores.** `target_scores` defines the *expected* thresholds
   per machine per round (par for golf, run baseline for baseball, frame
   baseline for bowling). `scores` records what each player *actually* shot.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    leagues ||--o{ events : "has"
    leagues ||--o{ league_players : "roster"
    leagues ||--o{ league_teams : "roster"
    leagues ||--o{ league_staff : "directs"
    leagues ||--o{ league_locations : "plays at"

    events ||--|| target_scores : "defines thresholds"
    events ||--o{ scores : "records"
    events ||--o{ event_matchups : "head2head pairings"

    event_matchups ||--o{ matchups : "half-inning slots"
    event_matchups ||--o| players : "player1 (home)"
    event_matchups ||--o| players : "player2 (away)"
    event_matchups ||--o| players : "winner"

    matchups ||--|| machines : "played on"
    matchups }o--|| event_matchups : "belongs to"

    scores ||--|| machines : "played on"
    scores }o--o| players : "shot by (individual modes)"
    scores }o--o| teams : "shot by (team mode)"
    scores }o--|| events : "part of"
    scores }o--o| event_matchups : "head2head context"

    target_scores ||--|| machines : "thresholds for"
    target_scores }o--|| events : "part of"

    locations ||--o{ location_machines : "hosts"
    location_machines ||--o{ location_machine_scores : "per-format targets"
    machines ||--o{ machine_scores : "global per-format targets"
    machines ||--o{ location_machines : "installed at"

    players ||--o{ league_players : "member of"
    players ||--o{ team_members : "on"
    players ||--o| users : "may be linked to"

    teams ||--o{ team_members : "composed of"
    teams ||--o{ league_teams : "competes in"

    users ||--o{ league_staff : "directs"
```

---

## Table Reference

### `leagues` — Top-level container

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `name` | varchar(255) | League or session name |
| `type` | enum(`standard`,`session`) | `session` = Quick Play one-off; `standard` = multi-week |
| `participation_type` | enum(`individual`,`team`) | Legacy format property; unified under Universal Team Model |
| `team_size` | int default 1 | **Universal Team Model**: `1` for individual play (teams of 1; team names hidden in UI), `> 1` for multi-player teams |
| `start_date` | date | |
| `scoring_format` | varchar(50) | `bowling` / `golf` / `baseball` |
| `season_scoring` | enum(`cumulative`,`weekly`) | Season aggregation strategy |
| `drop_lowest_weeks` | int | Season scoring tweak |
| `weekly_points` | int (nullable) | Season config (standard leagues) |
| `point_spread` | int (nullable) | Season config (standard leagues) |
| `rounds_per_game` | int (nullable) | Number of rounds in a game. Bowling = 10 (full), sessions often 3/6/10. Golf = 9 or 18. Baseball = innings. |
| `matchups_per_round` | int (nullable) | Number of 1-on-1 matchup rows per round. Total `matchups` rows per game = `rounds_per_game * matchups_per_round`. |
| `weeks_in_season` | int (nullable) | Number of weeks/events in a standard season |
| `status` | enum(`setup`,`active`,`completed`) | |
| `playoff_series_length` | int (nullable) | Number of games per playoff series |

**Relationships:** 1→many `events`, `league_players`, `league_teams`,
`league_staff`, `league_locations`.

> Game sizing is split across two independent columns (`rounds_per_game` ×
> `matchups_per_round`) instead of a single combined count, so the schema
> has no opinion about how many sides a head2head format has. The engine
> materializes `rounds_per_game * matchups_per_round` rows in the `matchups`
> table when a head2head event is created.

---

### `events` — A single date of play within a league

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `league_id` | int FK→`leagues.id` | |
| `event_name` | varchar(255) | |
| `event_date` | date | |
| `location_id` | int FK→`locations.id` (nullable) | |
| `scoring_format` | varchar(50) | Denormalized from league for convenience |

**Relationships:** belongs to `leagues`; has many `scores`, `target_scores`,
`event_matchups`.

> For a `session`-type league, there is typically exactly one event. For a
> `standard` league, each week of play is a separate `events` row.

---

### `event_matchups` — A single head-to-head pairing within an event

Used **only for `head2head` (Baseball)** formats. Individual formats skip this
table entirely.

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `event_id` | int FK→`events.id` | |
| `player1_id` | int FK→`players.id` | **Engine-translated**: Home team (team) or Home player (individual) |
| `player2_id` | int FK→`players.id` (nullable) | **Engine-translated**: Away team (team) or Away player (individual) |
| `player1_score` | int default 0 | **Engine-translated**: Home Runs |
| `player2_score` | int default 0 | **Engine-translated**: Away Runs |
| `player3_id` | int FK→`players.id` (nullable) | Reserved for future use (generic column) |
| `player4_id` | int FK→`players.id` (nullable) | Reserved for future use (generic column) |
| `player3_score` | int default 0 | Reserved for future use |
| `player4_score` | int default 0 | Reserved for future use |
| `winner_id` | int FK→`players.id` (nullable) | Resolved when `status='completed'` |
| `status` | enum(`pending`,`completed`) | |
| `game_number` | int default 1 | For multi-game series within one event |
| `round_name` | varchar(50) (nullable) | Team baseball only. Half-inning label, e.g. `"Top 1"`, `"Bottom 2"`. Individual mode: NULL. |

**Relationships:** belongs to `events`; has many `matchups` (the half-inning
slots); references `players` three times (player1, player2, winner).

> **Team baseball model:** Each `event_matchups` row represents one half-inning.
> `player1_id` = home team, `player2_id` = away team. The `round_name` field
> stores the half-inning label (e.g. "Top 1"). A 2-inning team game has 4
> `event_matchups` rows (Top 1, Bottom 1, Top 2, Bottom 2), each with N
> `matchups` rows (one per batter in the batting rotation).
>
> **Individual baseball model:** Each `event_matchups` row represents one
> head-to-head pairing between two players. `player1_id` = home player,
> `player2_id` = away player. `round_name` is NULL. A 2-inning game has 1
> `event_matchups` row with 4 `matchups` rows (Top 1, Bottom 1, Top 2, Bottom 2).
>
> The engine layer is responsible for mapping `player1`/`player2` to
> Home/Away and `player1_score`/`player2_score` to Home/Away Runs. The DB
> stores only neutral `player1`/`player2` semantics.

---

### `matchups` — Individual half-inning slots (Baseball)

One row per half-inning per game. For an N-inning baseball game there are
**N × 2** rows here (Top of 1st, Bottom of 1st, Top of 2nd, Bottom of 2nd, …).

| `id` | int PK auto | |
| `event_matchup_id` | int FK→`event_matchups.id` (nullable) | Grouping parent |
| `order_number` | int | Sequential matchup index (1-based) within the game |
| `machine_id` | int FK→`machines.id` | The machine played for this matchup |
| `player1_id` | int FK→`players.id` (nullable) | Pitcher (defensive player) in Baseball; Active Player 1 in match play |
| `player2_id` | int FK→`players.id` (nullable) | Batter (offensive player) in Baseball; Active Player 2 in match play |

**Unique key:** `unique_matchup_round` (`event_matchup_id`, `order_number`) — drives `ON DUPLICATE KEY UPDATE` in matchup saves.

**Relationships:** belongs to `event_matchups`; references `machines`, `players`.

> `order_number` semantics:
> - Represents 1-on-1 matchup positions across `rounds_per_game * matchups_per_round`.
> - **Baseball**: `player1_id` = Pitcher, `player2_id` = Batter.
> - **Bowling / Golf**: `player1_id` = Active Player.

---

### `scores` — Actual scores per round/machine

Stores what was actually shot. Supports two ownership models:
- **Individual / Team-member modes**: `player_id` is set; `team_id` is NULL.
- **Team-level modes** (e.g. team baseball H2H): `team_id` is set; `player_id` is NULL.

Exactly one of `player_id` or `team_id` must be non-NULL per row.

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `event_id` | int FK→`events.id` | |
| `event_matchup_id` | int FK→`event_matchups.id` (nullable) | Set for head2head formats |
| `player_id` | int FK→`players.id` **nullable** | Individual/team-member row owner. NULL for team-level rows. |
| `team_id` | int FK→`teams.id` **nullable** | Team row owner (team baseball H2H). NULL for individual rows. |
| `order_number` | int | Round/frame/hole/half-inning index |
| `machine_id` | int FK→`machines.id` | |
| `ball1` / `ball2` / `ball3` | bigint | The three ball scores for the round |
| `match_key` | varchar(100) STORED GENERATED | Composite key for upserts. Computed from `event_id`/`event_matchup_id` + `order_number` |

**Unique keys:**
- `unique_scores_key` (`player_id`, `match_key`) — per-player row dedup.
- `uq_score_team` (`event_matchup_id`, `team_id`, `order_number`) — per-team row dedup.

**Relationships:** belongs to `events`, `event_matchups` (optional),
`players` (optional), `teams` (optional), `machines`.

> `order_number` aligns with `matchups.order_number` for baseball (so the
> engine can join a player's balls to the half-inning's machine/targets) and
> with `target_scores.order_number` for bowling/golf.

---

### `target_scores` — Expected thresholds per machine per round

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `event_id` | int FK→`events.id` | |
| `machine_id` | int FK→`machines.id` | |
| `order_number` | int | Round/frame/hole/half-inning index |
| `value1` | bigint | **Engine-translated**: Strike score (bowling), Target Score/baseline (golf), Run baseline (baseball) |
| `value2` | decimal(12,3) | **Engine-translated**: 1-pin baseline (bowling), Par value per hole (golf), Exponential multiplier (baseball) |
| `score1`…`score10` | bigint | Pre-computed threshold ladder (10 pin levels for bowling, 10 stroke thresholds for golf, 10 run levels for baseball) |

**Relationships:** belongs to `events`, `machines`.

> `value1`/`value2` are intentionally generic. The engine interprets them:
> - **Baseball**: `value1` = run baseline; `value2` = exponential multiplier.
> - **Golf**: `value1` = target score (the pinball score threshold anchored at par); `value2` = par value for the hole (3/4/5). `value2` drives `buildRoundValues`, cumulative-par display, and hole row highlighting.
> - **Bowling**: `value1` = strike score (the 10-pin threshold); `value2` = 1-pin baseline score. Both are passed to `buildRoundValues` to interpolate the full 1–10 pin ladder.

---

### `machines` — Master pinball machine registry

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `machine_name` | varchar(255) UNIQUE | |
| `year` | int (nullable) | |
| `manufacturer` | varchar(255) (nullable) | |

**Relationships:** has many `machine_scores`, `location_machines`,
`matchups`, `scores`, `target_scores`.

---

### `machine_scores` — Global per-format target defaults for a machine

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `machine_id` | int FK→`machines.id` | |
| `format` | varchar(50) | `bowling` / `golf` / `baseball` |
| `target_easy` / `target_med` / `target_hard` | bigint | Difficulty thresholds |

**Relationships:** belongs to `machines`.

> Fallback when no location-specific override exists.

---

### `locations` — Venues

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `name` | varchar(255) | |
| `city` / `state` | varchar(255) (nullable) | |

**Relationships:** has many `location_machines`, `league_locations`,
`events` (via `location_id`).

---

### `location_machines` — Machines installed at a location

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `location_id` | int FK→`locations.id` | |
| `machine_id` | int FK→`machines.id` | |

**Relationships:** belongs to `locations`, `machines`; has many
`location_machine_scores`.

---

### `location_machine_scores` — Location-specific per-format target overrides

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `location_machine_id` | int FK→`location_machines.id` | |
| `format` | varchar(50) | |
| `target_easy` / `target_med` / `target_hard` | bigint | |

**Relationships:** belongs to `location_machines`.

> Takes precedence over `machine_scores` when resolving targets for a session
> generated at a specific location.

---

### `players` — People who play

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `player_name` | varchar(255) UNIQUE | |
| `ifpa_id` / `matchplay_id` | varchar(50) (nullable) | External IDs |

**Relationships:** has many `league_players`, `team_members`, `scores`,
`event_matchups` (as player1/player2/winner); may be linked 1:1 to a `users`
row.

---

### `users` — Auth accounts

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `username` | varchar(255) UNIQUE | |
| `password_hash` | varchar(255) | |
| `email` | varchar(255) UNIQUE (nullable) | |
| `reset_token` / `reset_token_expires` | (nullable) | Password reset flow |
| `role` | enum(`player`,`td`,`admin`) | RBAC |
| `player_id` | int FK→`players.id` UNIQUE (nullable) | Optional link to a player profile |

**Relationships:** has many `league_staff`; optional 1:1 with `players`.

---

### `teams` — Grouped players

| Column | Type | Notes |
|---|---|---|
| `id` | int PK auto | |
| `name` | varchar(255) | |
| `city` / `state` | varchar(255) (nullable) | |
| `created_at` | timestamp | |

**Relationships:** has many `team_members`, `league_teams`.

---

### `teams` / `team_members` — Roster join tables

| Table | PK | FKs | Purpose |
|---|---|---|---|
| `league_players` | (`league_id`,`player_id`) | →`leagues`, →`players` | Individual roster |
| `league_teams` | (`league_id`,`team_id`) | →`leagues`, →`teams` | Team roster |
| `league_staff` | (`league_id`,`user_id`) | →`leagues`, →`users` | TDs directing a league |
| `league_locations` | (`league_id`,`location_id`) | →`leagues`, →`locations` | Where a league plays |
| `team_members` | (`team_id`,`player_id`) | →`teams`, →`players` | Players on a team |

---

### `schema_migrations` — Migration tracking

| Column | Type | Notes |
|---|---|---|
| `migration_name` | varchar(255) PK | |
| `applied_at` | timestamp | |

Managed by `migrate.php`. Not application data.

---

## Session Generation Flow (Baseball)

This traces how a Quick Play session materializes rows across these tables.
Refer to `scripts/pages/playPage.js` (`generatePreview`) and
`scripts/services/sessionFinalizer.js` (`finalizeSession`).

### Individual Baseball

1. **`leagues`** — `finalizeSession` calls `PB_API.leagues.create` with
   `type:'session'`, `scoring_format:'baseball'`, `participants:'head2head'`,
   `rounds_per_game: generatedFrames.length / 2` (the inning count) and
   `matchups_per_round: 2` (top + bottom per inning).
2. **`events`** — One event created for the session date.
3. **`target_scores`** — One row per generated frame (machine + order_number +
   value1/value2 + pre-computed `score1..score10` ladder). For a 2-inning
   baseball game this is **4 rows** (Top 1, Bottom 1, Top 2, Bottom 2).
4. **`league_players`** — Current user joined; opponent added via dialog if
   roster < 2.
5. **`event_matchups`** — Created by `api/matchup.php` POST handler when the
   first matchup payload arrives (resolves player1=home, player2=away).
   **One row** per head-to-head pairing.
6. **`matchups`** — `BaseballEngine.generateMatchupPayload` →
   `buildRoundRobinMatchups(players, inningCount, machines)` produces
   `inningCount × 2` rows (one per half-inning slot), each pointing at the
   `event_matchup_id` and a `machine_id`. For 2 innings → **4 rows**.

### Team Baseball

For team leagues (`leagues.participation_type = 'team'`), the model differs:

1. **`leagues`** — Created with `participation_type:'team'`, `scoring_format:'baseball'`.
2. **`events`** — One event per week.
3. **`target_scores`** — Same as individual: one row per half-inning slot.
4. **`event_matchups`** — **One row per half-inning** (not per pairing). A
   2-inning team game creates **4 rows** (Top 1, Bottom 1, Top 2, Bottom 2). Each row has:
   - `player1_id` = home team ID, `player2_id` = away team ID
   - `round_name` = `"Top N"` or `"Bottom N"`
5. **`matchups`** — Each `event_matchup` has exactly **1 matchup row** (one machine per
   half-inning). The batting order rotation — Ball 1 → Batter 1, Ball 2 → Batter 2, etc. —
   is resolved at scoring time by the `Set Batting Order` dialog, not by pre-creating
   separate rows per batter.
6. **`scores`** — Team baseball uses `team_id`-keyed rows (one per half-inning).
   `player_id` is NULL for these rows. `team_id` = the team that scored in that half-inning.

### Score ownership by format

| Format | `scores.player_id` | `scores.team_id` | Why |
|---|---|---|---|
| Bowling / Golf (individual) | Player ID | NULL | Each player has their own score sheet |
| Individual Baseball H2H | Player ID | NULL | Each player records their own balls |
| Team Baseball H2H | NULL | Team ID | The half-inning score belongs to the team, not one player |
| Team Bowling (future) | Player ID | NULL | Each player on the team still bowls their own game |

### Expected row counts for a 2-inning baseball session

| Table | Individual | Team | Why |
|---|---|---|---|
| `leagues` | 1 | 1 | The session/standard league |
| `events` | 1 | 4 (one per week) | Individual = session; Team = standard |
| `target_scores` | 4 | 4 per event | 2 innings × 2 half-innings |
| `event_matchups` | 1 | 4 per event | Individual = 1 pairing; Team = 1 per half-inning |
| `matchups` | 4 | 4 per event | Individual = 4 half-inning slots; Team = 1 machine per half-inning |
| `scores` (per team/player) | 4 rows (player-keyed) | 4 rows (team-keyed) | One score row per half-inning |
| `league_players` or `league_teams` | 2 | 2 teams | Home + Away |

If you observe unexpected row counts, check the payload generation path
(`buildRoundRobinMatchups` in `scripts/services/matchupBuilder.js` for individual,
or `SeasonService::startSeason` for team) or the `inningCount` argument.

---

## Format Translation Matrix

How engines interpret generic schema columns under the Universal Team Model:

| Generic Column | Bowling | Golf | Baseball (Universal Team Model) |
|---|---|---|---|
| `leagues.team_size` | `1` (Individual team of 1) | `1` (Individual team of 1) | `1` (Individual team of 1) or `> 1` (Multi-player team) |
| `leagues.rounds_per_game` | Frames per game (10 full; sessions often 3/6/10) | Holes per game (9 or 18) | Innings per game (2, 4, 6, 9) |
| `leagues.matchups_per_round` | 1 (Individual round) | 1 (Individual round) | Matchup rows per inning (e.g. 2 for half-innings, 6 for 3-ball turns) |
| `event_matchups.player1_id` | Competitor 1 (Team of 1) | Competitor 1 (Team of 1) | Home Team ID |
| `event_matchups.player2_id` | Competitor 2 (Team of 1) | Competitor 2 (Team of 1) | Away Team ID |
| `event_matchups.player1_score` | Total Points | Total Strokes vs Par | Home Runs |
| `event_matchups.player2_score` | Total Points | Total Strokes vs Par | Away Runs |
| `matchups.order_number` | Frame # | Hole # | 1-based matchup index across the game |
| `matchups.player1_id` | Active Player | Active Player | Pitcher (defensive player assigned for half-inning) |
| `matchups.player2_id` | — | — | Batter (offensive player assigned by lineup rotation) |
| `scores.order_number` | Frame # | Hole # | Matchup `order_number` |
| `target_scores.value1` | Strike score (10-pin threshold) | Target Score (anchored at par) | Run baseline |
| `target_scores.value2` | 1-pin baseline score | Par value per hole (3/4/5) | Exponential multiplier (e.g. 1.5) |
| `target_scores.score1..10` | Pin thresholds (1-pin → strike) | Stroke thresholds (1 stroke → 10 strokes) | Run thresholds (1R..10R) |

---

## Schema Design Principles & Implementation Guidelines

1. **Universal Team Model:** All competitions treat participants as teams (`team_size = 1` for individuals). This unifies roster management (`league_teams`), fixture generation (`MatchupGenerator`), and scoring engine calculations into a single execution path.
2. **Single Source of Truth for Calculations:** Scoring logic lives exclusively within the scoring engine classes (`BaseballEngine.js`, `BowlingEngine.js`, `GolfEngine.js`). Database storage holds raw inputs (`ball1`, `ball2`, `ball3`, `value1`, `value2`), eliminating duplicate calculation engines on the server.
3. **Format-Neutral 1-on-1 Matchups:** Every `matchups` row connects `player1_id` and `player2_id` on a `machine_id`. Engines translate these neutral columns into sport-specific roles at runtime without adding ad-hoc database columns.

