export const IPC = {
  TIMER_STATE: "timer:state",
  TODAY_REPORT: "today:report",
  DESKTOP_PREFS_GET: "desktop-prefs:get",
  DESKTOP_PREFS_SET: "desktop-prefs:set",
  TRAY_TOGGLE: "tray:toggle-play-pause",
  TRAY_PLAY_WITH_TITLE: "tray:play-with-title",
  TRAY_PAUSE_WITH_SUMMARY: "tray:pause-with-summary",
  TRAY_SHOW_WINDOW: "tray:show-window",
  TRAY_SHOW_TODAY_REPORT: "tray:show-today-report",
  WIDGET_CONTEXT_MENU: "widget:context-menu",
} as const;

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

export interface DesktopPreferences {
  autoStartOnBoot: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  runningColor: string;
  pausedColor: string;
}

export const DEFAULT_DESKTOP_PREFS: DesktopPreferences = {
  autoStartOnBoot: true,
  startMinimized: true,
  closeToTray: true,
  runningColor: "#22c55e",
  pausedColor: "#ef4444",
};
