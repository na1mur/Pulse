import type { DesktopSettings } from "../../electron/desktop-settings";

export interface ElectronApi {
  platform: string;
  isDesktop: boolean;
  getDesktopSettings: () => Promise<DesktopSettings>;
  updateDesktopSettings: (
    partial: Partial<DesktopSettings>,
  ) => Promise<DesktopSettings>;
  quitApp: () => Promise<void>;
}

declare global {
  interface Window {
    electron?: ElectronApi;
  }
}

export {};
