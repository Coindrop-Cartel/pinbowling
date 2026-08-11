/**
 * Normalizes a single target API row by camelCasing field names,
 * coercing numeric fields to Number, and building a `values` map
 * from score1–score10.
 *
 * @param {Object} t - Raw target row from the API.
 * @param {string|number} t.id - Target record ID.
 * @param {string|number} t.event_id - Event ID this target belongs to.
 * @param {string|number} t.machine_id - Machine ID for this target.
 * @param {string|number} t.order_number - Display/sort order within the event.
 * @param {string|number} t.score1 - Target score for ball 1.
 * @param {string|number} [t.score2] - Target score for ball 2.
 * @param {string|number} [t.score3] - Target score for ball 3.
 * @param {string|number} [t.score4] - Target score for ball 4.
 * @param {string|number} [t.score5] - Target score for ball 5.
 * @param {string|number} [t.score6] - Target score for ball 6.
 * @param {string|number} [t.score7] - Target score for ball 7.
 * @param {string|number} [t.score8] - Target score for ball 8.
 * @param {string|number} [t.score9] - Target score for ball 9.
 * @param {string|number} [t.score10] - Target score for ball 10.
 * @returns {Object} Normalized target object.
 * @returns {number} returns.id - Target record ID.
 * @returns {Object<number, number>} returns.values - Map of ball number to target score.
 * @returns {number} returns.value1 - Primary target score (e.g. Strike/Par).
 */
export function normalizeTarget(t) {
  return {
    ...t,
    eventId: t.eventId || t.event_id,
    machineId: t.machineId || t.machine_id,
    machineName: t.machineName || t.machine_name,
    orderNumber: t.orderNumber || t.order_number,
    value1: Number(t.value1 || 0),
    value2: Number(t.value2 || 0),
    values: t.values || {
      1: Number(t.score1 || 0), 2: Number(t.score2 || 0), 3: Number(t.score3 || 0),
      4: Number(t.score4 || 0), 5: Number(t.score5 || 0), 6: Number(t.score6 || 0),
      7: Number(t.score7 || 0), 8: Number(t.score8 || 0), 9: Number(t.score9 || 0), 10: Number(t.score10 || 0)
    }
  };
}

/**
 * Normalizes an array of target API rows.
 *
 * @param {Object[]} arr - Array of raw target rows from the API.
 * @returns {Object[]} Array of normalized target objects.
 */
export function normalizeTargets(arr) {
  return (arr || []).map(normalizeTarget);
}

/**
 * Normalizes a single score API row by camelCasing field names.
 *
 * @param {Object} s - Raw score row from the API.
 * @param {string|number} s.player_id - Player ID.
 * @param {string|number} s.event_id - Event ID.
 * @param {string|number} s.order_number - Round/order number.
 * @param {string|number} s.machine_id - Machine ID.
 * @returns {{ playerId: number, eventId: number, orderNumber: number, machineId: number }}
 *   Normalized score with camelCase fields.
 */
export function normalizeScore(s) {
  return {
    ...s,
    playerId: s.playerId || s.player_id,
    eventId: s.eventId || s.event_id,
    orderNumber: s.orderNumber || s.order_number,
    machineId: s.machineId || s.machine_id
  };
}

/**
 * Normalizes an array of score API rows.
 *
 * @param {Object[]} arr - Array of raw score rows from the API.
 * @returns {Object[]} Array of normalized score objects.
 */
export function normalizeScores(arr) {
  return (arr || []).map(normalizeScore);
}

/**
 * Groups an array of targets into a map keyed by event ID.
 *
 * @param {Object[]} targets - Array of normalized target objects (each with an `eventId` property).
 * @returns {Object<number, Object[]>} Map of `{ [eventId]: target[] }`.
 */
export function groupTargetsByEvent(targets) {
  return (targets || []).reduce((acc, t) => {
    if (!acc[t.eventId]) acc[t.eventId] = [];
    acc[t.eventId].push(t);
    return acc;
  }, {});
}

/**
 * Groups an array of scores into a nested map keyed by event ID then player ID.
 *
 * @param {Object[]} scores - Array of normalized score objects (each with `eventId` and `playerId` properties).
 * @returns {Object<number, Object<number, Object[]>>} Nested map of `{ [eventId]: { [playerId]: score[] } }`.
 */
export function groupScoresByEventAndPlayer(scores) {
  return (scores || []).reduce((acc, s) => {
    if (!acc[s.eventId]) acc[s.eventId] = {};
    if (!acc[s.eventId][s.playerId]) acc[s.eventId][s.playerId] = [];
    acc[s.eventId][s.playerId].push(s);
    return acc;
  }, {});
}

/**
 * Groups an array of scores into a map keyed by player ID.
 *
 * @param {Object[]} scores - Array of normalized score objects (each with a `playerId` property).
 * @returns {Object<number, Object[]>} Map of `{ [playerId]: score[] }`.
 */
