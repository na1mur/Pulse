import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import { DEFAULT_DESKTOP_PREFS, type DesktopPreferences } from "./ipc-channels";

function prefsPath(): string {
  return path.join(app.getPath("userData"), "desktop-prefs.json");
}

export function readDesktopPrefs(): DesktopPreferences {
  try {
    const raw = fs.readFileSync(prefsPath(), "utf-8");
    return { ...DEFAULT_DESKTOP_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_DESKTOP_PREFS };
  }
}

export function writeDesktopPrefs(prefs: DesktopPreferences): void {
  fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
  fs.writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2), "utf-8");
}

export function applyAutoStart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? ["--minimized"] : [],
  });
}
