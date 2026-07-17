# Refactoring Plan: Engine vs UI/Service Split

## Problem Statement

The scoring engine layer has drifted into responsibility territory that belongs in the UI and service layers. The `ScoringEngine` base class is 578 lines, and format-specific engines (especially BaseballEngine at 562 lines) embed **HTML template generation**, **DOM manipulation logic**, **UI state management hooks**, and **business rules** that don't belong in pure scoring math.

This blurs the clear architectural boundary: **Engines = WHAT the result is**. **Pages/UI/Services = HOW to display it, who can act on it, and how data flows.**

---

## Current Architecture (simplified)

```
Engine Layer          ScoringEngine (578 loc) ───┬── BowlingEngine (368)
                                          ├── GolfEngine (264)
                                          └── BaseballEngine (562)
                                                       ↓ imports directly
                                                  normalizer.js, scoreboard.js

UI Layer          pages/scoresPage.js (819) ────┬── buildRoundRow
                        ui/roundRow.js (208)     ├── renderThresholdGrid
                        ui/scoreboard.js (147)   ├── applyPreferredTheme (in branding)
                        ui/branding.js (90)      └── printBlankScoreSheet

Service Layer     services/normalizer.js (248)  ─┬── normalizeTargets
                             services/api.js      ├── buildScoreMapFromRows
                             services/*           └── ...general normalization
```

---

## Issues by Category

### 1. Engine classes generate UI HTML (View logic in Model layer)

**What's happening**: Engines contain HTML template strings for rendering preview rows, threshold grids, bonus targets, role labels, printable score sheets, and even the full results panel.

| Method | File | Lines | Belongs in |
|--------|------|-------|------------|
| `ScoringEngine.getPreviewRowHtml()` | ScoringEngine.js | ~180 | `ui/roundRow.js` or separate `renderers/` module |
| `ScoringEngine.renderRoundRow()` | ScoringEngine.js | 20 | `ui/roundRow.js` |
| `ScoringEngine.getThresholdGridHtml()` | ScoringEngine.js | ~35 | `ui/lists.js` or threshold rendering module |
| `BowlingEngine.getBonusTargetHtml()` | BowlingEngine.js | 9 | `ui/roundRow.js` |
| `BaseballEngine.getPreviewRowHtml()` | BaseballEngine.js | ~40 | `ui/roundRow.js` engine-variant renderer |
| `ScoringEngine.getRowSummaryHtml()` | ScoringEngine.js | 5 | `ui/roundRow.js` or engine returns raw data for UI to format |
| `BaseballEngine.getRoundRowContext()` | BaseballEngine.js | ~80 | `services/matchupResolver.ts` or similar |

**Why it's a problem**: Engines now own both the scoring math AND how their data is rendered. This makes them hard to test in isolation, prevents UI redesign, and creates coupling to DOM APIs that can't run in tests or on the server.

### 2. Engines import directly from services (cross-cutting imports)

| Engine | Imports | Should be provided by |
|--------|---------|----------------------|
| `BaseballEngine` | `services/normalizer.js` (`buildBaseballScoreMapForPlayer`, `flattenMatchupInnings`) | Constructor or engine context |
| `BaseballEngine` | `ui/scoreboard.js` (`renderBaseballScoreboard`) | `pages/scoresPage.js` dispatch |

**Why it's a problem**: Circular dependency risk. Engines are supposed to be pure modules, but they reach into services and UI code. This also means you can't reuse an engine outside the browser context.

### 3. BaseballEngine is a monolith (562 lines)

BaseballEngine conflates three distinct concerns:
- **Scoring math** (`calculateBallRuns`, `getRunCount`, `buildRoundValues`) — ~100 lines of real scoring logic
- **Matchup business logic** (`generateMatchupPayload`, `getRoundRowContext` with inning/role resolution) — ~200 lines
- **Rendering/UI hooks** (`renderResults`, `getPreviewRowHtml`, `formatMark`, etc.) — ~150 lines

The matchup generation and role resolution logic is **business domain logic**, not scoring logic. It belongs in a dedicated service.

### 4. Baseball-specific normalization functions scattered across layers

`normalizer.js` contains `buildBaseballScoreMapForPlayer` and `flattenMatchupInnings` at 120+ lines of baseball-only code mixed with general-purpose normalizers like `normalizeScore`, `groupScoresByPlayer`, etc.

