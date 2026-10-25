# Workspace packages resolve to their sources in checks

`packages/contract` (and any later workspace package) exports its TypeScript sources under `types` and the custom condition `@pulse/source`, and its built `dist/*.js` under `default` (ADR 0003). Reason: `scripts/check.mjs` runs type checks and tests **before** `pnpm -r build`, so on a clean checkout there is no `dist/` yet.

- tsc and svelte-check follow `types`, so nothing to configure.
- Vitest does not know `types`: a consumer's Vitest config must add `@pulse/source` to `ssr.resolve.conditions` (see `apps/server/vitest.config.ts`). Setting the option replaces Vite's defaults, so list them again. Without it the tests pass locally (an old `dist/` exists) and fail in CI with "Failed to resolve entry for package".
- Running code (`node dist/main.js`, `nest start`) uses `dist/`: build the package first (`pnpm --filter @pulse/contract build`).
