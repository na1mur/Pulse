import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useUserSettings } from "@/hooks/usePulseQueries";
import { useDesktopSettings } from "@/hooks/useDesktopSettings";

interface SettingsPageProps {
  onLogout: () => void;
}

function SettingToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-primary"
      />
    </div>
  );
}

export function SettingsPage({ onLogout }: SettingsPageProps) {
  const { data: settings } = useUserSettings();
  const { settings: desktopSettings, loaded, updateSettings } =
    useDesktopSettings();
  const isElectron = Boolean(window.electron?.isDesktop);

  return (
    <div className="max-w-2xl space-y-6">
      {isElectron && loaded ? (
        <Card className="p-6 space-y-6">
          <h3 className="text-lg font-semibold text-foreground">Desktop</h3>
          <div className="space-y-4">
            <SettingToggle
              id="minimize-to-tray"
              label="Minimize to system tray on close"
              description="Keep Pulse running in the background when you close the window so timer sync stays active."
              checked={desktopSettings.minimizeToTray}
              onCheckedChange={(checked) =>
                void updateSettings({ minimizeToTray: checked })
              }
            />
            <SettingToggle
              id="open-at-login"
              label="Launch at login"
              description="Start Pulse automatically when you sign in to Windows."
              checked={desktopSettings.openAtLogin}
              onCheckedChange={(checked) =>
                void updateSettings({ openAtLogin: checked })
              }
            />
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
