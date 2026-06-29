import { LogOut } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUpdateTimezone,
  useUserSettings,
} from "@/hooks/usePulseQueries";

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Standard Time (EST)" },
  { value: "America/Chicago", label: "Central Standard Time (CST)" },
  { value: "America/Denver", label: "Mountain Standard Time (MST)" },
  { value: "America/Los_Angeles", label: "Pacific Standard Time (PST)" },
  { value: "UTC", label: "Coordinated Universal Time (UTC)" },
];

interface SettingsPageProps {
  onLogout: () => void;
}

export function SettingsPage({ onLogout }: SettingsPageProps) {
  const { data: settings } = useUserSettings();
  const updateTimezone = useUpdateTimezone();

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-6 space-y-6">
        <h3 className="text-lg font-semibold text-foreground">General</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={settings?.timezone ?? "UTC"}
              onValueChange={(value) => {
                if (value) updateTimezone.mutate(value);
              }}
            >
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

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
