/**
 * Small helpers for Quick-Play session generation.
 */

import { getTargetScoreForDifficulty as resolveTarget, FORMAT_DEFAULTS } from './targetResolver.js';

export { FORMAT_DEFAULTS };

/**
 * Build a session name from optional custom name, location, date, and time.
 * @param {string} rawName - Optional custom event name (may be empty string)
 * @param {string} locationName - Location name
 * @param {string} date - Formatted date string
 * @param {string} time - Formatted time string
 * @returns {string} Composed session name
 */
export function generateSessionName(rawName, locationName, date, time) {
    return rawName
        ? `${rawName} - ${locationName} - ${date} - ${time}`
        : `${locationName} - ${date} - ${time}`;
}

/**
 * Randomly select a specified number of machines from the available pool.
 * Fills with random repeats if the pool is smaller than the requested count.
 * @param {Array} machines - Available machines at the location
 * @param {number} count - Number of machines to select
 * @returns {Array} Selected machines (may contain duplicates if pool < count)
 */
export function selectRandomMachines(machines, count) {
    const shuffled = [...machines].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);
    while (selected.length < count) {
        selected.push(machines[Math.floor(Math.random() * machines.length)]);
    }
    return selected;
}

/**
 * Look up the target score for a machine at a given difficulty level.
 * 
 * Delegates to {@link module:services/targetResolver.resolveTarget}.
 * Supports signature variants `(machine, difficulty, format)` and `(machine, format, difficulty)`.
 *
 * @param {Object} machine - Machine object with score targets
 * @param {string} [param2='med'] - Difficulty level or scoring format
 * @param {string} [param3='bowling'] - Scoring format or difficulty level
 * @returns {number} Resolved target score
 */
export function getTargetScoreForDifficulty(machine, param2 = 'med', param3 = 'bowling') {
    const isParam2Format = ['bowling', 'golf', 'baseball'].includes(String(param2).toLowerCase());
    const format = isParam2Format ? param2 : param3;
    const difficulty = isParam2Format ? param3 : param2;
    return resolveTarget(machine, format, difficulty);
}
