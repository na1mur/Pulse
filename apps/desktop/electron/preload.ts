import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  type DesktopPreferences,
  type TimerStatePayload,
  type TodayReportPayload,
} from "./ipc-channels";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,

  sendTimerState: (state: TimerStatePayload) => {
    ipcRenderer.send(IPC.TIMER_STATE, state);
  },

  sendTodayReport: (report: TodayReportPayload) => {
    ipcRenderer.send(IPC.TODAY_REPORT, report);
  },

  getDesktopPrefs: (): Promise<DesktopPreferences> =>
    ipcRenderer.invoke(IPC.DESKTOP_PREFS_GET),

  setDesktopPrefs: (prefs: DesktopPreferences): Promise<DesktopPreferences> =>
    ipcRenderer.invoke(IPC.DESKTOP_PREFS_SET, prefs),

  onTrayToggle: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.TRAY_TOGGLE, handler);
    return () => ipcRenderer.removeListener(IPC.TRAY_TOGGLE, handler);
  },

  onTrayPlayWithTitle: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.TRAY_PLAY_WITH_TITLE, handler);
    return () => ipcRenderer.removeListener(IPC.TRAY_PLAY_WITH_TITLE, handler);
  },

  onTrayPauseWithSummary: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.TRAY_PAUSE_WITH_SUMMARY, handler);
    return () =>
      ipcRenderer.removeListener(IPC.TRAY_PAUSE_WITH_SUMMARY, handler);
  },

  onTrayShowTodayReport: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC.TRAY_SHOW_TODAY_REPORT, handler);
    return () =>
      ipcRenderer.removeListener(IPC.TRAY_SHOW_TODAY_REPORT, handler);
  },
});
