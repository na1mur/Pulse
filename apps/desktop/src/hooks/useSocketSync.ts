import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@repo/queries";
import { useTimerStore } from "../store/useTimerStore";

let socket: Socket | null = null;
let queryClientRef: QueryClient | null = null;

function getBaseURL() {
  return import.meta.env.VITE_API_URL ?? "http://localhost:3001";
}

function getAccessToken() {
  return localStorage.getItem("pulse-access-token");
}

function teardownSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

function bindSocketEvents(activeSocket: Socket) {
  activeSocket.on("connect", () => {
    console.log("Connected to Socket.IO sync server");
    activeSocket.emit("timer_status_request");
  });

  activeSocket.on("timer_started", (data) => {
    console.log("Sync event: timer_started received", data);
    useTimerStore.getState().syncTimerState({
      isRunning: true,
      startedAt: data.startedAt,
      elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
    });
  });

  activeSocket.on("timer_paused", (data) => {
    console.log("Sync event: timer_paused received", data);
    useTimerStore.getState().syncTimerState({
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun || 0,
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
      });
    }
  });

  activeSocket.on("timer_status_response", (data) => {
    console.log("Sync event: timer_status_response received", data);
    useTimerStore.getState().syncTimerState({
      isRunning: data.isRunning,
      startedAt: data.startedAt,
      elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
    });
  });

  activeSocket.on("goal_updated", () => {
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.todayStats });
    queryClientRef?.invalidateQueries({ queryKey: queryKeys.settings });
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

export function startTimer() {
  useTimerStore.getState().startTimer();
  const updatedState = useTimerStore.getState();
  emitTimerEvent("timer_start", {
    startedAt: updatedState.startedAt,
    elapsedBeforeCurrentRun: updatedState.elapsedBeforeCurrentRun,
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
    connectSocket();

    return () => {
      queryClientRef = null;
      teardownSocket();
    };
  }, [queryClient]);
}

export type UseSocketSyncReturn = {
  startTimer: typeof startTimer;
  pauseTimer: typeof pauseTimer;
  resetTimer: typeof resetTimerSync;
};
