import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { responseWithData, MonkeyClientError } from "./util/api";

const c = initContract();

/**
 * PvP Game Schema Definitions
 */

// Ranking Entry
export const PvPRankingSchema = z.object({
  userId: z.string(),
  username: z.string(),
  elo: z.number().default(1000),
  wins: z.number().default(0),
  losses: z.number().default(0),
  matches: z.number().default(0),
  lastMatchAt: z.date().nullable().default(null),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type PvPRanking = z.infer<typeof PvPRankingSchema>;

// Match Details
export const PvPMatchSchema = z.object({
  _id: z.string(),
  player1Id: z.string(),
  player1Username: z.string(),
  player2Id: z.string(),
  player2Username: z.string(),
  player1Wpm: z.number(),
  player1Accuracy: z.number(),
  player2Wpm: z.number(),
  player2Accuracy: z.number(),
  winnerId: z.string().nullable().default(null),
  winnerName: z.string().nullable().default(null),
  player1EloChange: z.number().default(0),
  player2EloChange: z.number().default(0),
  matchDuration: z.number(), // seconds
  status: z.enum(["active", "completed", "cancelled"]),
  createdAt: z.date(),
  completedAt: z.date().nullable().default(null),
});

export type PvPMatch = z.infer<typeof PvPMatchSchema>;

// REST Contracts
export const pvpContract = c.router({
  // Get player ranking
  getRanking: {
    method: "GET",
    path: "/pvp/ranking/:userId",
    responses: {
      200: responseWithData(PvPRankingSchema),
      404: MonkeyClientError,
    },
  },

  // Get global leaderboard
  getLeaderboard: {
    method: "GET",
    path: "/pvp/leaderboard",
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    responses: {
      200: responseWithData(
        z.object({
          leaderboard: z.array(PvPRankingSchema),
          total: z.number(),
        }),
      ),
    },
  },

  // Join matchmaking queue
  joinQueue: {
    method: "POST",
    path: "/pvp/queue/join",
    body: z.object({}),
    responses: {
      200: responseWithData(
        z.object({
          queueId: z.string(),
          queueSize: z.number(),
        }),
      ),
      409: MonkeyClientError,
    },
  },

  // Leave matchmaking queue
  leaveQueue: {
    method: "DELETE",
    path: "/pvp/queue/leave",
    responses: {
      200: responseWithData(z.object({})),
      404: MonkeyClientError,
    },
  },

  // Get match history
  getMatchHistory: {
    method: "GET",
    path: "/pvp/history/:userId",
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }),
    responses: {
      200: responseWithData(
        z.object({
          matches: z.array(PvPMatchSchema),
          total: z.number(),
        }),
      ),
    },
  },
});

/**
 * Socket.IO Events - Client to Server
 */
export enum PvPClientEvent {
  JOIN_QUEUE = "pvp:join_queue",
  LEAVE_QUEUE = "pvp:leave_queue",
  GAME_START = "pvp:game_start",
  PROGRESS_UPDATE = "pvp:progress_update",
  MATCH_COMPLETE = "pvp:match_complete",
}

/**
 * Socket.IO Events - Server to Client
 */
export enum PvPServerEvent {
  QUEUE_JOINED = "pvp:queue_joined",
  QUEUE_LEFT = "pvp:queue_left",
  QUEUE_STATUS = "pvp:queue_status",
  MATCH_FOUND = "pvp:match_found",
  GAME_READY = "pvp:game_ready",
  OPPONENT_PROGRESS = "pvp:opponent_progress",
  MATCH_RESULT = "pvp:match_result",
  OPPONENT_DISCONNECTED = "pvp:opponent_disconnected",
  ERROR = "pvp:error",
}

// Socket event payloads
export const ProgressUpdateSchema = z.object({
  matchId: z.string(),
  wpm: z.number(),
  accuracy: z.number(),
  timestamp: z.number(),
});

export const MatchCompleteSchema = z.object({
  matchId: z.string(),
  finalWpm: z.number(),
  finalAccuracy: z.number(),
  timestamp: z.number(),
});

export const OpponentProgressSchema = z.object({
  matchId: z.string(),
  opponentWpm: z.number(),
  opponentAccuracy: z.number(),
  timestamp: z.number(),
});

export const MatchResultSchema = z.object({
  matchId: z.string(),
  winnerId: z.string().nullable(),
  winnerName: z.string().nullable(),
  player1Id: z.string(),
  player1Name: z.string(),
  player1Wpm: z.number(),
  player1Accuracy: z.number(),
  player1EloChange: z.number(),
  player2Id: z.string(),
  player2Name: z.string(),
  player2Wpm: z.number(),
  player2Accuracy: z.number(),
  player2EloChange: z.number(),
  matchDuration: z.number(),
});
