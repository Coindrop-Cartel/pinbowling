# Lane Separation: Decoupling UI presentation from Scoring Logic

This document proposes a plan for completing the separation between UI presentation (rendering, themes, labels, logos) and the scoring/matchup logic (math, rules, schedules).

---

## 1. Remaining Couplings

Despite our recent refactoring, several areas of the codebase still mix UI concerns with format logic:

### A. Results rendering inside the engines (`renderResults`)
* **Problem:** `ScoringEngine.renderResults` and `BaseballEngine.renderResults` still directly manipulate the DOM (clearing tables, injecting grids, updating classes, etc.).
* **Impact:** The engines are not pure data modules and cannot be easily run in headless contexts or server environments without mock DOM dependencies.

### B. UI configuration inside the engines (branding, themes, labels)
* **Problem:** Engine classes contain presentation-specific getters:
  * `getThemeClass()` — CSS theme classes
  * `getLogoImage()` / `getHeaderLogoImage()` — Logo image filenames
  * `getBrandName()` — Title text
  * `getPlayActionLabel()` — Button label strings
  * `getScoringDescription()` — UI help text
  * `getScoringHint()` / `getLastFrameHint()` — Entry help text hints
* **Impact:** Presentational changes (e.g. renaming a button, changing a theme class, updating a logo) require modifying the core scoring classes.

### C. Threshold Grid HTML compiler inside `ScoringEngine`
* **Problem:** `ScoringEngine.getThresholdGridHtml` still compiles HTML tables.
* **Impact:** This is dead presentation code left on the scoring base class.

---

## 2. Proposed Refactoring Steps

### Phase 1: Decouple Scoreboard Grid Rendering
Extract all results rendering from the engine classes:
1. **Remove `renderResults` from `ScoringEngine` and `BaseballEngine`.**
2. Create a new module `scripts/renderers/scoreboardRenderer.js` containing:
   * `renderStandardScoreboard(calcResult, domRefs)`
   * `renderBaseballScoreboard(calcResult, machines, scoreMap, context, domRefs)`
3. Update `scoresPage.js` to import and invoke these renderers based on the active format/engine type, keeping the engine entirely out of the DOM manipulation flow.

### Phase 2: Separate Branding and Themes from Engines
Introduce a centralized presentation config layer:
1. Create `scripts/services/scoringFormatBranding.js` that maps format IDs to their presentational properties:
   ```javascript
   export const FormatBranding = {
     bowling: {
       themeClass: 'theme-bowling',
       logo: 'logo.png',
       brandName: 'PinBowling',
       ctaLabel: 'Play',
       description: 'Standard PinBowling rules...',
       hint: 'Enter cumulative scores for each ball.',
       lastFrameHint: 'XX and XXX denote bonus values...'
     },
     golf: { ... },
     baseball: { ... }
   };
   ```
2. Remove these getters from `ScoringEngine` and its subclasses.
3. Update `scoresPage.js`, `playPage.js`, and `branding.js` to look up configuration values from `FormatBranding` rather than querying the engine instances.

### Phase 3: Clean up dead HTML code
1. Delete `ScoringEngine.getThresholdGridHtml()` completely.
2. Ensure the UI only uses the utility function `renderThresholdGrid` in `scripts/utils.js`.

---

## 3. Benefits of this Refactoring

* **Pure Scoring Engines:** Engines will expose only synchronous, data-in/data-out methods representing mathematical scoring rules.
* **Separation of Concerns:** A designer can update theme classes, description texts, or logo filenames in `scoringFormatBranding.js` without touching or risking regressions in game scoring calculations.
* **Easier Testing:** Engine tests will no longer need mock DOM containers or mock renderers.
