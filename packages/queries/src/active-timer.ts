import type { AxiosInstance } from "axios";
import type { ActiveTimerState, TimerState } from "@repo/types";

export function activeTimerToTimerState(timer: ActiveTimerState): TimerState {
  return {
    isRunning: timer.isRunning,
    startedAt: timer.startedAt,
    elapsedBeforeCurrentRun: timer.elapsedBeforeCurrentRun,
    sessionTitle: timer.sessionTitle ?? undefined,
    lastActiveDate: new Date().toDateString(),
  };
}

function parseServerUpdatedAt(updatedAt?: string): number {
  if (!updatedAt) return Date.now();
  const parsed = Date.parse(updatedAt);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

export async function fetchActiveTimer(
  api: AxiosInstance,
): Promise<ActiveTimerState> {
  const { data } = await api.get<ActiveTimerState>("/users/me/active-timer");
  return data;
}

export async function reconcileActiveTimer(
  api: AxiosInstance,
  applyRemote: (state: TimerState, remoteUpdatedAt?: number) => void,
  getLocalState?: () => TimerState & { remoteUpdatedAt?: number },
): Promise<void> {
  try {
    const activeTimer = await fetchActiveTimer(api);
    const serverMs = parseServerUpdatedAt(activeTimer.updatedAt);

    if (getLocalState) {
      const local = getLocalState();
      if (
        remote.isRunning &&
        !local.isRunning &&
        local.remoteUpdatedAt != null &&
        serverMs < local.remoteUpdatedAt
      ) {
        return;
      }
    }

    const remote = activeTimerToTimerState(activeTimer);
    if (getLocalState) {
      const local = getLocalState();
      if (!remote.isRunning && !local.isRunning) {
        applyRemote(
          {
            ...remote,
            elapsedBeforeCurrentRun: Math.max(
              local.elapsedBeforeCurrentRun,
              remote.elapsedBeforeCurrentRun,
            ),
          },
          serverMs,
        );
        return;
      }
    }

    applyRemote(remote, serverMs);
  } catch (error) {
    console.warn("[Pulse] Failed to fetch active timer from server:", error);
  }
}
