import { Socket } from "socket.io";
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
// Socket.io data is typed as any
import * as PvPQueue from "../services/pvp-queue.service";
import * as PvPMatch from "../services/pvp-match.service";
import { getSocket } from "../init/socket";
import Logger from "../utils/logger";

const MATCH_CHECK_INTERVAL = 1000; // Check for matches every second
let matchCheckInterval: NodeJS.Timeout | null = null;

/**
 * Initialize the queue matching loop
 * Note: Matching is now handled internally by the queue service when players join
 * This interval is kept for potential future periodic checks
 */
export function initializeQueueMatchLoop(): void {
  if (matchCheckInterval) {
    clearInterval(matchCheckInterval);
  }

  // The queue service handles matching automatically in tryMatch()
  // This interval can be used for additional periodic checks if needed
  matchCheckInterval = setInterval(() => {
    // Placeholder for any periodic queue maintenance
    const queueSize = PvPQueue.getQueueSize();
    if (queueSize > 0) {
      Logger.info(`Queue status check: ${queueSize} players waiting`);
    }
  }, MATCH_CHECK_INTERVAL * 30); // Check every 30 seconds

  Logger.info("PvP queue monitoring started");
}

/**
 * Stop the queue matching loop
 */
export function stopQueueMatchLoop(): void {
  if (matchCheckInterval) {
    clearInterval(matchCheckInterval);
    matchCheckInterval = null;
    Logger.info("PvP queue monitoring stopped");
  }
}

/**
 * Set up Socket.IO event handlers for queue operations
 */
export function setupQueueHandlers(socket: Socket): void {
  /**
   * pvp:join_queue event
   * Player joins the matchmaking queue
   */
  socket.on("pvp:join_queue", async () => {
    try {
      const userId = socket.data.userId as string;
      const username = socket.data.username as string;
      const socketId = socket.id;

      if (!userId || !username) {
        socket.emit("error", { message: "User not authenticated" });
        return;
      }

      // Check if already in queue
      if (PvPQueue.isInQueue(userId)) {
        socket.emit("QUEUE_UPDATED", {
          queueSize: PvPQueue.getQueueSize(),
          inQueue: true,
        });
        return;
      }

      // Join queue (this will auto-trigger matching if 2+ players)
      const queueSize = PvPQueue.joinQueue(userId, username, socketId);

      // Join socket room for user-specific events
      await socket.join(`user:${userId}`);
      await socket.join("queue_room"); // For broadcasts

      // Notify player they joined queue
      socket.emit("pvp:queue_joined", {
        queueSize,
        message: "Joined queue",
      });

      // Notify all players in queue of updated size
      const io = getSocket();
      io.to("queue_room").emit("pvp:queue_status", {
        queueSize,
      });

      Logger.info(`${userId} joined PvP queue (size: ${queueSize})`);
    } catch (error) {
      Logger.error(error);
      socket.emit("error", { message: "Failed to join queue" });
    }
  });

  /**
   * pvp:leave_queue event
   * Player leaves the matchmaking queue
   */
  socket.on("pvp:leave_queue", async () => {
    try {
      const userId = socket.data.userId as string;
      if (!userId) return;

      if (!PvPQueue.isInQueue(userId)) {
        return;
      }

      PvPQueue.leaveQueue(userId);
      await socket.leave(`user:${userId}`);
      await socket.leave("queue_room");

      // Notify player they left queue
      socket.emit("pvp:queue_left", {
        message: "Left queue",
      });

      // Notify remaining players
      const io = getSocket();
      io.to("queue_room").emit("pvp:queue_status", {
        queueSize: PvPQueue.getQueueSize(),
      });

      Logger.info(
        `${userId} left PvP queue (size: ${PvPQueue.getQueueSize()})`,
      );
    } catch (error) {
      Logger.error(`Error leaving queue: ${error}`);
    }
  });

  /**
   * Accept match
   * Player joins the match room to start the game
   */
  socket.on("ACCEPT_MATCH", async (data: { matchId: string }) => {
    try {
      const userId = socket.data.userId as string;
      if (!userId) {
        socket.emit("error", { message: "User not authenticated" });
        return;
      }

      const { matchId } = data;

      // Join the match room
      await socket.join(matchId);

      // Start the match (notifies both players via emitToUser in service)
      await PvPMatch.startMatch(matchId);

      Logger.info(`${userId} accepted match ${matchId}`);
    } catch (error) {
      Logger.error(error);
      socket.emit("error", { message: "Failed to accept match" });
    }
  });

  /**
   * Decline match
   * Returns both players to queue
   */
  socket.on("DECLINE_MATCH", async (data: { matchId: string }) => {
    try {
      const userId = socket.data.userId as string;
      if (!userId) return;

      const { matchId } = data;

      // TODO: Implement decline logic in match service
      // - Cancel match
      // - Return both players to queue
      // - Notify opponent

      Logger.info(`${userId} declined match ${matchId}`);
    } catch (error) {
      Logger.error(`Error declining match: ${error}`);
    }
  });
}
