// shadcn preset b6YWhHcRs: nova style, mauve base, fuchsia theme
export type ColorScheme = "light" | "dark";

export const themeColors = {
  light: {
    background: "#ffffff",
    foreground: "#0c090c",
    muted: "#79697b",
    card: "#ffffff",
    border: "#e7e4e7",
    primary: "#a800b7",
    primaryForeground: "#fdf4ff",
    destructive: "#e7000b",
    tabBar: "#ffffff",
    tabBarBorder: "#e7e4e7",
    tabActive: "#a800b7",
    tabInactive: "#79697b",
    input: "#ffffff",
    inputBorder: "#e7e4e7",
    mutedSurface: "#f3f1f3",
    overlay: "rgba(12, 9, 12, 0.5)",
  },
  dark: {
    background: "#0c090c",
    foreground: "#fafafa",
    muted: "#a89ea9",
    card: "#1d161e",
    border: "#2a212c",
    primary: "#8a0194",
    primaryForeground: "#fdf4ff",
    destructive: "#ff6467",
    tabBar: "#1d161e",
    tabBarBorder: "#2a212c",
    tabActive: "#8a0194",
    tabInactive: "#a89ea9",
    input: "#1d161e",
    inputBorder: "#594c5b",
    mutedSurface: "#2a212c",
    overlay: "rgba(0, 0, 0, 0.7)",
  },
} as const;

export function getThemeColors(scheme: ColorScheme) {
  return themeColors[scheme];
}
