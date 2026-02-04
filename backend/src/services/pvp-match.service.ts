import Logger from "../utils/logger";
import { getMatch, updateMatch, getRanking, updateRanking } from "../dal/pvp";
import { emitToUser } from "../init/socket";
import { calculateEloChange } from "../utils/elo.utils";

type MatchProgress = {
  userId: string;
  wpm: number;
  accuracy: number;
  timestamp: number;
};

/**
 * Track active match progress
 */
class MatchProgressTracker {
  private progress: Map<string, MatchProgress> = new Map();

  updateProgress(userId: string, wpm: number, accuracy: number): void {
    this.progress.set(userId, {
      userId,
      wpm,
      accuracy,
      timestamp: Date.now(),
    });
  }

  getProgress(userId: string): MatchProgress | undefined {
    return this.progress.get(userId);
  }

  clearMatch(player1Id: string, player2Id: string): void {
    this.progress.delete(player1Id);
    this.progress.delete(player2Id);
  }
}

const tracker = new MatchProgressTracker();

const MATCH_TIMEOUT = 120000; // 120 seconds
const activeMatches = new Map<string, NodeJS.Timeout>();

/**
 * Start a match
 */
export async function startMatch(matchId: string): Promise<void> {
  try {
    const match = await getMatch(matchId);
    if (!match) {
      Logger.error(`Match ${matchId} not found`);
      return;
    }

    const gameStartPayload = {
      matchId,
      player1: {
        id: match.player1Id,
        username: match.player1Username,
      },
      player2: {
        id: match.player2Id,
        username: match.player2Username,
      },
      startTime: Date.now(),
      testDuration: 60, // 60 second typing test
    };

    // Notify both players
    emitToUser(match.player1Id, "pvp:game_start", gameStartPayload);
    emitToUser(match.player2Id, "pvp:game_start", gameStartPayload);

    // Set match timeout
    const timeout = setTimeout(() => {
      void handleMatchTimeout(matchId);
    }, MATCH_TIMEOUT);

    activeMatches.set(matchId, timeout);

    Logger.info(`Match ${matchId} started`);
  } catch (error) {
    Logger.error(`Failed to start match ${matchId}: ${error}`);
  }
}

/**
 * Handle player progress update during match
 */
export async function handleProgressUpdate(
  matchId: string,
  userId: string,
  wpm: number,
  accuracy: number,
): Promise<void> {
  try {
    const match = await getMatch(matchId);
    if (!match || match.status !== "active") {
      Logger.warning(`Match ${matchId} not active or not found`);
      return;
    }

    // Update progress tracker
    tracker.updateProgress(userId, wpm, accuracy);

    // Update match record
    if (userId === match.player1Id) {
      await updateMatch(matchId, {
        player1Wpm: wpm,
        player1Accuracy: accuracy,
      });
    } else if (userId === match.player2Id) {
      await updateMatch(matchId, {
        player2Wpm: wpm,
        player2Accuracy: accuracy,
      });
    }

    // Send opponent's progress to the other player
    const opponentId =
      userId === match.player1Id ? match.player2Id : match.player1Id;

    emitToUser(opponentId, "pvp:opponent_progress", {
      matchId,
      opponentWpm: wpm,
      opponentAccuracy: accuracy,
      timestamp: Date.now(),
    });

    Logger.info(`Progress update for match ${matchId}: ${userId} (${wpm} WPM)`);
  } catch (error) {
    Logger.error(
      `Failed to handle progress update for match ${matchId}: ${error}`,
    );
  }
}

/**
 * Handle player completion
 */
export async function handleMatchComplete(
  matchId: string,
  userId: string,
  finalWpm: number,
  finalAccuracy: number,
): Promise<void> {
  try {
    const match = await getMatch(matchId);
    if (!match || match.status !== "active") {
      Logger.warning(`Match ${matchId} not active or not found`);
      return;
    }

    // Update match record with final stats
    if (userId === match.player1Id) {
      await updateMatch(matchId, {
        player1Wpm: finalWpm,
        player1Accuracy: finalAccuracy,
      });
    } else if (userId === match.player2Id) {
      await updateMatch(matchId, {
        player2Wpm: finalWpm,
        player2Accuracy: finalAccuracy,
      });
    }

    // Check if both players have completed
    const updatedMatch = await getMatch(matchId);
    if (
      updatedMatch &&
      updatedMatch.player1Wpm > 0 &&
      updatedMatch.player2Wpm > 0
    ) {
      await finalizeMatch(matchId);
    }

    Logger.info(
      `Player ${userId} completed match ${matchId} (${finalWpm} WPM, ${finalAccuracy}% acc)`,
    );
  } catch (error) {
    Logger.error(`Failed to handle match completion for ${matchId}: ${error}`);
  }
}

/**
 * Finalize match and calculate results
 */
