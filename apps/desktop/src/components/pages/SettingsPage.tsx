import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useUserSettings } from "@/hooks/usePulseQueries";
import {
  DEFAULT_DESKTOP_PREFS,
  type DesktopPreferences,
} from "@/types/desktop";

interface SettingsPageProps {
  onLogout: () => void;
}

export function SettingsPage({ onLogout }: SettingsPageProps) {
  const { data: settings } = useUserSettings();
  const [desktopPrefs, setDesktopPrefs] = useState<DesktopPreferences>(
    DEFAULT_DESKTOP_PREFS,
  );
  const isElectron = typeof window.electron !== "undefined";

  useEffect(() => {
    if (!window.electron) return;
    void window.electron.getDesktopPrefs().then(setDesktopPrefs);
  }, []);

  const updateDesktopPref = <K extends keyof DesktopPreferences>(
    key: K,
    value: DesktopPreferences[K],
  ) => {
    const next = { ...desktopPrefs, [key]: value };
    setDesktopPrefs(next);
    if (window.electron) {
      void window.electron.setDesktopPrefs(next);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      {isElectron ? (
        <Card className="p-6 space-y-6">
          <h3 className="text-lg font-semibold text-foreground">
            Desktop & Taskbar
          </h3>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={desktopPrefs.autoStartOnBoot}
                onCheckedChange={(checked) =>
                  updateDesktopPref("autoStartOnBoot", checked === true)
                }
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Start on boot
                </p>
                <p className="text-xs text-muted-foreground">
                  Launch Pulse automatically when Windows starts
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={desktopPrefs.startMinimized}
                onCheckedChange={(checked) =>
                  updateDesktopPref("startMinimized", checked === true)
                }
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Start minimized to tray
                </p>
                <p className="text-xs text-muted-foreground">
                  Keep the main window hidden; show only the taskbar timer
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={desktopPrefs.closeToTray}
                onCheckedChange={(checked) =>
                  updateDesktopPref("closeToTray", checked === true)
                }
              />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Close to tray
                </p>
                <p className="text-xs text-muted-foreground">
                  Closing the window keeps Pulse running in the background
                </p>
              </div>
            </label>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="running-color">Running timer color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="running-color"
                    type="color"
                    value={desktopPrefs.runningColor}
                    onChange={(e) =>
                      updateDesktopPref("runningColor", e.target.value)
                    }
                    className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
                  />
                  <span className="text-sm text-muted-foreground font-mono">
                    {desktopPrefs.runningColor}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paused-color">Paused timer color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="paused-color"
                    type="color"
                    value={desktopPrefs.pausedColor}
                    onChange={(e) =>
                      updateDesktopPref("pausedColor", e.target.value)
                    }
                    className="h-9 w-12 cursor-pointer rounded border border-input bg-background"
                  />
                  <span className="text-sm text-muted-foreground font-mono">
                    {desktopPrefs.pausedColor}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Right-click the taskbar timer or system tray icon to play/pause,
              add a title or summary, and view today&apos;s report.
            </p>
          </div>
        </Card>
      ) : null}

      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Appearance</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <ThemeToggle />
            <p className="text-xs text-muted-foreground mt-2">
              Choose how Pulse looks on your device
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">Account</h3>
        <div className="space-y-4">
          {settings?.name ? (
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm font-medium text-foreground">
                {settings.name}
              </p>
            </div>
          ) : null}
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-sm text-foreground">{settings?.email ?? "—"}</p>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">About</h3>
        <p className="text-sm text-muted-foreground">Version 1.0.0</p>
      </Card>

      <Card className="p-6 space-y-4 border-destructive/30">
        <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
        <Button variant="destructive" onClick={onLogout} className="gap-2">
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </Card>
    </div>
  );
}
