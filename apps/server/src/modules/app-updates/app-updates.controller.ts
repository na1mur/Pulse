import { Controller } from '@nestjs/common';
import type { OperationQuery, OperationResponse } from '@pulse/contract';
import { AppError } from '../../platform/errors/app-error.js';
import { ContractQuery, ContractRoute } from '../../platform/http/contract-route.js';
import { AppUpdatesService } from './app-updates.service.js';

@Controller()
export class AppUpdatesController {
  constructor(private readonly appUpdates: AppUpdatesService) {}

  @ContractRoute('appUpdates.getLatest')
  getLatest(
    @ContractQuery('appUpdates.getLatest') query: OperationQuery<'appUpdates.getLatest'>,
  ): OperationResponse<'appUpdates.getLatest'> {
    const release = this.appUpdates.latest(query.platform);
    if (!release) throw new AppError('NOT_FOUND', `No ${query.platform} release is published.`);
    return release;
  }
}
