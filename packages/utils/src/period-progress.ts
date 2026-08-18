export interface PeriodProgress {
  workedMinutes: number;
  hasTarget: boolean;
  percentage: number | null;
  remainingMinutes: number | null;
  goalMinutes: number;
}

export function getPeriodProgress(
  workedMinutes: number,
  hasTarget: boolean,
  goalHours: number,
): PeriodProgress {
  const goalMinutes = Math.max(0, Math.round(goalHours * 60));
  const enabled = hasTarget && goalMinutes > 0;

  return {
    workedMinutes,
    hasTarget: enabled,
    percentage: enabled ? Math.round((workedMinutes / goalMinutes) * 100) : null,
    remainingMinutes: enabled ? Math.max(0, goalMinutes - workedMinutes) : null,
    goalMinutes,
  };
}

export function progressBarValue(percentage: number | null): number {
  if (percentage == null) return 0;
  return Math.min(percentage, 100);
}
