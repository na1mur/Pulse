import { useEffect, useState, useCallback } from "react";
import { Platform, useColorScheme as useSystemColorScheme } from "react-native";
import { appStorage } from "@/utils/api";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export function useTheme() {
  const systemScheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    appStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
      }
      setMounted(true);
    });
  }, []);

  const resolvedScheme = theme === "system" ? (systemScheme ?? "light") : theme;

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.classList.toggle(
        "dark",
        resolvedScheme === "dark",
      );
    }
  }, [resolvedScheme]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    await appStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  return { theme, setTheme, resolvedScheme, mounted };
}