### 5. Engine context pattern is ad-hoc but fragile

The engine uses an open-ended `context` object passed into many methods (`getRoundRowContext`, `enrichScoreMap`, `getPreviewRowHtml`, `buildPlayerScoreMap`):

```javascript
function getEngineContext() {
  return {
    allEventScores, eventMatchups, allPlayersCache, getCurrentPlayerId,
    normalizeScores, groupScoresByPlayer, buildBaseballScoreMapForPlayer, escapeHTML
  };
}
```

This is a code smell — the context parameter grows as engines discover they need more data, and there's no contract or interface enforcing what each method needs. It works for now but will become unmanageable.

### 6. `ScoringEngine` base class owns rendering too much

At 578 lines, the abstract base class has:
- Default implementations of `renderResults()` that manipulate DOM elements
- `getThresholdGridHtml()` that builds threshold grid HTML
- `getPreviewRowHtml()` with inline template literals
- `renderRoundRow()` that creates and populates DOM nodes

The "abstract base class" pattern here is really just a namespace for shared defaults. A better approach would extract rendering into pluggable renderer components.

---

## Proposed Refactoring Steps

### [Phase 0] Centralize scoring format constants

**Problem**: The strings `'bowling'`, `'golf'`, `'baseball'` are hardcoded as raw literals across ~30+ files. There is no validation that a cookie, URL param, or database value is a recognized format. Adding a fourth format later requires scattering edits with high risk of typos and silently unsupported values.

**Root causes:**
- No single source of truth for valid format identifiers
- Default fallbacks always `'bowling'` everywhere — easy to write incorrectly 
- No `isValid()` guard so any value in the cookie drops through to default (or crashes)

**Solution: Create `scripts/services/scoringFormat.js`**

```js
/** @enum {string} */
export const ScoringFormats = Object.freeze({
  BOWLING: 'bowling',
  GOLF: 'golf', 
  BASEBALL: 'baseball'
});

ScoringFormats.ALL = Object.values(ScoringFormats);
ScoringFormats.DEFAULT = ScoringFormats.BOWLING;

/** Validate that a value is a known format identifier. */
ScoringFormats.isValid = function(v) {
  return this.ALL.includes(String(v ?? ''));
};
```

**What gets replaced:**
- All `|| 'bowling'` default fallbacks → `ScoringFormats.DEFAULT` 
- Direct string comparisons like `format === 'baseball'` → `format === ScoringFormats.BASEBALL`
- Arrays of format strings → `ScoringFormats.ALL`
- Cookie reads with bare defaults → validation-first: `ScoringFormats.isValid(raw) ? raw : ScoringFormats.DEFAULT`

---

### Phase 1: Extract matchup logic to a service (low risk, high impact)

**New file**: `services/matchupBuilder.js`

- Move `BaseballEngine.generateMatchupPayload()` → `buildRoundRobinMatchups(players, inningCount, machines)`
- Move `BaseballEngine.getRoundRowContext()` helper logic → `resolveInningRole(playerId, machineId, eventMatchups)` (returns structured data, not HTML)
- Remove these from BaseballEngine

**Migration**: Update `scoresPage.js` and `BaseballEngine` to use the service. The engine calls return plain objects; the page/renderer decides what HTML to produce.

### Phase 2: Move UI hooks out of engines — introduce a renderer contract

**New file(s)**: `scripts/renderers/` directory
- `renderers/roundRowRenderer.js` — takes machine config + result data + engine as dependency, produces DOM or JSX
- `renderers/scoreboardRenderer.js` — renders any scorer's results (baseball grid or standard table)

**Changes to engines**:
- Replace `getPreviewRowHtml()` with `getPreviewRowData(frame)` returning `{ header: string, metadata: object }`
- Replace `getRowSummaryHtml()` with `getRowSummaryData(round)` — raw data, not HTML
- Replace `renderResults()` with a hook that returns result objects; page invokes its own renderer
- Replace `getRoundRowContext()` with `getTurnMetadata(round)` returning structured data

The engine returns **data**. A separate renderer converts that data to **HTML/XML/pixels**.

### Phase 3: Clean up normalizer — move baseball-specific normalization

