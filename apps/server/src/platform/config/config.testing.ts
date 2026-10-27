// Test support (not built into dist, see tsconfig.build.json): a valid configuration for specs
// that start the application, so no spec depends on the machine's environment.
import type { AppConfig } from './app-config.js';
import { loadConfig, type Env } from './load-config.js';

/** Where nothing listens: a spec that needs no database boots, and a query fails at once. */
export const UNREACHABLE_DATABASE_URL = 'postgres://pulse:pulse@127.0.0.1:1/pulse';

/** A valid environment; the secrets are random-looking test values, not real ones. */
export function testEnv(overrides: Env = {}): Env {
  return {
    DATABASE_URL: UNREACHABLE_DATABASE_URL,
    JWT_SECRET: 'k3Qv9xT2mWz7LrB4nPd8HsY1cJf6GuAe',
    REFRESH_SECRET: 'Vb5Nq0Zt8XcR2mLk7Wd4Hs9YfJ1GuPeA',
    ...overrides,
  };
}

/** A valid configuration; `overrides` replace whole fields (limits included). */
export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig(testEnv()), ...overrides };
}
