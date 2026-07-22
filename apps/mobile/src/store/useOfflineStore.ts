import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { PERSIST_STORE_KEYS } from "@repo/api-client";
import { scopedPersistStorage } from "./scopedStorage";

export interface PendingSession {
  localId: string;
  startTime: string;
  endTime: string;
  deviceId: string;
  title?: string;
  summary?: string;
}

interface OfflineStoreState {
  pendingSessions: PendingSession[];
  addPendingSession: (session: Omit<PendingSession, "localId">) => string;
  removePendingSession: (localId: string) => void;
  clearPendingSessions: () => void;
}

export const useOfflineStore = create<OfflineStoreState>()(
  persist(
    (set) => ({
      pendingSessions: [],

      addPendingSession: (session) => {
        const localId =
          Date.now().toString() + Math.random().toString(36).substring(2, 9);
        set((state) => ({
          pendingSessions: [...state.pendingSessions, { ...session, localId }],
        }));
        return localId;
      },

      removePendingSession: (localId) =>
        set((state) => ({
          pendingSessions: state.pendingSessions.filter(
            (s) => s.localId !== localId,
          ),
        })),

      clearPendingSessions: () => set({ pendingSessions: [] }),
    }),
    {
      name: PERSIST_STORE_KEYS.offline,
      storage: createJSONStorage(() => scopedPersistStorage),
    },
  ),
);
