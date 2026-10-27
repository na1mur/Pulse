import { Global, Module } from '@nestjs/common';
import type { AppConfig } from './app-config.js';
import { loadConfig } from './load-config.js';

/** Nest injection token for the validated `AppConfig`. */
export const APP_CONFIG = Symbol('AppConfig');

/**
 * Provides the configuration to every module (global, like the clock). The factory validates the
 * process environment, so an invalid one stops the application from being created; `startServer`
 * loads it first to fail before anything else starts. Specs replace the provider.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