**Changes to**: `services/normalizer.js`
- Extract `buildBaseballScoreMapForPlayer`, `flattenMatchupInnings` → `services/matchupBuilder.js` or new `sports/baseball.js`

**Changes to**: `BaseballEngine`
- Import from the new location (or better: receive these as injected dependencies)

### Phase 4: Reduce BaseballEngine monolith

With the above extractions, BaseballEngine should shrink from 562 lines to ~180-220 lines covering only:
- `buildRoundValues()` — exponential run scaling
- `getRunCount()` — threshold lookup
- `calculateBallRuns()` / `getInningData()` — per-inning calculation
- `calculateTurnResults()` — result orchestration (with walk-off logic)
- Labels, configuration, and metadata getters

### Phase 5: Slim down ScoringEngine base class

Target: ~200-250 lines of shared defaults only.

Remove or refactor:
- `getPreviewRowHtml()` → engine returns preview data; page calls `roundRowRenderer.renderPreview()`
- `renderRoundRow()` → entire method moves to `roundRowRenderer`
- `getThresholdGridHtml()` → move to threshold rendering module
- `enrichScoreMap()` default → remove or make it a pure identity function. Engines that need enrichment should do it in their own data pipeline, not via an open-ended context object.

### Phase 6: Formalize the engine contract

Create an explicit interface/document defining what each engine method must return (data types only):

```
// Engine Contract (proposed)
calculateTurnResults(machines, scoreMap)                    → { turnResults, total, totalDisplay }
buildRoundValues(target, base/multiplier, scalingType)     → Object<rank, value>
getRunCount / getPinCount / getStrokes                     → integer
getRowSummaryData(round)                                   → Object (not HTML)
getPreviewRowData(frame)                                   → Object (not HTML)
formatMark(turnResult)                                     → string or format spec
```

Pages and renderers consume only the data return types. No engine should touch DOM, fetch APIs, or build HTML directly.

---

## What This Preserves

- The current engine factory pattern (`getScoringEngine()`) remains intact
- Format-specific behavior still delegates through engine polymorphism (no big `if/else` in pages)
- The open-ended hook pattern is **retained** but restricted to data-returning methods only
- Each format still controls its own terminology, labels, thresholds, and scoring math

## What This Changes

| Before | After |
|--------|-------|
| Engine returns strings/HTML for UI | Engine returns structured data objects |
| `BaseballEngine` imports `normalizer.js`, `scoreboard.js` | Engines are pure modules; dependencies injected or resolved by pages |
| BaseballEngine = 562 lines (scoring + matchmaking + rendering) | BaseballEngine ~200 lines (scoring only); rest in services/renders |
| `ScoringEngine` = 578 lines of shared defaults with DOM access | `ScoringEngine` ~200 lines; renderers in separate module |
| Ad-hoc `context` object grows with every feature | Explicit data-returning methods with typed contracts |
| Normalizer contains baseball-specific code (48%) | Baseball normalization in `sports/baseball.js` or `matchupBuilder.js` |

## Effort Estimate

| Phase | Estimated lines changed | Risk | Scope |
|-------|------------------------|------|-------|
| 0. Format constants | ~30 added, ~40 replaced | Low | New file + all JS files with format strings |
| 1. Matchup service extraction | ~150 added, ~150 moved | Low | BaseballEngine + scoresPage |
| 2. Renderer contract | ~300 added, ~250 removed from engines | Medium | All three engines + scoresPage + roundRow |
| 3. Normalizer cleanup | ~70 moved out | Low | normalizer.js |
| 4. BaseballEngine slimming | ~340 lines deleted | Medium | baseballEngine.js |
| 5. ScoringEngine slimming | ~250-300 lines deleted | Medium | ScoringEngine.js + all engines |
| 6. Contract documentation | New doc in `architecture.md` | None | Documentation |

## Implementation Order Recommendation

1. **Phase 6 first**: Document the contract before any changes so there's a clear target state for Phase 2-5.
2. **Phase 1**: Matchup service — highest impact/lowest risk. This alone removes ~80 lines of UI logic from BaseballEngine.
3. **Phase 3**: Normalizer cleanup — mechanical extraction, easy to test.
4. **Phase 2 + 5** together: Renderer abstraction and base class slimming are intertwined. Do both in one pass.
5. **Phase 4**: Natural consequence of phases 1-3; BaseballEngine shrinks on its own.

---

