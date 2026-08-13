/**
 * Converts bowling turn results into PinGolf-style stroke results using a top-down,
 * rank-preserving model.
 * 
 * Scoring & Ranking Principles:
 * - Par: 4 per hole (40 total par for a 10-hole game).
 * - Benchmark Par Bowling Score: 200 pins = 40 strokes (Even / E).
 * - Total strokes formula: T_raw = 100 - 0.3 * BowlingScore
 * - Strict Monotonic Order Preservation:
 *   - Players are sorted by their total bowling score descending.
 *   - Total stroke pools T are assigned sequentially to guarantee that a higher bowling score
 *     ALWAYS gets lower (better) golf strokes, and tied bowling scores get identical golf totals.
 * - Per-Frame Allocation:
 *   - Each player's stroke pool T is distributed across their 10 frames based on frame performance weights.
 *   - Strikes/Spares receive fewer strokes, open frames receive more strokes based on pinfall.
 *   - The Largest Remainder Method (Hamilton Method) ensures per-frame strokes sum to T EXACTLY.
 * 
 * @module services/bowlingToGolfConverter
 */

/** Par value for each converted hole */
export const GOLF_CONVERSION_PAR = 4;

/** Benchmark bowling score for Even Par (40 strokes) */
const BENCHMARK_PAR_BOWLING_SCORE = 200;

/** Maximum strokes any single hole can be assigned */
const MAX_HOLE_STROKES = 10;

/** Minimum strokes any single hole can be assigned */
const MIN_HOLE_STROKES = 1;

/**
 * Calculates raw target continuous golf strokes for a bowling score.
 * 200 pins -> 40 strokes.
 * 300 pins -> 10 strokes.
 * 0 pins -> 100 strokes.
 * 
 * @param {number} bowlingScore - Total bowling score.
 * @returns {number} Raw total golf strokes.
 */
export function calculateRawGolfTotal(bowlingScore) {
  const score = Math.max(0, Math.min(300, Number(bowlingScore) || 0));
  const raw = 100 - 0.3 * score;
  return Math.max(10, Math.min(100, Math.round(raw)));
}

/**
 * Returns golf-style CSS class for a stroke count relative to par.
 * 
 * @param {number} strokes - The final stroke count for the hole.
 * @param {number} par - The par value for the hole.
 * @returns {string} CSS class name for styling.
 */
function getGolfStyleClass(strokes, par) {
  const diff = strokes - par;
  if (diff <= -3) return 'golf-albatross';
  if (diff === -2) return 'golf-eagle';
  if (diff === -1) return 'golf-birdie';
  if (diff === 0) return '';
  if (diff === 1) return 'golf-bogey';
  if (diff === 2) return 'golf-double-bogey';
  if (diff >= 3) return 'golf-triple-bogey';
  return '';
}

/**
 * Formats a par-relative score for display.
 * 
 * @param {number} diff - Score relative to par (strokes - par).
 * @returns {string} Display string (e.g. "E", "+1", "-2").
 */
function formatParRelative(diff) {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : String(diff);
}

/**
 * Calculates a performance difficulty weight for a frame.
 * Lower weight = better performance (gets fewer strokes).
 * Higher weight = worse performance (gets more strokes).
 * 
 * @param {Object} turn - Bowling turn result.
 * @param {boolean} isLast - Whether this is the 10th frame.
 * @returns {number} Frame weight.
 */
