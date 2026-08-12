/**
 * WPPR (World Pinball Player Rankings) Calculator
 * 
 * Implements the official IFPA WPPR v6.2 formulas for estimating
 * WPPR point distributions for a tournament.
 * 
 * @see https://www.ifpapinball.com/menu/ranking-info-2-2-2/
 * @module services/wpprCalculator
 */

/**
 * Event booster multiplier constants.
 */
export const EVENT_BOOSTERS = {
  NONE: { label: 'None', value: 1.0 },
  CERTIFIED: { label: 'Certified (125%)', value: 1.25 },
  CHAMPIONSHIP: { label: 'Championship Series (150%)', value: 1.5 },
  CERTIFIED_PLUS: { label: 'Certified+ (150%)', value: 1.5 },
  MAJOR: { label: 'Major (200%)', value: 2.0 },
};

/**
 * Calculates the base value of a tournament.
 * Base value = 0.5 WPPR per rated player, max 32 (at 64+ players).
 * 
 * @param {number} ratedPlayerCount - Number of IFPA-rated players.
 * @returns {number} Base value points.
 */
export function calculateBaseValue(ratedPlayerCount) {
  return Math.min(ratedPlayerCount * 0.5, 32);
}

/**
 * Calculates a single player's contribution to the Rating TVA.
 * Formula: (RATING * 0.000546875) - 0.703125
 * Players with rating <= 1285.71 contribute nothing.
 * 
 * @param {number} rating - The player's IFPA rating.
 * @returns {number} The player's contribution to the rating TVA (clamped to >= 0).
 */
export function calculateRatingContribution(rating) {
  if (!rating || rating <= 0) return 0;
  return Math.max(0, (rating * 0.000546875) - 0.703125);
}

/**
 * Calculates a single player's contribution to the Ranking TVA.
 * Formula: ln(RANKING) * -0.211675054 + 1.459827968
 * 
 * @param {number} ranking - The player's IFPA world ranking position.
 * @returns {number} The player's contribution to the ranking TVA (clamped to >= 0).
 */
export function calculateRankingContribution(ranking) {
  if (!ranking || ranking <= 0) return 0;
  return Math.max(0, Math.log(ranking) * -0.211675054 + 1.459827968);
}

/**
 * Calculates the Tournament Value Adjustment (TVA) based on player ratings.
 * Takes the best 64 rated players. Maximum TVA from ratings is 25 points.
 * 
 * @param {Array<{rating: number}>} players - Array of player objects with rating.
 * @returns {number} Rating TVA value (capped at 25).
 */
export function calculateRatingTVA(players) {
  const sorted = players
    .filter(p => p.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 64);

  const total = sorted.reduce((sum, p) => sum + calculateRatingContribution(p.rating), 0);
  return Math.min(total, 25);
}

/**
 * Calculates the Tournament Value Adjustment (TVA) based on player rankings.
 * Takes the best 64 ranked players. Maximum TVA from rankings is 50 points.
 * 
 * @param {Array<{ranking: number}>} players - Array of player objects with ranking.
 * @returns {number} Ranking TVA value (capped at 50).
 */
export function calculateRankingTVA(players) {
  const sorted = players
    .filter(p => p.ranking > 0)
    .sort((a, b) => a.ranking - b.ranking)
    .slice(0, 64);

  const total = sorted.reduce((sum, p) => sum + calculateRankingContribution(p.ranking), 0);
  return Math.min(total, 50);
}

/**
 * Calculates the first-place WPPR value for a tournament.
 * 
 * @param {Object} params - Tournament parameters.
 * @param {number} params.ratedPlayerCount - Number of rated players.
 * @param {Array<{rating: number, ranking: number}>} params.players - Player data.
 * @param {number} params.tgpPercent - TGP as a percentage (0-200).
 * @param {number} [params.eventBooster=1.0] - Event booster multiplier.
 * @returns {Object} Breakdown of the WPPR value calculation.
 */
