/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        foreground: "#09090b",
        card: "#ffffff",
        "card-foreground": "#09090b",
        primary: "#09090b",
        "primary-foreground": "#fafafa",
        secondary: "#f4f4f5",
        "secondary-foreground": "#09090b",
        muted: "#f4f4f5",
        "muted-foreground": "#71717a",
        accent: "#f4f4f5",
        "accent-foreground": "#09090b",
        destructive: "#ef4444",
        border: "#e4e4e7",
        input: "#e4e4e7",
        ring: "#a1a1aa",
        sidebar: "#fafafa",
        "sidebar-foreground": "#09090b",
        "sidebar-primary": "#09090b",
        "sidebar-primary-foreground": "#fafafa",
        "sidebar-accent": "#f4f4f5",
        "sidebar-border": "#e4e4e7",
      },
    },
  },
  plugins: [],
};

