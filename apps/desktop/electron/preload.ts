import { contextBridge, ipcRenderer } from "electron";
import type { DesktopSettings } from "./desktop-settings";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  isDesktop: true,
  getDesktopSettings: (): Promise<DesktopSettings> =>
    ipcRenderer.invoke("desktop:get-settings"),
  updateDesktopSettings: (
    partial: Partial<DesktopSettings>,
  ): Promise<DesktopSettings> =>
    ipcRenderer.invoke("desktop:update-settings", partial),
  quitApp: (): Promise<void> => ipcRenderer.invoke("app:quit"),
});
