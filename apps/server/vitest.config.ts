import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Vitest's on-disk module cache is not invalidated by tsconfig changes (verified with the
    // decorator flags Nest depends on), so a local run could test stale transforms.
    fsModuleCache: false,
  },
});
