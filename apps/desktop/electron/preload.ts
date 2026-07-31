import { contextBridge } from "electron";

// Expose minimal APIs to the renderer process
contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
});
