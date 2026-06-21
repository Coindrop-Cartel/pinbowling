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
 * For baseball, each inning has 2 machines (home and away). Each matchup is assigned
 * an order number corresponding to the inning it belongs to, with playerOrder indicating
 * home (1) or away (2). For N players, there are N*(N-1)/2 unique pairings (single round-robin).
 * If the number of innings exceeds the number of unique pairings, the schedule
 * cycles through the same pairings again. Role alternation (Pitcher/Batter)
 * is handled by the isBatter formula based on playerOrder,
 * so player1/player2 assignments remain consistent across all innings for the same pair of players.
 *
 * @param {Array<{id: number, playerName?: string}>} players - Array of player objects
 * @param {number} inningCount - Number of innings (rounds) in the session
 * @param {Array<{machineId: number}>} machines - Array of machine objects for the session (2 per inning: home then away)
 * @returns {Array<{orderNumber: number, player1Id: number, player2Id: number, machineId: number, playerOrder: number}>}
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
    // Role alternation (Pitcher/Batter) is handled by the isBatter formula
    // based on playerOrder, so player1/player2 must stay consistent
    // across all innings for the same pair of players.
    const allPairings = [...pairings];

    const matchups = [];
    for (let inning = 0; inning < inningCount; inning++) {
        const pairing = allPairings[inning % allPairings.length];
        
        // Each inning has 2 machines: home (even index) and away (odd index)
        const homeMachine = machines[inning * 2] || machines[0];
        const awayMachine = machines[inning * 2 + 1] || machines[1] || homeMachine;
        
        // Home (playerOrder 1): player1 is pitcher, player2 is batter
        matchups.push({
            orderNumber: inning + 1,
            playerOrder: 1,
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            machineId: homeMachine.machineId || homeMachine.id
        });
        
        // Away (playerOrder 2): roles are swapped (player2 is pitcher, player1 is batter)
        matchups.push({
            orderNumber: inning + 1,
            playerOrder: 2,
            player1Id: pairing.player2Id,
            player2Id: pairing.player1Id,
            machineId: awayMachine.machineId || awayMachine.id
        });
    }

    return matchups;
}
