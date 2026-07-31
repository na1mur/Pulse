import { app } from "electron";
import fs from "fs";
import path from "path";

export interface DesktopSettings {
  minimizeToTray: boolean;
  openAtLogin: boolean;
}

const DEFAULTS: DesktopSettings = {
  minimizeToTray: true,
  openAtLogin: false,
};

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "desktop-settings.json");
}

export function loadDesktopSettings(): DesktopSettings {
  try {
    const raw = fs.readFileSync(getSettingsPath(), "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDesktopSettings(
  partial: Partial<DesktopSettings>,
): DesktopSettings {
  const next = { ...loadDesktopSettings(), ...partial };
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2));

  if (typeof partial.openAtLogin === "boolean") {
    app.setLoginItemSettings({
      openAtLogin: next.openAtLogin,
      openAsHidden: next.openAtLogin,
    });
  }

  return next;
}

export function applyLoginItemSettings(settings: DesktopSettings): void {
  app.setLoginItemSettings({
    openAtLogin: settings.openAtLogin,
    openAsHidden: settings.openAtLogin,
  });
}
