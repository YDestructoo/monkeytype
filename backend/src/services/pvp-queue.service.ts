import Logger from "../utils/logger";
import { emitToUser } from "../init/socket";
import { createMatch, getRanking, createRanking } from "../dal/pvp";
import { v4 as uuidv4 } from "uuid";
import type { PvPMatch } from "@monkeytype/contracts/pvp";

type QueueEntry = {
  userId: string;
  username: string;
  socketId: string;
  joinedAt: number;
};

/**
 * In-memory FIFO queue for matchmaking
 */
class PvPQueue {
  private queue: QueueEntry[] = [];
  private userInQueue: Set<string> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private QUEUE_TIMEOUT = 30000; // 30 seconds
  private CLEANUP_INTERVAL = 5000; // 5 seconds

  constructor() {
    this.startCleanupJob();
  }

  /**
   * Join queue
   */
  join(userId: string, username: string, socketId: string): number {
    if (this.userInQueue.has(userId)) {
      Logger.warning(`User ${userId} already in queue`);
      return this.queue.length;
    }

    const entry: QueueEntry = {
      userId,
      username,
      socketId,
      joinedAt: Date.now(),
    };

    this.queue.push(entry);
    this.userInQueue.add(userId);

    Logger.info(
      `User ${userId} joined queue. Queue size: ${this.queue.length}`,
    );

    // Try to match players if queue size >= 2
    void this.tryMatch();

    return this.queue.length;
  }

  /**
   * Leave queue
   */
  leave(userId: string): boolean {
    const index = this.queue.findIndex((entry) => entry.userId === userId);

    if (index === -1) {
      Logger.warning(`User ${userId} not found in queue`);
      return false;
    }

    this.queue.splice(index, 1);
    this.userInQueue.delete(userId);

    Logger.info(`User ${userId} left queue. Queue size: ${this.queue.length}`);

    return true;
  }

  /**
   * Get queue size
   */
  getSize(): number {
    return this.queue.length;
  }

  /**
   * Get all users in queue
   */
  getQueueUsers(): QueueEntry[] {
    return [...this.queue];
  }

  /**
   * Check if user is in queue
   */
  isInQueue(userId: string): boolean {
    return this.userInQueue.has(userId);
  }

  /**
   * Try to match players (FIFO)
   */
  private async tryMatch(): Promise<void> {
    while (this.queue.length >= 2) {
      const player1 = this.queue.shift();
      const player2 = this.queue.shift();

      if (!player1 || !player2) break;

      this.userInQueue.delete(player1.userId);
      this.userInQueue.delete(player2.userId);

      try {
        await this.createMatch(player1, player2);
      } catch (error) {
        Logger.error(`Failed to create match: ${error}`);
        // Re-add players to queue if match creation fails
        this.queue.push(player1, player2);
        this.userInQueue.add(player1.userId);
        this.userInQueue.add(player2.userId);
      }
    }
  }

  /**
   * Create match and notify players
   */
  private async createMatch(
    player1: QueueEntry,
    player2: QueueEntry,
  ): Promise<void> {
    const matchId = uuidv4();
    const now = new Date();

    // Ensure both players have rankings
    let p1Ranking = await getRanking(player1.userId);
    p1Ranking ??= await createRanking({
      userId: player1.userId,
      username: player1.username,
      elo: 1000,
      wins: 0,
      losses: 0,
      matches: 0,
      lastMatchAt: null,
      createdAt: now,
      updatedAt: now,
    });

    let p2Ranking = await getRanking(player2.userId);
    p2Ranking ??= await createRanking({
      userId: player2.userId,
      username: player2.username,
      elo: 1000,
      wins: 0,
      losses: 0,
      matches: 0,
      lastMatchAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // Create match record
    const match: PvPMatch = {
      _id: matchId,
      player1Id: player1.userId,
      player1Username: player1.username,
      player2Id: player2.userId,
      player2Username: player2.username,
      player1Wpm: 0,
      player1Accuracy: 0,
      player2Wpm: 0,
      player2Accuracy: 0,
      winnerId: null,
      winnerName: null,
      player1EloChange: 0,
      player2EloChange: 0,
      matchDuration: 0,
      status: "active",
      createdAt: now,
      completedAt: null,
    };

    await createMatch(match);

    // Notify players
    emitToUser(player1.userId, "pvp:match_found", {
      matchId,
      opponent: {
        id: player2.userId,
        username: player2.username,
        elo: p2Ranking.elo,
      },
    });

    emitToUser(player2.userId, "pvp:match_found", {
      matchId,
      opponent: {
        id: player1.userId,
        username: player1.username,
        elo: p1Ranking.elo,
      },
    });

    Logger.info(
      `Match created: ${matchId} (${player1.username} vs ${player2.username})`,
    );
  }

  /**
   * Clean up stale queue entries
   */
  private cleanupStaleEntries(): void {
    const now = Date.now();
    const before = this.queue.length;

    this.queue = this.queue.filter((entry) => {
      const age = now - entry.joinedAt;
      if (age > this.QUEUE_TIMEOUT) {
        Logger.warning(
          `Removing stale queue entry for user ${entry.userId} (age: ${age}ms)`,
        );
        this.userInQueue.delete(entry.userId);

        // Notify user
        emitToUser(entry.userId, "pvp:queue_timeout", {
          message: "Queue timeout - you were removed",
        });

        return false;
      }
      return true;
    });

    if (before !== this.queue.length) {
      Logger.info(
        `Queue cleanup: removed ${before - this.queue.length} entries`,
      );
    }
  }

  /**
   * Start periodic cleanup job
   */
  private startCleanupJob(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleEntries();
    }, this.CLEANUP_INTERVAL);

    Logger.info("Queue cleanup job started");
  }

  /**
   * Stop cleanup job
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      Logger.info("Queue cleanup job stopped");
    }
  }
}

// Export singleton instance
export const pvpQueue = new PvPQueue();

/**
 * Join matchmaking queue
 */
export function joinQueue(
  userId: string,
  username: string,
  socketId: string,
): number {
  return pvpQueue.join(userId, username, socketId);
}

/**
 * Leave matchmaking queue
 */
export function leaveQueue(userId: string): boolean {
  return pvpQueue.leave(userId);
}

/**
 * Get queue size
 */
export function getQueueSize(): number {
  return pvpQueue.getSize();
}

/**
 * Get queue users
 */
export function getQueueUsers(): QueueEntry[] {
  return pvpQueue.getQueueUsers();
}

/**
 * Check if user is in queue
 */
export function isInQueue(userId: string): boolean {
  return pvpQueue.isInQueue(userId);
}

/**
 * Stop queue service
 */
export function stopQueueService(): void {
  pvpQueue.stop();
}
