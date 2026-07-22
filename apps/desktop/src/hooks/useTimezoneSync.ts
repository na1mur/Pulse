import { useEffect, useRef } from "react";
import { getDeviceTimezone } from "@repo/utils";
import { useUpdateTimezone, useUserSettings } from "@/hooks/usePulseQueries";

export function useTimezoneSync() {
  const { data: settings } = useUserSettings();
  const updateTimezone = useUpdateTimezone();
  const lastSyncedTimezone = useRef<string | null>(null);

  useEffect(() => {
    if (!settings) return;

    const deviceTimezone = getDeviceTimezone();
    if (settings.timezone === deviceTimezone) {
      lastSyncedTimezone.current = deviceTimezone;
      return;
    }

    if (lastSyncedTimezone.current === deviceTimezone) return;

    lastSyncedTimezone.current = deviceTimezone;
    updateTimezone.mutate(deviceTimezone);
  }, [settings, settings?.timezone, updateTimezone]);
}
