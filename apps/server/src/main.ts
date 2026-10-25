import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

const defaultPort = 3000;

// Validated configuration (spec Appendix A) replaces this in T1.2; until then the
// port is the only setting and an invalid value stops the boot instead of being guessed.
function readPort(value: string | undefined): number {
  if (value === undefined || value === '') {
    return defaultPort;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`PORT must be an integer between 0 and 65535, got "${value}"`);
  }
  return port;
}

async function bootstrap(): Promise<void> {
  const port = readPort(process.env['PORT']);
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(port);
  Logger.log(`Pulse server listening on port ${port}`, 'Bootstrap');
}

await bootstrap();
