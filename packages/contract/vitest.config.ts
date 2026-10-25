import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Same reason as apps/server/vitest.config.ts: the on-disk cache ignores tsconfig changes.
    fsModuleCache: false,
  },
});
