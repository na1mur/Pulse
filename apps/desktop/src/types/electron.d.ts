import type {
  DesktopPreferences,
  TimerStatePayload,
  TodayReportPayload,
} from "./desktop";

export interface ElectronAPI {
  platform: string;
  sendTimerState: (state: TimerStatePayload) => void;
  sendTodayReport: (report: TodayReportPayload) => void;
  getDesktopPrefs: () => Promise<DesktopPreferences>;
  setDesktopPrefs: (prefs: DesktopPreferences) => Promise<DesktopPreferences>;
  onTrayToggle: (callback: () => void) => () => void;
  onTrayPlayWithTitle: (callback: () => void) => () => void;
  onTrayPauseWithSummary: (callback: () => void) => () => void;
  onTrayShowTodayReport: (callback: () => void) => () => void;
}

export interface ElectronWidgetAPI {
  onTimerState: (
    callback: (state: {
      isRunning: boolean;
      displayTime: string;
      runningColor: string;
      pausedColor: string;
      sessionTitle?: string;
    }) => void,
  ) => () => void;
  onPrefsUpdated: (
    callback: (prefs: { runningColor: string; pausedColor: string }) => void,
  ) => () => void;
  showContextMenu: () => void;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
    electronWidget?: ElectronWidgetAPI;
  }
}

export {};
