import type { TimerState } from "@repo/types";
import {
  getEndOfLocalDayMs,
  getLocalDayString,
  getStartOfLocalDayMs,
  getTodayTimerDisplayMs,
} from "@repo/utils";

export interface TimerSessionPayload {
  startTime: string;
  endTime: string;
  deviceId: string;
  title?: string;
  summary?: string;
}

export type SaveTimerSessionFn = (
  payload: TimerSessionPayload,
) => Promise<void>;

export function seedTodayElapsedFromStats(
  state: TimerState,
  workedMinutes: number,
): Partial<TimerState> | null {
  const today = getLocalDayString();
  if (state.lastActiveDate && state.lastActiveDate !== today) {
    return null;
  }

  const serverMs = workedMinutes * 60 * 1000;
  const displayMs = getTodayTimerDisplayMs(state);

  if (serverMs <= displayMs) {
    return null;
  }

  if (!state.isRunning || !state.startedAt) {
    return { elapsedBeforeCurrentRun: serverMs, lastActiveDate: today };
  }

  const currentSegment = Date.now() - state.startedAt;
  const newBase = Math.max(0, serverMs - currentSegment);
  if (newBase <= state.elapsedBeforeCurrentRun) {
    return null;
  }

  return { elapsedBeforeCurrentRun: newBase, lastActiveDate: today };
}

export async function rolloverTimerForNewDay(
  state: TimerState,
  saveSession: SaveTimerSessionFn,
  deviceId: string,
): Promise<TimerState> {
  const today = getLocalDayString();
  const previousDate = state.lastActiveDate;

  if (!previousDate || previousDate === today) {
    return { ...state, lastActiveDate: today };
  }

  const carriedTitle = state.sessionTitle;
  const previousDay = new Date(previousDate);

  if (state.isRunning && state.startedAt) {
    const prevDayEnd = getEndOfLocalDayMs(previousDay);

    if (state.startedAt < prevDayEnd) {
      await saveSession({
        startTime: new Date(state.startedAt).toISOString(),
        endTime: new Date(prevDayEnd).toISOString(),
        deviceId,
        ...(carriedTitle ? { title: carriedTitle } : {}),
      });
    }

    return {
      isRunning: true,
      startedAt: getStartOfLocalDayMs(new Date()),
      elapsedBeforeCurrentRun: 0,
      lastActiveDate: today,
      sessionTitle: carriedTitle,
    };
  }

  return {
    isRunning: false,
    startedAt: undefined,
    elapsedBeforeCurrentRun: 0,
    lastActiveDate: today,
    sessionTitle: carriedTitle,
  };
}
