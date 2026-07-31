import { useCallback, useEffect, useState } from "react";

const DEFAULTS = {
  minimizeToTray: true,
  openAtLogin: false,
};

export function useDesktopSettings() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!window.electron?.getDesktopSettings) {
      setLoaded(true);
      return;
    }

    void window.electron.getDesktopSettings().then((value) => {
      setSettings({
        minimizeToTray: value.minimizeToTray,
        openAtLogin: value.openAtLogin,
      });
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<typeof DEFAULTS>) => {
      if (!window.electron?.updateDesktopSettings) {
        setSettings((current) => ({ ...current, ...partial }));
        return;
      }

      const next = await window.electron.updateDesktopSettings(partial);
      setSettings({
        minimizeToTray: next.minimizeToTray,
        openAtLogin: next.openAtLogin,
      });
    },
    [],
  );

  return { settings, loaded, updateSettings };
}
