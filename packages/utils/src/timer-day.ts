/** Local calendar day string (matches Date.toDateString()). */
export function getLocalDayString(date = new Date()): string {
  return date.toDateString();
}

export function getStartOfLocalDayMs(date = new Date()): number {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

export function getEndOfLocalDayMs(date = new Date()): number {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

/** Total worked today in ms from timer state (includes the active segment). */
export function getTodayTimerDisplayMs(state: {
  isRunning: boolean;
  startedAt?: number;
  elapsedBeforeCurrentRun: number;
}): number {
  if (state.isRunning && state.startedAt) {
    return state.elapsedBeforeCurrentRun + (Date.now() - state.startedAt);
  }
  return state.elapsedBeforeCurrentRun;
}