function getFramePerformanceWeight(turn, isLast) {
  const mark = (turn.mark || turn.displayMark || '').trim();
  
  if (isLast) {
    if (mark === 'X X X') return 1.0;
    if (/^X X [\dX]/.test(mark)) return 1.5;
    if (/^X \d+\//.test(mark)) return 2.0;
    if (/^X \d+/.test(mark)) return 3.0;
    if (/^\d+\/ [\dX]/.test(mark)) return 2.2;
    if (/^\d+\/$/.test(mark)) return 2.5;
    if (/^\d+$/.test(mark)) return 4.0;
    
    // Open 10th frame
    const pinCount = Number(turn.score) || 0;
    return 3.0 + Math.max(0, 10 - pinCount) * 0.7;
  }

  switch (turn.type) {
    case 'strike': return 1.0;
    case 'spare2': return 2.0;
    case 'spare3': return 2.8;
    case 'open':
    default: {
      const pinCount = Number(turn.score) || (Number(turn.first || 0) + Number(turn.second || 0) + Number(turn.third || 0));
      return 3.0 + Math.max(0, 10 - pinCount) * 0.7;
    }
  }
}

/**
 * Distributes a target total stroke count T across N frames based on frame difficulty weights,
 * using the Largest Remainder Method (Hamilton Method) to guarantee sum(strokes) == T.
 * 
 * @param {Array<Object>} turnResults - Original bowling turn results.
 * @param {number} totalGolfStrokes - Total golf stroke pool for the player.
 * @returns {Array<number>} Integer strokes for each frame.
 */
function distributeStrokesToFrames(turnResults, totalGolfStrokes) {
  const numHoles = turnResults.length;
  if (numHoles === 0) return [];
  
  // Calculate weights for each frame
  const weights = turnResults.map((turn, index) => {
    const isLast = index === numHoles - 1;
    return getFramePerformanceWeight(turn, isLast);
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  
  // Continuous target strokes per frame
  const rawStrokes = weights.map(w => (totalGolfStrokes * w) / (totalWeight || 1));
  
  // Floor allocations bounded by MIN and MAX
  const integerStrokes = rawStrokes.map(r => Math.max(MIN_HOLE_STROKES, Math.min(MAX_HOLE_STROKES, Math.floor(r))));
  
  let currentSum = integerStrokes.reduce((sum, s) => sum + s, 0);
  let remainder = totalGolfStrokes - currentSum;
  
  // Largest Remainder Method for positive remainder
  if (remainder > 0) {
    const remainders = rawStrokes.map((r, i) => ({ index: i, rem: r - integerStrokes[i] }));
    remainders.sort((a, b) => b.rem - a.rem);
    
    for (let i = 0; i < remainders.length && remainder > 0; i++) {
      const idx = remainders[i].index;
      if (integerStrokes[idx] < MAX_HOLE_STROKES) {
        integerStrokes[idx]++;
        remainder--;
      }
    }
  }
  
  // Largest Remainder Method for negative remainder (if over-allocated due to bounds)
  if (remainder < 0) {
    const remainders = rawStrokes.map((r, i) => ({ index: i, rem: r - integerStrokes[i] }));
    remainders.sort((a, b) => a.rem - b.rem);
    
    for (let i = 0; i < remainders.length && remainder < 0; i++) {
      const idx = remainders[i].index;
      if (integerStrokes[idx] > MIN_HOLE_STROKES) {
        integerStrokes[idx]--;
        remainder++;
      }
    }
  }

  return integerStrokes;
}

/**
 * Converts a batch of player rows from Bowling to PinGolf stroke play.
 * Preserves strict monotonic ranking order:
 * Higher Bowling Score -> Strictly Lower (Better) Golf Strokes.
 * Tied Bowling Scores -> Equal Golf Strokes.
 * 
 * Mutates/updates the rows in-place and returns them.
 * 
 * @param {Array<Object>} rows - Player rows from standingsPage.
 * @param {Array<Object>} machines - Target machine definitions.
 * @returns {Array<Object>} Converted rows.
 */
export function convertAllBowlingToGolf(rows, machines = []) {
  if (!rows || rows.length === 0) return rows;

  // 1. Sort rows by bowling score descending to assign monotonic totals
  const sortedIndices = rows.map((row, idx) => ({
    row,
    idx,
    bowlingScore: Number(row.bowlingTotal ?? row.total ?? 0)
  })).sort((a, b) => b.bowlingScore - a.bowlingScore);

  // 2. Assign total golf strokes sequentially with monotonic guarantees
  const totalGolfStrokesMap = new Map();

  sortedIndices.forEach((item, rankIndex) => {
    const rawTarget = calculateRawGolfTotal(item.bowlingScore);

    if (rankIndex === 0) {
      totalGolfStrokesMap.set(item.idx, rawTarget);
    } else {
      const prev = sortedIndices[rankIndex - 1];
      const prevGolfStrokes = totalGolfStrokesMap.get(prev.idx);

      if (item.bowlingScore === prev.bowlingScore) {
        // Bowling tie -> Exact Golf tie
        totalGolfStrokesMap.set(item.idx, prevGolfStrokes);
      } else {
        // Bowling lower score -> Golf strokes MUST be strictly higher (+1 minimum)
        const monotonicMin = prevGolfStrokes + 1;
        totalGolfStrokesMap.set(item.idx, Math.max(rawTarget, monotonicMin));
      }
    }
  });

  // 3. Convert turn results for each row
  const par = GOLF_CONVERSION_PAR;

  rows.forEach((row, originalIndex) => {
    const totalStrokes = totalGolfStrokesMap.get(originalIndex);
    const bowlingTurnResults = row.turnResults || [];
    const numHoles = bowlingTurnResults.length;

    const frameStrokes = distributeStrokesToFrames(bowlingTurnResults, totalStrokes);

    let runningTotal = 0;
    const playedMachines = [];

    const golfTurnResults = bowlingTurnResults.map((origTurn, k) => {
      const strokes = frameStrokes[k] || par;
      runningTotal += strokes;

      const machine = machines.find(m => m.orderNumber === origTurn.orderNumber);
      if (machine) playedMachines.push(machine);

      const holeDiff = strokes - par;
      const styleClass = getGolfStyleClass(strokes, par);
      const cumulativePar = playedMachines.length * par;
      const cumulativeDiff = runningTotal - cumulativePar;

      return {
        ...origTurn,
        mark: String(strokes),
        score: strokes,
        played: origTurn.played,
        displayMark: String(strokes),
        styleClass,
        displayRoundTotal: formatParRelative(holeDiff),
        displayRunningTotal: `${runningTotal} (${formatParRelative(cumulativeDiff)})`,
        _bowlingMark: origTurn.displayMark || origTurn.mark,
        _bowlingType: origTurn.type
      };
    });

    const totalPar = numHoles * par;
    const parDiff = totalStrokes - totalPar;
    const totalDisplay = `${totalStrokes} (${formatParRelative(parDiff)})`;

    row.turnResults = golfTurnResults;
    row.total = totalStrokes;
    row.totalDisplay = totalDisplay;
    row.parDiff = parDiff;
  });

  return rows;
}

/**
 * Single-player helper for backwards compatibility.
 * Converted results for a single player turn set.
 * 
 * @param {Array<Object>} bowlingTurnResults - Turn results from BowlingEngine.calculateTurnResults().
 * @param {Array<Object>} machines - Machine definitions.
 * @returns {{ turnResults: Array<Object>, total: number, totalDisplay: string, parDiff: number }}
 */
export function convertBowlingToGolf(bowlingTurnResults, machines = []) {
  const bowlingTotal = bowlingTurnResults.reduce((sum, t) => sum + (Number(t.score) || 0), 0);
  const mockRow = { turnResults: bowlingTurnResults, bowlingTotal, total: bowlingTotal };
  
  convertAllBowlingToGolf([mockRow], machines);

  return {
    turnResults: mockRow.turnResults,
    total: mockRow.total,
    totalDisplay: mockRow.totalDisplay,
    parDiff: mockRow.parDiff
  };
}