export function groupScoresByPlayer(scores) {
  return (scores || []).reduce((acc, s) => {
    if (!acc[s.playerId]) acc[s.playerId] = [];
    acc[s.playerId].push(s);
    return acc;
  }, {});
}

/**
 * Groups matchup rows by event ID.
 * @param {Object[]} matchups
 * @returns {Object<number, Object[]>}
 */
export function groupMatchupsByEvent(matchups) {
  return (matchups || []).reduce((acc, matchup) => {
    const eventId = matchup.eventId || matchup.event_id;
    if (!acc[eventId]) acc[eventId] = [];
    acc[eventId].push(matchup);
    return acc;
  }, {});
}

/**
 * Flattens a list of event-matchup wrappers into a single array of matchup entries.
 *
 * The API always returns matchups as a list of wrapper objects, each with an
 * `entries` array. This helper extracts all individual matchup entries from
 * every wrapper into a flat list so callers can iterate them without checking
 * two different data shapes.
 *
 * @param {Object[]} eventMatchups Array of event-matchup wrapper objects.
 * @returns {Object[]} Flat array of matchup entry objects.
 */
export function flattenMatchupEntries(eventMatchups) {
  return (eventMatchups || []).flatMap(em => em.entries || (Array.isArray(em) ? em : []));
}

/**
 * Builds a score map from an array of score rows, keyed by order number.
 * Each entry contains ball scores as `{ ball1, ball2, ball3 }`.
 *
 * @param {Object[]} rows - Array of score row objects with `orderNumber`, `ball1`, `ball2`, `ball3` properties.
 * @returns {Object<string, { ball1: number, ball2: number, ball3: number }>}
 *   Map of `{ [orderNumber]: { ball1, ball2, ball3 } }`.
 */
export function buildScoreMapFromRows(rows) {
  return (rows || []).reduce((map, row) => {
    map[String(row.orderNumber)] = { ball1: Number(row.ball1), ball2: Number(row.ball2), ball3: Number(row.ball3) };
    return map;
  }, {});
}

/**
 * Reads DOM `.round-row` elements within a container and builds a score map
 * keyed by order number. Each entry contains ball scores from `[data-ball]` inputs.
 *
 * @param {HTMLElement} container - DOM element containing `.round-row` elements with `[data-ball]` inputs.
 * @returns {Object<string, { ball1: number, ball2: number, ball3: number }>}
 *   Map of `{ [orderNumber]: { ball1, ball2, ball3 } }`.
 */
export function buildScoreMapFromDOM(container) {
  const map = {};
  if (!container) return map;
  const rows = container.querySelectorAll('.round-row');
  rows.forEach(row => {
    const orderNum = Number(row.dataset.orderNumber);
    const bySection = {};
    const byPlayer = {};

    const participantSections = row.querySelectorAll('.participant-section');
    if (participantSections.length > 0) {
      participantSections.forEach(secEl => {
        const secInput = secEl.querySelector('input[data-section-key]');
        const sectionKey = secInput ? secInput.dataset.sectionKey : (secEl.classList.contains('player1-section') ? 'player1' : 'player2');
        const playerId = secInput?.dataset.playerId;

        const b1El = secEl.querySelector('[data-ball="1"]');
        const b2El = secEl.querySelector('[data-ball="2"]');
        const b3El = secEl.querySelector('[data-ball="3"]');
        const ball1 = b1El ? Number(String(b1El.value || '').replace(/\D/g, '')) || 0 : 0;
        const ball2 = b2El ? Number(String(b2El.value || '').replace(/\D/g, '')) || 0 : 0;
        const ball3 = b3El ? Number(String(b3El.value || '').replace(/\D/g, '')) || 0 : 0;
        const entry = { ball1, ball2, ball3 };

        bySection[sectionKey] = entry;
        if (playerId) {
          byPlayer[playerId] = entry;
        }
      });
    }

    // Default ball1, ball2, ball3 for flat lookup
    // Prefer input with data-is-active-participant="true" if present
    let ball1El = row.querySelector('input[data-is-active-participant="true"][data-ball="1"]') || row.querySelector('[data-ball="1"]');
    let ball2El = row.querySelector('input[data-is-active-participant="true"][data-ball="2"]') || row.querySelector('[data-ball="2"]');
    let ball3El = row.querySelector('input[data-is-active-participant="true"][data-ball="3"]') || row.querySelector('[data-ball="3"]');

    const ball1 = ball1El ? Number(String(ball1El.value || '').replace(/\D/g, '')) || 0 : 0;
    const ball2 = ball2El ? Number(String(ball2El.value || '').replace(/\D/g, '')) || 0 : 0;
    const ball3 = ball3El ? Number(String(ball3El.value || '').replace(/\D/g, '')) || 0 : 0;

    const entry = { ball1, ball2, ball3 };
    Object.defineProperty(entry, 'bySection', { value: bySection, enumerable: false, writable: true, configurable: true });
    Object.defineProperty(entry, 'byPlayer', { value: byPlayer, enumerable: false, writable: true, configurable: true });

    map[orderNum] = entry;
  });
  return map;
}
