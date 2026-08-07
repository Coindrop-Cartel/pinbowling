# Future Roadmap — Code Review & Technical Debt

> Code review performed August 2026 against the current main branch.

---

## 1. Duplicate & Dead Code

### 1.1 `calculateHead2HeadRecords` vs `HeadToHeadCompetitionStrategy.calculateMatchupRecords`

**Status: ✅ Completed (August 2026)**

Retired legacy `calculateHead2HeadRecords` from `seasonCalculator.js`. Updated `standingsPage.js` to call `HeadToHeadCompetitionStrategy.calculateMatchupRecords` directly through the active scoring engine.

---

### 1.2 `isH2HTie` — Triplicated Tiebreaker Logic & Engine-Delegated Tiebreaking

**Status: ✅ Completed (August 2026)**

Extracted tiebreaker detection into `HeadToHeadCompetitionStrategy.isTie(a, b, engine)` and added `engine.isTie(a, b)` on `ScoringEngine`. Standardized record fields on generic format-neutral `scoreDiff` and `totalScore`. `standingsTableRenderer.js` and `printing.js` now call `engine.isTie(a, b)`.

---

### 1.3 Identical Matchup Header HTML in `standingsTableRenderer.js`

**Status: ✅ Completed (August 2026)**

Collapsed the identical `if (isTeamLeague && supportsMatchups)` and `else if (supportsMatchups && !isTeamLeague)` header branches in `standingsTableRenderer.js` into a single `if (supportsMatchups)` block.

---

### 1.4 `BaseballEngine.sortStandings` vs `HeadToHeadCompetitionStrategy.sortStandings`

**Status: ✅ Completed (August 2026)**

Updated `HeadToHeadCompetitionStrategy.sortStandings` to handle `options.head2headRecordsMap` for resolving entity records, and removed the duplicate `sortStandings` override from `BaseballEngine.js`. `BaseballEngine` now inherits `super.sortStandings` from `ScoringEngine`.

---

### 1.5 `ScoringEngine` Static/Instance Method Pairs

**Status: ✅ Completed (August 2026)**

Simplified static/instance delegation pairs in `ScoringEngine.js` (`getFormatDefaults`, `hasHead2HeadScoring`, `requiresHeadToHead`, `getDefaultCompetitionFormat`, `getDefaultRoundsPerGame`, `getDefaultMatchupsPerRound`, `getDefaultQuickFillTargets`, `getDefaultFallbackTargetValues`, `getDefaultTargetForDifficulty`, `getCrossFormatPreferenceOrder`) to cleanly use `this.constructor.methodName(...args)`.

---

## 2. Logic Creep Outside Engines

### 2.1 Competition Format String Fragmentation

**Status: ✅ Completed (August 2026)**

Added `isHead2Head(format)` helper in `scoringFormat.js` which normalizes `'head2head'`, `'head_to_head'`, and `'h2h'`. Updated all string checks across `selectors.js`, `lists.js`, `leagueFormController.js`, `leaguesPage.js`, `scoresPage.js`, `leagueFlows.js`, and `CompetitionFormatStrategy.js`.

---

### 2.2 `seasonCalculator.js` — H2H Display Value Logic

**Severity: Low — Acceptable Trade-Off**

