# Remaining Terminology Leak Issues

## Background
Sport-specific language that leaked out of the scoring engines into CSS class names, variable names, and string literals. HIGH items have been addressed; these are MEDIUM-priority.

---

## CSS Class Names

| File | Class | Sport | Notes |
|------|-------|-------|-------|
| `styles/pages.css:127` | `.pitcher-label` | Baseball | Defined in CSS, never referenced in JS/HTML — likely dead |
| `styles/pages.css:131` | `.batter-label` | Baseball | Defined in CSS, never referenced in JS/HTML — likely dead |
| `styles/pages.css:229` | `.strike-target` | Bowling | Used in `roundRowRenderer.js:70` |
| `styles/pages.css:388` | `.frame-row` | Bowling | Used in JS HTML templates |
| `styles/pages.css:417` | `.frame-info` | Bowling | Used in JS HTML templates |
| `styles/pages.css:422` | `.frame-label` | Bowling | Used in JS HTML templates |
| `styles/pages.css:429` | `.frame-machine` | Bowling | Used in JS HTML templates |
| `styles/pages.css:435` | `.frame-inputs-container` | Bowling | Used in JS HTML templates |
| `styles/pages.css:457` | `.save-frame-button` | Bowling | Used in JS HTML templates |
| `styles/baseball.css:15` | `.matchup-inning` | Baseball | Used in `roundRowRenderer.js:330` |
| `styles/baseball.css:45` | `.player-row.pitcher` | Baseball | Defined in CSS, JS uses `.player-row` generically — may not be referenced |
| `styles/baseball.css:49` | `.player-row.batter` | Baseball | Same as above |
| `styles/golf.css:29` | `.golf-birdie` | Golf | Returned by `GolfEngine.getMarkFormatting()` (engine-owned) |
| `styles/golf.css:49` | `.golf-bogey` | Golf | Same — engine-owned |
| `styles/golf.css:57` | `.golf-double-bogey` | Golf | Same — engine-owned |
| `styles/golf.css:64` | `.golf-triple-bogey` | Golf | Same — engine-owned |

## Approach
CSS class renames are straightforward but touch multiple files (CSS definition + every JS/PHP file that generates the class string). Each rename requires updating both the style rule and all HTML template strings that reference it.

**Golf mark classes** (`.golf-birdie`, etc.) are returned by `GolfEngine.getMarkFormatting()` — a borderline case since the engine owns the mark terminology. But the CSS file is outside the engine boundary.

## Already Fixed (for reference)
- `scoreboardRenderer.js` — `innings` → `roundGroups`, hardcoded `'Inning '` → `engine.getRoundLabel()`
- `scoresPage.js` — duplicated Top/Bottom/inning logic → `engine.getRoundRowContext()`
- `dialogs.js` — removed dead `showPitcherAssignmentDialog` / `showBattingOrderDialog` aliases
- `printing.js` — renamed `.print-frame`/`.inning-header`/`.inning-score` → generic equivalents
- `styles/print.css` — renamed `.print-frame`/`.print-frame-header` → `.print-card`/`.print-card-header`
