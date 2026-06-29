import { useEffect, useState, useCallback } from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export function useTheme() {
  const systemScheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark" || stored === "system") {
        setThemeState(stored);
      }
      setMounted(true);
    });
  }, []);

  const resolvedScheme =
    theme === "system" ? (systemScheme ?? "light") : theme;

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    await AsyncStorage.setItem(STORAGE_KEY, newTheme);
  }, []);

  return { theme, setTheme, resolvedScheme, mounted };
}
