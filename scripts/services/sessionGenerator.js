/**
 * Small helpers for Quick-Play session generation.
 */

/**
 * Generate randomized par values for a golf session.
 * Guarantees at least one of each common par (3, 4, 5) for variety.
 * @param {string} format - Scoring format ('golf' or 'bowling')
 * @param {number} frameCount - Number of frames/rounds
 * @returns {number[]} Array of par values (empty for non-golf formats)
 */
export function generatePars(format, frameCount) {
    if (format !== 'golf') return [];
    const pars = [];
    // Guarantee at least one of each common par values for variety
    pars.push(3, 4, 5);
    while (pars.length < frameCount) {
        pars.push(Math.floor(Math.random() * 3) + 3); // 3,4,5
    }
    // Shuffle
    for (let i = pars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pars[i], pars[j]] = [pars[j], pars[i]];
    }
    return pars.slice(0, frameCount);
}

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
 * @returns {number} Target score for the difficulty, or 1000000 as fallback
 */
export function getTargetScoreForDifficulty(machine, difficulty) {
    const key = 'target' + difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    return machine[key] || 1000000;
}
