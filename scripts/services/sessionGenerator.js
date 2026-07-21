/**
 * Small helpers for Quick-Play session generation.
 */

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
 * Difficulty is mapped to a machine property key (e.g. 'easy' → 'targetEasy').
 * @param {Object} machine - Machine object with targetEasy/targetMed/targetHard properties
 * @param {string} difficulty - Difficulty level ('easy', 'med', or 'hard')
 * @param {string} [format='bowling'] - The format to lookup targets for
 * @returns {number} Target score for the difficulty, or 1000000 (5000000 for baseball) as fallback
 */
export function getTargetScoreForDifficulty(machine, difficulty, format = 'bowling') {
    const key = 'target' + difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    if (machine.scores && machine.scores[format] && machine.scores[format][key]) {
        return machine.scores[format][key];
    }
    if ((!machine.format || machine.format === format) && machine[key]) {
        return machine[key];
    }
    return (format === 'baseball' ? 5000000 : 1000000);
}


