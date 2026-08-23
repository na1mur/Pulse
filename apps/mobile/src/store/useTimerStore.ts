import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { TimerState } from "@repo/types";
import {
  applyIncomingTimerState,
  getLocalDayString,
  mergeTimerStates,
  type RemoteTimerSource,
} from "@repo/utils";
import { PERSIST_STORE_KEYS } from "@repo/api-client";
import { scopedPersistStorage } from "./scopedStorage";

interface TimerStoreState extends TimerState {
  /** In-memory stamp of the latest authoritative remote timer update. */
  remoteUpdatedAt?: number;
  startTimer: (title?: string, tagId?: string) => void;
  pauseTimer: () => void;
  resetTimer: () => void;
  syncTimerState: (state: TimerState) => void;
  applyRemoteTimerState: (
    state: TimerState,
    remoteUpdatedAt?: number,
    source?: RemoteTimerSource,
  ) => void;
}

export const useTimerStore = create<TimerStoreState>()(
  persist(
    (set) => ({
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: 0,
      lastActiveDate: undefined,
      sessionTitle: undefined,
      tagId: undefined,

      startTimer: (title?: string, tagId?: string) =>
        set((state) => {
          if (state.isRunning) return {};
          const today = getLocalDayString();
          const isNewDay =
            !!state.lastActiveDate && state.lastActiveDate !== today;
          return {
            isRunning: true,
            startedAt: Date.now(),
            sessionTitle: title?.trim() || state.sessionTitle || undefined,
            tagId: tagId || undefined,
            elapsedBeforeCurrentRun: isNewDay
              ? 0
              : state.elapsedBeforeCurrentRun,
            lastActiveDate: today,
            remoteUpdatedAt: Date.now(),
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
            remoteUpdatedAt: Date.now(),
          };
        }),

      resetTimer: () =>
        set({
          isRunning: false,
          startedAt: undefined,
          sessionTitle: undefined,
          tagId: undefined,
          elapsedBeforeCurrentRun: 0,
          lastActiveDate: getLocalDayString(),
          remoteUpdatedAt: Date.now(),
        }),

      syncTimerState: (incoming) =>
        set((state) => ({
          ...mergeTimerStates(state, incoming),
        })),

      applyRemoteTimerState: (incoming, remoteUpdatedAt, source = "reconcile") =>
        set((state) =>
          applyIncomingTimerState(
            state,
            incoming,
            remoteUpdatedAt,
            source,
          ),
        ),
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
        tagId: state.tagId,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as Partial<TimerStoreState>),
      }),
    },
  ),
);
