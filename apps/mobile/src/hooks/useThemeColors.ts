import { useTheme } from "@/hooks/useTheme";
import { getThemeColors, type ColorScheme } from "@/theme/colors";

export function useThemeColors() {
  const { resolvedScheme } = useTheme();
  const scheme: ColorScheme = resolvedScheme === "dark" ? "dark" : "light";
  return getThemeColors(scheme);
}
