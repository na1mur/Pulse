import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TimerState } from "@repo/types";
import { getLocalDayString } from "@repo/utils";
import { PERSIST_STORE_KEYS } from "@repo/api-client";
import { mergeTimerStates } from "@repo/utils";
import { scopedPersistStorage } from "./scopedStorage";

interface TimerStoreState extends TimerState {
  startTimer: (title?: string) => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  syncTimerState: (state: TimerState) => void;
  checkDayChange: () => void;
}

export const useTimerStore = create<TimerStoreState>()(
  persist(
    (set, get) => ({
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: 0,
      lastActiveDate: undefined,
      sessionTitle: undefined,

      startTimer: (title?: string) =>
        set((state) => {
          if (state.isRunning) return {};
          return {
            isRunning: true,
            startedAt: Date.now(),
            sessionTitle: title?.trim() || state.sessionTitle || undefined,
            lastActiveDate: getLocalDayString(),
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
            lastActiveDate: getLocalDayString(),
          };
        }),

      resetTimer: () =>
        set({
          isRunning: false,
          startedAt: undefined,
          sessionTitle: undefined,
          elapsedBeforeCurrentRun: 0,
          lastActiveDate: getLocalDayString(),
        }),

      syncTimerState: (incoming) =>
        set((state) => ({
          ...mergeTimerStates(state, incoming),
        })),

      checkDayChange: () => {
        const today = getLocalDayString();
        const state = get();
        if (!state.lastActiveDate || state.lastActiveDate === today) {
          if (state.lastActiveDate !== today) {
            set({ lastActiveDate: today });
          }
        }
      },
    }),
    {
      name: PERSIST_STORE_KEYS.timer,
      storage: createJSONStorage(() => scopedPersistStorage),
      partialize: (state) => ({
        isRunning: state.isRunning,
        startedAt: state.startedAt,
        elapsedBeforeCurrentRun: state.elapsedBeforeCurrentRun,
        lastActiveDate: state.lastActiveDate,
        sessionTitle: state.sessionTitle,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<TimerStoreState>),
      }),
    },
  ),
);
