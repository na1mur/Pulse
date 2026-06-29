/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#fafafa",
        foreground: "#212121",
        card: "#ffffff",
        "card-foreground": "#212121",
        primary: "#262626",
        "primary-foreground": "#fafafa",
        secondary: "#f2f2f2",
        "secondary-foreground": "#212121",
        muted: "#ebebeb",
        "muted-foreground": "#737373",
        accent: "#262626",
        "accent-foreground": "#fafafa",
        destructive: "#dc2626",
        border: "#f0f0f0",
        input: "#f5f5f5",
        ring: "#262626",
        sidebar: "#fafafa",
        "sidebar-foreground": "#212121",
        "sidebar-primary": "#262626",
        "sidebar-primary-foreground": "#fafafa",
        "sidebar-accent": "#f2f2f2",
        "sidebar-border": "#f0f0f0",
      },
    },
  },
  plugins: [],
};
