/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-explicit-any */
// Express req and ts-rest params/query are not properly typed
import { initServer } from "@ts-rest/express";
import { pvpContract } from "@monkeytype/contracts/pvp";
import Logger from "../../utils/logger";
import { getRanking, getLeaderboard, getMatchHistory } from "../../dal/pvp";
import {
  joinQueue,
  leaveQueue,
  isInQueue,
} from "../../services/pvp-queue.service";
import MonkeyError from "../../utils/error";

const s = initServer();

export default s.router(pvpContract, {
  getRanking: {
    handler: async ({ params }) => {
      try {
        const { userId } = params;
        const ranking = await getRanking(userId);

        if (!ranking) {
          throw new MonkeyError(404, `No ranking found for user ${userId}`);
        }

        return {
          status: 200 as const,
          body: {
            message: "Ranking retrieved",
            data: ranking,
          },
        };
      } catch (error) {
        Logger.error(`Error getting ranking: ${error}`);
        throw new MonkeyError(500, "Internal server error");
      }
    },
  },

  getLeaderboard: {
    handler: async ({ query }) => {
      try {
        const { limit, offset } = query;
        const result = await getLeaderboard(limit, offset);

        return {
          status: 200 as const,
          body: {
            message: "Leaderboard retrieved",
            data: result,
          },
        };
      } catch (error) {
        Logger.error(`Error getting leaderboard: ${error}`);
        throw new MonkeyError(500, "Internal server error");
      }
    },
  },

  joinQueue: {
    handler: async ({ req }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userId = (req as any).user?.id as string | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const username = (req as any).user?.username as string | undefined;

        if (!userId || !username) {
          throw new MonkeyError(409, "User not authenticated");
        }

        if (isInQueue(userId)) {
          throw new MonkeyError(409, "User already in queue");
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const socketId =
          ((req as any).user?.socketId as string | undefined) || "unknown";
        const queueSize = joinQueue(userId, username, socketId);

        return {
          status: 200 as const,
          body: {
            message: "Joined queue successfully",
            data: {
              queueId: userId,
              queueSize,
            },
          },
        };
      } catch (error) {
        Logger.error(`Error joining queue: ${error}`);
        throw new MonkeyError(409, "Failed to join queue");
      }
    },
  },

  leaveQueue: {
    handler: async ({ req }) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userId = (req as any).user?.id as string | undefined;

        if (!userId) {
          throw new MonkeyError(404, "User not authenticated");
        }

        const success = leaveQueue(userId);

        if (!success) {
          throw new MonkeyError(404, "User not in queue");
        }

        return {
          status: 200 as const,
          body: {
            message: "Left queue successfully",
            data: {},
          },
        };
      } catch (error) {
        Logger.error(`Error leaving queue: ${error}`);
        throw new MonkeyError(404, "Failed to leave queue");
      }
    },
  },

  getMatchHistory: {
    handler: async ({ params, query, req }) => {
      try {
        const { userId } = params;
        const { limit, offset } = query;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const requestingUserId = (req as any).user?.id as string | undefined;

        if (requestingUserId !== userId) {
          Logger.warning(
            `User ${requestingUserId} attempted to access ${userId}'s match history`,
          );
        }

        const result = await getMatchHistory(userId, limit, offset);

        return {
          status: 200 as const,
          body: {
            message: "Match history retrieved",
            data: result,
          },
        };
      } catch (error) {
        Logger.error(`Error getting match history: ${error}`);
        throw new MonkeyError(500, "Internal server error");
      }
    },
  },
});
