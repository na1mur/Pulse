import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform, useColorScheme as useSystemColorScheme } from "react-native";
import { appStorage } from "@/utils/api";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedScheme: "light" | "dark";
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
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

  const resolvedScheme: "light" | "dark" =
    theme === "system" ? (systemScheme === "dark" ? "dark" : "light") : theme;

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

  const value = useMemo(
    () => ({ theme, setTheme, resolvedScheme, mounted }),
    [theme, setTheme, resolvedScheme, mounted],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
