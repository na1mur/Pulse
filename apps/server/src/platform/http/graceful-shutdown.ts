import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server } from 'node:http';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/app-config.js';
import { ShutdownDeadline } from '../lifecycle/shutdown-deadline.js';

const IDLE_SWEEP_MS = 50;

/**
 * Spec 9.2, graceful shutdown. Nest stops accepting connections and waits for the open ones when
 * the application closes (a signal, with `enableShutdownHooks`); this bounds that wait. Idle
 * keep-alive connections are closed as they appear, in-flight requests get `shutdownHttpDrainMs` to finish,
 * then the remaining connections are cut so the pool can close within what is left of the one
 * shutdown deadline (`shutdownGraceMs` in all, see `ShutdownDeadline`).
 */
@Injectable()
export class GracefulShutdown implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly logger = new Logger(GracefulShutdown.name);
  private timer: NodeJS.Timeout | undefined;
  private sweeper: NodeJS.Timeout | undefined;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly deadline: ShutdownDeadline,
  ) {}

  beforeApplicationShutdown(signal?: string): void {
    // Without a listening server (a module that was only compiled) there is nothing to bound.
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server | undefined;
    if (!server) return;
    const { shutdownGraceMs, shutdownHttpDrainMs } = this.config.limits;
    // The whole shutdown is bounded by one deadline; the drain may use only the first part of it,
    // so the pool close that follows still has time (spec 9.2).
    this.deadline.start(shutdownGraceMs);
    const drainMs = Math.min(shutdownHttpDrainMs, shutdownGraceMs);
    this.logger.log(
      `Shutting down${signal ? ` on ${signal}` : ''}: waiting up to ${drainMs} ms for open requests`,
    );
    // A connection that finishes its last request while we wait goes idle too: sweep until done,
    // or it would stay open for the keep-alive timeout.
    server.closeIdleConnections();
    this.sweeper = setInterval(() => {
      server.closeIdleConnections();
    }, IDLE_SWEEP_MS);
    this.sweeper.unref();
    this.timer = setTimeout(() => {
      this.logger.warn('Closing connections that are still open after the grace period');
      server.closeAllConnections();
    }, drainMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.timer);
    clearInterval(this.sweeper);
  }
}
