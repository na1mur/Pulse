import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Workspace packages export their TypeScript sources under the "@pulse/source" condition, so
  // tests run against them without building first (check.mjs runs tests before builds). Vite's
  // default server conditions are listed again because setting the option replaces them.
  ssr: {
    resolve: { conditions: ['@pulse/source', 'module', 'node', 'development|production'] },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    // Vitest's on-disk module cache is not invalidated by tsconfig changes (verified with the
    // decorator flags Nest depends on), so a local run could test stale transforms.
    fsModuleCache: false,
  },
});
