// pure black & white — no hue
export type ColorScheme = "light" | "dark";

export const themeColors = {
  light: {
    background: "#ffffff",
    foreground: "#09090b",
    muted: "#71717a",
    card: "#ffffff",
    border: "#e4e4e7",
    primary: "#09090b",
    primaryForeground: "#fafafa",
    destructive: "#ef4444",
    tabBar: "#ffffff",
    tabBarBorder: "#e4e4e7",
    tabActive: "#09090b",
    tabInactive: "#71717a",
    input: "#ffffff",
    inputBorder: "#e4e4e7",
    mutedSurface: "#f4f4f5",
    overlay: "rgba(9, 9, 11, 0.5)",
  },
  dark: {
    background: "#09090b",
    foreground: "#fafafa",
    muted: "#a1a1aa",
    card: "#111113",
    border: "#27272a",
    primary: "#fafafa",
    primaryForeground: "#09090b",
    destructive: "#f87171",
    tabBar: "#111113",
    tabBarBorder: "#27272a",
    tabActive: "#fafafa",
    tabInactive: "#a1a1aa",
    input: "#111113",
    inputBorder: "#3f3f46",
    mutedSurface: "#27272a",
    overlay: "rgba(0, 0, 0, 0.7)",
  },
} as const;

export function getThemeColors(scheme: ColorScheme) {
  return themeColors[scheme];
}
