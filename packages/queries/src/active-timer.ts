import type { AxiosInstance } from "axios";
import type { ActiveTimerState, TimerState } from "@repo/types";

export function activeTimerToTimerState(timer: ActiveTimerState): TimerState {
  return {
    isRunning: timer.isRunning,
    startedAt: timer.startedAt,
    elapsedBeforeCurrentRun: timer.elapsedBeforeCurrentRun,
    sessionTitle: timer.sessionTitle,
  };
}

export async function fetchActiveTimer(
  api: AxiosInstance,
): Promise<ActiveTimerState> {
  const { data } = await api.get<ActiveTimerState>("/users/me/active-timer");
  return data;
}

export async function reconcileActiveTimer(
  api: AxiosInstance,
  apply: (state: TimerState) => void,
): Promise<void> {
  try {
    const activeTimer = await fetchActiveTimer(api);
    apply(activeTimerToTimerState(activeTimer));
  } catch (error) {
    console.warn("[Pulse] Failed to fetch active timer from server:", error);
  }
}
