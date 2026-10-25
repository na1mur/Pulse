import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

// Tauri's devUrl (src-tauri/tauri.conf.json) points at this port, so it must not drift:
// strictPort makes Vite fail instead of silently picking another one.
const DEV_PORT = 1420;

export default defineConfig({
  plugins: [tailwindcss(), svelte(), svelteTesting()],
  // Keep Vite's output visible next to the Tauri CLI's in the same terminal.
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    // The Rust shell is rebuilt by the Tauri CLI, not by Vite.
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    // Vitest's on-disk module cache ignores tsconfig changes, so a run could test stale
    // transforms (docs/knowledge/vitest-module-cache.md).
    fsModuleCache: false,
  },
});
