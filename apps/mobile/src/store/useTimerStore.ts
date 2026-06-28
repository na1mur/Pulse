import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TimerState } from "@repo/types";
import { asyncStorage } from "./storage";

interface TimerStoreState extends TimerState {
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  syncTimerState: (state: TimerState) => void;
  checkDayChange: () => void;
}

export const useTimerStore = create<TimerStoreState>()(
  persist(
    (set) => ({
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: 0,
      lastActiveDate: undefined,

      startTimer: () =>
        set((state) => {
          if (state.isRunning) return {};
          return {
            isRunning: true,
            startedAt: Date.now(),
            lastActiveDate: new Date().toDateString(),
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
            lastActiveDate: new Date().toDateString(),
          };
        }),

      resetTimer: () =>
        set({
          isRunning: false,
          startedAt: undefined,
          elapsedBeforeCurrentRun: 0,
          lastActiveDate: new Date().toDateString(),
        }),

      syncTimerState: (state) =>
        set({
          isRunning: state.isRunning,
          startedAt: state.startedAt,
          elapsedBeforeCurrentRun: state.elapsedBeforeCurrentRun,
          lastActiveDate: state.lastActiveDate || new Date().toDateString(),
        }),

      checkDayChange: () =>
        set((state) => {
          const today = new Date().toDateString();
          if (state.lastActiveDate && state.lastActiveDate !== today) {
            return {
              isRunning: false,
              startedAt: undefined,
              elapsedBeforeCurrentRun: 0,
              lastActiveDate: today,
            };
          }
          return { lastActiveDate: today };
        }),
    }),
    {
      name: "pulse-timer-storage",
      storage: createJSONStorage(() => asyncStorage),
    },
  ),
);

