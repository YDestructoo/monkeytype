/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-confusing-void-expression, @typescript-eslint/prefer-nullish-coalescing */
// Socket.io types are inherently any-typed and require loose type checking
import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import Logger from "../utils/logger";
import {
  setupQueueHandlers,
  initializeQueueMatchLoop,
} from "../socket/queue-handler";
import { setupMatchHandlers } from "../socket/match-handler";

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.IO server
 */
export function initializeSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env["FRONTEND_URL"] || "http://localhost:5173",
      credentials: true,
    },
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 1e6, // 1MB
  });

  // Middleware for authentication
  io.use((socket, next) => {
    const userId = socket.handshake.auth["userId"];
    const username = socket.handshake.auth["username"];

    if (!userId || !username) {
      return next(
        new Error("Authentication failed: missing userId or username"),
      );
    }

    // Store user info on socket
    socket.data.userId = userId;
    socket.data.username = username;

    Logger.info(
      `Socket authenticated for user ${userId} (${username}): ${socket.id}`,
    );
    next();
  });

  // Connection handler
  io.on("connection", (socket: Socket) => {
    Logger.info(`User ${socket.data.userId} connected: ${socket.id}`);

    // Set up PvP event handlers
    setupQueueHandlers(socket);
    setupMatchHandlers(socket);

    // Disconnect handler
    socket.on("disconnect", () => {
      Logger.info(`User ${socket.data.userId} disconnected: ${socket.id}`);
      // Cleanup will be handled by queue/match services
    });

    socket.on("error", (error) => {
      Logger.error(`Socket error for user ${socket.data.userId}: ${error}`);
    });
  });

  // Start queue matching loop
  initializeQueueMatchLoop();

  Logger.info("Socket.IO initialized successfully");
  return io;
}

/**
 * Get Socket.IO instance (must be called after initializeSocket)
 */
export function getSocket(): SocketIOServer {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initializeSocket first.");
  }
  return io;
}

/**
 * Emit event to specific user
 */
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!io) return;

  const sockets = io.sockets.sockets;
  sockets.forEach((socket) => {
    if (socket.data.userId === userId) {
      socket.emit(event, data);
    }
  });
}

/**
 * Emit event to multiple users
 */
export function emitToUsers(
  userIds: string[],
  event: string,
  data: unknown,
): void {
  if (!io) return;

  const sockets = io.sockets.sockets;
  sockets.forEach((socket) => {
    if (userIds.includes(socket.data.userId)) {
      socket.emit(event, data);
    }
  });
}

/**
 * Broadcast event to all connected users
 */
export function broadcastEvent(event: string, data: unknown): void {
  if (!io) return;
  io.emit(event, data);
}

/**
 * Get socket ID for a user
 */
export function getUserSocketId(userId: string): string | null {
  if (!io) return null;

  const sockets = io.sockets.sockets;
  for (const socket of sockets.values()) {
    if (socket.data.userId === userId) {
      return socket.id;
    }
  }

  return null;
}

/**
 * Get all connected user IDs
 */
export function getConnectedUsers(): Map<string, string> {
  if (!io) return new Map();

  const users = new Map<string, string>();
  const sockets = io.sockets.sockets;

  sockets.forEach((socket) => {
    users.set(socket.data.userId, socket.data.username);
  });

  return users;
}

/**
 * Check if user is connected
 */
export function isUserConnected(userId: string): boolean {
  if (!io) return false;

  const sockets = io.sockets.sockets;
  for (const socket of sockets.values()) {
    if (socket.data.userId === userId) {
      return true;
    }
  }

  return false;
}
