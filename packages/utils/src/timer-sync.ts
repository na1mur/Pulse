import type { TimerState } from "@repo/types";
import { getLocalDayString } from "./timer-day";

export function mergeTimerStates(
  local: TimerState,
  remote: TimerState,
): TimerState {
  const today = getLocalDayString();
  const localDate = local.lastActiveDate ?? today;
  const remoteDate = remote.lastActiveDate ?? today;

  if (localDate === today && remoteDate !== today) {
    return { ...local, lastActiveDate: today };
  }

  if (remoteDate === today && localDate !== today) {
    return { ...remote, lastActiveDate: today };
  }

  if (remote.isRunning) {
    return { ...remote, lastActiveDate: today };
  }

  if (local.isRunning) {
    return { ...local, lastActiveDate: today };
  }

  return {
    isRunning: false,
    startedAt: undefined,
    elapsedBeforeCurrentRun: Math.max(
      local.elapsedBeforeCurrentRun,
      remote.elapsedBeforeCurrentRun,
    ),
    lastActiveDate: today,
    sessionTitle: local.sessionTitle ?? remote.sessionTitle,
  };
}