export function calculateWPPRValue({ ratedPlayerCount, players, tgpPercent, eventBooster = 1.0 }) {
  const baseValue = calculateBaseValue(ratedPlayerCount);
  const ratingTVA = calculateRatingTVA(players);
  const rankingTVA = calculateRankingTVA(players);
  const tgpDecimal = Math.min(tgpPercent, 200) / 100;

  const rawValue = (baseValue + ratingTVA + rankingTVA) * tgpDecimal * eventBooster;
  const firstPlaceValue = Math.round(rawValue * 100) / 100;

  return {
    baseValue: Math.round(baseValue * 100) / 100,
    ratingTVA: Math.round(ratingTVA * 100) / 100,
    rankingTVA: Math.round(rankingTVA * 100) / 100,
    tgpPercent,
    eventBooster,
    firstPlaceValue,
  };
}

/**
 * Calculates the linear distribution component for a finishing position.
 * Formula: (PlayerCnt + 1 - Position) * 10/100 * (1st place value / PlayerCnt)
 * 
 * @param {number} position - Finishing position (1-indexed).
 * @param {number} playerCount - Total players.
 * @param {number} firstPlaceValue - WPPR value for 1st place.
 * @returns {number} Linear distribution points.
 */
export function calculateLinearPoints(position, playerCount, firstPlaceValue) {
  if (playerCount <= 0 || position <= 0 || position > playerCount) return 0;
  return (playerCount + 1 - position) * 0.10 * (firstPlaceValue / playerCount);
}

/**
 * Calculates the dynamic distribution component for a finishing position.
 * Formula: (1 - ((position - 1) / min(ratedPlayerCount/2, 64))^0.7)^3 * 90/100 * firstPlaceValue
 * Only applies to the top half of rated players (up to 64).
 * 
 * @param {number} position - Finishing position (1-indexed).
 * @param {number} ratedPlayerCount - Number of rated players.
 * @param {number} firstPlaceValue - WPPR value for 1st place.
 * @returns {number} Dynamic distribution points.
 */
export function calculateDynamicPoints(position, ratedPlayerCount, firstPlaceValue) {
  if (ratedPlayerCount <= 0 || position <= 0) return 0;

  const dynamicCutoff = Math.min(ratedPlayerCount / 2, 64);
  if (position - 1 >= dynamicCutoff) return 0;

  const ratio = (position - 1) / dynamicCutoff;
  const value = Math.pow(1 - Math.pow(ratio, 0.7), 3) * 0.90 * firstPlaceValue;
  return Math.max(0, value);
}

/**
 * Calculates the full WPPR distribution for all players in a tournament.
 * 
 * @param {Object} params - Tournament and player parameters.
 * @param {Array<{name: string, ifpaId?: string, rating?: number, ranking?: number}>} params.players - Player data.
 * @param {number} params.tgpPercent - TGP as a percentage (0-200).
 * @param {number} [params.eventBooster=1.0] - Event booster multiplier.
 * @returns {Object} Full calculation results including value breakdown and per-player distribution.
 */
