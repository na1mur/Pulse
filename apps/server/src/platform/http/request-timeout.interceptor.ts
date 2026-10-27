import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { TimeoutError, catchError, throwError, timeout, type Observable } from 'rxjs';
import { APP_CONFIG } from '../config/config.module.js';
import type { AppConfig } from '../config/app-config.js';
import { AppError } from '../errors/app-error.js';

/**
 * Spec 9.2: a handler that takes longer than the request timeout is answered with UNAVAILABLE
 * (503) in the contract's error shape. The handler is not cancelled, so a write may still commit:
 * clients retry commands under the same command ID (R-34), which makes that safe.
 */
@Injectable()
export class RequestTimeoutInterceptor implements NestInterceptor {
  private readonly timeoutMs: number;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.timeoutMs = config.limits.requestTimeoutMs;
  }

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError
            ? new AppError('UNAVAILABLE', 'The request took too long. Try again.')
            : error,
        ),
      ),
    );
  }
}
