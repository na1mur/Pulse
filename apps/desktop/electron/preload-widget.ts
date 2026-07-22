import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "./ipc-channels";

contextBridge.exposeInMainWorld("electronWidget", {
  onTimerState: (
    callback: (state: {
      isRunning: boolean;
      displayTime: string;
      runningColor: string;
      pausedColor: string;
      sessionTitle?: string;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      state: {
        isRunning: boolean;
        displayTime: string;
        runningColor: string;
        pausedColor: string;
        sessionTitle?: string;
      },
    ) => callback(state);
    ipcRenderer.on(IPC.TIMER_STATE, handler);
    return () => ipcRenderer.removeListener(IPC.TIMER_STATE, handler);
  },

  onPrefsUpdated: (
    callback: (prefs: { runningColor: string; pausedColor: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      prefs: { runningColor: string; pausedColor: string },
    ) => callback(prefs);
    ipcRenderer.on("desktop-prefs:updated", handler);
    return () => ipcRenderer.removeListener("desktop-prefs:updated", handler);
  },

  showContextMenu: () => {
    ipcRenderer.send(IPC.WIDGET_CONTEXT_MENU);
  },
});
