# Scoring Engine Contract

This document defines the public API that every scoring engine must expose.

## Core Architectural Principles

1. **Neutral Hierarchy Terminology:**
   - The application layer, database schema, and UI strictly use generic domain terms: **Games**, **Events**, **Rounds**, and **Matchups**.
   - The term "slots" is avoided across all modules.
2. **Encapsulated Format Logic:**
   - Engines contain all sport-specific calculations and role interpretations (e.g. mapping `player1` = Away / Pitcher and `player2` = Home / Batter in Baseball, or calculating marks/frames/strokes).
3. **Single Source of Truth for Calculations:**
   - The application layer and UI must **only ever query the engines** for format-specific logic:
     - How to display results, format marks, and render row summaries
     - How to calculate turn/matchup scores
     - How to compute season standings, weekly totals, and row aggregations.
   - Engines remain **data-only** (pure calculation/formatting logic) and perform no DOM manipulation or side-effects.

## Core Methods

| Method | Purpose | Input | Output | Notes |
|--------|---------|------|-------|------|
| `calculateTurnResults(machines, scoreMap)` | Compute the results for a single turn. | `machines: Machine[]`, `scoreMap: Record<string, number>` | `{ turnResults: TurnResult[], total: number, totalDisplay: string, homeScore?: number, awayScore?: number }` | `turnResults` contains per‑machine data used by the UI.  `total` is the numeric total for the turn.  `totalDisplay` is a formatted string for display.  `homeScore`/`awayScore` are returned by `BaseballEngine` for head-to-head matchup totals (player1=Home, player2=Away). |
| `buildRoundValues(target, base, multiplier, scalingType)` | Build the per‑machine values for a round. | `target: number`, `base: number`, `multiplier: number`, `scalingType: 'linear' | 'exponential'` | `Record<string, number>` mapping machine IDs to the value for that round.
| `getRunCount()` | Return the number of runs required to win a turn. | – | `number` |
| `getPinCount()` | Return the number of pins required to win a turn. | – | `number` |
| `getStrokes()` | Return the number of strokes required to win a turn. | – | `number` |
| `getRowSummaryData(round)` | Return a plain object describing a round summary. | `round: Round` | `{ header: string, metadata: Record<string, any> }` |
| `getPreviewRowData(frame)` | Return a preview of a frame for the UI. | `frame: Frame` | `{ header: string, metadata: Record<string, any> }` |
| `formatMark(turnResult)` | Return a string or markup that represents a turn result for the UI. | `turnResult: TurnResult` | `string` |

## Data Types

```ts
type Machine = {
  id: string;
  name: string;
  format: string;
  // …other properties used by the engine
};

type TurnResult = {
  machineId: string;
  score: number;
  bonus?: number;
  // …other fields that the UI may need
};

type Round = {
  number: number;
  target: number;
  // …other round‑specific data
};

type Frame = {
  number: number;
  // …frame‑specific data
};
```

## Rendering Responsibility

The engine **must not** generate HTML or manipulate the DOM.  All rendering
logic should live in the UI layer (e.g. `scripts/renderers/roundRowRenderer.js`).
The engine simply returns the data structures defined above.

## Extensibility

If a new scoring format is added, it should implement the same methods.  The
UI can then use the same renderer logic, passing in the appropriate engine.

## Example Implementation (BowlingEngine)

```js
export class BowlingEngine {
  calculateTurnResults(machines, scoreMap) {
    // ...implementation
    return { turnResults, total, totalDisplay };
  }
  // ...other methods as per the contract
}
```

> **Note:** `BaseballEngine` extends this contract by also returning `homeScore` and `awayScore` — the pre-computed matchup totals for the head-to-head game. The client sends these values to the server on each score save so that `event_matchups.player1_score/player2_score` matches the JS engine's display (single source of truth).

## Usage in the UI

```js
import { getScoringEngine } from '@core/engine.js';
import { roundRowRenderer } from '@renderers/roundRowRenderer.js';

const engine = getScoringEngine('bowling');
const { turnResults } = engine.calculateTurnResults(machines, scoreMap);
turnResults.forEach(tr => {
  const row = roundRowRenderer.renderTurn(tr, engine);
  container.appendChild(row);
});
```

---

This contract will be referenced throughout the refactor to ensure consistency
and to provide a clear target for the subsequent phases.
