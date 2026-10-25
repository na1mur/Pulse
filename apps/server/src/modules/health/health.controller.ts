import { Controller } from '@nestjs/common';
import type { OperationResponse } from '@pulse/contract';
import { ContractRoute } from '../../platform/http/contract-route.js';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @ContractRoute('health.get')
  get(): Promise<OperationResponse<'health.get'>> {
    return this.health.report();
  }

  @ContractRoute('health.live')
  live(): OperationResponse<'health.live'> {
    return { status: 'ok' };
  }
}
