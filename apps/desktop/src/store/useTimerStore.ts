import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TimerState } from "@repo/types";

interface TimerStoreState extends TimerState {
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  syncTimerState: (state: TimerState) => void;
}

export const useTimerStore = create<TimerStoreState>()(
  persist(
    (set) => ({
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: 0,

      startTimer: () =>
        set((state) => {
          if (state.isRunning) return {};
          return {
            isRunning: true,
            startedAt: Date.now(),
          };
        }),

      pauseTimer: () =>
        set((state) => {
          if (!state.isRunning || !state.startedAt) return {};
          const sessionElapsed = Date.now() - state.startedAt;
          return {
            isRunning: false,
            startedAt: undefined,
            elapsedBeforeCurrentRun:
              state.elapsedBeforeCurrentRun + sessionElapsed,
          };
        }),

      resetTimer: () =>
        set({
          isRunning: false,
          startedAt: undefined,
          elapsedBeforeCurrentRun: 0,
        }),

      syncTimerState: (state) =>
        set({
          isRunning: state.isRunning,
          startedAt: state.startedAt,
          elapsedBeforeCurrentRun: state.elapsedBeforeCurrentRun,
        }),
    }),
    {
      name: "pulse-timer-storage",
    },
  ),
);
