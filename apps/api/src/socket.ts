import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "./utils/auth";
import {
  getActiveTimerForUser,
  persistTimerPause,
  persistTimerReset,
  persistTimerStart,
} from "./services/activeTimer";

let io: Server | null = null;

interface SocketWithUser extends Socket {
  userId?: string;
}

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: "*", // Adjust origins in production if necessary
      methods: ["GET", "POST"],
    },
  });

  // Authentication middleware for Socket.IO connections
  io.use((socket: SocketWithUser, next) => {
    try {
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const payload = verifyAccessToken(token);
      socket.userId = payload.userId;
      next();
    } catch (err) {
      console.error("Socket authentication error:", err);
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: SocketWithUser) => {
    const userId = socket.userId;
    if (!userId) {
      socket.disconnect();
      return;
    }

    const room = `user_${userId}`;
    socket.join(room);
    console.log(
      `Socket connected: ${socket.id} (User: ${userId}) joined room ${room}`,
    );

    socket.on("timer_start", async (data) => {
      await persistTimerStart(userId, data);
      socket.to(room).emit("timer_started", data);
    });

    socket.on("timer_pause", async (data) => {
      await persistTimerPause(userId, data);
      socket.to(room).emit("timer_paused", data);
    });

    socket.on("timer_reset", async (data?: { deviceId?: string }) => {
      await persistTimerReset(userId, data?.deviceId);
      socket.to(room).emit("timer_reset");
    });

    socket.on("timer_status_request", async () => {
      const activeTimer = await getActiveTimerForUser(userId);
      if (!activeTimer) return;

      socket.emit("timer_status_response", {
        requesterId: socket.id,
        isRunning: activeTimer.isRunning,
        startedAt: activeTimer.startedAt,
        elapsedBeforeCurrentRun: activeTimer.elapsedBeforeCurrentRun,
        sessionTitle: activeTimer.sessionTitle,
      });

      socket.to(room).emit("timer_status_request", { requesterId: socket.id });
    });

    socket.on("timer_status_response", (data) => {
      if (data.requesterId) {
        io?.to(data.requesterId).emit("timer_status_response", data);
      }
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function broadcastToUser(
  userId: string,
  event: string,
  data: unknown,
): void {
  if (io) {
    const room = `user_${userId}`;
    io.to(room).emit(event, data);
  }
}
