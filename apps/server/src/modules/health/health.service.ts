import { Injectable } from '@nestjs/common';
import type { OperationResponse } from '@pulse/contract';

@Injectable()
export class HealthService {
  /**
   * OPS-01: API and database status. There is no database before T1.1; T1.2 adds the real ping
   * and answers 503 UNAVAILABLE when it fails.
   */
  report(): Promise<OperationResponse<'health.get'>> {
    return Promise.resolve({ status: 'ok', database: 'up' });
  }
}
