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

/**
 * Generate head-to-head matchup pairings for a baseball session.
 * Produces a round-robin schedule where each player faces every other player.
 *
 * For baseball, each inning has 2 machines (top and bottom). Each matchup is
 * assigned a sequential order number: 1 = Top of 1st, 2 = Bottom of 1st,
 * 3 = Top of 2nd, 4 = Bottom of 2nd, etc. Player1/player2 assignments stay
 * consistent across both halves of an inning — role alternation (Pitcher/Batter)
 * is determined by the order number parity (odd = top, even = bottom) in the
 * scoring engine, not by swapping player1/player2.
 *
 * For N players, there are N*(N-1)/2 unique pairings (single round-robin).
 * If the number of innings exceeds the number of unique pairings, the schedule
 * cycles through the same pairings again.
 *
 * @param {Array<{id: number, playerName?: string}>} players - Array of player objects
 * @param {number} inningCount - Number of innings (rounds) in the session
 * @param {Array<{machineId: number}>} machines - Array of machine objects for the session (2 per inning: top then bottom)
 * @returns {Array<{orderNumber: number, player1Id: number, player2Id: number, machineId: number}>}
 *   Array of matchup objects ready to be saved via PB_API.matchups.save()
 */
export function generateMatchups(players, inningCount, machines) {
    if (!players || players.length < 2 || inningCount < 1) return [];

    // Build all unique pairings (round-robin)
    const pairings = [];
    for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
            pairings.push({ player1Id: players[i].id, player2Id: players[j].id });
        }
    }

    // Cycle through pairings for additional innings.
    // player1/player2 stay consistent — role alternation is handled
    // by the scoring engine based on orderNumber parity.
    const allPairings = [...pairings];

    const matchups = [];
    for (let inning = 0; inning < inningCount; inning++) {
        const pairing = allPairings[inning % allPairings.length];
        
        // Each inning has 2 machines: top (even index) and bottom (odd index)
        const topMachine = machines[inning * 2] || machines[0];
        const bottomMachine = machines[inning * 2 + 1] || machines[1] || topMachine;
        
        // Top of inning (sequential orderNumber = inning*2 + 1)
        matchups.push({
            orderNumber: inning * 2 + 1,
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            machineId: topMachine.machineId || topMachine.id
        });
        
        // Bottom of inning (sequential orderNumber = inning*2 + 2)
        matchups.push({
            orderNumber: inning * 2 + 2,
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            machineId: bottomMachine.machineId || bottomMachine.id
        });
    }

    return matchups;
}
