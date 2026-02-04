/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-explicit-any */
// MongoDB type assertions required due to library limitations
import { MongoError } from "mongodb";
import * as db from "../init/db";
import Logger from "../utils/logger";
import type { PvPMatch, PvPRanking } from "@monkeytype/contracts/pvp";

const COLLECTIONS = {
  RANKINGS: "pvp_rankings",
  MATCHES: "pvp_matches",
  MATCH_HISTORY: "pvp_match_history",
};

/**
 * Initialize PvP collections and indexes
 */
export async function initializePvPCollections(): Promise<void> {
  try {
    const database = db.getDb();
    if (!database) throw new Error("Database not initialized");

    // Create collections if they don't exist
    const collections = await database.listCollections().toArray();
    const collectionNames = new Set(collections.map((c) => c.name));

    if (!collectionNames.has(COLLECTIONS.RANKINGS)) {
      await database.createCollection(COLLECTIONS.RANKINGS);
      Logger.info(`Created collection: ${COLLECTIONS.RANKINGS}`);
    }

    if (!collectionNames.has(COLLECTIONS.MATCHES)) {
      await database.createCollection(COLLECTIONS.MATCHES);
      Logger.info(`Created collection: ${COLLECTIONS.MATCHES}`);
    }

    if (!collectionNames.has(COLLECTIONS.MATCH_HISTORY)) {
      await database.createCollection(COLLECTIONS.MATCH_HISTORY);
      Logger.info(`Created collection: ${COLLECTIONS.MATCH_HISTORY}`);
    }

    // Create indexes
    const rankingsCollection = database.collection<PvPRanking>(
      COLLECTIONS.RANKINGS,
    );
    await rankingsCollection.createIndex({ userId: 1 }, { unique: true });
    await rankingsCollection.createIndex({ elo: -1 });
    await rankingsCollection.createIndex({ createdAt: 1 });

    const matchesCollection = database.collection<PvPMatch>(
      COLLECTIONS.MATCHES,
    );
    await matchesCollection.createIndex({ player1Id: 1 });
    await matchesCollection.createIndex({ player2Id: 1 });
    await matchesCollection.createIndex({ status: 1 });
    await matchesCollection.createIndex({ createdAt: -1 });

    Logger.info("PvP collections initialized with indexes");
  } catch (error) {
    Logger.error(`Failed to initialize PvP collections: ${error}`);
    throw error;
  }
}

/**
 * RANKINGS CRUD
 */

export async function getRanking(userId: string): Promise<PvPRanking | null> {
  try {
    const collection = db.collection<PvPRanking>(COLLECTIONS.RANKINGS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await collection.findOne({ userId } as any);
  } catch (error) {
    Logger.error(`Failed to get ranking for user ${userId}: ${error}`);
    throw error;
  }
}

export async function createRanking(
  ranking: Omit<PvPRanking, "_id">,
): Promise<PvPRanking> {
  try {
    const collection = db.collection<PvPRanking>(COLLECTIONS.RANKINGS);
    const rankingWithId = { ...ranking, _id: ranking.userId } as PvPRanking & {
      _id: string;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await collection.insertOne(rankingWithId as any);
    return rankingWithId as PvPRanking;
  } catch (error) {
    if (error instanceof MongoError && error.code === 11000) {
      // Duplicate key error - user already has ranking
      Logger.warning(`Ranking already exists for user ${ranking.userId}`);
      const existing = await getRanking(ranking.userId);
      if (existing) return existing;
    }
    Logger.error(
      `Failed to create ranking for user ${ranking.userId}: ${error}`,
    );
    throw error;
  }
}

export async function updateRanking(
  userId: string,
  updates: Partial<PvPRanking>,
): Promise<PvPRanking | null> {
  try {
    const collection = db.collection<PvPRanking>(COLLECTIONS.RANKINGS);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await collection.findOneAndUpdate(
      { userId } as any,
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (result as any) || null;
  } catch (error) {
    Logger.error(`Failed to update ranking for user ${userId}: ${error}`);
    throw error;
  }
}

export async function getLeaderboard(
  limit: number = 50,
  offset: number = 0,
): Promise<{ leaderboard: PvPRanking[]; total: number }> {
  try {
    const collection = db.collection<PvPRanking>(COLLECTIONS.RANKINGS);

    const [leaderboard, total] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection
        .find({} as any)
        .sort({ elo: -1 })
        .limit(limit)
        .skip(offset)
        .toArray(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection.countDocuments({} as any),
    ]);

    return { leaderboard, total };
  } catch (error) {
    Logger.error(`Failed to get leaderboard: ${error}`);
    throw error;
  }
}

/**
 * MATCHES CRUD
 */

export async function createMatch(match: PvPMatch): Promise<PvPMatch> {
  try {
    const collection = db.collection<PvPMatch>(COLLECTIONS.MATCHES);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await collection.insertOne(match as any);
    return match;
  } catch (error) {
    Logger.error(`Failed to create match: ${error}`);
    throw error;
  }
}

export async function getMatch(matchId: string): Promise<PvPMatch | null> {
  try {
    const collection = db.collection<PvPMatch>(COLLECTIONS.MATCHES);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await collection.findOne({ _id: matchId } as any);
  } catch (error) {
    Logger.error(`Failed to get match ${matchId}: ${error}`);
    throw error;
  }
}

export async function updateMatch(
  matchId: string,
  updates: Partial<PvPMatch>,
): Promise<PvPMatch | null> {
  try {
    const collection = db.collection<PvPMatch>(COLLECTIONS.MATCHES);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await collection.findOneAndUpdate(
      { _id: matchId } as any,
      {
        $set: updates,
      },
      { returnDocument: "after" },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (result as any) || null;
  } catch (error) {
    Logger.error(`Failed to update match ${matchId}: ${error}`);
    throw error;
  }
}

export async function getMatchHistory(
  userId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<{ matches: PvPMatch[]; total: number }> {
  try {
    const collection = db.collection<PvPMatch>(COLLECTIONS.MATCHES);

    const query = {
      $or: [{ player1Id: userId }, { player2Id: userId }],
      status: "completed" as const,
    };

    const [matches, total] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection
        .find(query as any)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .toArray(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection.countDocuments(query as any),
    ]);

    return { matches, total };
  } catch (error) {
    Logger.error(`Failed to get match history for user ${userId}: ${error}`);
    throw error;
  }
}

export async function getActiveMatches(userId: string): Promise<PvPMatch[]> {
  try {
    const collection = db.collection<PvPMatch>(COLLECTIONS.MATCHES);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await collection
      .find({
        $or: [{ player1Id: userId }, { player2Id: userId }],
        status: "active" as const,
      } as any)
      .toArray();
  } catch (error) {
    Logger.error(`Failed to get active matches for user ${userId}: ${error}`);
    throw error;
  }
}
