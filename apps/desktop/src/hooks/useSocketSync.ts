import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useTimerStore } from "../store/useTimerStore";

let socket: Socket | null = null;

export function useSocketSync() {
  const queryClient = useQueryClient();
  const { syncTimerState, resetTimer } = useTimerStore();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const accessToken = localStorage.getItem("pulse-access-token");
    if (!accessToken) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      return;
    }

    // Connect to the Socket.IO server
    socket = io("http://localhost:3001", {
      auth: {
        token: accessToken,
      },
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to Socket.IO sync server");
      // Request current running timer state from other active devices
      socket?.emit("timer_status_request");
    });

    // Inbound listener: Another device started the timer
    socket.on("timer_started", (data) => {
      console.log("Sync event: timer_started received", data);
      syncTimerState({
        isRunning: true,
        startedAt: data.startedAt,
        elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
      });
    });

    // Inbound listener: Another device paused the timer
    socket.on("timer_paused", (data) => {
      console.log("Sync event: timer_paused received", data);
      syncTimerState({
        isRunning: false,
        startedAt: undefined,
        elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun || 0,
      });
      // Invalidate stats and sessions queries to reload new data
      queryClient.invalidateQueries();
    });

    // Inbound listener: Another device reset the timer
    socket.on("timer_reset", () => {
      console.log("Sync event: timer_reset received");
      resetTimer();
    });

    // Inbound listener: Another device requested the current running status
    socket.on("timer_status_request", (data) => {
      const state = useTimerStore.getState();
      if (state.isRunning && state.startedAt) {
        console.log(
          "Sync response: sending running status to",
          data.requesterId,
        );
        socket?.emit("timer_status_response", {
          requesterId: data.requesterId,
          isRunning: true,
          startedAt: state.startedAt,
          elapsedBeforeCurrentRun: state.elapsedBeforeCurrentRun,
        });
      }
    });

    // Inbound listener: Received timer status response from another device
    socket.on("timer_status_response", (data) => {
      console.log("Sync event: timer_status_response received", data);
      syncTimerState({
        isRunning: data.isRunning,
        startedAt: data.startedAt,
        elapsedBeforeCurrentRun: data.elapsedBeforeCurrentRun,
      });
    });

    // Inbound listener: Goal target or session update
    socket.on("goal_updated", () => {
      console.log("Sync event: goal_updated received");
      queryClient.invalidateQueries();
    });

    socket.on("session_created", () => {
      console.log("Sync event: session_created received");
      queryClient.invalidateQueries();
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from Socket.IO sync server");
    });

    return () => {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, [syncTimerState, resetTimer, queryClient]);

  // Outbound Trigger: Start timer locally and sync
  const startTimer = () => {
    const timerStore = useTimerStore.getState();
    timerStore.startTimer();

    // Fetch newly set state to emit to other devices
    const updatedState = useTimerStore.getState();
    if (socket && socket.connected) {
      socket.emit("timer_start", {
        startedAt: updatedState.startedAt,
        elapsedBeforeCurrentRun: updatedState.elapsedBeforeCurrentRun,
      });
    }
  };

  // Outbound Trigger: Pause timer locally and sync
  const pauseTimer = (currentElapsedMs: number) => {
    const timerStore = useTimerStore.getState();
    timerStore.pauseTimer();

    if (socket && socket.connected) {
      socket.emit("timer_pause", {
        elapsedBeforeCurrentRun: currentElapsedMs,
      });
    }
  };

  // Outbound Trigger: Reset timer locally and sync
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
    isConnected: socketRef.current?.connected || false,
  };
}
export type UseSocketSyncReturn = ReturnType<typeof useSocketSync>;
