import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@repo/queries";
import { tokenStorage } from "@/utils/api";
import { useTimerStore } from "../store/useTimerStore";

let socket: Socket | null = null;

export function useSocketSync() {
  const queryClient = useQueryClient();
  const { syncTimerState, resetTimer } = useTimerStore();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let active = true;

    const setupSocket = async () => {
      const accessToken = await tokenStorage.getAccessToken();
      if (!accessToken) {
        if (socket) {
          socket.disconnect();
          socket = null;
        }
        if (active) setIsConnected(false);
        return;
      }

      if (socket) {
        socket.disconnect();
      }

      const baseURL =
        process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
      socket = io(baseURL, {
        auth: {
          token: accessToken,
        },
        autoConnect: true,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        console.log("Mobile connected to Socket.IO sync server");
        if (active) setIsConnected(true);
        socket?.emit("timer_status_request");
      });

      socket.on("timer_started", (data) => {
        console.log("Mobile sync: timer_started received", data);
        syncTimerState({
          isRunning: true,
          startedAt: data.startedAt,
          elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
        });
      });

      socket.on("timer_paused", (data) => {
        console.log("Mobile sync: timer_paused received", data);
        syncTimerState({
          isRunning: false,
          startedAt: undefined,
          elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun || 0,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
        queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
        queryClient.invalidateQueries({ queryKey: queryKeys.weekStats });
        queryClient.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
        queryClient.invalidateQueries({ queryKey: queryKeys.todaySessions });
      });

      socket.on("timer_reset", () => {
        console.log("Mobile sync: timer_reset received");
        resetTimer();
      });

      socket.on("timer_status_request", (data) => {
        const state = useTimerStore.getState();
        if (state.isRunning && state.startedAt) {
          socket?.emit("timer_status_response", {
            requesterId: data.requesterId,
            isRunning: true,
            startedAt: state.startedAt,
            elapsedBeforeCurrentRun: state.elapsedBeforeCurrentRun,
          });
        }
      });

      socket.on("timer_status_response", (data) => {
        console.log("Mobile sync: timer_status_response received", data);
        syncTimerState({
          isRunning: data.isRunning,
          startedAt: data.startedAt,
          elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
        });
      });

      socket.on("goal_updated", () => {
        console.log("Mobile sync: goal_updated received");
        queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
        queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      });

      socket.on("session_created", () => {
        console.log("Mobile sync: session_created received");
        queryClient.invalidateQueries({ queryKey: queryKeys.todayStats });
        queryClient.invalidateQueries({ queryKey: queryKeys.statsSummary });
        queryClient.invalidateQueries({ queryKey: queryKeys.weekStats });
        queryClient.invalidateQueries({ queryKey: queryKeys.weeklyTrend });
        queryClient.invalidateQueries({ queryKey: queryKeys.todaySessions });
      });

      socket.on("disconnect", () => {
        console.log("Mobile disconnected from Socket.IO server");
        if (active) setIsConnected(false);
      });
    };

    setupSocket();

    return () => {
      active = false;
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, [syncTimerState, resetTimer, queryClient]);

  const startTimer = () => {
    const timerStore = useTimerStore.getState();
    timerStore.startTimer();

    const updatedState = useTimerStore.getState();
    if (socket && socket.connected) {
      socket.emit("timer_start", {
        startedAt: updatedState.startedAt,
        elapsedBeforeCurrentRun: updatedState.elapsedBeforeCurrentRun,
      });
    }
  };

  const pauseTimer = (currentElapsedMs: number) => {
    const timerStore = useTimerStore.getState();
    timerStore.pauseTimer();

    if (socket && socket.connected) {
      socket.emit("timer_pause", {
        elapsedBeforeCurrentRun: currentElapsedMs,
      });
    }
  };

  const resetTimerLocally = () => {
    const timerStore = useTimerStore.getState();
    timerStore.resetTimer();

    if (socket && socket.connected) {
      socket.emit("timer_reset");
    }
  };

  return {
    startTimer,
    pauseTimer,
    resetTimer: resetTimerLocally,
    isConnected,
  };
}
