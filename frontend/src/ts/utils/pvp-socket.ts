import { io, Socket } from "socket.io-client";
import { getAuthenticatedUser } from "../firebase";

type PvPSocketEvents = {
  // Queue events
  "pvp:queue_joined": (data: { queueSize: number; message: string }) => void;
  "pvp:queue_left": (data: { message: string }) => void;
  "pvp:queue_status": (data: { queueSize: number }) => void;
  "pvp:match_found": (data: { opponent: string; matchId: string }) => void;

  // Match events
  "pvp:game_start": (data: { matchId: string; opponent: string }) => void;
  "pvp:opponent_progress": (data: {
    wpm: number;
    accuracy: number;
    timestamp: number;
  }) => void;
  "pvp:match_result": (data: {
    winner: string;
    yourStats: { wpm: number; accuracy: number; eloChange: number };
    opponentStats: { wpm: number; accuracy: number; eloChange: number };
    duration: number;
  }) => void;
  "pvp:opponent_disconnected": (data: { reason: string }) => void;

  // Error events
  "pvp:error": (data: { message: string }) => void;
};

type EventName = keyof PvPSocketEvents;
type EventHandler<T extends EventName> = PvPSocketEvents[T];

let socket: Socket | null = null;
const eventHandlers: Map<
  EventName,
  Set<(...args: unknown[]) => void>
> = new Map();

// Get backend URL from environment or default to localhost
const getBackendUrl = (): string => {
  // In production, this should be the actual backend URL
  // For development, use localhost with backend port
  const url = process.env["VITE_BACKEND_URL"];
  return url !== null && url !== undefined && url.length > 0
    ? url
    : "http://localhost:5005";
};

export function connect(): void {
  if (socket?.connected) {
    console.log("Socket already connected");
    return;
  }

  const user = getAuthenticatedUser();
  if (!user) {
    console.error("Cannot connect to PvP socket: user not authenticated");
    return;
  }

  const backendUrl = getBackendUrl();

  socket = io(backendUrl, {
    auth: {
      userId: user.uid,
      username:
        user.displayName !== null && user.displayName.length > 0
          ? user.displayName
          : user.email !== null && user.email.length > 0
            ? user.email
            : user.uid,
    },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  // Setup connection event handlers
  socket.on("connect", () => {
    console.log("Connected to PvP socket");
  });

  socket.on("disconnect", (reason) => {
    console.log("Disconnected from PvP socket:", reason);
  });

  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
  });

  // Forward all PvP events to registered handlers
  setupEventForwarding();
}

function setupEventForwarding(): void {
  if (!socket) return;

  const events: EventName[] = [
    "pvp:queue_joined",
    "pvp:queue_left",
    "pvp:queue_status",
    "pvp:match_found",
    "pvp:game_start",
    "pvp:opponent_progress",
    "pvp:match_result",
    "pvp:opponent_disconnected",
    "pvp:error",
  ];

  events.forEach((event) => {
    socket?.on(event, (...args: unknown[]) => {
      const handlers = eventHandlers.get(event);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(...args);
          } catch (error) {
            console.error(`Error in handler for ${event}:`, error);
          }
        });
      }
    });
  });
}

export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  eventHandlers.clear();
}

export function on<T extends EventName>(
  event: T,
  handler: EventHandler<T>,
): void {
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set());
  }
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.add(handler as (...args: unknown[]) => void);
  }
}

export function off<T extends EventName>(
  event: T,
  handler: EventHandler<T>,
): void {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    handlers.delete(handler as (...args: unknown[]) => void);
  }
}

export function emit(event: string, data?: unknown): void {
  if (!socket?.connected) {
    console.error("Cannot emit event: socket not connected");
    return;
  }
  socket.emit(event, data);
}

// PvP-specific actions
export async function joinQueue(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error("Socket not connected"));
      return;
    }

    emit("pvp:join_queue");

    // Wait for confirmation
    const timeout = setTimeout(() => {
      reject(new Error("Join queue timeout"));
    }, 5000);

    const handler = (): void => {
      clearTimeout(timeout);
      off("pvp:queue_joined", handler);
      off("pvp:error", errorHandler);
      resolve();
    };

    const errorHandler = (data: { message: string }): void => {
      clearTimeout(timeout);
      off("pvp:queue_joined", handler);
      off("pvp:error", errorHandler);
      reject(new Error(data.message));
    };

    on("pvp:queue_joined", handler);
    on("pvp:error", errorHandler);
  });
}

export async function leaveQueue(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error("Socket not connected"));
      return;
    }

    emit("pvp:leave_queue");

    // Wait for confirmation
    const timeout = setTimeout(() => {
      reject(new Error("Leave queue timeout"));
      return;
    }, 5000);

    const handler = (): void => {
      clearTimeout(timeout);
      off("pvp:queue_left", handler);
      off("pvp:error", errorHandler);
      resolve();
    };

    const errorHandler = (data: { message: string }): void => {
      clearTimeout(timeout);
      off("pvp:queue_left", handler);
      off("pvp:error", errorHandler);
      reject(new Error(data.message));
    };

    on("pvp:queue_left", handler);
    on("pvp:error", errorHandler);
  });
}

export function sendProgress(wpm: number, accuracy: number): void {
  if (!socket?.connected) return;

  emit("pvp:progress_update", {
    wpm,
    accuracy,
    timestamp: Date.now(),
  });
}

export function sendMatchComplete(wpm: number, accuracy: number): void {
  if (!socket?.connected) return;

  emit("pvp:match_complete", {
    wpm,
    accuracy,
    timestamp: Date.now(),
  });
}

export async function forfeit(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error("Socket not connected"));
      return;
    }

    emit("pvp:forfeit");

    // Wait for confirmation
    const timeout = setTimeout(() => {
      resolve(); // Resolve anyway after timeout
    }, 3000);

    const handler = (): void => {
      clearTimeout(timeout);
      off("pvp:match_result", handler);
      resolve();
    };

    on("pvp:match_result", handler);
  });
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

export function getSocket(): Socket | null {
  return socket;
}
