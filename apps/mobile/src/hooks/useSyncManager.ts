import { useEffect, useCallback, useRef } from "react";
import { useOfflineStore } from "../store/useOfflineStore";
import { api } from "../utils/api";

export function useSyncManager() {
  const { pendingSessions, removePendingSession } = useOfflineStore();
  const isSyncing = useRef(false);

  const syncSessions = useCallback(async () => {
    // Prevent overlapping sync operations
    if (isSyncing.current || pendingSessions.length === 0) {
      return;
    }

    isSyncing.current = true;
    console.log(
      `Starting sync for ${pendingSessions.length} pending sessions...`,
    );

    const sessionsToSync = [...pendingSessions];

    for (const session of sessionsToSync) {
      try {
        await api.post("/sessions", {
          startTime: session.startTime,
          endTime: session.endTime,
          deviceId: session.deviceId,
          ...(session.title ? { title: session.title } : {}),
          ...(session.summary ? { summary: session.summary } : {}),
        });

        removePendingSession(session.localId);
        console.log(
          `Successfully synced session started at ${session.startTime}`,
        );
      } catch (error: any) {
        console.error(`Failed to sync session:`, error);

        // If it's a network/server connection error, halt sync loop
        if (!error.response || error.response.status >= 500) {
          break;
        }

        // If it's a validation error, discard
        if (error.response?.status === 400) {
          removePendingSession(session.localId);
        }
      }
    }

    isSyncing.current = false;
  }, [pendingSessions, removePendingSession]);

  useEffect(() => {
    // Try to sync on mount
    syncSessions();

    // Check periodically every 20 seconds on mobile
    const interval = setInterval(syncSessions, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [syncSessions]);

  return {
    syncSessions,
    pendingCount: pendingSessions.length,
  };
}
