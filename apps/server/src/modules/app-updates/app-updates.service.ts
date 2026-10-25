import { Injectable } from '@nestjs/common';
import type { OperationQuery, OperationResponse } from '@pulse/contract';

type Platform = OperationQuery<'appUpdates.getLatest'>['platform'];

@Injectable()
export class AppUpdatesService {
  /** Stub (T0.4): releases are published from T7.6 (Windows) and T7.7 (Android). */
  latest(_platform: Platform): OperationResponse<'appUpdates.getLatest'> | undefined {
    return undefined;
  }
}
