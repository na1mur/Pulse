// Test support (not built into dist): the whole application on an ephemeral port, set up like
// `startServer` does, with a given configuration.
import type { LoggerService, Type } from '@nestjs/common';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../app.module.js';
import { CLOCK, type Clock } from '../clock/clock.js';
import type { AppConfig } from '../config/app-config.js';
import { APP_CONFIG } from '../config/config.module.js';
import { testConfig } from '../config/config.testing.js';
import { configureApp } from './configure-app.js';

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly baseUrl: string;
}

export interface TestAppOptions {
  readonly config?: AppConfig;
  /** Extra controllers, for routes that exist only to provoke a failure. */
  readonly controllers?: Type<unknown>[];
  /** Replaces the system clock. */
  readonly clock?: Clock;
  /** Defaults to no logging. */
  readonly logger?: LoggerService;
}

export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const config = options.config ?? testConfig();
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(APP_CONFIG)
    .useValue(config);
  if (options.clock) builder.overrideProvider(CLOCK).useValue(options.clock);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: options.logger ?? false,
  });
  configureApp(app, config);
  await app.init();
  const port = await listenOnUsablePort(app.getHttpServer());
  return { app, baseUrl: `http://127.0.0.1:${port}` };
}

// `fetch` refuses a list of ports (the WHATWG "bad ports", such as 6000 or 10080) with "bad port",
// and where the operating system's dynamic range is wide the random port of `listen(0)` can hit
// one: a rare, confusing failure of any spec. Listen again until the port is one fetch accepts.
const FETCH_BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);

async function listenOnUsablePort(server: Server): Promise<number> {
  for (;;) {
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve((server.address() as AddressInfo).port);
      });
    });
    if (!FETCH_BAD_PORTS.has(port)) return port;
    await new Promise((resolve) => server.close(resolve));
  }
}
