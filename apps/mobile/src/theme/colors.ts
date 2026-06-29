export type ColorScheme = "light" | "dark";

export const themeColors = {
  light: {
    background: "#fafafa",
    foreground: "#171717",
    muted: "#737373",
    card: "#ffffff",
    border: "#e5e5e5",
    primary: "#262626",
    primaryForeground: "#fafafa",
    destructive: "#dc2626",
    tabBar: "#ffffff",
    tabBarBorder: "#f0f0f0",
    tabActive: "#262626",
    tabInactive: "#a3a3a3",
    input: "#ffffff",
    inputBorder: "#e5e5e5",
    mutedSurface: "#f5f5f5",
    overlay: "rgba(0,0,0,0.5)",
  },
  dark: {
    background: "#0a0a0a",
    foreground: "#f5f5f5",
    muted: "#a3a3a3",
    card: "#171717",
    border: "#262626",
    primary: "#f5f5f5",
    primaryForeground: "#171717",
    destructive: "#f87171",
    tabBar: "#171717",
    tabBarBorder: "#262626",
    tabActive: "#f5f5f5",
    tabInactive: "#737373",
    input: "#171717",
    inputBorder: "#404040",
    mutedSurface: "#262626",
    overlay: "rgba(0,0,0,0.7)",
  },
} as const;

export function getThemeColors(scheme: ColorScheme) {
  return themeColors[scheme];
}
