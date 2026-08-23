import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TimerState } from "@repo/types";
import { getLocalDayString } from "@repo/utils";
import { PERSIST_STORE_KEYS } from "@repo/api-client";
import { mergeTimerStates } from "@repo/utils";
import { scopedPersistStorage } from "./scopedStorage";

interface TimerStoreState extends TimerState {
  /** In-memory stamp of the latest authoritative remote timer update. */
  remoteUpdatedAt?: number;
  startTimer: (title?: string) => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  syncTimerState: (state: TimerState) => void;
  applyRemoteTimerState: (state: TimerState, remoteUpdatedAt?: number) => void;
}

export const useTimerStore = create<TimerStoreState>()(
  persist(
    (set) => ({
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: 0,
      lastActiveDate: undefined,
      sessionTitle: undefined,

      startTimer: (title?: string) =>
        set((state) => {
          if (state.isRunning) return {};
          const today = getLocalDayString();
          const isNewDay =
            !!state.lastActiveDate && state.lastActiveDate !== today;
          return {
            isRunning: true,
            startedAt: Date.now(),
            sessionTitle: title?.trim() || state.sessionTitle || undefined,
            elapsedBeforeCurrentRun: isNewDay
              ? 0
              : state.elapsedBeforeCurrentRun,
            lastActiveDate: today,
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
          remoteUpdatedAt: undefined,
        }),

      syncTimerState: (incoming) =>
        set((state) => ({
          ...mergeTimerStates(state, incoming),
        })),

      applyRemoteTimerState: (incoming, remoteUpdatedAt) =>
        set((state) => {
          const nextUpdatedAt = remoteUpdatedAt ?? Date.now();
          if (
            state.remoteUpdatedAt != null &&
            nextUpdatedAt < state.remoteUpdatedAt
          ) {
            return state;
          }

          const today = getLocalDayString();
          const incomingDay =
            incoming.lastActiveDate ??
            (remoteUpdatedAt
              ? getLocalDayString(new Date(remoteUpdatedAt))
              : today);

          // Keep a same-day local timer, or an already-rolled reset. Only realign the
          // day marker when local elapsed still matches stale server data.
          if (state.lastActiveDate === today && incomingDay !== today) {
            if (
              state.elapsedBeforeCurrentRun === 0 ||
              state.elapsedBeforeCurrentRun !==
                incoming.elapsedBeforeCurrentRun
            ) {
              return { ...state, remoteUpdatedAt: nextUpdatedAt };
            }

            return {
              ...state,
              lastActiveDate: incomingDay,
              remoteUpdatedAt: nextUpdatedAt,
            };
          }

          if (incomingDay === today) {
            return {
              isRunning: incoming.isRunning,
              startedAt: incoming.isRunning ? incoming.startedAt : undefined,
              elapsedBeforeCurrentRun: incoming.elapsedBeforeCurrentRun,
              sessionTitle: incoming.sessionTitle,
              lastActiveDate: today,
              remoteUpdatedAt: nextUpdatedAt,
            };
          }

          return {
            isRunning: incoming.isRunning,
            startedAt: incoming.isRunning ? incoming.startedAt : undefined,
            elapsedBeforeCurrentRun: state.elapsedBeforeCurrentRun,
            sessionTitle: incoming.sessionTitle ?? state.sessionTitle,
            lastActiveDate: state.lastActiveDate ?? incomingDay,
            remoteUpdatedAt: nextUpdatedAt,
          };
        }),
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
