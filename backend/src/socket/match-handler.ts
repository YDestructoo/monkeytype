import { Socket } from "socket.io";
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-floating-promises */
// Socket.io data is typed as any, and async handlers don't need await in socket.io
import * as PvPMatch from "../services/pvp-match.service";
import Logger from "../utils/logger";

/**
 * Set up Socket.IO event handlers for match operations
 */
export function setupMatchHandlers(socket: Socket): void {
  /**
   * MATCH_PROGRESS event
   * Broadcast player's typing progress to opponent in real-time
   */
  socket.on(
    "MATCH_PROGRESS",
    async (data: { matchId: string; wpm: number; acc: number }) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        const { matchId, wpm, acc } = data;

        // Update progress in match service (this broadcasts to opponent)
        await PvPMatch.handleProgressUpdate(matchId, userId, wpm, acc);

        // Note: Broadcasting to opponent is handled in the service layer
      } catch (error) {
        Logger.error(error);
        socket.emit("error", { message: "Failed to update progress" });
      }
    },
  );

  /**
   * MATCH_COMPLETE event
   * Player submits final test results
   */
  socket.on(
    "MATCH_COMPLETE",
    async (data: { matchId: string; wpm: number; acc: number }) => {
      try {
        const userId = socket.data.userId as string;
        if (!userId) {
          socket.emit("error", { message: "User not authenticated" });
          return;
        }

        const { matchId, wpm, acc } = data;

        Logger.info(`Result submitted by ${userId} in ${matchId}: ${wpm} WPM`);

        // Notify opponent that player finished
        socket.to(matchId).emit("OPPONENT_FINISHED", {
          matchId,
          wpm,
          acc,
        });

        // Handle match completion (determines winner if both submitted)
        await PvPMatch.handleMatchComplete(matchId, userId, wpm, acc);

        // Note: Match result notification is handled in the service layer
        // when both players have completed via emitToUser()
      } catch (error) {
        Logger.error(`Error handling match completion: ${error}`);
        socket.emit("error", { message: "Failed to complete match" });
      }
    },
  );

  /**
   * FORFEIT event
   * Player forfeits/quits the match
   */
  socket.on("FORFEIT", async (data: { matchId: string }) => {
    try {
      const userId = socket.data.userId as string;
      if (!userId) return;

      const { matchId } = data;

      // Handle forfeit in match service
      await PvPMatch.handlePlayerDisconnect(userId);

      // Notify opponent
      socket.to(matchId).emit("OPPONENT_FORFEITED", {
        matchId,
      });

      Logger.info(`${userId} forfeited match ${matchId}`);

      // Leave room
      socket.leave(matchId);
    } catch (error) {
      Logger.error(`Error handling forfeit: ${error}`);
    }
  });

  /**
   * disconnect event
   * Handle player disconnection during match
   */
  socket.on("disconnect", async () => {
    try {
      const userId = socket.data.userId as string;
      if (!userId) return;

      // TODO: Find if player is in an active match
      // TODO: Handle disconnection (grace period for reconnect)
      // For now, we'll let the match service handle timeouts

      Logger.info(`${userId} disconnected`);
    } catch (error) {
      Logger.error(`Error handling disconnect: ${error}`);
    }
  });

  /**
   * RECONNECT event
   * Player reconnects to an active match
   */
  socket.on("RECONNECT", async (data: { matchId: string }) => {
    try {
      const userId = socket.data.userId as string;
      if (!userId) {
        socket.emit("error", { message: "User not authenticated" });
        return;
      }

      const { matchId } = data;

      // Rejoin the match room
      await socket.join(matchId);

      // TODO: Get current match state and send to reconnecting player
      // TODO: Notify opponent of reconnection

      socket.to(matchId).emit("OPPONENT_RECONNECTED", {
        matchId,
      });

      Logger.info(`${userId} reconnected to match ${matchId}`);
    } catch (error) {
      Logger.error(`Error handling reconnection: ${error}`);
      socket.emit("error", { message: "Failed to reconnect" });
    }
  });
}
