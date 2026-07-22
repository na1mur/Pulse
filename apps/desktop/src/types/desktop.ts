export interface DesktopPreferences {
  autoStartOnBoot: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  runningColor: string;
  pausedColor: string;
}

export interface TimerStatePayload {
  isRunning: boolean;
  displayTime: string;
  sessionTitle?: string;
}

export interface TodayReportPayload {
  workedMinutes: number;
  sessionCount: number;
  progressPercent: number | null;
  goalEnabled: boolean;
}

export const DEFAULT_DESKTOP_PREFS: DesktopPreferences = {
  autoStartOnBoot: true,
  startMinimized: true,
  closeToTray: true,
  runningColor: "#22c55e",
  pausedColor: "#ef4444",
};
