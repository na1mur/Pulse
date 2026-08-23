import type { TimerState } from "@repo/types";
import { getLocalDayString } from "./timer-day";

export type RemoteTimerSource = "live" | "reconcile";

export type TimerStateWithStamp = TimerState & { remoteUpdatedAt?: number };

/**
 * Apply remote timer state. Live socket play/pause always wins on isRunning.
 * Reconcile (HTTP / status snapshot) still protects today's elapsed from a
 * stale other-day total, but never drops a newer play/pause.
 */
export function applyIncomingTimerState(
  state: TimerStateWithStamp,
  incoming: TimerState,
  remoteUpdatedAt?: number,
  source: RemoteTimerSource = "reconcile",
): TimerStateWithStamp {
  const isLive = source === "live";

  // Live socket play/pause must not be compared against client Date.now()
  // stamps from local start/pause — Atlas/server time is often a few seconds
  // behind the device clock and would reject the other device's action.
  if (
    !isLive &&
    remoteUpdatedAt != null &&
    state.remoteUpdatedAt != null &&
    remoteUpdatedAt < state.remoteUpdatedAt
  ) {
    return state;
  }

  const today = getLocalDayString();
  const nextUpdatedAt = remoteUpdatedAt ?? Date.now();

  if (source === "live") {
    return {
      isRunning: incoming.isRunning,
      startedAt: incoming.isRunning ? incoming.startedAt : undefined,
      elapsedBeforeCurrentRun: incoming.elapsedBeforeCurrentRun,
      sessionTitle: incoming.sessionTitle,
      lastActiveDate: today,
      remoteUpdatedAt: nextUpdatedAt,
    };
  }

  const incomingDay =
    incoming.lastActiveDate ??
    (remoteUpdatedAt
      ? getLocalDayString(new Date(remoteUpdatedAt))
      : today);

  if (incoming.isRunning !== state.isRunning) {
    return {
      isRunning: incoming.isRunning,
      startedAt: incoming.isRunning ? incoming.startedAt : undefined,
      elapsedBeforeCurrentRun:
        incomingDay === today || incoming.isRunning
          ? incoming.elapsedBeforeCurrentRun
          : state.lastActiveDate === today
            ? state.elapsedBeforeCurrentRun
            : incoming.elapsedBeforeCurrentRun,
      sessionTitle: incoming.sessionTitle ?? state.sessionTitle,
      lastActiveDate: today,
      remoteUpdatedAt: nextUpdatedAt,
    };
  }

  if (state.lastActiveDate === today && incomingDay !== today) {
    return { ...state, remoteUpdatedAt: nextUpdatedAt };
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
}

export function mergeTimerStates(
  local: TimerState,
  remote: TimerState,
): TimerState {
  const today = getLocalDayString();
  const localDate = local.lastActiveDate ?? today;
  const remoteDate = remote.lastActiveDate ?? today;

  if (localDate !== today && remoteDate !== today) {
    return {
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: 0,
      lastActiveDate: localDate,
      sessionTitle: remote.sessionTitle ?? local.sessionTitle,
    };
  }

  if (localDate === today && remoteDate !== today) {
    return { ...local, lastActiveDate: today };
  }

  if (remoteDate === today && localDate !== today) {
    return { ...remote, lastActiveDate: today };
  }

  if (remote.isRunning) {
    return { ...remote, lastActiveDate: today };
  }

  // Remote explicitly paused while local is still running (socket pause event).
  if (remote.isRunning === false && local.isRunning) {
    return {
      isRunning: false,
      startedAt: undefined,
      elapsedBeforeCurrentRun: remote.elapsedBeforeCurrentRun,
      lastActiveDate: today,
      sessionTitle: remote.sessionTitle ?? local.sessionTitle,
    };
  }

  if (local.isRunning) {
    return { ...local, lastActiveDate: today };
  }

  const elapsed =
    localDate === today && remoteDate === today
      ? Math.max(
          local.elapsedBeforeCurrentRun,
          remote.elapsedBeforeCurrentRun,
        )
      : 0;

  return {
    isRunning: false,
    startedAt: undefined,
    elapsedBeforeCurrentRun: elapsed,
    lastActiveDate: today,
    sessionTitle: remote.sessionTitle ?? local.sessionTitle,
  };
}