export function calculateFullDistribution({ players, tgpPercent, eventBooster = 1.0 }) {
  const ratedPlayers = players.filter(p => p.rating > 0 || p.ranking > 0);
  const ratedPlayerCount = ratedPlayers.length || players.length;
  const playerCount = players.length;

  const wpprValue = calculateWPPRValue({
    ratedPlayerCount,
    players,
    tgpPercent,
    eventBooster,
  });

  // Calculate each player's contribution to the TVA
  const contributions = players.map(p => {
    const ratingContrib = calculateRatingContribution(p.rating || 0);
    const rankingContrib = calculateRankingContribution(p.ranking || 0);
    const baseContrib = ratedPlayerCount > 0 ? wpprValue.baseValue / ratedPlayerCount : 0;

    return {
      ...p,
      baseContribution: Math.round(baseContrib * 100) / 100,
      ratingContribution: Math.round(ratingContrib * 100) / 100,
      rankingContribution: Math.round(rankingContrib * 100) / 100,
      totalContribution: Math.round((baseContrib + ratingContrib + rankingContrib) * 100) / 100,
    };
  });

  // Sort players by total contribution descending (for the contributions table)
  contributions.sort((a, b) => a.name.localeCompare(b.name));

  // Calculate per-position distribution (handles IFPA tie averaging if scores/totals are present)
  const rawDist = [];
  for (let pos = 1; pos <= playerCount; pos++) {
    const linear = calculateLinearPoints(pos, playerCount, wpprValue.firstPlaceValue);
    const dynamic = calculateDynamicPoints(pos, ratedPlayerCount, wpprValue.firstPlaceValue);
    rawDist.push({ position: pos, linear, dynamic, total: linear + dynamic });
  }

  // Detect ties if players have 'total' score property
  const distribution = [];
  let i = 0;
  while (i < playerCount) {
    let j = i + 1;
    const currentScore = players[i]?.total;

    // Check for consecutive ties if total score is defined
    if (typeof currentScore === 'number') {
      while (j < playerCount && players[j]?.total === currentScore) {
        j++;
      }
    }

    const count = j - i;
    if (count > 1) {
      // Average the points across tied positions
      let sumLinear = 0;
      let sumDynamic = 0;
      for (let k = i; k < j; k++) {
        sumLinear += rawDist[k].linear;
        sumDynamic += rawDist[k].dynamic;
      }
      const avgLinear = sumLinear / count;
      const avgDynamic = sumDynamic / count;
      const avgTotal = avgLinear + avgDynamic;

      for (let k = i; k < j; k++) {
        distribution.push({
          position: k + 1,
          isTie: true,
          linear: Math.round(avgLinear * 100) / 100,
          dynamic: Math.round(avgDynamic * 100) / 100,
          total: Math.round(avgTotal * 100) / 100,
        });
      }
    } else {
      distribution.push({
        position: i + 1,
        isTie: false,
        linear: Math.round(rawDist[i].linear * 100) / 100,
        dynamic: Math.round(rawDist[i].dynamic * 100) / 100,
        total: Math.round(rawDist[i].total * 100) / 100,
      });
    }

    i = j;
  }

  return {
    playerCount,
    ratedPlayerCount,
    tgpPercent,
    eventBooster,
    wpprValue,
    distribution,
    contributions,
  };
}

/**
 * Calculates Pin-Golf Multiplier (PGM) and resulting TGP% based on IFPA guidelines.
 * 
 * 1. Average score = Sum of scores / Number of players
 * 2. Course average = Average score / Number of holes
 * 3. PGM = Course average / 3
 * 4. Meaningful games = PGM >= 1.0 ? numHoles : numHoles * PGM
 * 5. TGP% = min(200, meaningfulGames * 4)
 * 
 * @param {number} numHoles - Number of holes/machines played
 * @param {number} avgScore - Average total score across all players
 * @returns {Object} PGM calculation breakdown
 */
export function calculatePinGolfPGM(numHoles, avgScore) {
  if (!numHoles || numHoles <= 0) {
    return { numHoles: 0, avgScore: 0, courseAverage: 0, pgm: 1.0, meaningfulGames: 0, tgpPercent: 100 };
  }

  const courseAverage = avgScore / numHoles;
  const pgm = courseAverage / 3;
  const pgmMultiplier = pgm >= 1.0 ? 1.0 : pgm;
  const meaningfulGames = numHoles * pgmMultiplier;
  const tgpPercent = Math.min(200, Math.round(meaningfulGames * 4 * 100) / 100);

  return {
    numHoles,
    avgScore: Math.round(avgScore * 100) / 100,
    courseAverage: Math.round(courseAverage * 100) / 100,
    pgm: Math.round(pgm * 100) / 100,
    meaningfulGames: Math.round(meaningfulGames * 100) / 100,
    tgpPercent,
  };
}

