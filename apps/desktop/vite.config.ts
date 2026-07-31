import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "electron-html",
      transformIndexHtml(html) {
        // crossorigin breaks module/CSS loading over Electron's file:// protocol
        return html.replace(/\s+crossorigin/g, "");
      },
    },
  ],
  build: {
    modulePreload: false,
  },
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
    alias: {
      "@": path.resolve(appDir, "./src"),
      react: path.resolve(appDir, "node_modules/react"),
      "react-dom": path.resolve(appDir, "node_modules/react-dom"),
    },
  },
});
