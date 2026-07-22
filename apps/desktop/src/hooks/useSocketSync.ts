import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  applyRemoteGoalUpdate,
  emitGoalAchievement,
  type GoalTargetFields,
} from "@repo/queries";
import type { GoalAchievementEvent } from "@repo/types";
import { refreshTokens } from "@repo/api-client";
import { useTimerStore } from "../store/useTimerStore";
import { storage } from "@/utils/api";

let socket: Socket | null = null;
let queryClientRef: QueryClient | null = null;

function getBaseURL() {
  return import.meta.env.VITE_API_URL ?? "http://localhost:3001";
}

function getAccessToken() {
  return storage.getAccessToken();
}

function teardownSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

let tokenRefreshHandler: (() => void) | null = null;

export function setTokenRefreshHandler(handler: () => void) {
  tokenRefreshHandler = handler;
}

export function runTokenRefreshHandler() {
  tokenRefreshHandler?.();
}

function bindSocketEvents(activeSocket: Socket) {
  activeSocket.on("connect", () => {
    console.log("Connected to Socket.IO sync server");
    void queryClientRef?.refetchQueries({ queryKey: queryKeys.settings });
    activeSocket.emit("timer_status_request");
  });

  activeSocket.on("timer_started", (data) => {
    console.log("Sync event: timer_started received", data);
    useTimerStore.getState().syncTimerState({
      isRunning: true,
      startedAt: data.startedAt,
      elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
      sessionTitle: data.sessionTitle,
    });
  });

  activeSocket.on("timer_paused", (data) => {
    console.log("Sync event: timer_paused received", data);
    useTimerStore.getState().syncTimerState({
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun || 0,
      sessionTitle: undefined,
    });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.todayStats });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.statsSummary });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.weekStats });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.todaySessions });
  });

  activeSocket.on("timer_reset", () => {
    console.log("Sync event: timer_reset received");
    useTimerStore.getState().resetTimer();
  });

  activeSocket.on("timer_status_request", (data) => {
    const state = useTimerStore.getState();
    if (state.isRunning && state.startedAt) {
      activeSocket.emit("timer_status_response", {
        requesterId: data.requesterId,
        isRunning: true,
        startedAt: state.startedAt,
        elapsedBeforeCurrentRun: state.elapsedBeforeCurrentRun,
        sessionTitle: state.sessionTitle,
      });
    }
  });

  activeSocket.on("timer_status_response", (data) => {
    console.log("Sync event: timer_status_response received", data);
    useTimerStore.getState().syncTimerState({
      isRunning: data.isRunning,
      startedAt: data.startedAt,
      elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
      sessionTitle: data.sessionTitle,
    });
  });

  activeSocket.on("goal_updated", (data: GoalTargetFields) => {
    if (queryClientRef) {
      applyRemoteGoalUpdate(queryClientRef, data);
    }
  });

  activeSocket.on("goal_achieved", (data: GoalAchievementEvent) => {
    emitGoalAchievement(data);
  });

  activeSocket.on("session_created", () => {
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.todayStats });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.statsSummary });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.weekStats });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.todaySessions });
  });

  activeSocket.on("disconnect", () => {
    console.log("Disconnected from Socket.IO sync server");
  });

  activeSocket.on("connect_error", async (err) => {
    console.warn("Socket connect_error:", err.message);
    const newToken = await refreshTokens(getBaseURL(), storage);
    if (newToken && activeSocket) {
      activeSocket.auth = { token: newToken };
      activeSocket.connect();
    }
  });
}

function connectSocket() {
  const accessToken = getAccessToken();
  if (!accessToken) {
    teardownSocket();
    return;
  }

  teardownSocket();
  socket = io(getBaseURL(), {
    auth: { token: accessToken },
    autoConnect: true,
    reconnection: true,
  });
  bindSocketEvents(socket);
}

function emitTimerEvent(event: string, data: unknown) {
  if (socket?.connected) {
    socket.emit(event, data);
    return;
  }
  connectSocket();
  socket?.emit(event, data);
}

export function reconnectTimerSocket() {
  connectSocket();
}

export function startTimer(title?: string) {
  useTimerStore.getState().startTimer(title);
  const updatedState = useTimerStore.getState();
  emitTimerEvent("timer_start", {
    startedAt: updatedState.startedAt,
    elapsedBeforeCurrentRun: updatedState.elapsedBeforeCurrentRun,
    sessionTitle: updatedState.sessionTitle,
  });
}

export function pauseTimer(currentElapsedMs: number) {
  useTimerStore.getState().pauseTimer();
  emitTimerEvent("timer_pause", {
    elapsedBeforeCurrentRun: currentElapsedMs,
  });
}

export function resetTimerSync() {
  useTimerStore.getState().resetTimer();
  emitTimerEvent("timer_reset", undefined);
}

/** Mount once near the app root to maintain the shared socket connection. */
export function useSocketSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClientRef = queryClient;
    setTokenRefreshHandler(() => {
      void queryClient.refetchQueries({ queryKey: queryKeys.settings });
    });
    connectSocket();

    return () => {
      queryClientRef = null;
      setTokenRefreshHandler(() => {});
      teardownSocket();
    };
  }, [queryClient]);
}

export type UseSocketSyncReturn = {
  startTimer: typeof startTimer;
  pauseTimer: typeof pauseTimer;
  resetTimer: typeof resetTimerSync;
};
