/**
 * ELO Rating Calculator
 *
 * Uses standard ELO formula:
 * newRating = oldRating + K × (result - expected)
 *
 * Where:
 * - K = rating volatility factor (32 for casual, 16 for experienced)
 * - result = 1 (win), 0.5 (draw), 0 (loss)
 * - expected = probability of winning based on rating difference
 */

const K_FACTOR = 32; // Moderate rating swings suitable for casual users

/**
 * Calculate expected win probability
 * Based on rating difference between two players
 */
function getExpectedScore(
  playerRating: number,
  opponentRating: number,
): number {
  const ratingDiff = opponentRating - playerRating;
  return 1 / (1 + Math.pow(10, ratingDiff / 400));
}

/**
 * Calculate ELO change for a player after a match
 * @param playerRating Current ELO rating
 * @param opponentRating Opponent's ELO rating
 * @param result Match result: 1 (win), 0.5 (draw), 0 (loss)
 * @returns ELO point change (can be negative)
 */
export function calculateEloChange(
  playerRating: number,
  opponentRating: number,
  result: number,
): number {
  const expected = getExpectedScore(playerRating, opponentRating);
  const change = K_FACTOR * (result - expected);

  // Round to nearest integer
  return Math.round(change);
}

/**
 * Calculate new rating after a match
 */
export function calculateNewRating(
  currentRating: number,
  opponentRating: number,
  result: number,
): number {
  const change = calculateEloChange(currentRating, opponentRating, result);
  const newRating = currentRating + change;

  // Ensure rating doesn't go below 0
  return Math.max(0, Math.round(newRating));
}

/**
 * Simulate rating change (for preview)
 */
export function simulateRatingChange(
  playerRating: number,
  opponentRating: number,
): { ifWin: number; ifLoss: number; ifDraw: number } {
  return {
    ifWin: calculateEloChange(playerRating, opponentRating, 1),
    ifLoss: calculateEloChange(playerRating, opponentRating, 0),
    ifDraw: calculateEloChange(playerRating, opponentRating, 0.5),
  };
}

/**
 * Get rating tier based on ELO
 * Used for rank badges/titles
 */
export function getRatingTier(elo: number): string {
  if (elo < 1000) return "Bronze";
  if (elo < 1200) return "Silver";
  if (elo < 1400) return "Gold";
  if (elo < 1600) return "Platinum";
  if (elo < 1800) return "Diamond";
  return "Immortal";
}

/**
 * Get win rate from match statistics
 */
export function getWinRate(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100);
}
