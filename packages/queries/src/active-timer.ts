import type { AxiosInstance } from "axios";
import type { ActiveTimerState, TimerState } from "@repo/types";
import { getLocalDayString } from "@repo/utils";

export function activeTimerToTimerState(timer: ActiveTimerState): TimerState {
  const lastActiveDate = timer.updatedAt
    ? getLocalDayString(new Date(timer.updatedAt))
    : undefined;

  return {
    isRunning: timer.isRunning,
    startedAt: timer.startedAt,
    elapsedBeforeCurrentRun: timer.elapsedBeforeCurrentRun,
    sessionTitle: timer.sessionTitle ?? undefined,
    tagId: timer.tagId ?? undefined,
    lastActiveDate,
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
    const remote = activeTimerToTimerState(activeTimer);

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

    if (getLocalState) {
      const local = getLocalState();
      if (!remote.isRunning && !local.isRunning) {
        const today = getLocalDayString();
        const localDay = local.lastActiveDate ?? today;
        const remoteDay = remote.lastActiveDate ?? today;

        let elapsed = remote.elapsedBeforeCurrentRun;
        if (localDay === today && remoteDay !== today) {
          elapsed = local.elapsedBeforeCurrentRun;
        } else if (localDay === today && remoteDay === today) {
          elapsed = Math.max(
            local.elapsedBeforeCurrentRun,
            remote.elapsedBeforeCurrentRun,
          );
        } else if (localDay !== today && remoteDay === today) {
          elapsed = remote.elapsedBeforeCurrentRun;
        } else {
          elapsed = 0;
        }

        applyRemote(
          {
            ...remote,
            elapsedBeforeCurrentRun: elapsed,
            lastActiveDate:
              localDay === today || remoteDay === today ? today : localDay,
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