async function finalizeMatch(matchId: string): Promise<void> {
  try {
    const match = await getMatch(matchId);
    if (!match) {
      Logger.error(`Match ${matchId} not found for finalization`);
      return;
    }

    // Clear timeout
    const timeout = activeMatches.get(matchId);
    if (timeout) {
      clearTimeout(timeout);
      activeMatches.delete(matchId);
    }

    // Calculate winner (weighted score: 80% WPM + 20% accuracy)
    const player1Score = match.player1Wpm * 0.8 + match.player1Accuracy * 0.2;
    const player2Score = match.player2Wpm * 0.8 + match.player2Accuracy * 0.2;

    let winnerId: string | null = null;
    let winnerName: string | null = null;

    if (player1Score > player2Score) {
      winnerId = match.player1Id;
      winnerName = match.player1Username;
    } else if (player2Score > player1Score) {
      winnerId = match.player2Id;
      winnerName = match.player2Username;
    }

    // Get player rankings for ELO calculation
    const p1Ranking = await getRanking(match.player1Id);
    const p2Ranking = await getRanking(match.player2Id);

    if (!p1Ranking || !p2Ranking) {
      Logger.error(`Rankings not found for match ${matchId}`);
      return;
    }

    // Calculate ELO changes
    const p1Result =
      winnerId === match.player1Id ? 1 : winnerId === match.player2Id ? 0 : 0.5;
    const p2Result =
      winnerId === match.player2Id ? 1 : winnerId === match.player1Id ? 0 : 0.5;

    const p1EloChange = calculateEloChange(
      p1Ranking.elo,
      p2Ranking.elo,
      p1Result,
    );
    const p2EloChange = calculateEloChange(
      p2Ranking.elo,
      p1Ranking.elo,
      p2Result,
    );

    // Update rankings
    const now = new Date();
    await updateRanking(match.player1Id, {
      elo: p1Ranking.elo + p1EloChange,
      wins: match.player1Id === winnerId ? p1Ranking.wins + 1 : p1Ranking.wins,
      losses:
        match.player1Id !== winnerId && winnerId !== null
          ? p1Ranking.losses + 1
          : p1Ranking.losses,
      matches: p1Ranking.matches + 1,
      lastMatchAt: now,
    });

    await updateRanking(match.player2Id, {
      elo: p2Ranking.elo + p2EloChange,
      wins: match.player2Id === winnerId ? p2Ranking.wins + 1 : p2Ranking.wins,
      losses:
        match.player2Id !== winnerId && winnerId !== null
          ? p2Ranking.losses + 1
          : p2Ranking.losses,
      matches: p2Ranking.matches + 1,
      lastMatchAt: now,
    });

    // Calculate match duration
    const matchDuration = match.completedAt
      ? Math.floor(
          (match.completedAt.getTime() - match.createdAt.getTime()) / 1000,
        )
      : 60;

    // Update match record
    await updateMatch(matchId, {
      winnerId,
      winnerName,
      player1EloChange: p1EloChange,
      player2EloChange: p2EloChange,
      matchDuration,
      status: "completed",
      completedAt: now,
    });

    // Send results to both players
    const resultPayload = {
      matchId,
      winnerId,
      winnerName,
      player1Id: match.player1Id,
      player1Name: match.player1Username,
      player1Wpm: match.player1Wpm,
      player1Accuracy: match.player1Accuracy,
      player1EloChange: p1EloChange,
      player2Id: match.player2Id,
      player2Name: match.player2Username,
      player2Wpm: match.player2Wpm,
      player2Accuracy: match.player2Accuracy,
      player2EloChange: p2EloChange,
      matchDuration,
    };

    emitToUser(match.player1Id, "pvp:match_result", resultPayload);
    emitToUser(match.player2Id, "pvp:match_result", resultPayload);

    // Clean up tracker
    tracker.clearMatch(match.player1Id, match.player2Id);

    Logger.info(`Match ${matchId} finalized. Winner: ${winnerName ?? "Tie"}`);
  } catch (error) {
    Logger.error(`Failed to finalize match ${matchId}: ${error}`);
  }
}

/**
 * Handle match timeout (both players didn't finish)
 */
async function handleMatchTimeout(matchId: string): Promise<void> {
  try {
    const match = await getMatch(matchId);
    if (!match || match.status !== "active") {
      return;
    }

    Logger.warning(`Match ${matchId} timed out`);

    // Mark as completed even if not both finished
    await updateMatch(matchId, {
      status: "completed",
      completedAt: new Date(),
    });

    // Notify players of timeout
    emitToUser(match.player1Id, "pvp:match_timeout", {
      matchId,
      message: "Match timeout - game ended",
    });
    emitToUser(match.player2Id, "pvp:match_timeout", {
      matchId,
      message: "Match timeout - game ended",
    });

    tracker.clearMatch(match.player1Id, match.player2Id);
  } catch (error) {
    Logger.error(`Failed to handle match timeout for ${matchId}: ${error}`);
  }
}

/**
 * Handle player disconnect during match
 */
export async function handlePlayerDisconnect(userId: string): Promise<void> {
  try {
    // Find active matches for this user
    // For now, matches will timeout automatically
    Logger.info(`Player ${userId} disconnected`);
  } catch (error) {
    Logger.error(`Failed to handle player disconnect: ${error}`);
  }
}

/**
 * Clean up all active matches on shutdown
 */
export function cleanupMatches(): void {
  activeMatches.forEach((timeout) => clearTimeout(timeout));
  activeMatches.clear();
  Logger.info("Match cleanup completed");
}