The `calculateSeasonSummary` function in [seasonCalculator.js:258–300](file:///c:/Users/kylev/development/antigravity/pinbowling/scripts/services/seasonCalculator.js#L258-L300) contains inline matchup-result display logic (`W`/`L`/`T`/`BYE`) that reads `team1Score`, `player1Score`, etc. This is format-aware presentation logic that ideally belongs in the engine or a renderer.

However, since `calculateSeasonSummary` is a shared service used by both the live standings page and the print module, and the display logic is minimal, this is a reasonable trade-off. Flagged for future consideration only.

---

### 2.3 `scoresPage.js` — Target Resolution Inline Helper

**Severity: Low**

The `resolveTargetVal` function ([scoresPage.js:867–878](file:///c:/Users/kylev/development/antigravity/pinbowling/scripts/pages/scoresPage.js#L867-L878)) duplicates parts of the `targetResolver.js` resolution logic by falling back to `getTargetScoreForDifficulty` → engine defaults. This is a page-level orchestration helper (not scoring logic), so it's acceptable but could be unified.

---

## 3. Enhancement Suggestions

### 3.1 Centralize `computeRanks` Tie Functions

The `computeRanks` function is well-structured, but its tie-detection callbacks are defined ad-hoc at each call site:
- `isH2HTie` (standingsTableRenderer, printing)
- `isSeasonTie` (standingsTableRenderer)
- `isEventTie` (standingsTableRenderer)
- `isTeamTie` (standingsTableRenderer)
- `isMatchupEventTie` (standingsTableRenderer)

**Recommendation:** Create a small library of named tie comparators in the `CompetitionFormatStrategy` or `standingsTableRenderer` module:
```js
export const TieDetectors = {
  h2h: (a, b) => { /* Win% → H2H → Diff → Runs */ },
  score: (a, b, engine) => engine.compareScores(a.total, b.total) === 0,
  seasonPoints: (a, b) => (a.totalSeasonPoints ?? 0) === (b.totalSeasonPoints ?? 0),
};
```

---

### 3.2 `printing.js` Modular Split

**Status: ✅ Completed (August 2026)**

Split `printing.js` (857 lines) into focused modules under `scripts/ui/printing/`:
- `printStyles.js`: Shared print CSS definitions and `formatPrintTargets` helper.
- `printMachineScores.js`: Machine target sign printing (`printMachineScores`).
- `printScoreSheet.js`: Single-event blank and filled score sheet printing (`printBlankScoreSheet`, `printScoreSheet`).
- `printSeasonSummary.js`: Full season booklet printing (`printSeasonResults`).
- `printing.js`: Re-exports all functions for 100% backward compatibility.

---

### 3.3 `scoresPage.js` Size

At **1164 lines / 50KB**, `scoresPage.js` is the largest module. It handles tournament selection, player selection, score entry, team mode, matchup scheduling, results rendering, and session management.

**Recommendation:** Continue extracting rendering into dedicated modules (like `roundRowRenderer.js`, `matchupScheduleRenderer.js`, `scoreboardRenderer.js` — which are good examples). Candidates for extraction:
- Player/team selection logic → `playerSelectionController.js`
- Target resolution and machine setup → already partially in `targetResolver.js`

---

### 3.4 Error Boundary / Retry Patterns

API calls across pages use inconsistent error handling. Some swallow errors silently (`.catch(() => [])`), others show user-facing alerts. There's no unified retry mechanism for transient network failures.

**Recommendation:** Add a standardized `apiCall(promise, { fallback, retries, showError })` wrapper in `api.js` that:
- Retries on 5xx / network errors
- Falls back to a default value
- Optionally surfaces an error toast

---

### 3.5 TV Mode / Auto-Refresh Polling

The TV mode auto-refresh polls on a fixed interval. For multi-user scoring scenarios, consider adding Server-Sent Events (SSE) or WebSocket support to push score updates in real-time instead of polling.

---

## 4. Potential Issues

### 4.1 Optimization of `seasonCalculator.js` Matchup Lookup

**Status: ✅ Completed (August 2026)**

Pre-built per-event entity-to-matchup lookup map (`entityMatchupMapByEvent`) in `seasonCalculator.js`, replacing $O(\text{entities} \times \text{events} \times \text{matchups})$ redundant search loops with $O(1)$ constant-time lookups per cell.

---

### 4.2 `_isHeadToHead` Only Checks League Format

**Status: ✅ Completed (August 2026)**

Updated `ScoringEngine._isHeadToHead(context)` to check `isHead2Head(fmt) || this.requiresHeadToHead()`.

---

### 4.3 Competition Format Detection Inconsistency in `seasonCalculator.js`

**Status: ✅ Completed (August 2026)**

Replaced line 36 heuristic `!!engine.getMatchupDescription(1)` with `isHead2Head(league?.competitionFormat) || engine?.requiresHeadToHead?.() === true`.

---

### 4.4 `CompetitionFormatStrategy.calculateMatchupRecords` Team Mode Detection

The team mode detection at [CompetitionFormatStrategy.js:75](file:///c:/Users/kylev/development/antigravity/pinbowling/scripts/core/CompetitionFormatStrategy.js#L75) uses a heuristic:
```js
const isTeamMode = options?.participationType === 'team'
  || (matchups.length > 0 && matchups[0].team1Id !== null && matchups[0].team1Id !== undefined);
```

This works but is fragile — if `team1Id` is `0` (edge case), it would pass `!== null && !== undefined` but fail the data extraction since `Number(0) === 0` would be falsy in the bye-week check on line 84. Currently not a real risk since IDs are never 0, but worth noting.

---

### 4.5 Elimination of Blind `eventMatchups[0]` Fallbacks

**Status: ✅ Completed (August 2026)**

Audited and refactored multiple files where code fell back to `eventMatchups[0]` or flat league matchups instead of querying/matching the active `matchupId`:
- `playerSelector.js`: Updated `getSelectableTeams`, `getSelectablePlayers`, `getAutoSelectedPlayerId`, and `getSpectatorStatus` to find the active matchup by ID (`eventMatchups.find(m => String(m.id) === String(activeMatchupId))`).
- `matchupBuilder.js`: Updated `resolveMatchupRole` to match `targetMatchup` by checking which matchup `playerId` (or `teamId`) actually participates in.
- `scoresPage.js`: Updated team score saving and spectator warning logic to use the active matchup ID instead of hardcoding `eventMatchups[0].id`.
- `standingsPage.js`: Removed `(allLeagueMatchupsResults.flat() || [])` fallback on line 456 to prevent cross-event matchup leakage into empty events.

---

## 5. Testing Gaps

### 5.1 Unit Tests for `computeRanks`

**Status: ✅ Completed (August 2026)**

Added dedicated unit test suite in `tests/unit/scripts/renderers/standingsTableRenderer.test.js` covering empty arrays, single entries, non-tied sequences, two-way ties with skipped ranks, three-way ties, and all-tied scenarios.

---

### 5.2 Unit Tests for `isTie` Tiebreaker Logic

**Status: ✅ Completed (August 2026)**

Added unit tests in `tests/unit/scripts/core/CompetitionFormatStrategy.test.js` covering `BaseCompetitionStrategy.isTie` and 5 edge cases for `HeadToHeadCompetitionStrategy.isTie` (Win %, direct H2H, scoreDiff, totalScore equality/inequality).

---

### 5.3 PHP Service Integration Tests

The `MatchupGenerator.php` and `TargetResolver.php` are tested only through the API endpoints (Playwright E2E). Unit-level PHP tests for target resolution (especially the cross-format fallback in Tier 3) would catch regressions faster.

---

## 6. Priority Summary

| Priority | Item | Effort |
|----------|------|--------|
| ✅ Done | Retire `calculateHead2HeadRecords` duplicate (§1.1) | Small |
| ✅ Done | Extract shared `isH2HTie` & `engine.isTie(a, b)` (§1.2) | Small |
| ✅ Done | Collapse duplicate matchup header in standingsTableRenderer (§1.3) | Trivial |
| ✅ Done | Unify `BaseballEngine` / `CompetitionFormatStrategy` sort (§1.4) | Medium |
| ✅ Done | Simplify static/instance pairs in ScoringEngine (§1.5) | Medium |
| ✅ Done | Centralize H2H format string detection (§2.1) | Medium |
| ✅ Done | Fix `_isHeadToHead` to include `requiresHeadToHead()` (§4.2) | Small |
| ✅ Done | Replace `getMatchupDescription` heuristic with `requiresHeadToHead()` (§4.3) | Small |
| ✅ Done | Add `computeRanks` and `isTie` unit tests (§5.1, §5.2) | Small |
| ✅ Done | Split `printing.js` into focused modules (§3.2) | Large |
| 🟢 Low | Extract player selection logic from `scoresPage.js` (§3.3) | Large |
| 💡 Future | SSE / WebSocket for live TV mode (§3.5) | Large |
| 💡 Future | Standardized API error/retry wrapper (§3.4) | Medium |
